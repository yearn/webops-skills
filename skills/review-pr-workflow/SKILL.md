---
name: review-pr-workflow
description: Multi-agent PR review — fans out review lenses, adversarially verifies every material claim before it reaches the author, then posts via the review-pr format after explicit approval
---

## Activation Criteria
Use this skill when:
- User says `/review-pr-workflow`
- User asks for a multi-agent, verified, or "deep" PR review
- User asks to review a PR and explicitly wants fan-out / subagent verification

For an ordinary single-pass review, use `review-pr` instead. This skill costs many times more tokens.

## Scope

Same scope as `review-pr`: **web/frontend projects** (React, TypeScript, Next.js). This skill inherits `review-pr`'s review format, its rules for writing actionable change requests, and its approval gate — it changes only *how the findings are produced*, not what a review looks like or who gets to post it.

## Arguments

```
/review-pr-workflow <pr-url-or-number> [verify-agent=claude|codex] [tier=auto|full|light|skip]
```

| Arg | Default | Meaning |
|-----|---------|---------|
| `verify-agent` | `claude` | Which agent verifies findings in Phase 2. `claude` uses the session model. `codex` shells out to the `codex` CLI. |
| `tier` | `auto` | How much horsepower to spend. `auto` detects from the diff (see Tier Detection). Anything else overrides detection. |

Example: `/review-pr-workflow https://github.com/yearn/kong/pull/412 verify-agent=codex tier=full`

### Why `verify-agent=codex`

A second Claude instance shares the first one's blind spots — it tends to find the same false positives plausible. Codex is a different model, so its verification is genuinely independent. Prefer it when the review will request changes on someone else's PR, or when a finding rests on subtle reasoning rather than a plain fact about the code.

Requires the `codex` CLI on PATH. If it is missing, say so and fall back to `claude` — do not silently substitute.

## Requirements

- GitHub tooling with read/write access to PRs and issues
- Playwright or browser automation tooling for visual verification
- `codex` CLI on PATH (only when `verify-agent=codex`)

---

## Phase 0 — Main loop (before any subagent)

Do all of this yourself. Subagents share one working directory; if they check out branches or start dev servers they race each other.

1. **Fetch PR details** — description, metadata, changed files, diff, existing reviews.
2. **Read the PR body for instructions** — author's review notes, linked issues (`Closes #123`, `Fixes #456`, URLs).
3. **Fetch linked issues** — read each issue body for the original spec. The review is graded against this, not against the PR description.
4. **Checkout the PR branch locally.** Do this once, here. Every workflow agent is read-only from this point.
5. **Run project linters** — `bun run lint`, `npm run lint`, whatever the project defines. Capture the output; it goes into the workflow as context so five agents don't each re-run it.
6. **Detect new dependencies** — if `package.json` changed, list newly added packages. These feed the dependency lens.
7. **Detect the tier** (below) and **state it out loud with its reason** before spawning anything.

### Tier Detection

Read `gh pr diff --name-only` and `--stat`. Two rules govern everything:

**Sensitivity can only upgrade. Size can only downgrade. Sensitivity wins.**

The failure that matters is under-reviewing a small dangerous diff, not overspending on a big boring one.

**Force `full` — any single hit, regardless of diff size:**
- paths matching `auth`, `session`, `token`, `crypto`, `permission`, `role`, `acl`
- `package.json` with an **added** dependency
- `.github/workflows/`, CI config, build config
- database migrations or schema changes
- code that reads env vars, or config selecting a network / endpoint / contract address
- signing scripts, chain config, hardcoded addresses

**Downgrade to `light`** only when no sensitivity trigger fired **and both**:
- the diff spans ≤ 2 top-level source directories
- ≤ ~150 net source lines, **after excluding** lockfiles, generated files, snapshots, fixtures, translations

**`skip` the workflow entirely** — review inline with plain `review-pr`:
- docs- or comments-only
- lockfile-only, or a pure version bump
- generated-file-only
- a clean revert of a single commit with no manual edits

**Not criteria:** raw line count (a 2,000-line lockfile is nothing; a 40-line auth change is everything), and bot authorship (a Dependabot PR bumping a transitive dep is exactly when dependency policy matters most).

**When signals conflict or a path is ambiguous, escalate.** This detector reads paths and line counts, not semantics — it cannot see a logic change hiding inside what looks like a rename.

**Never downgrade silently.** Always print the tier and why:
> `tier: light — 2 files, ~60 net lines, no sensitive paths. Override with tier=full.`

### Tier → workflow shape

| Tier | Review lenses | Verify votes per finding | Critic |
|------|---------------|--------------------------|--------|
| `full` | all 5 | 3 for blockers, 1 otherwise | yes |
| `light` | spec-conformance + bugs | 1 | no |
| `skip` | — run `review-pr` instead — | | |

---

## Phase 1–3 — The workflow

Call `Workflow` with the script below, passing Phase 0's output as `args`:

```json
{
  "pr": { "number": 412, "title": "...", "body": "...", "repo": "yearn/kong" },
  "issues": [{ "number": 398, "body": "..." }],
  "diffStat": "...",
  "changedFiles": ["src/a.ts", "src/b.tsx"],
  "lintOutput": "...",
  "newDeps": ["some-package"],
  "tier": "full",
  "verifyAgent": "claude"
}
```

Pass these as real JSON values, not a JSON-encoded string.

```javascript
export const meta = {
  name: 'review-pr-workflow',
  description: 'Fan out PR review lenses, adversarially verify each material claim, then critique for gaps',
  phases: [
    { title: 'Review', detail: 'one agent per review lens' },
    { title: 'Verify', detail: 'refute each material finding' },
    { title: 'Critic', detail: 'what did the review miss' },
  ],
}

const { pr, issues, diffStat, changedFiles, lintOutput, newDeps, tier, verifyAgent } = args

const CONTEXT = `
PR ${pr.repo}#${pr.number}: ${pr.title}

PR body:
${pr.body}

Linked issue specs (the PR is graded against these, not against its own description):
${(issues || []).map(i => `#${i.number}:\n${i.body}`).join('\n\n') || '(none)'}

Changed files:
${(changedFiles || []).join('\n')}

Diffstat:
${diffStat}

Lint output (already run — do not re-run):
${lintOutput || '(clean)'}

The PR branch is already checked out. You are READ-ONLY: do not checkout,
commit, stash, start a dev server, or modify any file.
Read the diff with: git diff origin/HEAD...HEAD
`

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
leaked secrets or tokens, unsafe redirects, overly broad CORS, and data exposed
to the client that should not be. Report only what this diff introduces or fails
to fix — not pre-existing issues elsewhere in the repo.`,
  },
  {
    key: 'deps',
    prompt: `Newly added dependencies: ${(newDeps || []).join(', ') || '(none)'}.
For each, evaluate against the npm-policy skill's criteria and give a clear
APPROVED or REJECTED with a one-line reason. If there are no new dependencies,
return zero findings — do not manufacture any.`,
  },
  {
    key: 'clarity',
    prompt: `Find code that will be expensive to maintain: misleading names,
duplicated logic that should be shared, functions doing several unrelated things,
and missing tests for behavior this PR introduces. Be selective — only raise what
you would genuinely block or comment on, never nitpicks.`,
  },
]

const LENSES = tier === 'light'
  ? ALL_LENSES.filter(l => l.key === 'spec' || l.key === 'bugs')
  : ALL_LENSES

// Verify at most this many findings per lens, highest severity first, so the
// agent count stays bounded and the selection is deterministic across resumes.
const MAX_VERIFY_PER_LENS = 4
const SEVERITY_RANK = { blocker: 0, issue: 1, suggestion: 2 }

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
    correction: { type: 'string', description: 'If the claim is directionally right but stated wrong, the corrected version.' },
  },
}

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

function verifyOne(f) {
  if (verifyAgent === 'codex') {
    return agent(
      `Shell out to codex and return ONLY the verdict it produces, as the schema requires.

Write the prompt below to a temp file to avoid shell quoting problems. Allocate the
path with \`mktemp\` — other verifiers are running concurrently, so a fixed filename
would be overwritten mid-flight. Then:

  codex exec --skip-git-repo-check - < "$TMPFILE"

The prompt to write to that file:
---
${refutePrompt(f)}

Answer in exactly this form and nothing else:
REFUTED: yes|no
REASON: <one or two sentences>
CORRECTION: <corrected claim, or "none">
---

Parse codex's answer into the schema. If codex fails, errors, or returns nothing
parseable, set refuted=true with reason "codex verification unavailable" — an
unverified claim does not reach the author.`,
      { label: `codex-verify:${f.file}:${f.line}`, phase: 'Verify', schema: VERDICT_SCHEMA },
    )
  }
  return agent(refutePrompt(f), {
    label: `verify:${f.file}:${f.line}`,
    phase: 'Verify',
    schema: VERDICT_SCHEMA,
  })
}

phase('Review')

const reviewed = await pipeline(
  LENSES,
  lens => agent(`${CONTEXT}\n\n${lens.prompt}`, {
    label: `review:${lens.key}`,
    phase: 'Review',
    schema: FINDINGS_SCHEMA,
  }),

  // Rank, cap, and log the cap — a silent truncation reads as "nothing found".
  (result, lens) => {
    const found = (result && result.findings) || []
    const ranked = found.slice().sort(
      (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
    )
    const kept = ranked.slice(0, MAX_VERIFY_PER_LENS)
    if (ranked.length > kept.length) {
      log(`lens ${lens.key}: ${ranked.length} findings, verifying top ${kept.length} by severity — ${ranked.length - kept.length} dropped unverified`)
    }
    return { lens: lens.key, kept }
  },

  // Each finding's verifiers run concurrently; blockers get a 3-vote panel.
  async ({ lens, kept }) => {
    const judged = await parallel(kept.map(f => async () => {
      const votes = (tier === 'full' && f.severity === 'blocker')
        ? (await parallel([0, 1, 2].map(() => () => verifyOne(f)))).filter(Boolean)
        : [await verifyOne(f)].filter(Boolean)

      if (!votes.length) return { ...f, lens, survived: false, why: 'no verdict returned' }

      const refutedCount = votes.filter(v => v.refuted).length
      const survived = refutedCount < Math.ceil(votes.length / 2)
      const correction = votes.map(v => v.correction).find(c => c && c !== 'none')

      return {
        ...f,
        lens,
        survived,
        votes: votes.length,
        why: votes.map(v => v.reason).join(' | '),
        claim: survived && correction ? correction : f.claim,
      }
    }))
    return judged.filter(Boolean)
  },
)

const all = reviewed.filter(Boolean).flat()
const confirmed = all.filter(f => f.survived)
const rejected = all.filter(f => !f.survived)

log(`${confirmed.length} findings confirmed, ${rejected.length} refuted and dropped`)

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
behavior changed without a corresponding test. Report gaps in coverage, not new
bugs you have not verified.`,
    {
      label: 'critic:gaps',
      phase: 'Critic',
      schema: {
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
      },
    },
  )
}

return {
  confirmed,
  rejected: rejected.map(f => ({ file: f.file, line: f.line, claim: f.claim, why: f.why })),
  gaps: (gaps && gaps.gaps) || [],
  tier,
  verifyAgent,
}
```

---

## Phase 4 — Main loop (after the workflow returns)

1. **Visual verification with Playwright** — do this **here**, not in the fan-out. Parallel agents each starting a dev server collide on the same port.
   - Start the dev server, navigate to affected routes, screenshot UI changes, interact with changed components.
   - Save screenshots to `/tmp/pr-review-{pr-number}/`, never inside the repo.
   - Skip entirely when the PR touches no UI.

2. **Assemble the review** using `review-pr`'s Review Format, with these rules:
   - Only `confirmed` findings become Issues. Refuted findings never reach the author.
   - Every change request follows `review-pr`'s **Writing Actionable Change Requests** — anchored to code, constraints in the same bullet as the imperative, retentions stated as checkable assertions, end state described. The schema's `change` / `keep` / `doneWhen` fields map directly onto that format.
   - `gaps` go under Suggestions, phrased as coverage the review did not reach — never as findings, since they were not verified.
   - Verdict: `REQUEST_CHANGES` if any confirmed blocker survived, else `COMMENT` if any confirmed issue, else `APPROVE`.

3. **Preview the review for the user.** Output the full review as plain markdown text in the conversation. Do not skip this. Do not substitute a tool-call preview.

   Report alongside it: the tier and why it was chosen, `verify-agent` used, how many findings were refuted and dropped, and anything dropped unverified by the per-lens cap.

4. **Post only after explicit approval.** Do not call any GitHub write tool before the user approves this specific review. A prior approval, a plan that mentioned posting, or this skill's own existence does not count.

5. **Cleanup** — delete every screenshot created during verification.

## User Confirmation

**CRITICAL** — inherited from `review-pr` and non-negotiable here:

- Always ask before posting a review, approving, requesting changes, or posting comments.
- **Never perform write/mutating operations on GitHub without explicit user confirmation.**
- The workflow itself can never post. It returns findings; you render them; the user approves; only then does anything reach GitHub.

## Attribution

Replace `review-pr`'s attribution footer with:

```
---

## How This Was Reviewed
Reviewed with the [review-pr-workflow skill](https://github.com/yearn/webops/blob/main/skills/review-pr-workflow/SKILL.md) —
{N} review lenses, each finding independently verified by {verify-agent}. {M} candidate findings were refuted and dropped.
```

## Notes

- This skill is expensive. Prefer `review-pr` for routine PRs; the tier detector exists to keep you honest about that.
- Verification removes findings and never adds them — the critic phase is the only thing that pushes back on under-review.
- Refuted findings are worth reporting to the user even though they never reach the author. A pattern in what gets refuted is a signal that a lens prompt needs tuning.
- If `codex` is requested but missing, say so and fall back to `claude`. Never silently substitute a verifier.
