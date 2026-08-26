---
name: my-reviews
description: list open PRs across GitHub where you are a requested reviewer, verified live against each repo
---

## Activation Criteria
Use this skill when:
- Asked what PRs are waiting on the user's review ("what's in my review queue", "any PRs waiting on me")
- Asked to refresh or re-run a review queue listing
- Triaging what to review next

Takes an optional org argument to narrow scope (e.g. `/my-reviews yearn`). With no argument, searches all orgs.

## Workflow

1. **Resolve the user** - `gh api user --jq .login`. Never hardcode the login; the skill should work for whoever is authenticated.

2. **Search for review requests** - Retry on 503; the GitHub search API returns them intermittently.
   ```bash
   OWNER_FLAG=""   # or --owner <org> when an org argument was given
   for i in 1 2 3; do
     out=$(gh search prs --state open --review-requested "$LOGIN" $OWNER_FLAG \
       --limit 50 --json number,repository,url 2>&1)
     echo "$out" | grep -q "503" || break
     sleep 3
   done
   ```

3. **Verify every hit live** - REQUIRED, not optional. See Notes.
   ```bash
   gh pr view "$NUM" -R "$REPO" --json \
     number,title,state,isDraft,author,reviewRequests,createdAt,updatedAt,mergeable,reviewDecision,statusCheckRollup
   ```
   Drop any PR whose live `state` is not `OPEN`, or whose `reviewRequests` no longer contains the user.

4. **Report** - Use the output format below. If verification dropped any search hits, say so explicitly and say why (merged, closed, or reviewer removed) — a silently shorter list looks like PRs vanished.

## Output Format

Group by repo, order by staleness (least recent activity last). Per PR: link, title, author, age, last activity, and anything blocking.

```markdown
**owner/repo**
- [#442](url) — title — author, opened 31d ago, last activity 6d ago — checks green, mergeable
```

Close with what is actually blocked on the user versus blocked on the author (failing checks, merge conflicts, requested changes outstanding).

## Notes

- **The search index lags behind the repos.** On 2026-08-21 a single `gh search prs --review-requested` run returned 8 PRs, of which 5 had already been merged or closed days earlier. Per-repo `gh pr view` is the only trustworthy state. Never report search results unverified.
- Two consecutive runs can legitimately differ. When a count changes, explain the delta rather than silently presenting a new list.
- `--review-requested` matches individual requests only. Team requests need `--team-review-requested <org/team>`; this skill deliberately excludes them.
- `mergeable=UNKNOWN` usually means GitHub is recomputing the merge commit on a long-idle branch, not a real conflict. Re-check rather than reporting it as blocked.
- Requires `gh auth login` with `repo` and `read:org` scopes.
