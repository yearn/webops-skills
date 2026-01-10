---
name: pr-guide
description: guide for composing pull request titles and descriptions following project standards
---

## Activation Criteria
Use this skill when:
- Creating pull requests
- Reviewing PR descriptions for completeness
- Needing guidance on PR format and content

## PR Title

Write a clear, concise title that summarizes the change in a sentence fragment. Capitalize the first letter. Avoid prefixes like `feat:` or `fix:` — let the content speak for itself.

**Good examples:**
- `Add webhook retry logic with exponential backoff`
- `Fix token refresh race condition`
- `Remove deprecated v1 API endpoints`

**Avoid:**
- `fix: bug` (too vague, uses prefix)
- `Updated stuff` (unclear what changed)
- `WIP` (don't open PR until ready, or use draft)

## PR Description Template

```markdown
### Summary
<minimum 1–2 sentences: what changed and why?>

### How to review
<What should the reviewer look at first?
Any specific files/flows to ignore?
Happy path steps to smoke test?>

### Test plan
- [ ] Manual: <steps, special cases, environment, etc>
- [ ] Automated (when applicable): <tests run / commands>

### Risk / impact
<Any risky areas (funds, auth, migrations, rate limits)?
Any feature flags, kill switches, or easy rollback steps?>
```

## Guidelines

- **Summary**: Be concise but complete. Explain both what changed and why.
- **How to review**: Help reviewers focus their attention. Mention key files, suggest a review order, or note anything that can be skipped.
- **Test plan**: Include concrete steps. For manual testing, specify environment or special setup. For automated tests, list the commands or test names.
- **Risk / impact**: Be honest about risky areas. Mention anything touching funds, authentication, database migrations, or rate limits. Include rollback strategy if applicable.
