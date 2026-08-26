---
name: review-pr-workflow
description: Multi-agent PR review — fans out review lenses, verifies every claim before it reaches the author, then posts via the review-pr format after explicit approval
---

## Activation Criteria
Use this skill when:
- User says `/review-pr-workflow`
- User asks for a multi-agent, verified, or "deep" PR review
- User asks to review a PR and explicitly wants fan-out / subagent verification

For an ordinary single-pass review, use `review-pr` instead. This skill costs many times more tokens.

## Scope

Same scope as `review-pr`: **web/frontend projects** (React, TypeScript, Next.js). This skill inherits `review-pr`'s review format, its rules for writing findings, and its approval gate — it changes only *how the findings are produced*, not what a review looks like or who gets to post it.

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

Advisory findings are the one exception: they are always verified by `claude`, whatever `verify-agent` says. The check is a registry lookup (`gh api /advisories/…`), and codex runs in a read-only sandbox with no network, so it could only ever answer "cannot confirm" — which the prompt correctly treats as refuted. There is no independence to buy on a version fact.

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

| Tier | Review lenses | Verify votes: blocker / issue / advisory | Critic |
|------|---------------|-----------------------------------------|--------|
| `full` | all 5 | 3 / 1 / 1 | yes |
| `light` | spec-conformance + bugs | 1 / 1 / 1 | no |
| `skip` | — run `review-pr` instead — | | |

**A review carries defects and nothing else.** There is no suggestions section, and non-blocking observations are not published — the workflow discards them before verification and returns no channel that could carry one to the author. "Non-blocking" never meant free: the author still pays a context switch to read it, judge it, and answer it, and the ones that turn out to be wrong cost the full round trip they were supposedly too cheap to matter. So the lens schema keeps a `suggestion` severity purely as a sink — it gives an agent somewhere to put an opinion other than `issue`, and everything in it is dropped unread and reported to you only as a count.

**Nothing is exempt from verification, advisories included.** Every finding that can reach the author carries at least one verifier verdict; there is no severity and no identifier that routes around it. What an `advisory` finding changes is the question asked, not whether one is asked. A refuter handed a CVE will argue about whether the app's configuration makes it exploitable, which is the wrong question — the remedy is the same patch bump either way, and that argument comes out differently run to run. So an advisory gets a single registry check instead: does the pinned version actually fall inside the published affected range, for this package, introduced by this PR? Cannot cite the range, cannot publish the finding. It stays one vote even at `full` tier — a panel would buy three copies of the same lookup.

---

## Phase 1–3 — The workflow

The workflow script lives beside this file at `workflow.js`. **Do not paste it inline** — invoke it by path, so what executes is exactly what is in the repo and reviewed in git:

```
Workflow({
  scriptPath: "<this skill's base directory>/workflow.js",
  args: { ...Phase 0 output... }
})
```

The base directory is handed to you when the skill is invoked ("Base directory for this skill: ..."). Under the standard `export.sh` install it resolves to `~/.claude/skills/review-pr-workflow/workflow.js`.

### args

Pass these as real JSON values, never a JSON-encoded string.

| field | required | notes |
|-------|----------|-------|
| `pr` | yes | `{ repo, number, title, body }` |
| `issues` | no | `[{ number, body }]` — linked issue specs. Empty means the review grades against the PR description and says so. |
| `baseRef` | no | Base to diff against, e.g. `origin/main`. Defaults to `origin/HEAD`; pass it explicitly when the PR targets anything else. |
| `diffStat` | no | Output of `gh pr diff --stat` |
| `changedFiles` | no | Array of paths |
| `lintOutput` | no | Phase 0's lint result, so five agents don't each re-run it |
| `newDeps` | no | Newly added package names |
| `tier` | no | `full` or `light`. `skip` throws — run `review-pr` inline instead. |
| `verifyAgent` | no | `claude` (default) or `codex` |

### returns

| field | contents |
|-------|----------|
| `confirmed` | Findings that survived verification. These become Issues, and they are the only thing that becomes anything. Every entry has `votes >= 1`, advisories included — an advisory's single vote is a registry check, not a refutation attempt. |
| `rejected` | Refuted findings, with the refutation reason. **Never shown to the author** — report to the user only. |
| `dropped` | Material findings the per-lens cap left unverified. Not publishable as-is. |
| `gaps` | Critic's coverage gaps (`full` tier only). Never in the review; listed to the user in step 4 so they can decide whether to re-run a lens. |
| `stats` | `{ tier, verifyAgent, lenses, confirmed, refuted, unverified, discarded, advisories }` — `discarded` counts non-defect findings dropped before verification. |

### Cost

Agent count scales with findings, not diff size. A PR yielding 2 blockers and 5 issues costs ~17 agents at `full` tier (advisories are exempt from the cap — every one gets its registry check), ~7 at `light`. `MAX_VERIFY_PER_LENS` in `workflow.js` is the ceiling knob.

---

## Phase 4 — Main loop (after the workflow returns)

1. **Visual verification with Playwright** — do this **here**, not in the fan-out. Parallel agents each starting a dev server collide on the same port.
   - Start the dev server, navigate to affected routes, screenshot UI changes, interact with changed components.
   - Save screenshots to `/tmp/pr-review-{pr-number}/`, never inside the repo.
   - Skip entirely when the PR touches no UI.

2. **Merge duplicate findings first.** The lenses overlap on purpose, so one defect routinely arrives two to four times in different words. That is a confidence signal, not four defects. Collapse `confirmed` entries naming the same defect at the same anchor into one, keeping the highest severity, the strictest `doneWhen`, and the `provenance` (they must agree; if they do not, one of the findings is wrong — verify before merging). Report the collapse in step 4, never in the review body — vote counts are your evidence, not the author's.

3. **Assemble the review** using `review-pr`'s Review Format. Each return field has exactly one destination — do not mix them:

   | field | goes to |
   |-------|---------|
   | `confirmed` | **Issues.** The only findings stated as defects. State an entry with an `advisory` id as a version fact — package, pinned version, severity, affected range, first patched version — and say plainly if it is not exploitable in this codebase. Do not drop it on that basis. |
   | `gaps` | **Nowhere in the review.** Listed to the user in step 4. |
   | `dropped` | **Nowhere in the review.** Report to the user only (step 4). |
   | `rejected` | **Nowhere in the review.** Report to the user only (step 4). |

   `confirmed` is the only field that reaches the author. The other four do not, and that is the design: every finding in the review body carries a verifier verdict, so there is no section where an unverified claim could sit. If you find yourself wanting to append a note that is not a confirmed defect — a coverage gap, a refuted-but-interesting claim, a stylistic preference — it does not go in the review.

   - Every finding follows `review-pr`'s **Writing Findings** — consequence first, anchored to code, a checkable `Done when:`, a `Provenance:` hash, and no prescribed edit. The schema's `doneWhen` / `provenance` fields map directly onto that format.
   - Verdict: `REQUEST_CHANGES` if any confirmed blocker survived, else `COMMENT` if any confirmed issue, else `APPROVE`. `dropped` findings never affect the verdict — an unverified claim is not evidence.

   **Length is a correctness property here, not a matter of taste.** A review the author skims is a review that gets partly implemented, and the blocker is what gets skipped. Hold to all of these:

   - **One finding, one bullet.** Claim in a single sentence, then `Done when:` and `Provenance:`, one line each. Never a `Change:` line, never a code or config block — see **Writing Findings** item 5.
   - **Rewrite every claim in plain language — never render the agent's `claim` verbatim.** Agent claims are written mechanism-first to convince a verifier; the author needs consequence-first prose a human parses on the first read. Open each finding with a short bolded label naming the problem class ("Retention tier validation bug"), then one sentence saying what goes wrong and why anyone should care, in ordinary words. Mechanism details (operator names, prototype chains, internal identifiers) go after the consequence, inside `Done when:` as a constraint, or nowhere.
     - Bad: "reportRoute accepts Object.prototype members as tiers — `parts[0] in RETENTION_TIERS` matches `toString`/`constructor`/`__proto__`."
     - Good: "**Retention tier validation bug (high)** — a few JavaScript built-in names (`toString`, `constructor`) accidentally pass as valid tiers, and a report published under one is stored with no expiration — it quietly never gets deleted."
     - Test: if the claim sentence names a function or operator before it names the consequence, rewrite it.
   - **Give every finding a priority — `(high)`, `(medium)`, or `(low)` after its bolded label.** Priority is real-world consequence: data exposure or loss above crashes, crashes above debt, debt above polish. You assign it during assembly, since only you see all lenses. It is independent of the blocker/issue split — that split decides the verdict, priority tells the author what to fix first. Sort most-severe-first.
   - **Never paste `evidence` into the review.** That field is the agent's justification *to you*, and you already accepted it by confirming the finding. The author needs the anchor and at most one short quote of the offending code — not the reasoning chain, not the spec excerpt, not the git archaeology.
   - **Budget roughly 60 words per finding and 400 for the whole body.** Over budget means you are re-arguing a verdict you have already reached. Cut the argument, keep the instruction.
   - **No preamble, no restatement of the PR.** At most one sentence on what is already right. The author knows what they built.
   - The Review Format's bullet shape is a **ceiling, not a starting point**. Prose paragraphs under a finding mean you have blown past it.

4. **Preview the review for the user.** Output the full review as plain markdown text in the conversation. Do not skip this. Do not substitute a tool-call preview.

   Then, in **no more than four lines** outside the review body, report counts only: tier and why, `verify-agent`, `stats.refuted`, `stats.discarded`, `stats.advisories`, any duplicate collapse from step 2, and `stats.unverified`. Counts, not contents — do not summarise a refuted claim. Two exceptions to the line budget — if `gaps` is non-empty, list each gap in one line so the user can decide whether to re-run a lens; and if `stats.unverified` is non-zero, list those findings explicitly and say plainly that the review is not exhaustive; raising `MAX_VERIFY_PER_LENS` or re-running that lens is the fix.

5. **Post only after explicit approval.** Do not call any GitHub write tool before the user approves this specific review. A prior approval, a plan that mentioned posting, or this skill's own existence does not count.

6. **Cleanup** — delete every screenshot created during verification.

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
- Brevity is part of the deliverable, and this skill fights you on it: the workflow returns agent-facing prose — `claim` and `evidence` written at length to convince *you* a finding is real. Render that verbatim and the author gets a wall of text. More lenses must not mean a longer review.
- Verification removes findings and never adds them — the critic phase is the only thing that pushes back on under-review.
- Refuted findings are worth reporting to the user even though they never reach the author. A pattern in what gets refuted is a signal that a lens prompt needs tuning.
- If `codex` is requested but missing, say so and fall back to `claude`. Never silently substitute a verifier.
- Editing `workflow.js`: it is plain JS in an async context — no TypeScript, and `Date.now()` / `Math.random()` / `new Date()` throw, because they would break workflow resume. `scripts/check-workflow.mjs` exercises the control flow against stub agents; run it after any change.
