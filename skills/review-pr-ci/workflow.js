export const meta = {
  name: 'review-pr-ci',
  description: 'Review a PR with two parallel lenses and one combined verifier',
  phases: [
    { title: 'Review', detail: 'two bounded review lenses' },
    { title: 'Verify', detail: 'one verifier checks every retained candidate' },
  ],
}

let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch {
    throw new Error('review-pr-ci: args arrived as a string that is not valid JSON')
  }
}

if (!input || !input.pr) {
  throw new Error('review-pr-ci: args.pr is required')
}

const {
  pr,
  issues = [],
  baseRef = 'origin/HEAD',
  diffStat = '',
  changedFiles = [],
  lintOutput = '',
  newDeps = [],
} = input

// This file contains the complete orchestration budget: two lens calls below and
// at most one verifier call. Do not add agent() calls without updating the skill
// contract and scripts/check-workflow.mjs.
const MAX_AGENTS = 3
const MAX_CANDIDATES_PER_LENS = 4
const REVIEW_MODEL = 'sonnet'
const REVIEW_EFFORT = 'medium'
const MATERIAL = new Set(['blocker', 'issue'])
const SEVERITY_RANK = { blocker: 0, issue: 1 }

const CONTEXT = `
PR ${pr.repo}#${pr.number}: ${pr.title || '(untitled)'}

PR body:
${pr.body || '(unavailable)'}

Linked issue specs:
${issues.map(i => `#${i.number}:\n${i.body}`).join('\n\n') || '(none available)'}

Changed files:
${changedFiles.join('\n') || '(not provided)'}

Diffstat:
${diffStat || '(not provided)'}

Lint output supplied by the caller:
${lintOutput || '(not run or clean)'}

New dependencies:
${newDeps.join(', ') || '(none detected)'}

The PR head is already checked out. Read the diff with:
git diff ${baseRef}...HEAD

You are read-only. Do not modify files, checkout refs, start servers, post to
GitHub, or delegate work through Agent, Task, or Workflow. Report defects only.
For each finding, use git blame to identify the short commit hash that introduced
the line. If it predates the PR, prefix it with "pre-existing" and keep it only
when this PR touches or depends on that behavior.
`

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      maxItems: MAX_CANDIDATES_PER_LENS,
      items: {
        type: 'object',
        required: ['file', 'line', 'severity', 'claim', 'evidence', 'doneWhen', 'provenance'],
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['blocker', 'issue', 'suggestion'] },
          claim: { type: 'string' },
          evidence: { type: 'string' },
          doneWhen: { type: 'string' },
          provenance: { type: 'string' },
          advisory: { type: 'string' },
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
        required: ['id', 'confirmed', 'reason', 'correction'],
        properties: {
          id: { type: 'string' },
          confirmed: { type: 'boolean' },
          reason: { type: 'string' },
          correction: { type: 'string' },
        },
      },
    },
  },
}

const LENSES = [
  {
    key: 'correctness',
    prompt: `Check linked-spec conformance, logic, async ordering, stale state,
null and error paths, and missing tests only when the missing coverage permits a
specific regression. Trace real code paths. Do not report style or preferences.`,
  },
  {
    key: 'risk',
    prompt: `Check authorization, unsafe inputs, injection, exposed secrets,
permissions, dependency changes, and operational regressions. When registry or
network access is unavailable, do not guess dependency health. Do not report
style, optional hardening, or pre-existing defects untouched by this PR.`,
  },
]

function compareFindings(a, b) {
  return (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
    a.file.localeCompare(b.file) || a.line - b.line
}

const lensResults = await parallel(LENSES.map(lens => async () => {
  const result = await agent(`${CONTEXT}\n\n${lens.prompt}\n\nReturn no more than ${MAX_CANDIDATES_PER_LENS} findings. Use suggestion severity as a discard bucket for anything that is not a defect.`, {
    label: `review:${lens.key}`,
    phase: 'Review',
    schema: FINDINGS_SCHEMA,
    model: REVIEW_MODEL,
    effort: REVIEW_EFFORT,
  })
  return { lens: lens.key, findings: result?.findings || [] }
}))

let discarded = 0
const dropped = []
const candidates = []

for (const result of lensResults.filter(Boolean)) {
  const material = result.findings.filter(f => MATERIAL.has(f.severity)).sort(compareFindings)
  discarded += result.findings.length - material.length
  const retained = material.slice(0, MAX_CANDIDATES_PER_LENS)
  dropped.push(...material.slice(MAX_CANDIDATES_PER_LENS).map(f => ({ ...f, lens: result.lens })))
  retained.forEach((finding, index) => {
    candidates.push({ ...finding, id: `${result.lens}:${index + 1}`, lens: result.lens })
  })
}

if (!candidates.length) {
  return {
    confirmed: [],
    rejected: [],
    dropped,
    stats: {
      maxAgents: MAX_AGENTS,
      agentsUsed: 2,
      model: REVIEW_MODEL,
      effort: REVIEW_EFFORT,
      candidates: 0,
      confirmed: 0,
      rejected: 0,
      unverified: dropped.length,
      discarded,
    },
  }
}

const verificationPrompt = `${CONTEXT}

Two reviewers produced these candidate findings:
${JSON.stringify(candidates, null, 2)}

Independently verify every candidate against the checked-out code and diff. Do
not delegate. Confirm only defects introduced by, touched by, or required for
this PR. Reject preferences, unsupported claims, unreachable failures, incorrect
anchors or provenance, and claims already handled elsewhere. For an advisory,
confirm only when the named package and pinned version are demonstrably inside
the published affected range; reject it when registry access is unavailable.

Return one verdict for every candidate id. Put "none" in correction unless the
defect is real but the claim needs narrower, accurate wording. Omitted ids are
treated as rejected.`

const verification = await agent(verificationPrompt, {
  label: 'verify:combined',
  phase: 'Verify',
  schema: VERDICTS_SCHEMA,
  model: REVIEW_MODEL,
  effort: REVIEW_EFFORT,
})

const verdicts = new Map((verification?.verdicts || []).map(v => [v.id, v]))
const confirmed = []
const rejected = []

for (const candidate of candidates) {
  const verdict = verdicts.get(candidate.id)
  if (verdict?.confirmed === true) {
    const correction = verdict.correction && verdict.correction !== 'none'
      ? verdict.correction
      : candidate.claim
    const { id, ...finding } = candidate
    confirmed.push({ ...finding, claim: correction, votes: 1 })
  } else {
    const { id, ...finding } = candidate
    rejected.push({
      ...finding,
      why: verdict?.reason || 'combined verifier returned no verdict for this candidate',
    })
  }
}

return {
  confirmed,
  rejected,
  dropped,
  stats: {
    maxAgents: MAX_AGENTS,
    agentsUsed: 3,
    model: REVIEW_MODEL,
    effort: REVIEW_EFFORT,
    candidates: candidates.length,
    confirmed: confirmed.length,
    rejected: rejected.length,
    unverified: dropped.length,
    discarded,
  },
}
