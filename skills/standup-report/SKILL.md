---
name: standup-report
description: generate a git-based report for standup meetings showing recent work and progress
---

## Activation Criteria
Use this skill when:
- Preparing for standup meetings
- Generating a summary of recent work
- Needing to report on progress from git history

## Workflow

1. **Get GitHub username** - Run `gh api user -q .login` to get the authenticated user

2. **Fetch PR activity** - Query PRs authored by the user in the yearn org from the last 7 days:
   ```bash
   gh search prs --author=@me --owner=yearn --created=">=$(date -v-7d +%Y-%m-%d)" --json title,url,state,createdAt,repository,number --limit 100
   ```

3. **Generate markdown report** - Create a file called `standup-report.md` in the current working directory with:

## Output Format

```markdown
# Yearn Activity Report

**Period:** [7 days ago] - [today]
**Author:** [github username]

## Pull Requests Authored

| Repo | PR | Status | Created |
|------|-----|--------|---------|
| [repo] | [#number title](url) | [state] | [date] |

## Summary
- **PRs Authored:** X
```

5. **Confirm output** - Tell the user the report was saved to `standup-report.md` in their current directory

## Notes

- Uses `gh` CLI for GitHub API access
- Requires authentication with `gh auth login`
- Scoped exclusively to the `yearn` organization
- Date range is fixed at 7 days
