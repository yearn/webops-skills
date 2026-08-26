#!/usr/bin/env bash
# Run one headless, resumable /review-pr-workflow session per PR, serially.
# Each session stops at the review preview; nothing is ever posted to GitHub here.
#
# usage: run-batch.sh <run-dir>
# env:
#   REVIEW_TIER          pass-through tier for /review-pr-workflow (default: auto)
#   REVIEW_VERIFY_AGENT  claude | codex (default: claude)
#   REVIEW_MODEL         optional --model override for the review sessions
#   SESSION_CWD          worktree (default) | invocation | <abs path>
#   INVOCATION_DIR       where the batch was invoked from (default: $PWD)
set -uo pipefail

RUN_DIR="${1:?usage: run-batch.sh <run-dir>}"
MANIFEST="$RUN_DIR/manifest.json"
RESULTS="$RUN_DIR/results.jsonl"
[ -f "$MANIFEST" ] || { echo "run-batch: missing $MANIFEST" >&2; exit 2; }

TIER="${REVIEW_TIER:-auto}"
VERIFY_AGENT="${REVIEW_VERIFY_AGENT:-claude}"
SESSION_CWD="${SESSION_CWD:-worktree}"
INVOCATION_DIR="${INVOCATION_DIR:-$PWD}"

# Broad allow-list: a review needs to read, search, shell out, and fan out agents.
# The write gate is the deny-list below plus the prompt, not a narrow allow-list —
# a missing entry here degrades a review silently instead of failing loudly.
ALLOWED='Bash,Read,Write,Edit,Glob,Grep,Task,Agent,Workflow,TodoWrite,WebFetch,WebSearch,Skill,BashOutput,KillShell' 

# Backstop against posting. Prefix-matched, so it is a safety net, not a sandbox;
# the binding instruction is in the prompt.
# NOTE: --allowedTools/--disallowedTools are variadic; they must each be passed as
# ONE comma-separated argument or they swallow the prompt that follows.
DENIED='Bash(gh pr review:*),Bash(gh pr comment:*),Bash(gh pr merge:*),Bash(gh pr close:*),Bash(gh pr edit:*),Bash(gh pr ready:*),Bash(gh issue comment:*),Bash(gh issue close:*),Bash(gh issue edit:*),Bash(gh api:*),Bash(git push:*)' 

: > "$RESULTS"
COUNT=$(jq length "$MANIFEST")
echo "run-batch: $COUNT PR(s), tier=$TIER verify-agent=$VERIFY_AGENT" >&2

for i in $(seq 0 $((COUNT - 1))); do
  eval "$(jq -r ".[$i] | @sh \"
    SLUG=\(.repo) NUM=\(.number) TITLE=\(.title) URL=\(.url)
    BASE_REF=\(.baseRef) WT=\(.worktree) UUID=\(.sessionId) REPO_NAME=\(.repoName)\"" "$MANIFEST")"

  case "$SESSION_CWD" in
    worktree)   CWD="$WT" ;;
    invocation) CWD="$INVOCATION_DIR" ;;
    *)          CWD="$SESSION_CWD" ;;
  esac

  LOG="$RUN_DIR/logs/$REPO_NAME-$NUM.log"
  echo "run-batch: [$((i + 1))/$COUNT] $SLUG#$NUM — $TITLE" >&2
  echo "run-batch:   session $UUID  cwd $CWD" >&2

  PROMPT=$(cat <<PROMPTEOF
Run the /review-pr-workflow skill on pull request #$NUM of $SLUG.

  PR:        $URL
  Title:     $TITLE
  Worktree:  $WT
  Base ref:  origin/$BASE_REF
  Args:      tier=$TIER verify-agent=$VERIFY_AGENT

The worktree above is already checked out at the PR head in detached HEAD, and
origin/$BASE_REF is fetched. Do NOT run 'gh pr checkout' or switch branches —
Phase 0 step 4 is already done for you. Run every git command against the
worktree and pass the repo explicitly to gh: gh <cmd> -R $SLUG.

Dependencies are already installed in the worktree. Do NOT run bun install,
npm install, pnpm install or yarn — a cold install of this tree is gigabytes and
running it mid-review competes with your own agents. If node_modules is missing
or lint fails because of it, read $WT/.prepare-install.log, skip the lint step,
and say so in your output rather than installing.
Pass baseRef "origin/$BASE_REF" to the workflow; this PR may target another PR's
branch rather than the default branch.

This session is non-interactive: there is no user available to answer anything,
and YOU GET EXACTLY ONE TURN. There is no later turn in which to finish.

  - Never ask a question. If a judgement call comes up, make it, state the
    assumption in your output, and continue.
  - Never end your turn to wait for something. Do not say you will assemble the
    review "when the lenses return" — if you end your turn, the session is over
    and the review is lost. Await every workflow, agent and command before you
    write your final message.
  - Prefer foreground commands. If you do start a background task, you must poll
    it to completion within this same turn before finishing.
  - Your final message must contain the complete assembled review. A turn that
    ends with work still outstanding is a failed run, not a partial one.
  - Post NOTHING to GitHub. No review, no comment, no approval, no request for
    changes, no label, no edit. Read-only gh commands only.
  - Stop at Phase 4 step 4: print the fully assembled review as plain markdown,
    then the short stats block. That is your final output. Do not go on to
    Phase 4 step 5 — the approval gate is satisfied later by a human resuming
    this session interactively.
  - Do not delete the worktree or clean up screenshots; the resumed session
    needs them.

The user will resume this session with 'claude --resume $UUID' to approve and
post the review themselves.
PROMPTEOF
)

  # The prompt goes over stdin on purpose: --allowedTools/--disallowedTools/--add-dir
  # are variadic and will swallow a trailing positional prompt argument.
  # Default is 600s, after which claude -p kills outstanding background tasks and
  # exits — long enough to truncate a review mid-fan-out. 0 means wait.
  export CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0

  START=$SECONDS
  ( cd "$CWD" && printf '%s' "$PROMPT" | claude -p \
      --session-id "$UUID" \
      --name "review $REPO_NAME#$NUM" \
      ${REVIEW_MODEL:+--model "$REVIEW_MODEL"} \
      --add-dir "$WT" \
      --allowedTools "$ALLOWED" \
      --disallowedTools "$DENIED" ) > "$LOG" 2>&1
  CODE=$?   # subshell exit == claude exit (last command in the pipe)
  ELAPSED=$((SECONDS - START))

  # Exit 0 only means the process ended. A session that ran out of turn mid-review
  # also exits 0, so require the review's own completion marker.
  if [ $CODE -ne 0 ]; then
    STATUS=failed
  elif grep -qE '^## How This Was Reviewed|^## Verdict' "$LOG" 2>/dev/null; then
    STATUS=ok
  else
    STATUS=incomplete
  fi
  echo "run-batch:   $STATUS in ${ELAPSED}s (exit $CODE) -> $LOG" >&2

  jq -nc --arg uuid "$UUID" --arg status "$STATUS" --argjson code "$CODE" \
        --argjson elapsed "$ELAPSED" --arg log "$LOG" --argjson idx "$i" \
        '{index:$idx, sessionId:$uuid, status:$status, exitCode:$code, elapsedSec:$elapsed, log:$log}' \
        >> "$RESULTS"
done

echo "run-batch: done — results at $RESULTS" >&2
