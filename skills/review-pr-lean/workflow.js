export const meta = {
  name: 'review-pr-lean',
  description: 'Fan out PR review lenses, then verify every finding in batched refuter agents',
  phases: [
    { title: 'Review', detail: 'one agent per review lens' },
    { title: 'Verify', detail: 'batched refuters; blocker panel; advisories against the registry' },
    { title: 'Critic', detail: 'coverage gaps, concurrent with Verify (full tier)' },
  ],
}

// @inject
// scripts/review.mjs prep replaces the line above with `const INJECTED = {...}` (PR context,
// diff) and writes the result to run.js, so the diff never passes through the main loop's
// output tokens. Small per-run choices (tier, verifyAgent) still arrive as `args`.

let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch {
    throw new Error('review-pr-lean: args arrived as a string that is not valid JSON')
  }
}
if (typeof INJECTED !== 'undefined') input = { ...INJECTED, ...(input || {}) }

if (!input || !input.pr) {
  throw new Error('review-pr-lean: args.pr is required — run scripts/review.mjs prep first')
}
if (input.tier === 'skip') {
  throw new Error('review-pr-lean: tier "skip" must not reach the workflow — run review-pr inline instead')
}

const {
  pr,
  root = '',
  issues = [],
  baseRef = 'origin/HEAD',
  diffStat = '',
  changedFiles = [],
  newDeps = [],
  diff = '',
  tier = 'full',
  verifyAgent = 'claude',
  blockerVotes,
  maxVerify,
} = input

// One verifier agent per BATCH findings instead of one per finding: the ~35k-token agent
// baseline is paid per batch, and reads of the same file are shared.
const BATCH = 6
const MAX_VERIFY = Number.isInteger(maxVerify) && maxVerify > 0 ? maxVerify : 24
const BLOCKER_VOTES =
  Number.isInteger(blockerVotes) && blockerVotes > 0 && blockerVotes % 2 === 1 ? blockerVotes : 3

const CHEAP = { model: 'sonnet', effort: 'medium' }
const WRAPPER = { model: 'haiku', effort: 'low' }

const MATERIAL = ['blocker', 'issue']
const SEVERITY_RANK = { blocker: 0, issue: 1 }
const isAdvisory = f => Boolean(f.advisory && f.advisory.trim() && f.advisory.trim() !== 'none')

const DIFF_BLOCK = diff
  ? `The PR diff is below, with each change shown inside its whole enclosing function.
Do not regenerate it.

\`\`\`diff
${diff}
\`\`\``
  : `Read the diff once with: git ${root ? `-C ${root} ` : ''}diff --function-context ${baseRef}...HEAD`

// Every agent turn re-sends this whole context, so turns are the cost driver. In past
// runs lenses averaged 15-25 tool calls each; the rules below exist to cut that.
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

The PR branch is already checked out${root ? ` at ${root} — resolve every file path against it, which may not be your working directory` : ''}. You are READ-ONLY: do not checkout, commit,
stash, start a dev server, or modify any file. Do not run lint, tests, typecheck,
git blame, git log, or any project script — checks and provenance are handled
outside this workflow.

Work in as few turns as you can. Answer from the diff first. Read another file only
when the diff cannot answer a question, and when you need several reads or greps,
issue them all in one turn as parallel tool calls instead of one per turn.

${DIFF_BLOCK}

Report defects only: something that is wrong, missing, or unsafe, with a
consequence you can name. Polish, preference, refactors, and "this would read
better as" are not findings. Give those severity "suggestion" and they are
discarded unread. Do not label one "issue" to get it seen — an unverified opinion
landing on the author is the specific failure this review exists to prevent.

Report only what this PR introduces or fails to fix: a line it added or changed, or
an unchanged line whose behavior this PR now depends on. Anchor "line" to the
line number in the PR's version of the file — derive it from the hunk header
(@@ -a,b +c,d @@ starts the new file at line c) or from a Read, never by guessing.
A verifier reading the wrong line will refute a real finding.
State "doneWhen" as an observable end state the author can check alone. Do not
prescribe the edit: no code, no config, no "replace X with Y".
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
    cheap: true,
    prompt: `Newly added dependencies: ${newDeps.join(', ') || '(none)'}.
For each, evaluate against the npm-policy skill's criteria and give a clear
APPROVED or REJECTED with a one-line reason.

When a pinned version falls inside a published advisory's affected range, set
"advisory" to the identifier (e.g. GHSA-xxxx-xxxx-xxxx) and state the finding as
a version fact: package, pinned version, severity, affected range, first patched
version. Do not weigh whether the app's configuration makes it exploitable, and
do not drop the finding because it is not — the remedy is the same patch bump
either way. The advisory id is checked against the registry before the finding
is published, so name one only when you have the range in front of you.`,
  },
  {
    key: 'clarity',
    cheap: true,
    prompt: `Find maintenance defects this PR introduces: behavior added with no
test covering it, logic duplicated such that one copy will silently diverge from
the other, and names or types that state something the code does not do. Every
finding needs a consequence you can name — what breaks, for whom, when. A cleaner
structure you would prefer is not a consequence. The diff cannot show that a test
is missing: before you claim or clear "untested", grep the spec/test files for the
changed behavior, all greps in one turn. Returning zero findings is the normal
outcome for this lens.`,
  },
]

const LENSES = tier === 'light'
  ? ALL_LENSES.filter(l => l.key === 'spec' || l.key === 'bugs')
  : ALL_LENSES.filter(l => l.key !== 'deps' || newDeps.length > 0)

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
        required: ['file', 'line', 'severity', 'claim', 'evidence', 'doneWhen'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['blocker', 'issue', 'suggestion'], description: 'blocker and issue are defects and are the only severities that reach anyone. "suggestion" is a discard bucket for non-defect observations — it is dropped unread, so use it freely rather than inflating an opinion to "issue".' },
          claim: { type: 'string', description: 'One sentence: what is wrong.' },
          evidence: { type: 'string', description: 'The specific code that makes this true.' },
          doneWhen: { type: 'string', description: 'Observable acceptance criteria the author can check without the reviewer. Constraints, not edits.' },
          advisory: { type: 'string', description: 'Published advisory identifier (GHSA/CVE) when this finding is a pinned version inside an advisory\'s affected range. Empty otherwise.' },
        },
      },
    },
  },
}

const VERDICTS_SCHEMA = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'refuted', 'reason', 'correction'],
        properties: {
          id: { type: 'string', description: 'The claim id, e.g. "F3".' },
          refuted: { type: 'boolean', description: 'True if the claim is wrong, unsupported, or not caused by this PR.' },
          reason: { type: 'string' },
          correction: { type: 'string', description: 'If the claim is directionally right but stated wrong, the corrected claim. Otherwise "none".' },
        },
      },
    },
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
// Verification — batched
// ---------------------------------------------------------------------------

const claimBlock = f => `${f.id} — ${f.file}:${f.line} [${f.severity}]${isAdvisory(f) ? ` advisory ${f.advisory}` : ''}
  Claim: ${f.claim}
  Stated evidence: ${f.evidence}
  Done when: ${f.doneWhen}`

function refutePrompt(fs) {
  return `${CONTEXT}

PR reviewers made the claims below. Your job is to REFUTE each one.

${fs.map(claimBlock).join('\n\n')}

Judge every claim on its own: one claim being real or false says nothing about the
others. For each, read the actual code at that location and decide. Refute it if:
the code does not say what the claim says, the problem is pre-existing and this PR
neither introduced it nor depends on it, the "bug" is unreachable in practice, a
guard elsewhere already handles it, or the evidence does not support the claim.
If the anchor is off by a few lines but the described code exists nearby, judge
that code — a wrong line number alone is not a refutation — and give the right
file:line in "correction".

Default to refuted=true when uncertain. A false finding posted to a colleague's PR
costs more than a missed one. If a claim is directionally right but inaccurately
stated, set refuted=false and put the accurate version in "correction".
Return exactly one verdict per id: ${fs.map(f => f.id).join(', ')}.`
}

// An advisory is a registry fact, not a judgement call: the check is whether the pinned
// version sits inside the published range, never whether it is exploitable here.
function advisoryPrompt(fs) {
  return `${CONTEXT}

PR reviewers reported these dependencies as sitting inside a published advisory's
affected range. Check each registry fact. Do not argue exploitability.

${fs.map(claimBlock).join('\n\n')}

Refute a claim if any of these is false: the advisory identifier exists and is
published; the package it covers is the package the claim names; the version
pinned in this PR's manifest or lockfile falls inside the advisory's affected
range; and this PR is what introduced or kept that pin.

Do NOT refute because the vulnerable path looks unreachable, because the app's
configuration makes it unexploitable, or because the severity seems overstated.
If the version fact holds but the wording is wrong, set refuted=false and put the
accurate version fact in "correction": package, pinned version, severity, affected
range, first patched version.

Look ids up with \`gh api /advisories/<id>\` for a GHSA id, or
\`gh api "/advisories?cve_id=<id>"\` for a CVE id; \`npm audit --json\` also works.
Issue the lookups for all ids in one turn. Default to refuted=true when you cannot
confirm the range. Return exactly one verdict per id: ${fs.map(f => f.id).join(', ')}.`
}

function codexPrompt(inner) {
  return `Verify code review claims by shelling out to the codex CLI, then return
codex's verdicts — not your own opinion — in the required schema.

1. PROMPT=$(mktemp) SCHEMA=$(mktemp) OUT=$(mktemp)
   Use mktemp: other verifiers run concurrently.

2. Write this prompt verbatim to "$PROMPT":
---BEGIN PROMPT---
${inner}
---END PROMPT---

3. Write this JSON Schema verbatim to "$SCHEMA":
${JSON.stringify(VERDICTS_SCHEMA, null, 2)}

4. Run:
   codex exec --sandbox read-only --skip-git-repo-check \\
     --output-schema "$SCHEMA" --output-last-message "$OUT" - < "$PROMPT"

5. Read "$OUT" and return exactly its values.

If codex is missing, exits non-zero, times out, or "$OUT" is empty or not valid
JSON, return refuted=true for every id with reason "codex verification
unavailable: <what happened>". An unverified claim must not reach the PR author.`
}

const chunk = xs => Array.from({ length: Math.ceil(xs.length / BATCH) }, (_, i) => xs.slice(i * BATCH, (i + 1) * BATCH))

// One batch → one agent. Advisories always verify with claude: codex's read-only sandbox
// has no network, so every registry lookup there would fail into "refuted".
function verifyBatch(fs, label, inherit) {
  const advisory = isAdvisory(fs[0])
  const prompt = advisory ? advisoryPrompt(fs) : refutePrompt(fs)
  if (verifyAgent === 'codex' && !advisory) {
    return agent(codexPrompt(prompt), { label: `codex-${label}`, phase: 'Verify', schema: VERDICTS_SCHEMA, ...WRAPPER })
  }
  return agent(prompt, { label, phase: 'Verify', schema: VERDICTS_SCHEMA, ...(inherit ? {} : CHEAP) })
}

// ---------------------------------------------------------------------------
// Review → dedup → verify
// ---------------------------------------------------------------------------

phase('Review')

// Barrier: dedup needs every lens before anything is verified.
const reviews = await parallel(LENSES.map(lens => () => agent(`${CONTEXT}\n\n${lens.prompt}`, {
  label: `review:${lens.key}`,
  phase: 'Review',
  schema: FINDINGS_SCHEMA,
  ...(lens.cheap ? CHEAP : {}),
})))

let discarded = 0
let merged = 0
const bySpot = new Map()
const gaps = []

LENSES.forEach((lens, i) => {
  const r = reviews[i]
  if (!r) {
    gaps.push({ gap: `lens ${lens.key} returned nothing`, why: 'its concern was not reviewed; re-run that lens' })
    return
  }
  const found = r.findings || []

  const bucket = found.filter(f => !MATERIAL.includes(f.severity))
  discarded += bucket.length

  for (const f of found.filter(f => MATERIAL.includes(f.severity))) {
    const key = isAdvisory(f) ? `${f.file}:${f.line}:${f.advisory.trim()}` : `${f.file}:${f.line}`
    const prev = bySpot.get(key)
    if (!prev) {
      bySpot.set(key, { ...f, lens: lens.key, lenses: [lens.key] })
      continue
    }
    merged++
    if (!prev.lenses.includes(lens.key)) prev.lenses.push(lens.key)
    if ((SEVERITY_RANK[f.severity] ?? 9) < (SEVERITY_RANK[prev.severity] ?? 9)) {
      Object.assign(prev, { severity: f.severity, claim: f.claim, evidence: f.evidence, doneWhen: f.doneWhen })
    }
  }
})

if (discarded) log(`${discarded} non-defect finding(s) discarded before verification`)
if (merged) log(`${merged} duplicate finding(s) merged across lenses before verification`)

// Highest severity first. Batching makes each extra finding cheap, so the cap is total and
// generous; whatever it drops is returned, never silently truncated. Advisories are exempt.
const material = [...bySpot.values()]
  .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))

const toVerify = []
const dropped = []
for (const f of material) {
  if (isAdvisory(f) || toVerify.filter(x => !isAdvisory(x)).length < MAX_VERIFY) toVerify.push(f)
  else dropped.push({ ...f, why: `past the ${MAX_VERIFY}-finding verification cap` })
}
toVerify.forEach((f, i) => { f.id = `F${i + 1}` })
if (dropped.length) log(`${dropped.length} finding(s) past the verification cap carried through unverified`)

phase('Verify')

const blockers = toVerify.filter(f => f.severity === 'blocker' && !isAdvisory(f))
const plain = toVerify.filter(f => f.severity !== 'blocker' && !isAdvisory(f))
const advisoryFindings = toVerify.filter(isAdvisory)
const panel = tier === 'full' ? BLOCKER_VOTES : 1

// Blockers: `panel` independent agents, each judging the whole blocker batch on the session
// model. Majority per finding across them. Everything else: one vote, cheaper model.
const jobs = [
  ...chunk(blockers).flatMap((fs, c) =>
    Array.from({ length: panel }, (_, v) => () => verifyBatch(fs, `verify:blockers${c + 1}#${v + 1}`, true))),
  ...chunk(plain).map((fs, c) => () => verifyBatch(fs, `verify:issues${c + 1}`, false)),
  ...chunk(advisoryFindings).map((fs, c) => () => verifyBatch(fs, `verify:advisories${c + 1}`, false)),
]

// The critic needs only the candidate list, not verdicts, so it runs beside verification
// instead of after it. Verification only removes findings; this is the push the other way.
const criticJob = () => agent(`${CONTEXT}

A multi-lens review of this PR produced these candidate findings (verification is
running now):
${toVerify.map(f => `- ${f.file}:${f.line} [${f.severity}] ${f.claim}`).join('\n') || '(none)'}

What did this review fail to look at? Consider changed files nobody cited, a
linked-issue requirement nobody graded, a config or generated change nobody
explained, and behavior changed without a corresponding test. Report gaps in
coverage, not new bugs you have not verified. One short line each.`,
  { label: 'critic:gaps', phase: 'Critic', schema: GAPS_SCHEMA, ...CHEAP })

const [verifyResults, critic] = await Promise.all([parallel(jobs), tier === 'full' ? criticJob() : null])
if (critic) gaps.push(...(critic.gaps || []))
const batches = verifyResults.filter(Boolean)
const verdictsById = new Map()
for (const b of batches) {
  const seen = new Set()
  for (const v of b.verdicts || []) {
    if (seen.has(v.id)) continue
    seen.add(v.id)
    if (!verdictsById.has(v.id)) verdictsById.set(v.id, [])
    verdictsById.get(v.id).push(v)
  }
}

// A claim with no verdict is not confirmed — no verifier vouched for it.
const judged = toVerify.map(f => {
  const votes = (verdictsById.get(f.id) || []).slice(0, f.severity === 'blocker' && !isAdvisory(f) ? panel : 1)
  if (!votes.length) return { ...f, survived: false, votes: 0, why: 'no verdict returned' }
  const survived = votes.filter(v => v.refuted).length < Math.ceil(votes.length / 2)
  const correction = votes.map(v => v.correction).find(c => c && c !== 'none')
  return {
    ...f,
    survived,
    votes: votes.length,
    why: votes.map(v => v.reason).join(' | '),
    originalClaim: survived && correction ? f.claim : undefined,
    claim: survived && correction ? correction : f.claim,
  }
})

const confirmed = judged.filter(f => f.survived)
const rejected = judged.filter(f => !f.survived)
const advisories = confirmed.filter(isAdvisory)

log(`${confirmed.length} confirmed (${advisories.length} advisory), ${rejected.length} refuted, ${dropped.length} unverified, ${discarded} non-defect discarded, ${jobs.length} verifier agent(s)`)

return {
  confirmed,
  rejected: rejected.map(f => ({ file: f.file, line: f.line, claim: f.claim, why: f.why })),
  dropped,
  gaps,
  stats: {
    tier,
    verifyAgent,
    lenses: LENSES.map(l => l.key),
    confirmed: confirmed.length,
    refuted: rejected.length,
    unverified: dropped.length,
    discarded,
    merged,
    advisories: advisories.length,
    verifierAgents: jobs.length,
  },
}
