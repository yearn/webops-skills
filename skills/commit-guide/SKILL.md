---
name: commit-guide
description: guide for composing git commit titles and bodies following project standards
---

## Activation Criteria
Use this skill when:
- Creating git commits
- Reviewing commit message quality
- Needing guidance on commit message format

## Format

### Title (Required)
```
Verb-first imperative description of what changed
```

**Rules:**
- Use imperative mood (Add, Fix, Update, Refactor, Remove, etc.)
- First letter capitalized
- No period at the end
- Keep under 50 characters when possible
- **Do NOT use prefixes** like "feat:", "fix:", "refactor:" - just the description
- Be specific about what changed, not how

**Examples:**
- ✅ "Add blockchain onboarding documentation"
- ✅ "Refactor webops-dev skill into focused granular skills"
- ✅ "Fix authentication timeout handling"
- ❌ "feat: add docs" (has prefix)
- ❌ "added new feature" (not imperative)
- ❌ "authentication fixes" (not specific enough)

### Body (Optional but recommended)

**Structure:**
1. High-level summary (what and why)
2. Bullet points for specific changes
3. Rationale or benefit explanation

**Format:**
```
Brief summary of the change and its purpose.

- First specific change with details
  - Sub-detail if needed
- Second specific change
- Third specific change

Explanation of why this change improves the codebase or solves a problem.

🤖 Generated with [Agent Name](https://agent-url.com)

Co-Authored-By: Agent Name <noreply@example.com>
```

**AI Agent Co-Author Credit:**
If an AI agent assisted with the commit, include attribution:
- **Claude Code:** `Co-Authored-By: Claude <noreply@anthropic.com>`
- **GitHub Copilot:** `Co-Authored-By: GitHub Copilot <noreply@github.com>`
- **OpenAI Codex:** `Co-Authored-By: OpenAI Codex <noreply@openai.com>`
- **Other agents:** Use appropriate attribution for the tool used

**Rules:**
- Leave blank line between title and body
- Wrap lines at 72 characters for readability in git log
- Use `-` for bullet points
- Focus on "what" and "why", not "how"
- Be concise but complete

## Examples from Project History

### Example 1: Feature Addition (using Claude Code)
```
Add skills export utility and webops-dev skill definition

- Created export.sh script to symlink skills to ~/.claude/skills directory
  - Automatically creates symlinks for all skill definitions
  - Cleans up orphaned symlinks from removed skills
- Added webops-dev skill with NPM dependency management policy
  - References existing npm-dependency-policy documentation
  - Includes placeholders for future commit, issue, PR, and standup guides

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Example 2: Refactoring (using Claude Code)
```
Refactor webops-dev skill into focused granular skills

Split the broad webops-dev skill into 4 specialized skills with single, clear purposes:

- npm-policy: Fully implemented with workflow for evaluating packages against dependency policy
- commit-guide: Placeholder for git commit message standards
- pr-guide: Placeholder for pull request format and conventions
- standup-report: Placeholder for git-based standup report generation

This makes skills easier to invoke, maintain, and reason about by having each serve a specific purpose rather than mixing concerns.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Example 3: Using GitHub Copilot
```
Fix rate limiting in API client

Add exponential backoff retry logic to handle 429 responses from the API.

- Implement retry decorator with configurable max attempts
- Add exponential backoff calculation (base 2, max 32 seconds)
- Log retry attempts for debugging

This prevents cascading failures when the API is under load.

🤖 Generated with GitHub Copilot

Co-Authored-By: GitHub Copilot <noreply@github.com>
```

## When to Include a Body

**Always include a body when:**
- Multiple files or components are changed
- The change needs context or rationale
- The change has non-obvious implications
- There are multiple related changes to list

**Body optional when:**
- Single, self-explanatory change
- The title fully describes the commit
- Trivial fixes or updates

## Anti-Patterns

❌ **Vague titles**
```
Update files
Fix bug
Changes
```

❌ **Past tense**
```
Added new feature
Fixed authentication
```

❌ **Label prefixes**
```
feat: add documentation
fix: resolve timeout issue
chore: update dependencies
```

❌ **Implementation details in title**
```
Change variable name from foo to bar in auth.js
Add new function handleSubmit() to form component
```

## Writing Process

1. **Review changes:** `git diff --staged`
2. **Identify type:** Add, Fix, Update, Refactor, Remove, etc.
3. **Write title:** What changed, imperative mood, under 50 chars
4. **Draft body:**
   - What: Summarize the changes
   - Details: Bullet points for specifics
   - Why: Explain the benefit or reasoning
5. **Review:** Does it accurately describe the commit?
