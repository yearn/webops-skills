# Create Spec Skill

This skill guides the creation of comprehensive work specifications for new features, changes, or technical implementations.

## Workflow

When this skill is invoked, follow this process:

### 1. Gather Initial Requirements

Ask the user to describe:
- What needs to be implemented/changed
- Why this work is needed (business value or technical need)
- Any specific context they can provide

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

Create a new markdown file with the spec. Use this template structure:

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

### 6. Save and Confirm

- Ask the user where they want to save the spec file
- Default location: `specs/[descriptive-name].md` or `.global/specs/[descriptive-name].md`
- After creating the file, summarize the key points and ask if any sections need refinement

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

[Assistant creates the spec file]

I've created the specification at `specs/feature-name.md`. Here's a summary:
- [Key points]
- [Important technical notes]

Would you like me to expand on any sections or make adjustments?
```

## Notes

- Always research before asking questions - provide informed questions based on codebase analysis
- Be specific with file paths and references
- Don't make assumptions about critical implementation details
- A spec with questions is better than a spec with wrong assumptions
- Use the AskUserQuestion tool for multiple choice clarifications
