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
| `verify-agent` | `claude` | Which agent verifies findings in Phase 2. `claude` uses the pinned review model. `codex` shells out to the `codex` CLI. |
| `tier` | `auto` | How much horsepower to spend. `auto` detects from the diff (see Tier Detection). Anything else overrides detection — upgrades only. |

Both map straight onto `phase0.mjs` flags: `--verify-agent=`, `--tier=`.

Example: `/review-pr-workflow https://github.com/yearn/kong/pull/412 verify-agent=codex tier=full`

### Why `verify-agent=codex`

A second Claude instance shares the first one's blind spots — it tends to find the same false positives plausible. Codex is a different model, so its verification is genuinely independent. Prefer it when the review will request changes on someone else's PR, or when a finding rests on subtle reasoning rather than a plain fact about the code.

Requires the `codex` CLI on PATH. If it is missing, say so and fall back to `claude` — do not silently substitute.

Advisory findings are the one exception: they are always verified by `claude`, whatever `verify-agent` says. The check is a registry lookup (`gh api /advisories/…`), and codex runs in a read-only sandbox with no network, so it could only ever answer "cannot confirm" — which the prompt correctly treats as refuted. There is no independence to buy on a version fact.

## Requirements

- `gh` CLI, authenticated, with read/write access to PRs and issues
- Node (for `scripts/phase0.mjs`)
- A clean working tree in a checkout of the PR's repo — Phase 0 checks out the PR head
- Playwright or browser automation tooling for visual verification
- `codex` CLI on PATH (only when `verify-agent=codex`)

---

## Phase 0 — Main loop (before any subagent)

**Run the script. Do not assemble any of this by hand.**

```
node <skill base directory>/scripts/phase0.mjs <pr-url-or-number> [--tier=full|light] [--verify-agent=claude|codex]
```

It prints one JSON object on stdout — that object is `args` for the workflow, verbatim, with no edits. Progress, the tier line and warnings go to stderr.

Hand-assembling Phase 0 is what made the same PR url produce different reviews for different people. Every step below was a judgement call or a per-clone detail before it was a line of script:

| step | what the script pins |
|------|----------------------|
| diff base | `gh pr view --json baseRefName`, fetched into `refs/remotes/origin/<base>` with an explicit refspec. `origin/HEAD` is never read — it is stale or wrong on somebody's clone. |
| PR head | fetched from `refs/pull/<n>/head` and checked out by SHA, so a force-push mid-review is visible instead of silent. |
| diff, diffstat, changed files | computed locally from `<base>...HEAD` — the same range the lens agents are told to read. |
| linked issues | closing keywords and issue URLs parsed from the PR body, each fetched. Missing spec becomes a warning, not a silent grade against the PR description. |
| new dependencies | base vs head `package.json` compared key by key, every workspace manifest, not eyeballed from the diff. |
| lint | run once here so five agents don't each re-run it. |
| tier | computed (below). |

It refuses to run on a dirty tree, and it refuses to run when the working directory is a different repo than the PR. Both are errors to fix, not to work around — if it exits non-zero, fix the cause and re-run.

Subagents share one working directory. Everything above happens here, once, and every workflow agent is read-only from this point.

**Read the `warnings` array out loud before spawning anything.** A `codex` fallback and a missing issue spec both change what the review is worth, and both used to be invisible.

### Tier Detection

The script decides. Two rules govern it:

**Sensitivity can only upgrade. Size can only downgrade. Sensitivity wins.** The failure that matters is under-reviewing a small dangerous diff, not overspending on a big boring one.

**Forces `full` — any single hit, regardless of diff size:** paths matching `auth`/`session`/`token`/`crypto`/`permission`/`role`/`acl`; an **added** dependency in any `package.json`; `.github/workflows/`, CI or build config; migrations or schema changes; added lines reading env vars; added lines carrying a hardcoded address, chain id, RPC url or endpoint.

**`light`** when no trigger fired and the diff spans ≤ 2 top-level source directories with ≤ 150 changed source lines (added + deleted), after excluding lockfiles, generated output, snapshots, fixtures and translations.

**`skip`** — no source changes, docs-only, or a pure version bump with no added dependency. Review inline with plain `review-pr` instead; the workflow throws on `tier: "skip"`.

**Otherwise `full`.**

**You may upgrade the tier. You may never downgrade it.** The detector reads paths and line counts, not semantics — it cannot see a logic change hiding inside what looks like a rename, so escalating past it is the whole point of a human-in-the-loop. Going the other way just reintroduces the judgement call the script exists to remove. To upgrade, re-run with `--tier=full`; the output records `detectedTier` alongside it, so the override is on the record.

**Never change the tier silently.** Echo the script's `tierReason` before spawning, and if you upgraded, say what you saw that the detector could not.

**Not criteria:** raw line count (a 2,000-line lockfile is nothing; a 40-line auth change is everything), and bot authorship (a Dependabot PR bumping a transitive dep is exactly when dependency policy matters most).

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

This is `phase0.mjs` stdout, passed through unchanged. Pass it as a real JSON value, never a JSON-encoded string. Do not hand-edit a field — if one is wrong, the script is wrong, and the next person gets the same wrong value only if you fix it there.

The workflow ignores `detectedTier`, `tierReason` and `warnings`; they are for your step-4 report.

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
| `stats` | `{ tier, verifyAgent, reviewModel, lenses, confirmed, refuted, unverified, discarded, advisories }` — `discarded` counts non-defect findings dropped before verification. |

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

   Then, in **no more than four lines** outside the review body, report counts only: `tierReason` (and what you upgraded on, if you did), `stats.verifyAgent`, `stats.reviewModel`, `stats.refuted`, `stats.discarded`, `stats.advisories`, any duplicate collapse from step 2, and `stats.unverified`. Counts, not contents — do not summarise a refuted claim. Three exceptions to the line budget — if `gaps` is non-empty, list each gap in one line so the user can decide whether to re-run a lens; if `stats.unverified` is non-zero, list those findings explicitly and say plainly that the review is not exhaustive (raising `MAX_VERIFY_PER_LENS` or re-running that lens is the fix); and if Phase 0 returned `warnings`, list each one — a `codex` fallback or a missing issue spec changes what the review is worth.

5. **Post only after explicit approval.** Do not call any GitHub write tool before the user approves this specific review. A prior approval, a plan that mentioned posting, or this skill's own existence does not count.

6. **Cleanup** — delete every screenshot created during verification, and `git checkout -` to put the repo back on the branch it was on before Phase 0 detached it.

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

## Reproducibility

Two people running this on the same PR url should get the same review. What makes that hold:

- **The diff is pinned, not inherited.** `phase0.mjs` resolves the base from the GitHub API and fetches it by explicit refspec, so nobody's `origin/HEAD` or week-old `origin/main` participates.
- **The tier is computed, not judged.** Same paths and line counts in, same tier out. You may upgrade it; nothing may downgrade it.
- **The lens and verifier models are pinned in `workflow.js`** (`REVIEW_MODEL` / `REVIEW_EFFORT`), not inherited from whoever's session is driving. An unpinned `agent()` takes the caller's model, so an Opus session and a Sonnet session used to produce different reviews from identical input — with nothing in the output saying so. `stats.reviewModel` now records it. Do not add an args override: that is the same fork wearing a different name.
- **The verification cap breaks ties on file and line**, so which finding gets verified and which gets dropped no longer depends on the order a lens happened to emit them.

What is still not pinned: sampling variance inside each agent, and the skill version itself — `export.sh` symlinks these files, so anyone who has not pulled `webops-skills` is running older logic. If two reviews disagree structurally, compare `git log -1` in this repo first.

## Notes

- This skill is expensive. Prefer `review-pr` for routine PRs; the tier detector exists to keep you honest about that.
- Brevity is part of the deliverable, and this skill fights you on it: the workflow returns agent-facing prose — `claim` and `evidence` written at length to convince *you* a finding is real. Render that verbatim and the author gets a wall of text. More lenses must not mean a longer review.
- Verification removes findings and never adds them — the critic phase is the only thing that pushes back on under-review.
- Refuted findings are worth reporting to the user even though they never reach the author. A pattern in what gets refuted is a signal that a lens prompt needs tuning.
- If `codex` is requested but missing, say so and fall back to `claude`. Never silently substitute a verifier.
- Editing `workflow.js`: it is plain JS in an async context — no TypeScript, and `Date.now()` / `Math.random()` / `new Date()` throw, because they would break workflow resume. `scripts/check-workflow.mjs` exercises the control flow against stub agents; run it after any change.
- `check-workflow.mjs` also guards the reproducibility properties: every agent carries an explicit model, the codex wrapper stays on the cheap tier, and the cap picks the same findings whatever order a lens emits them in.
