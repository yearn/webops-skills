---
name: review-pr-lean
description: Token- and time-efficient multi-agent PR review — the same five review lenses, blocker majority panel, and "every published finding is verified" guarantee as review-pr-workflow, at a fraction of the agents, turns, and wall time. Use whenever the user asks for a deep, thorough, verified, multi-agent, or fan-out review of a PR, says /review-pr-lean, or would otherwise reach for review-pr-workflow. Posts via the review-pr format only after explicit approval.
---

## Activation Criteria
Use this skill when:
- User says `/review-pr-lean`
- User asks for a deep, verified, multi-agent, or thorough PR review
- User would otherwise run `review-pr-workflow` (this skill replaces it at lower cost)

For an ordinary single-pass review, use `review-pr`.

## Why this is cheaper

Measured on seven past `review-pr-workflow` runs: lenses spent 3–6M cache-read tokens re-sending their context on 54–82 tool turns; verification spawned one agent per finding (three per blocker), each paying a ~35k-token baseline; a serial critic added up to 3 minutes at the end; lint and tests ran before the workflow could start. This skill keeps every lens and every verification vote, and removes the waste:

| Cost | Here |
|------|------|
| Main-loop prep (PR, issues, diff, deps, tier) | One script, ~3s: `scripts/review.mjs prep` |
| Diff passed to the workflow | Injected into `run.js` on disk — never in the main loop's context or output |
| Lens turns | Diff carries whole enclosing functions; no `git blame`; reads batched in one turn |
| Verifiers | One agent per batch of ≤6 findings; blocker panel = 3 agents judging the whole blocker batch |
| Critic | Runs concurrently with verification on the candidate list, not after it |
| Lint / tests / Playwright | Run concurrently with the workflow, not before it |
| Provenance hashes | `git blame` on confirmed findings only, after verification |

## Scope

Web/frontend projects (React, TypeScript, Next.js), same as `review-pr`. This skill uses `review-pr`'s Review Format, its Writing Findings rules, and its approval gate. It changes only how findings are produced.

## Arguments

```
/review-pr-lean <pr-url-or-number> [verify-agent=claude|codex] [tier=auto|full|light|skip] [run-checks=true|false]
```

| Arg | Default | Meaning |
|-----|---------|---------|
| `verify-agent` | `claude` | `codex` verifies blocker and issue batches with the `codex` CLI — a different model, so its verification does not share Claude's blind spots. Prefer it when requesting changes on someone else's PR. Needs `codex` on PATH; if missing, say so and fall back to `claude`. Advisories always verify with `claude` (codex's sandbox has no network for the registry lookup). |
| `tier` | `auto` | `auto` uses the tier from prep (below). Anything else overrides it. |
| `run-checks` | `true` | Lint and tests, run concurrently with the workflow. Only explicit `false` skips them. Agents never run checks themselves. |

---

## Phase 0 — Prep (one command)

From the repo root, with a clean working tree:

```
node <this skill's base directory>/scripts/review.mjs prep <pr>
```

Add `--no-checkout` when the PR branch is already checked out (e.g. a worktree from `review-pr-workflow-batch`). The script fetches the PR and its linked issues, checks out the branch, captures the lockfile-free diff with function context (falls back to `-U10`, then omits it past 150k chars), lists newly added dependencies, suggests a tier, and writes `run.js` — `workflow.js` with that context injected. It prints a short summary; a `warn: HEAD … != PR head` line means the checkout is stale — update it before launching. **Do not `cat` `run.js` or the diff** — keeping them out of your context is most of the point.

### Tier

The script applies the rules mechanically: **sensitivity only upgrades, size only downgrades, sensitivity wins.**

- `full` on any hit: paths matching auth/session/token/crypto/permission/role/acl, CI or build config, migrations/schema, chain/network/rpc/contract/address; an added dependency; added lines that read env vars or hardcode an address.
- `light` when nothing sensitive and the source churn is ≤ ~150 lines across ≤ 2 top-level dirs (lockfiles, docs, generated files, snapshots, fixtures, translations excluded).
- `skip` when only docs, lockfiles, or generated files changed — review inline with `review-pr` instead.

The script reads paths and line counts, not meaning. Escalate when the summary hints at something it cannot see (a logic change inside a rename, a security-relevant file with a bland name). Downgrade to `skip` yourself only for a clean single-commit revert or a pure version bump. **State the tier and its reason before launching:**
> `tier: light — 3 source files, ~60 changed lines, 1 top-level dir, no sensitive paths. Override with tier=full.`

---

## Phase 1 — Launch everything at once

In one turn:

1. **Workflow** — it runs in the background:
   ```
   Workflow({ scriptPath: "<run.js path from prep>", args: { tier: "<tier>", verifyAgent: "<claude|codex>" } })
   ```
   Pass `args` as a real object. Optional: `blockerVotes` (odd, default 3), `maxVerify` (non-advisory findings verified, default 24).
2. **Lint and tests** (unless `run-checks=false`) — Bash with `run_in_background`, using the project's own scripts (`bun run lint`, `bun test`, `npm test`, per package in a monorepo). Capture the tail of each output.
3. **Visual check** — only if prep reported UI files. Start the dev server, open the affected routes, screenshot changed components to `/tmp/pr-review-<number>/` (never inside the repo). Only the main loop does this; parallel agents would collide on the port.

Do not poll the workflow; its completion arrives as a notification.

### Workflow returns

| field | contents | goes to |
|-------|----------|---------|
| `confirmed` | Findings that survived verification, each with `votes ≥ 1` and `lenses`. | **Issues** — the only thing that reaches the author |
| `rejected` | Refuted findings with the reason. | User report only |
| `dropped` | Findings past `maxVerify`, unverified. | User report only |
| `gaps` | Critic's coverage gaps (`full` tier) and lenses that returned nothing. | User report only |
| `stats` | `{ tier, verifyAgent, lenses, confirmed, refuted, unverified, discarded, merged, advisories, verifierAgents }` | User report |

Non-defect observations (`suggestion` severity) are discarded inside the workflow and reported only as `stats.discarded`. A review carries defects and nothing else: an unverified "non-blocking" note still costs the author a context switch, and the wrong ones cost a full round trip.

---

## Phase 2 — Assemble (main loop)

1. **Provenance** — one command for all confirmed anchors:
   ```
   node <base dir>/scripts/review.mjs provenance <baseRef> <file:line> [<file:line> ...]
   ```
   Each line prints a short hash, or `pre-existing <hash>`. A `pre-existing` finding survives only if this PR depends on that line — check the claim says how; otherwise drop it and count it as refuted.
2. **Checks** — a lint error or failing test in a file this PR changed (or a test covering changed code) is a defect verified by execution: add it as an issue (`blocker` if tests fail), with the failing line of output as the anchor's evidence. Failures unrelated to the diff go to the user report, not the review. If checks were skipped or could not run, say so in the report — never imply they passed.
3. **Visual** — a confirmed visual defect from the screenshots is a finding like any other; describe it, do not attach the screenshot unless the user asks.
4. **Merge near-duplicates** — exact `file:line` duplicates are already merged (`stats.merged`). Collapse confirmed entries that name the same defect in different words or on neighbouring lines: keep the highest severity, the strictest `doneWhen`.
5. **Render** with `review-pr`'s Review Format and Writing Findings. Verdict: `REQUEST_CHANGES` if any confirmed blocker, else `COMMENT` if any confirmed issue, else `APPROVE`. `dropped` never affects the verdict. An `advisory` finding is stated as a version fact — package, pinned version, severity, affected range, first patched version — and kept even if not exploitable here.

### Length is a correctness property

A review the author skims gets partly implemented, and the blocker is what gets skipped.

- **One finding, one bullet:** a bolded problem label with priority — `(high)`, `(medium)`, `(low)` by real-world consequence (data exposure/loss > crashes > debt > polish) — then one consequence-first sentence, then `Done when:` and `Provenance:` lines. Sort most severe first.
- **Rewrite every claim in plain language.** Agent claims are written mechanism-first to convince a verifier. If your sentence names a function or operator before the consequence, rewrite it.
  - Bad: "reportRoute accepts Object.prototype members as tiers — `parts[0] in RETENTION_TIERS` matches `toString`."
  - Good: "**Retention tier validation bug (high)** — built-in names like `toString` pass as valid tiers, so a report published under one is never deleted."
- No `Change:` line, no code or config block, no pasted `evidence`, no preamble, at most one sentence on what is right.
- Budget ~60 words per finding, ~400 for the body.

## Phase 3 — Preview, approve, post

1. **Preview** the full review as plain markdown in the conversation.
2. Then **at most four lines** of counts: tier and why, verify-agent, checks (ran / skipped / failed), `refuted`, `discarded`, `advisories`, near-duplicate merges, `unverified`, `verifierAgents`. Counts, not contents. Exceptions: list each `gaps` entry in one line, and if `unverified > 0`, list those findings and say plainly the review is not exhaustive (re-run with a higher `maxVerify`).
3. **Post only after explicit approval** of this specific review. A prior approval or this skill's existence does not count.
4. **Cleanup** — delete screenshots and the prep output directory.

## User Confirmation

**CRITICAL**, inherited from `review-pr`: never post a review, approve, request changes, or comment on GitHub without explicit user confirmation. The workflow cannot post; it returns findings, you render them, the user approves.

## Attribution

Replace `review-pr`'s attribution footer with:

```
---

## How This Was Reviewed
Reviewed with the [review-pr-lean skill](https://github.com/yearn/webops/blob/main/skills/review-pr-lean/SKILL.md) —
{N} review lenses, each finding independently verified by {verify-agent}. {M} candidate findings were refuted and dropped.
```

`{N}` is `stats.lenses.length` (the deps lens is skipped when no dependency was added); `{M}` is `stats.refuted`.

## Notes

- Verification only removes findings; the critic is the only push against under-review. A gap is a reason to re-run a lens, not a finding.
- A pattern in `rejected` means a lens prompt needs tuning — report it.
- CI mode (no network, prefetched context) is not ported from `review-pr-workflow`; add it to `prep` when CI moves to this skill.
- Editing `workflow.js`: plain JS in an async context, no TypeScript; `Date.now()`, `Math.random()`, and argless `new Date()` throw. Keep the `// @inject` line — `prep` replaces it. Run `node scripts/check-workflow.mjs` after any change.
