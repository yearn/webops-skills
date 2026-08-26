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

## Writing Findings

A finding is a defect and a checkable end state. It is not a patch. The author owns the fix; the reviewer owns saying what is wrong, what "fixed" looks like, and where the defect came from.

For every finding:

1. **State the consequence first.** A short bolded label naming the problem class, a priority, then one sentence on what goes wrong and why anyone should care, in ordinary words. Mechanism details (operator names, internal identifiers) come after the consequence or not at all.
2. **Anchor to code.** File and line, verified against the actual code structure, not inferred from the diff.
3. **`Done when:` is the acceptance bar.** One line, observable, checkable by the author without the reviewer. Where a wholesale action (revert, delete, regenerate) would satisfy the letter but not the intent, say so here: "done when the requested-address check is gone and the chainId, label, and cap checks still pass."
4. **`Provenance:` is the commit that introduced the offending line.** From `git blame`, short hash. If it predates the PR's merge-base, write `pre-existing (hash)` — still a finding if the PR touches or depends on it, and the author should know which. For a spec or doc claim, the commit that wrote the sentence. Never omitted: a finding whose provenance cannot be determined is incomplete and does not post.
5. **Do not prescribe the edit.** No `Change:` line, no code blocks, no config snippets. A reviewer's untested patch is the most expensive thing a review can contain: the author applies it verbatim, it breaks something, and the next round is spent on the reviewer's mistake. If a specific mechanism is genuinely required, state it as a constraint inside `Done when:`. Literal code or config appears in a review only if the reviewer executed it, and then it is labelled as tested.
6. **Say it once, briefly.** The reasoning that convinced you belongs in your head. If a finding runs longer than a short bullet you are re-litigating a verdict you have already reached.
7. **If it is not a defect, it does not go in the review.** There is no suggestions section — no "consider…", no optional improvements, no preferences. "Non-blocking" is not free: the author still pays a context switch to read it, decide whether you meant it, and answer it, and the ones that are wrong cost the entire round trip they were supposedly too cheap to matter. A review that mixes defects with taste teaches the author to skim, and what gets skimmed is the blocker. If something non-defect genuinely matters to you, say it in the PR conversation as yourself — keep it out of the review.

When re-reviewing a revision, check it against each `Done when:` of the prior review and name the unmet items explicitly — "the chainId check was removed; done-when required it to stay" converges in one round; "this does not address the review" does not.

## Review Format

```
## Summary
[Brief description of what the PR does]

## Dependencies (if applicable)
[npm-policy evaluation results for any new packages]
- **package-name**: [APPROVED/REJECTED] - [brief reason]

## Issues
- [ ] **file.tsx:42** - **Short label (high|medium|low)** — [what goes wrong and why it matters]
  - Done when: [observable acceptance criteria]
  - Provenance: [abc1234 | pre-existing (abc1234)]
- [ ] **file.tsx:87** - **Short label (medium)** — [what goes wrong and why it matters]
  - Done when: [observable acceptance criteria]
  - Provenance: [abc1234]

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
- Write findings per "Writing Findings" — anchored, constraint-adjacent, with checkable retentions, and short
- Report defects only; a review with nothing to report is an approval, not an invitation to fill space
- Verify PR description matches actual changes
- Check that implementation satisfies the linked issue requirements
