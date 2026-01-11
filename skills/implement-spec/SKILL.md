---
name: implement-spec
description: implement a specification from a GitHub issue or spec file by following its tasks and acceptance criteria
---

## Activation Criteria
Use this skill when:
- User says "/implement-spec"
- User asks to implement a spec, specification, or issue
- User provides a GitHub issue URL/number or spec file path to implement

## Requirements

- GitHub MCP configured with repository access
- A specification (either a GitHub issue or local spec file following the `create-spec` format)

## Workflow

### 1. Load the Specification

**From GitHub issue (recommended):**
- Use GitHub MCP to fetch the issue by number or URL
- Parse the issue body for tasks and acceptance criteria
- Note any linked issues or references

**From local file (alternative):**
- Read the spec file from the provided path

Extract and understand:
- Description and context
- Task groups and individual tasks
- Acceptance criteria
- Technical notes and constraints

### 2. Create Implementation Plan

Use TodoWrite to create a todo list from the spec tasks:
- Convert each task into a trackable todo item
- Preserve task groupings and order
- Add acceptance criteria verification as final todos

### 3. Research Before Implementing

For each task group, before writing code:
- Read the files mentioned in the spec
- Understand existing patterns and conventions
- Identify any blockers or missing context

### 4. Implement Tasks

For each task:
1. Mark the todo as `in_progress`
2. Make the required changes
3. Verify the change works (run relevant commands/tests)
4. Mark the todo as `completed`
5. Move to the next task

**Guidelines:**
- Follow the technical notes and constraints from the spec
- Match existing code patterns and conventions
- Don't over-engineer — implement exactly what the spec asks for
- If blocked or uncertain, use `AskUserQuestion` to clarify

### 5. Verify Acceptance Criteria

After all tasks are complete:
- Go through each acceptance criterion
- Run tests, linters, or manual verification as appropriate
- Document any criteria that cannot be verified automatically

### 6. Run Final Checks

**Ask the user their preference:**

Use `AskUserQuestion` to ask whether they want to:
1. **Let the agent run checks** — Run lint, tests, and build automatically
2. **Run checks manually** — Skip automated checks; user will verify themselves

**If agent runs checks:**
- Run project lint (`bun lint`, `npm run lint`, etc.)
- Run project tests (`bun test`, `npm test`, etc.)
- Run build if applicable (`bun build`, `npm run build`, etc.)
- Report any failures and offer to fix them

**If user runs manually:**
- Provide a checklist of recommended commands to run
- Proceed to summary

### 7. Summarize and Handoff

Provide a summary:
- What was implemented
- Any deviations from the spec (and why)
- Any items that need manual verification
- Suggest running `/create-pr` to open a pull request (it will auto-link the issue with `Closes #<number>`)

## User Confirmation

Use `AskUserQuestion` when:
- A task is ambiguous or has multiple valid approaches
- The spec conflicts with existing code patterns
- You need to deviate from the spec
- Technical constraints prevent exact implementation
- Choosing between running checks automatically or manually

## Example Usage

```
User: /implement-spec #42