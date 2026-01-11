---
name: review-pr
description: Review pull requests, run checks, and post structured feedback via GitHub MCP
---

## Activation Criteria
Use this skill when:
- User says "/review-pr"
- User asks to review a pull request
- User provides a GitHub PR URL or number to review

## Scope

This skill currently focuses on **web/frontend projects** (React, TypeScript, Next.js, etc.). Support for other project types may be added later.

## Requirements

- GitHub MCP configured with a PAT that has read/write access to PRs and issues
- Playwright MCP for visual and functional verification

## Workflow

1. **Fetch PR details** - Use GitHub MCP to get:
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

8. **Visual verification with Playwright** - Use Playwright MCP to:
   - Run the app locally on the PR branch
   - Navigate to affected pages/components
   - Take screenshots of UI changes
   - Interact with changed components to verify functionality
   - Optionally compare with main branch for before/after

9. **Generate review** - Create structured feedback and **show it to the user for approval**

10. **Confirm before posting** - Use `AskUserQuestion` to get explicit approval before submitting

11. **Cleanup** - Remove any screenshot files created during verification

## User Confirmation

**CRITICAL:** Always use the `AskUserQuestion` tool:
- Before posting a review to GitHub
- Before approving or requesting changes
- Before posting any comments
- When clarification is needed during review
- When unsure about project conventions or requirements

**Never perform write/mutating operations on GitHub without explicit user confirmation.**

## Playwright Verification

Use Playwright MCP to visually and functionally verify UI changes:

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

## Review Format

```
## Summary
[Brief description of what the PR does]

## Dependencies (if applicable)
[npm-policy evaluation results for any new packages]
- **package-name**: [APPROVED/REJECTED] - [brief reason]

## Issues
- [ ] **file.tsx:42** - [Description of issue]
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
- Be constructive - suggest fixes, not just problems
- Verify PR description matches actual changes
- Check that implementation satisfies the linked issue requirements
