---
name: review-pr-ci
description: Run a bounded three-agent PR review for non-interactive CI
---

## Activation Criteria

Use this skill when:
- User says `/review-pr-ci`
- A non-interactive CI job requests a PR review with a fixed agent budget
- A caller wants more coverage than `review-pr` without the variable fan-out of `review-pr-workflow`

Use `review-pr` for a single-pass review. Use `review-pr-workflow` when the user explicitly wants the deeper, finding-by-finding verification and accepts its variable cost.

## Contract

This skill runs **at most three workflow agents**:

1. Two review lenses run in parallel.
2. One verifier checks their combined candidate findings.

The workflow never creates a per-finding verifier or a critic agent. Workflow agents must not call `Agent`, `Task`, or `Workflow`; recursive delegation is forbidden. Each lens may return at most four material findings, so the verifier receives at most eight candidates.

The direct orchestration cap is enforced by `workflow.js`, not left to prompt interpretation. Worker prompts also forbid recursive delegation. A runtime that grants delegation tools to workflow workers must deny those tools separately when it needs a security boundary rather than an orchestration budget. Changing the cap or adding another `agent()` call requires updating `scripts/check-workflow.mjs` in the same change.

## Scope

Same scope and review format as `review-pr`: web/frontend projects, including React, TypeScript, and Next.js. The bounded workflow trades some depth for predictable Actions duration:

| Skill | Agent shape | Intended use |
|-------|-------------|--------------|
| `review-pr` | no workflow agents | small or routine changes |
| `review-pr-ci` | 2 lenses + 1 verifier | non-interactive CI with a fixed budget |
| `review-pr-workflow` | 2–5 lenses, per-finding verification, optional critic | deep human-requested review |

## Arguments

```
/review-pr-ci <pr-url-or-number> [base=<git-ref-or-sha>]
```

`base` must identify the immutable merge base when the caller already resolved one. Otherwise use the PR's base branch. Never substitute `origin/HEAD` when the caller supplied a base SHA.

## Phase 0 — Main session

Prepare the workflow once, before spawning agents:

1. Read the PR URL or number, title, body, linked issue text, and any caller instructions already available in context.
2. Use the checked-out PR head. In non-interactive CI, do not fetch, checkout another ref, or modify files.
3. Resolve `baseRef` from the supplied `base` argument or caller instruction.
4. Collect `git diff --stat <baseRef>...HEAD`, `git diff --name-only <baseRef>...HEAD`, and lint output if the caller already ran lint. Do not install dependencies merely to run lint in a credential-bearing CI job.
5. Identify newly added dependencies from changed manifests when possible. If registry or network access is unavailable, mark policy lookup as not verifiable instead of estimating it.

Pass the collected values to the workflow as real JSON:

```
Workflow({
  scriptPath: "<this skill's base directory>/workflow.js",
  args: {
    pr: { repo, number, title, body },
    issues,
    baseRef,
    diffStat,
    changedFiles,
    lintOutput,
    newDeps
  }
})
```

If `Workflow` returns a task id, wait for it with `TaskOutput` until it finishes. The final response must contain the assembled review; ending the session while the task is running loses the result and does not make the GitHub Action asynchronous.

## Workflow behavior

The two lenses divide coverage to limit duplicated work:

- **correctness**: linked-spec conformance, logic, state, error handling, and missing tests with a concrete failure mode.
- **risk**: security boundaries, dependency changes, secrets, permissions, unsafe inputs, and operational regressions.

Both lenses report defects only. Preferences, cleanup, and optional refactors use `suggestion` severity and are discarded. The verifier reads the code and diff for every retained candidate, rejects unsupported or pre-existing claims, and may correct an otherwise valid claim. A candidate omitted from the verifier response is rejected rather than published.

## Assemble the review

Use `review-pr`'s Review Format and Writing Findings rules:

- Only `confirmed` findings may appear under Issues.
- Merge duplicates before rendering.
- State the consequence first and include a file/line anchor, priority, `Done when:`, and `Provenance:`.
- Do not include verifier reasoning, rejected findings, suggestions, or unverified `dropped` candidates in the review.
- `REQUEST_CHANGES` when a blocker survives, `COMMENT` when only issues survive, otherwise `APPROVE`.
- Keep the body under roughly 400 words.

Use this attribution:

```
---

## How This Was Reviewed
Reviewed with the [review-pr-ci skill](https://github.com/yearn/webops-skills/blob/main/skills/review-pr-ci/SKILL.md) — two review lenses and one combined verifier, capped at three workflow agents.
```

## Interactive and CI output

- **Interactive session:** preview the complete review and obtain explicit approval before posting anything to GitHub.
- **Non-interactive CI:** never post, ask questions, or wait for approval. Return the assembled review as raw Markdown so the caller can perform its own credential checks and posting step.

Always report `stats.agentsUsed`, `stats.candidates`, `stats.rejected`, and `stats.unverified` to an interactive user. In CI, keep those counts out of the review body unless the caller requests them.

## Notes

- The three-agent cap bounds orchestration, not model response time. Large diffs can still take longer than small ones.
- Every publishable finding receives one verifier verdict. This is less independent verification than `review-pr-workflow` gives blockers.
- The main session performs any visual verification after the workflow returns; workflow agents never start dev servers.
- Run `node skills/review-pr-ci/scripts/check-workflow.mjs` after editing `workflow.js`.
