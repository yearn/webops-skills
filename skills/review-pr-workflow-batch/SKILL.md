---
name: review-pr-workflow-batch
description: Run review-pr-workflow across several PRs in one go — one isolated worktree and one resumable Claude Code session per PR, executed serially, ending in a table of session UUIDs to resume for approval and posting
---

## Activation Criteria
Use this skill when:
- User says `/review-pr-workflow-batch`
- User hands over several PR URLs at once and wants each deeply reviewed
- User wants PR reviews parked in separate sessions to approve and post later

For a single PR, run `/review-pr-workflow` directly. This skill is a batch driver around it — it adds isolation and session bookkeeping, and changes nothing about how a review is produced.

## Arguments

```
/review-pr-workflow-batch <pr>, <pr>, ... [tier=auto|full|light] [verify-agent=claude|codex] [model=<alias>]
```

`<pr>` accepts `https://github.com/OWNER/REPO/pull/N`, `OWNER/REPO#N`, or `OWNER/REPO/N`. Separate with commas or whitespace. PRs may span different repos.

Trailing flags apply to every PR in the batch and are passed straight through to `/review-pr-workflow`; `tier=auto` lets each session run its own tier detection, which is almost always what you want.

## What it guarantees

- **One session per PR**, with its UUID minted *before* launch, so the table is known up front and survives a review that crashes.
- **`claude --resume <uuid>` works from anywhere.** Session lookup by UUID is not scoped to the directory you started in (verified on 2.1.246). Resuming puts the session's cwd at wherever you resume *from*, which is why the review prompt refers to the worktree by absolute path throughout.
- **One detached worktree per PR** under `<run-dir>/worktrees/` (a disk-backed path — see Phase 0), so stacked PRs and parallel checkouts never race. The batch session itself never leaves the directory you invoked it from.
- **Nothing reaches GitHub.** Each session runs to the review preview and stops. Posting happens when *you* resume the session and approve it.

---

## Phase 0 — Resolve and confirm (do this yourself, in the invoking session)

1. **Parse the PR refs** out of the user's message, plus any trailing flags.
2. **Pick a batch id and run dir.** `RUN_DIR=~/.cache/pr-review-batch/<short-slug>-<n>`, where the slug names the batch (e.g. `yearnfi-enso`). Never reuse a run dir.

   **Not `/tmp`.** On this class of machine `/tmp` is a tmpfs — it is RAM. A worktree is a full checkout plus a full `node_modules`, which for a JS monorepo runs to gigabytes each; installing two of those into a 7.6G tmpfs on a 15G box wedged the machine hard enough to need a bounce, with no OOM kill in the logs to explain it. `prepare.sh` now refuses a tmpfs run dir outright (`ALLOW_TMPFS=1` overrides, and you should not).
3. **Run `scripts/prepare.sh`:**
   ```
   scripts/prepare.sh "$RUN_DIR" <pr-ref>...
   ```
   It resolves each PR through `gh`, locates a local clone (searching `$PR_REVIEW_CLONE_DIRS`, default `~/git`) or clones into `~/.cache/pr-review-clones`, fetches the base branch and PR head into explicit refs, adds a detached worktree per PR, **installs that worktree's dependencies**, mints a session UUID per PR, and writes `$RUN_DIR/manifest.json`.

   The dependency install happens here, serially and `nice`/`ionice`'d, on purpose. A fresh worktree has no `node_modules`, so left alone every review's Phase 0 lint step triggers its own cold install — mid-fan-out, competing with that review's own agents, with the cost invisible until it bites. Doing it up front also means a failed install is a visible warning before you approve the batch, not a silent lint skip inside a review. `SKIP_DEPS=1` turns it off; the per-worktree log is `<worktree>/.prepare-install.log`.
4. **Show the user the resolved batch and stop for approval.** One line per PR — repo, number, title, author, changed-file and net-line counts, base ref — plus the run dir. Call out anything surprising:
   - a PR that is closed, merged, or draft
   - a PR whose base is *another PR's branch* (a stacked chain — each review is then graded against its own parent, not `main`)
   - a repo that had to be cloned fresh
   Then state the cost honestly: **N × a multi-agent review, run serially.** Do not launch until the user says go.

## Phase 1 — Run the batch

Launch the driver in the background — a full-tier review runs well past any foreground command timeout:

```
INVOCATION_DIR="$PWD" REVIEW_TIER=<tier> REVIEW_VERIFY_AGENT=<agent> \
  scripts/run-batch.sh "$RUN_DIR"
```

It walks `manifest.json` in order and, for each PR, runs one `claude -p --session-id <uuid>` in that PR's worktree, invoking `/review-pr-workflow` with the worktree path, the correct `baseRef`, and instructions to stop at the review preview. Per-PR stdout lands in `$RUN_DIR/logs/`, and a status line per PR is appended to `$RUN_DIR/results.jsonl`.

**A failed review never aborts the batch.** The loop records the exit code and moves to the next PR.

While it runs, do not start reviews of your own in the foreground — the point of the batch is that only one review is in flight at a time.

### Checking on a run

`scripts/status.sh [run-dir]` (defaults to the newest run dir) prints a live table. It reads only the run dir and the session transcripts, so it works from any session — including a fresh one after you lost the orchestrator to an SSH disconnect.

The thing it exists to tell you: **a quiet transcript is not a stall.** Once a review reaches its `Workflow` fan-out the parent blocks and its transcript stops growing, because the agents run inside that same process and write nothing separate to disk. `status.sh` reports `fan-out` plus the review process's accumulated CPU time and RSS, so liveness is visible even when nothing is being written. `NO PROCESS` against a PR still marked running is the real failure signal.

`claude -p` buffers its stdout until exit, so `logs/<repo>-<num>.log` stays empty for the whole run. Do not read emptiness there as a problem.

## Phase 2 — Report

When the driver exits, join `manifest.json` with `results.jsonl` and print the table:

| repo | pr | session |
|------|----|---------|
| `yearn/yearn.fi` | #1354 — Force Enso vault zaps through router | `f2c3e347-…` |

Then, in a few lines and no more:
- any PR whose status is not `ok`, with the log path — a failed row's session may still be resumable and partly useful
- the resume command shape, once: `claude --resume <uuid>`
- where the worktrees live, and that they must survive until the reviews are posted

Each resumed session comes back sitting at its finished review preview. Approve it there and it posts through `review-pr`'s normal gate.

## Phase 3 — Cleanup (only when asked)

Worktrees are not disposable — a resumed session still needs its checkout. Remove them only once the user says the batch is done:

```
git -C <clone> worktree remove --force <worktree>   # per PR
rm -rf "$RUN_DIR"
```

---

## Constraints worth knowing

- **`--permission-mode bypassPermissions` is refused when running as root**, so the headless sessions run on an explicit allow-list with a deny-list backstop (`gh pr comment`, `gh pr review`, `gh api`, `git push`, …). A denied call fails fast and the session continues — it does not hang. If a review's log shows it gave up on a step because a tool was denied, widen `ALLOWED` in `run-batch.sh`; do not widen `DENIED`.
- **A review session gets exactly one turn.** In `-p` there is no second turn, so a session that ends saying "I'll assemble the review when the lenses return" loses the whole review and still exits 0. Two guards: the prompt forbids ending a turn with work outstanding, and `run-batch.sh` marks a run `incomplete` unless the log carries the review's own completion marker. **Never treat exit 0 as proof a review exists.**
- **`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` is required.** The default is 600s, after which `claude -p` kills outstanding background tasks and exits — comfortably shorter than a full-tier review, and it truncates mid-fan-out. A review that runs its test suites in the background is the common way to trip it.
- **Never edit `run-batch.sh` while a batch is running.** Bash reads a script incrementally by byte offset, so an edit shifts the file under the live interpreter: it re-enters the loop with corrupted state, re-invokes the PR it was on — truncating that PR's log, which is opened with `>` — and then dies on a syntax error. The session itself is protected (a re-invocation is refused with "Session ID already in use") and the review survives in its transcript, but the log has to be reconstructed by hand. Stage every change, then run.
- **A lost log is not a lost review.** The full review text is the final assistant message in `~/.claude/projects/<worktree-slug>/<uuid>.jsonl`. Extract it with `jq -r 'select(.message.role=="assistant") | .message.content[]? | select(.type=="text") | .text'` and take everything from the last "assembled review" marker onward — the text arrives as many streamed blocks across consecutive lines, so order matters and `tac` will reverse it.
- **The write gate is the prompt, not the deny-list.** Deny patterns are prefix-matched and a determined agent could route around them. They are a backstop for accidents.
- **`--allowedTools`, `--disallowedTools` and `--add-dir` are variadic** and will swallow a trailing positional prompt. `run-batch.sh` pipes the prompt over stdin for this reason. Keep it that way.
- **Sessions are filed under the worktree's path** in `~/.claude/projects/`, so they will not appear in the `/resume` picker of the directory you invoked the batch from. Resume by UUID. Set `SESSION_CWD=invocation` to flip this, at the cost of running the review outside a git checkout.
- **Disk, not RAM.** Budget roughly (checkout + `node_modules`) per PR — a few gigabytes each for a JS monorepo. That is fine on a disk-backed path and fatal on a tmpfs. Phase 3 cleanup is what reclaims it.
- **Cost scales linearly.** Three full-tier reviews is roughly fifty agents. The per-PR tier detector in `review-pr-workflow` is what keeps that honest; leave `tier=auto` unless you have a reason.
