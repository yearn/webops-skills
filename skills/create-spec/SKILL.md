---
name: create-spec
description: guide the creation of comprehensive work specifications for new features, changes, or technical implementations
---

# Create Spec Skill

This skill guides the creation of comprehensive work specifications for new features, changes, or technical implementations. Specs are posted as GitHub issues by default, making them easy to track and implement with `/implement-spec`.

## Requirements

- GitHub MCP configured with repository access

## Workflow

When this skill is invoked, follow this process:

### 1. Gather Initial Requirements

Ask the user to describe:
- What needs to be implemented/changed
- Why this work is needed (business value or technical need)
- Any specific context they can provide
- Which repository to create the issue in (if not obvious from context)

### 2. Research the Codebase

Before filling out the spec template, research the codebase to understand:
- Existing patterns and implementations that are similar
- File structure and where changes will likely be made
- Related schemas, interfaces, or APIs
- Current implementation (if modifying existing functionality)

Use Glob, Grep, and Read tools to explore the codebase. This research will help you:
- Provide specific file paths in the spec
- Suggest concrete tasks based on existing patterns
- Identify potential technical constraints
- Reference similar implementations

### 3. Ask Clarifying Questions

**IMPORTANT**: Use the AskUserQuestion tool when you are unsure about:
- Which specific approach to take among multiple valid options
- Technical constraints or requirements that aren't obvious from the codebase
- Breaking change policies or backward compatibility requirements
- Performance, security, or quality thresholds
- Which existing code/patterns to reference or follow
- The scope of changes (how extensive should the implementation be)
- Priority or ordering of tasks
- Any section where you lack sufficient context to provide specific, actionable details

**DO NOT** guess or make assumptions about critical implementation details. A spec with placeholders and questions is better than a spec with incorrect assumptions.

**DO** ask informed questions based on your codebase research. Show the user what you've learned and ask specific questions about ambiguities.

### 4. Generate the Specification

Draft the spec content using this template structure:

```markdown
# [Title: Concise action-oriented description of the feature/change]

## Description

[2-3 sentence overview explaining what needs to be implemented/changed and why. Focus on the business value or technical need driving this change.]

## Context

**Current implementation:** [Brief description of how things work today, including file paths and key components]

**Proposed/New system:** [Brief description of the target state or new approach]

**Relevant references:**
- [Link/path to reference implementation]
- [Link/path to relevant documentation]
- [Link/path to related schemas/interfaces]

## Tasks

### [Task Group 1: Descriptive name for related tasks]

- [Specific actionable task with clear scope]
- [Another specific task]

### [Task Group 2: Another logical grouping]

- [Specific actionable task]
- [Task with file path references where applicable: `path/to/file.ts`]

### [Task Group 3: Continue as needed]

- [Implementation details]
- [Configuration changes]
- [Testing requirements]

## Acceptance Criteria

- [ ] [Specific, measurable outcome that can be verified]
- [ ] [Technical requirement that must be met]
- [ ] [Quality/performance criteria]
- [ ] [Backward compatibility verified (if applicable)]
- [ ] [Test coverage requirement (if applicable)]

## Technical Notes

[Important constraints, warnings, or guidelines that must be followed during implementation. Examples:]
- Breaking changes policy (e.g., "only add new optional fields")
- Performance requirements
- Security considerations
- Dependencies or prerequisites
- Migration strategies
```

### 5. Template Guidelines

**Title**:
- Use imperative mood
- Be specific about what's being done (e.g., "Integrate X with Y", "Add support for Z")

**Description**:
- Start with the problem/need
- Then describe the solution approach

**Context**:
- Include file paths to relevant existing code
- Link to external documentation or reference implementations
- Mention any related systems or services

**Tasks**:
- Group related tasks into logical sections
- Be specific about what needs to be done
- Include file paths where work will be performed
- Order tasks logically (dependencies first)

**Acceptance Criteria**:
- Write testable, verifiable statements
- Use checkboxes for trackability
- Include both functional and non-functional requirements

**Technical Notes**:
- Highlight constraints that could cause issues if violated
- Document any assumptions
- Note migration paths or rollback strategies if relevant

### 6. Confirm and Post

**Show the spec to the user for review before posting.**

Use `AskUserQuestion` to ask:
1. **Post as GitHub issue (recommended)** — Create an issue in the target repository
2. **Save locally** — Save to `specs/[descriptive-name].md` instead

**If posting to GitHub:**
- Use GitHub MCP `issue_write` with method `create`
- Use the spec title as the issue title
- Use the spec body (Description through Technical Notes) as the issue body
- Report the created issue URL to the user

**If saving locally:**
- Save to the user's preferred path or `specs/[descriptive-name].md`

After creating, summarize the key points and ask if any sections need refinement.

## User Confirmation

**CRITICAL:** Always use `AskUserQuestion`:
- Before posting to GitHub or saving locally
- When clarification is needed during spec creation
- When unsure about requirements or approach

**Never post to GitHub without explicit user confirmation.**

## Example Usage

```
User: I need to create a spec
Assistant: I'll help you create a comprehensive work specification.

First, let me understand what you're working on:
- What needs to be implemented or changed?
- Why is this work needed?
- Do you have any specific context or requirements?

[User provides details]

Let me research the codebase to understand the current implementation...

[Assistant uses Glob/Grep/Read to explore]

Based on my research, I found [summary of findings]. I have a few clarifying questions:
1. [Specific question based on research]
2. [Another question about technical approach]

[User answers questions]

I'll now create a detailed specification for you...

[Assistant drafts the spec and shows it to user]

Here's the spec I've drafted. Would you like to:
1. Post as GitHub issue (recommended)
2. Save locally instead

[User chooses GitHub issue]

I've created the issue at https://github.com/org/repo/issues/42. Here's a summary:
- [Key points]
- [Important technical notes]

Would you like me to expand on any sections, or are you ready to implement with `/implement-spec #42`?
```

## Notes

- Always research before asking questions - provide informed questions based on codebase analysis
- Be specific with file paths and references
- Don't make assumptions about critical implementation details
- A spec with questions is better than a spec with wrong assumptions
- Use the AskUserQuestion tool for multiple choice clarifications
