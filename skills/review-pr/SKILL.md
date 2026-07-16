---
name: review-pr
description: Review pull requests, run checks, present findings for user feedback, then post structured feedback via GitHub tooling
---

## Activation Criteria
Use this skill when:
- User asks for `review-pr`
- User asks to review a pull request
- User provides a GitHub PR URL or number to review

## Scope

This skill currently focuses on **web/frontend projects** (React, TypeScript, Next.js, etc.). Support for other project types may be added later.

## Requirements

- GitHub tooling configured with read/write access to PRs and issues
- Playwright or browser automation tooling for visual and functional verification

## Workflow

1. **Fetch PR details** - Use available GitHub tooling to get:
   - PR description and metadata
   - Changed files and diff
   - Existing comments/reviews

2. **Read PR body for instructions** - Check for:
   - Specific review instructions from the author
   - Linked issues (e.g., "Closes #123", "Fixes #456", or URL references)

3. **Fetch linked issues** - If the PR references issues:
   - Read the issue body for original spec/requirements
   - Use issue context to validate the PR implements what was requested

4. **Clone/checkout if needed** - Ensure local access to run checks

5. **Run project linters** - Execute lint commands from the project (e.g., `bun run lint`, `npm run lint`)

6. **Check for new dependencies** - If package.json was modified:
   - Identify any newly added dependencies
   - Run the `npm-policy` skill on each new package
   - Include policy evaluation results in the review

7. **Analyze changes** - Review the diff for:
   - Does it match the spec/issue requirements?
   - Logic errors or bugs
   - Security concerns
   - Missing error handling
   - Code clarity and maintainability

8. **Visual verification with Playwright** - Use Playwright or browser automation tooling to:
   - Run the app locally on the PR branch
   - Navigate to affected pages/components
   - Take screenshots of UI changes
   - Interact with changed components to verify functionality
   - Optionally compare with main branch for before/after

9. **Generate review** - Create structured feedback

10. **Preview the review for the user**
   - Output the full review as a markdown text message directly in the conversation so the user can read it
   - Do NOT skip this step — the user must see the review content as plain text, not just as a tool call preview
   - After outputting the review, ask for approval or feedback before proceeding

11. **Post** - Only after the user explicitly approves, post the review to GitHub using available GitHub tooling. Do NOT call any GitHub write tools until step 10 approval is received.

12. **Cleanup** - Remove any screenshot files created during verification

## User Confirmation

**CRITICAL:** Always ask for explicit user confirmation:
- Before posting a review to GitHub
- Before approving or requesting changes
- Before posting any comments
- When clarification is needed during review
- When unsure about project conventions or requirements

**Never perform write/mutating operations on GitHub without explicit user confirmation.**

## Playwright Verification

Use Playwright or browser automation tooling to visually and functionally verify UI changes:

1. **Start the dev server** - Run the project's dev command (e.g., `bun dev`, `npm run dev`)
2. **Navigate to affected areas** - Visit pages/routes that were changed in the PR
3. **Take screenshots** - Capture the current state of UI changes
4. **Test interactions** - Click buttons, fill forms, verify changed functionality works
5. **Compare branches** (optional) - Switch to main, take screenshots, compare with PR branch

### Screenshot Management

**IMPORTANT:** Do not leave screenshot files in the repository.

- Save screenshots to `/tmp/` or a temporary directory outside the repo
- Example: `/tmp/pr-review-{pr-number}/`
- Delete all screenshots after the review is complete (step 11 in workflow)
- Never commit screenshot files to the repository

## Writing Actionable Change Requests

The PR author is accountable for meeting every requirement in a review. Even so, write each change request so the cheapest misreading of it is impossible — a review that leads with "remove X" and buries its constraints under the rationale invites a wholesale action that deletes things the review required to keep.

For every requested change:

1. **Anchor to code, not policy.** Check the actual code structure before writing the instruction. If the behavior to remove is one predicate inside a function that also does required things, say so: "In `selectValidOutputs`, remove only the requested-address check; the chainId, label, and cap checks stay."
2. **Name the naive action when it's wrong.** If the request sits next to an easy wholesale action (revert a commit, delete a function, regenerate a file), state explicitly whether that action satisfies the review: "This is not a plain revert of #435 — a revert deletes protections this review requires."
3. **State retentions as checkable assertions.** "Retain the output caps" is a property; "the existing chain/label/cap tests must still pass" is verifiable. Name tests or observable behavior that must remain green. If a behavior to retain has no test, request one.
4. **Keep constraints next to the imperative.** Put "keep/don't touch" clauses in the same bullet as the "remove/change" instruction, never paragraphs later under supporting rationale.
5. **Describe the end state.** When a change is surgical rather than wholesale, sketch the code after the change: which functions exist, which checks remain, what the resulting contract is.

When re-reviewing a revision, check it against each item of the prior review and name the unmet items explicitly — "chain/label/cap validation was removed; the review asked to retain it" converges in one round; "this does not address the review" does not.

## Review Format

```
## Summary
[Brief description of what the PR does]

## Dependencies (if applicable)
[npm-policy evaluation results for any new packages]
- **package-name**: [APPROVED/REJECTED] - [brief reason]

## Issues
- [ ] **file.tsx:42** - [Description of issue]
  - Change: [the specific edit, anchored to functions/lines]
  - Keep: [what must not change, stated as testable assertions — omit if nothing applies]
  - Done when: [observable acceptance criteria]
- [ ] **file.tsx:87** - [Description of issue]

## Suggestions
- [Optional improvements that aren't blocking]

## Verdict
[APPROVE | REQUEST_CHANGES | COMMENT]

---

## How This Was Reviewed
This review was conducted using the [review-pr skill](https://github.com/yearn/webops/blob/main/skills/review-pr/SKILL.md).
```

## Notes

- Always read linked issues for original spec/context
- Always run project lint settings before manual review
- Evaluate new dependencies against npm-policy before approving
- Reference specific lines when commenting
- Write change requests per "Writing Actionable Change Requests" — anchored, constraint-adjacent, with checkable retentions
- Be constructive - suggest fixes, not just problems
- Verify PR description matches actual changes
- Check that implementation satisfies the linked issue requirements
