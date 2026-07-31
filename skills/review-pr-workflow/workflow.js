export const meta = {
  name: 'review-pr-workflow',
  description: 'Fan out PR review lenses, adversarially verify each material claim, then critique for gaps',
  phases: [
    { title: 'Review', detail: 'one agent per review lens' },
    { title: 'Verify', detail: 'refute each material finding' },
    { title: 'Critic', detail: 'what did the review miss' },
  ],
}

// ---------------------------------------------------------------------------
// Inputs. See SKILL.md "Invoking the workflow" for how the main loop builds these.
// ---------------------------------------------------------------------------

if (!args || !args.pr) {
  throw new Error('review-pr-workflow: args.pr is required — see SKILL.md "Invoking the workflow"')
}
if (args.tier === 'skip') {
  throw new Error('review-pr-workflow: tier "skip" must not reach the workflow — run review-pr inline instead')
}

const {
  pr,
  issues = [],
  baseRef = 'origin/HEAD',
  diffStat = '',
  changedFiles = [],
  lintOutput = '',
  newDeps = [],
  tier = 'full',
  verifyAgent = 'claude',
} = args

// Verify at most this many findings per lens, highest severity first. Bounds the
// agent count; the selection is deterministic so resumes hit cache.
const MAX_VERIFY_PER_LENS = 4

// Only these severities are worth an agent. Suggestions are non-blocking and pass
// through unverified, clearly labelled as such.
const MATERIAL = ['blocker', 'issue']
const SEVERITY_RANK = { blocker: 0, issue: 1, suggestion: 2 }

const CONTEXT = `
PR ${pr.repo}#${pr.number}: ${pr.title}

PR body:
${pr.body || '(empty)'}

Linked issue specs — the PR is graded against these, not against its own description:
${issues.map(i => `#${i.number}:\n${i.body}`).join('\n\n') || '(none)'}

Changed files:
${changedFiles.join('\n')}

Diffstat:
${diffStat}

Lint output, already run — do not re-run it:
${lintOutput || '(clean)'}

The PR branch is already checked out. You are READ-ONLY: do not checkout, commit,
stash, start a dev server, or modify any file.
Read the diff with: git diff ${baseRef}...HEAD
`

// ---------------------------------------------------------------------------
// Review lenses
// ---------------------------------------------------------------------------

const ALL_LENSES = [
  {
    key: 'spec',
    prompt: `Does this PR do what the linked issue asked? Find requirements in the
issue that are unimplemented, partially implemented, or implemented differently
than specified. Also flag anything the PR does that no issue asked for.
If there is no linked issue, grade against the PR description and say so.`,
  },
  {
    key: 'bugs',
    prompt: `Find logic errors, off-by-ones, unhandled null/undefined, incorrect
async ordering, race conditions, broken error handling, and state that can go
stale. Trace the actual code paths — do not flag style.`,
  },
  {
    key: 'security',
    prompt: `Find injection, XSS, unsafe deserialization, missing authz checks,
leaked secrets or tokens, unsafe redirects, overly broad CORS, and data exposed to
the client that should not be. Report only what this diff introduces or fails to
fix — not pre-existing issues elsewhere in the repo.`,
  },
  {
    key: 'deps',
    prompt: `Newly added dependencies: ${newDeps.join(', ') || '(none)'}.
For each, evaluate against the npm-policy skill's criteria and give a clear
APPROVED or REJECTED with a one-line reason. If there are no new dependencies,
return zero findings — do not manufacture any.`,
  },
  {
    key: 'clarity',
    prompt: `Find code that will be expensive to maintain: misleading names,
duplicated logic that should be shared, functions doing several unrelated things,
and missing tests for behavior this PR introduces. Be selective — raise only what
you would genuinely block or comment on, never nitpicks.`,
  },
]

const LENSES = tier === 'light'
  ? ALL_LENSES.filter(l => l.key === 'spec' || l.key === 'bugs')
  : ALL_LENSES

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['file', 'line', 'severity', 'claim', 'evidence', 'change'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['blocker', 'issue', 'suggestion'] },
          claim: { type: 'string', description: 'One sentence: what is wrong.' },
          evidence: { type: 'string', description: 'The specific code that makes this true.' },
          change: { type: 'string', description: 'The precise edit requested.' },
          keep: { type: 'string', description: 'What must NOT change, as a checkable assertion. Empty if nothing applies.' },
          doneWhen: { type: 'string', description: 'Observable acceptance criteria.' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason'],
  properties: {
    refuted: { type: 'boolean', description: 'True if the claim is wrong, unsupported, or not caused by this PR.' },
    reason: { type: 'string' },
    correction: { type: 'string', description: 'If the claim is directionally right but stated wrong, the corrected claim. Otherwise "none".' },
  },
}

const GAPS_SCHEMA = {
  type: 'object',
  required: ['gaps'],
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['gap', 'why'],
        properties: { gap: { type: 'string' }, why: { type: 'string' } },
      },
    },
  },
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function refutePrompt(f) {
  return `${CONTEXT}

A PR reviewer made this claim. Your job is to REFUTE it.

  File: ${f.file}:${f.line}
  Severity: ${f.severity}
  Claim: ${f.claim}
  Stated evidence: ${f.evidence}
  Requested change: ${f.change}

Read the actual code at that location and decide. Refute it if: the code does not
say what the claim says, the problem is pre-existing and not introduced by this PR,
the "bug" is unreachable in practice, a guard elsewhere already handles it, or the
evidence does not actually support the claim.

Default to refuted=true when uncertain. A false finding posted to a colleague's PR
costs more than a missed one. If the claim is directionally right but inaccurately
stated, set refuted=false and put the accurate version in "correction".`
}

// codex writes its final message to a file rather than stdout, so nothing has to
// parse progress output. --output-schema constrains that message to VERDICT_SCHEMA.
function codexVerifyPrompt(f) {
  return `Verify a code review claim by shelling out to the codex CLI, then return
codex's verdict — not your own opinion — in the required schema.

Steps:

1. PROMPT=$(mktemp) SCHEMA=$(mktemp) OUT=$(mktemp)
   Use mktemp for all three. Other verifiers run concurrently and fixed filenames
   would be overwritten mid-flight.

2. Write this prompt verbatim to "$PROMPT":
---BEGIN PROMPT---
${refutePrompt(f)}
---END PROMPT---

3. Write this JSON Schema verbatim to "$SCHEMA":
${JSON.stringify(VERDICT_SCHEMA, null, 2)}

4. Run:
   codex exec --sandbox read-only --skip-git-repo-check \\
     --output-schema "$SCHEMA" --output-last-message "$OUT" - < "$PROMPT"

5. Read "$OUT". It contains JSON matching the schema. Return exactly those values.

If codex is missing, exits non-zero, times out, or "$OUT" is empty or not valid
JSON, return refuted=true with reason "codex verification unavailable: <what
happened>". An unverified claim must not reach the PR author.`
}

function verifyOne(f, vote) {
  const suffix = vote === undefined ? '' : `#${vote + 1}`
  if (verifyAgent === 'codex') {
    return agent(codexVerifyPrompt(f), {
      label: `codex-verify:${f.file}:${f.line}${suffix}`,
      phase: 'Verify',
      schema: VERDICT_SCHEMA,
    })
  }
  return agent(refutePrompt(f), {
    label: `verify:${f.file}:${f.line}${suffix}`,
    phase: 'Verify',
    schema: VERDICT_SCHEMA,
  })
}

async function judge(f, lens) {
  // Blockers get an odd-numbered panel at full tier; majority refutes kills it.
  const votes = (tier === 'full' && f.severity === 'blocker')
    ? (await parallel([0, 1, 2].map(i => () => verifyOne(f, i)))).filter(Boolean)
    : [await verifyOne(f)].filter(Boolean)

  if (!votes.length) {
    return { ...f, lens, survived: false, votes: 0, why: 'no verdict returned' }
  }

  const refutedCount = votes.filter(v => v.refuted).length
  const survived = refutedCount < Math.ceil(votes.length / 2)
  const correction = votes.map(v => v.correction).find(c => c && c !== 'none')

  return {
    ...f,
    lens,
    survived,
    votes: votes.length,
    why: votes.map(v => v.reason).join(' | '),
    // A correction rewrites the claim; evidence and change may still need a light
    // edit when rendering, so the original claim is kept for comparison.
    originalClaim: survived && correction ? f.claim : undefined,
    claim: survived && correction ? correction : f.claim,
  }
}

// ---------------------------------------------------------------------------
// Phase 1-2: review lenses, pipelined straight into verification
// ---------------------------------------------------------------------------

phase('Review')

const reviewed = await pipeline(
  LENSES,

  lens => agent(`${CONTEXT}\n\n${lens.prompt}`, {
    label: `review:${lens.key}`,
    phase: 'Review',
    schema: FINDINGS_SCHEMA,
  }),

  // Split material findings from suggestions, then cap. Whatever the cap drops is
  // carried forward, not discarded — a silent truncation reads as "nothing found".
  (result, lens) => {
    const found = (result && result.findings) || []
    const suggestions = found.filter(f => !MATERIAL.includes(f.severity))
    const material = found
      .filter(f => MATERIAL.includes(f.severity))
      .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))

    const toVerify = material.slice(0, MAX_VERIFY_PER_LENS)
    const dropped = material.slice(MAX_VERIFY_PER_LENS)

    if (dropped.length) {
      log(`lens ${lens.key}: ${material.length} material findings, verifying top ${toVerify.length} by severity — ${dropped.length} carried through unverified`)
    }

    return { lens: lens.key, toVerify, dropped, suggestions }
  },

  async ({ lens, toVerify, dropped, suggestions }) => {
    const judged = (await parallel(toVerify.map(f => () => judge(f, lens)))).filter(Boolean)
    return {
      judged,
      dropped: dropped.map(f => ({ ...f, lens })),
      suggestions: suggestions.map(f => ({ ...f, lens })),
    }
  },
)

const lensResults = reviewed.filter(Boolean)
const judged = lensResults.flatMap(r => r.judged)
const confirmed = judged.filter(f => f.survived)
const rejected = judged.filter(f => !f.survived)
const dropped = lensResults.flatMap(r => r.dropped)
const suggestions = lensResults.flatMap(r => r.suggestions)

log(`${confirmed.length} confirmed, ${rejected.length} refuted and dropped, ${dropped.length} unverified past the cap, ${suggestions.length} suggestions`)

// ---------------------------------------------------------------------------
// Phase 3: what did the review miss? Verification only ever removes findings.
// ---------------------------------------------------------------------------

let gaps = null
if (tier === 'full') {
  phase('Critic')
  gaps = await agent(
    `${CONTEXT}

A multi-lens review of this PR produced these confirmed findings:
${confirmed.map(f => `- ${f.file}:${f.line} [${f.severity}] ${f.claim}`).join('\n') || '(none)'}

Verification only ever removes findings — it can never add one. So: what did this
review fail to look at? Consider changed files nobody cited, a linked-issue
requirement nobody graded, a config or generated change nobody explained, and any
behavior changed without a corresponding test.

Report gaps in coverage, not new bugs you have not verified.`,
    { label: 'critic:gaps', phase: 'Critic', schema: GAPS_SCHEMA },
  )
}

return {
  confirmed,
  rejected: rejected.map(f => ({ file: f.file, line: f.line, claim: f.claim, why: f.why })),
  dropped,
  suggestions,
  gaps: (gaps && gaps.gaps) || [],
  stats: {
    tier,
    verifyAgent,
    lenses: LENSES.map(l => l.key),
    confirmed: confirmed.length,
    refuted: rejected.length,
    unverified: dropped.length,
  },
}
