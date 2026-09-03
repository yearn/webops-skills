---
name: triage-reviews
description: List PRs waiting on your review, pick which to review, and hand the picks to review-pr-workflow-batch
---

## Activation Criteria
Use this skill when:
- User says `/triage-reviews`
- User wants to go from "what's waiting on me" straight into batch reviews
- User asks to pick from their review queue and review the selection

Optional org argument narrows the queue, same as `my-reviews` (e.g. `/triage-reviews yearn`).
Trailing `tier=`, `verify-agent=`, `model=` flags pass through to the batch untouched.

## Overview

A thin orchestrator. It runs two existing skills and owns only the glue between them:

1. **my-reviews** — list and live-verify PRs where the user is a requested reviewer
2. **picker** — checkbox selection (this skill's only original logic)
3. **review-pr-workflow-batch** — one isolated session per chosen PR

Nothing here changes how a queue is listed or how a review is produced. If either
underlying skill changes, this one should not need to.

## Workflow

### Step 1: List the queue

Run the `my-reviews` skill, forwarding the org argument if given. Show its full report
so the user sees the same detail they would get from `/my-reviews` alone, including any
search hits that verification dropped.

If the verified queue is empty, say so and stop.

### Step 2: Pick

Present the verified PRs with `AskUserQuestion`, multi-select. Constraints:

- **Max 4 options per question, max 4 questions.** Group by repo. If a repo has more than
  4 PRs, split it across questions. If the queue exceeds 16 PRs, show the 16 with the
  most recent activity and say which were left out.
- **Option label:** `<repo-short> #<n> <title>`, trimmed to fit.
- **Option description:** author, age, last activity, then any blocker in caps:
  `CONFLICTING`, `CHANGES_REQUESTED` outstanding, failing checks, draft.
  Show `mergeable=UNKNOWN` as "mergeable unknown (recomputing)", not as a blocker.
- Do not pre-select anything and do not recommend an option.

If the user selects nothing, stop.

### Step 3: Hand off

Build the batch argument as the chosen PR URLs, comma-separated, plus any pass-through
flags, then run `review-pr-workflow-batch` with it. Its Phase 0 shows the resolved batch
and stops for approval before launching anything. Do not skip or shortcut that approval.

## Notes

- Never launch the batch on the strength of the picker alone. The picker chooses; the
  batch's own Phase 0 confirmation authorises.
- The queue is verified live by `my-reviews`, so a PR that was merged between search and
  pick never reaches the picker.
