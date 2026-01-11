---
name: ship-spec
description: orchestrate a full dev cycle from spec creation through PR review, pausing for approval between steps
---

## Activation Criteria
Use this skill when:
- User says "/ship-spec"
- User wants to go through the full development cycle for a feature
- User asks to "ship" or "build end-to-end" a feature/change

## Overview

This skill orchestrates the complete development workflow by running these skills in sequence:

1. **create-spec** — Draft and post a specification as a GitHub issue
2. **implement-spec** — Implement the spec following its tasks and acceptance criteria
3. **create-pr** — Open a pull request with proper formatting
4. **review-pr** — Review the PR and post structured feedback

Each step pauses for user approval before proceeding to the next.

## Entry Points

Start anywhere in the flow based on what you already have:

| Command | Starts at | Use when |
|---------|-----------|----------|
| `/ship-spec` | Step 1 (create-spec) | Starting fresh, no spec yet |
| `/ship-spec #42` or `/ship-spec issue 42` | Step 2 (implement-spec) | You have a spec issue ready |
| `/ship-spec pr 123` | Step 4 (review-pr) | You have a PR ready for review |

When starting mid-flow, the skill picks up from that step and continues through the remaining steps.

## Workflow

### Step 1: Create Specification
*Skipped if issue number provided*

Run the `create-spec` skill:
- Gather requirements from the user
- Research the codebase
- Draft the spec
- Post as GitHub issue (with user approval)

**Pause point:** After the issue is created, confirm with the user:
> "Spec created at #[issue]. Ready to implement?"

### Step 2: Implement Specification

Run the `implement-spec` skill with the issue number:
- Load the spec from the GitHub issue
- Create todo list from tasks
- Implement each task
- Verify acceptance criteria
- Run final checks (lint, tests, build)

**Pause point:** After implementation is complete, confirm:
> "Implementation complete. Ready to create PR?"

### Step 3: Create Pull Request

Run the `create-pr` skill:
- Summarize changes
- Auto-link the issue with `Closes #[issue]`
- Include test plan and risk assessment
- Create the PR (with user approval)

**Pause point:** After PR is created, confirm:
> "PR created at [URL]. Ready to run review?"

### Step 4: Review Pull Request

Run the `review-pr` skill on the PR:
- Fetch PR details and linked issue
- Run linters and check dependencies
- Analyze changes against spec
- Visual verification with Playwright (for UI changes)
- Generate and post review (with user approval)

**End:** Summarize the full cycle and report final status.

## State Tracking

Track progress through the cycle:
- Issue number (from Step 1 or provided)
- PR number/URL (from Step 3 or provided)
- Current step

If the user needs to pause and resume later, provide context on where they left off.

## Example Usage

```
User: /ship-spec
Assistant: Starting full dev cycle. What feature do you want to build?
[Runs create-spec → implement-spec → create-pr → review-pr with pauses]

User: /ship-spec #42
Assistant: Starting from implementation. Loading spec from issue #42...
[Skips create-spec, runs implement-spec → create-pr → review-pr]

User: /ship-spec pr 87
Assistant: Starting review for PR #87...
[Skips to review-pr only]
```
