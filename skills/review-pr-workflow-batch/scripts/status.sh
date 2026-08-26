#!/usr/bin/env bash
# Show live progress for a batch. Safe to run at any time, including after the
# orchestrating session has gone away.
#
# usage: status.sh [run-dir]     (defaults to the newest run dir)
set -uo pipefail

RUN_DIR="${1:-}"
if [ -z "$RUN_DIR" ]; then
  RUN_DIR=$(ls -dt "$HOME"/.cache/pr-review-batch/*/ 2>/dev/null | head -1)
  RUN_DIR="${RUN_DIR%/}"
fi
[ -f "$RUN_DIR/manifest.json" ] || { echo "status: no manifest at ${RUN_DIR:-<none>}" >&2; exit 2; }

RESULTS="$RUN_DIR/results.jsonl"
echo "batch: $RUN_DIR"
printf '%-28s %-10s %-9s %s\n' "PR" "STATE" "ELAPSED" "DETAIL"

COUNT=$(jq length "$RUN_DIR/manifest.json")
for i in $(seq 0 $((COUNT - 1))); do
  eval "$(jq -r ".[$i] | @sh \"NUM=\(.number) UUID=\(.sessionId) TITLE=\(.title)\"" "$RUN_DIR/manifest.json")"

  DONE=""
  [ -f "$RESULTS" ] && DONE=$(jq -r --arg u "$UUID" 'select(.sessionId==$u) | "\(.status) \(.elapsedSec)"' "$RESULTS" 2>/dev/null | head -1)

  TRANSCRIPT=$(find "$HOME/.claude/projects" -name "$UUID.jsonl" 2>/dev/null | head -1)

  if [ -n "$DONE" ]; then
    read -r ST SECS <<<"$DONE"
    printf '#%-27s %-10s %-9s %s\n' "$NUM" "$ST" "${SECS}s" "${TITLE:0:44}"
  elif [ -n "$TRANSCRIPT" ]; then
    # Live: age of the transcript's first line vs now, and what it is doing.
    START=$(stat -c %W "$TRANSCRIPT" 2>/dev/null); [ "${START:-0}" -le 0 ] && START=$(stat -c %Y "$TRANSCRIPT")
    NOW=$(date +%s); EL=$(( NOW - START )); [ $EL -lt 0 ] && EL=0
    MSGS=$(wc -l < "$TRANSCRIPT")
    QUIET=$(( NOW - $(stat -c %Y "$TRANSCRIPT") ))

    # Liveness that survives a quiet transcript: the review process's own CPU time.
    PID=$(pgrep -f "session-id $UUID" | head -1)
    CPU=$(ps -o times= -p "${PID:-0}" 2>/dev/null | tr -d ' ')
    RSS=$(ps -o rss= -p "${PID:-0}" 2>/dev/null | awk '{printf "%dM", $1/1024}')

    # Once Workflow is in flight the parent blocks and its transcript stops
    # growing — agents run inside the same process. Quiet is normal there.
    if grep -q '"name":"Workflow"' "$TRANSCRIPT" 2>/dev/null; then
      PHASE="fan-out"
    else
      PHASE="phase 0"
    fi
    [ -z "$PID" ] && PHASE="NO PROCESS"

    printf '#%-27s %-10s %-9s %s\n' "$NUM" "running" \
      "$(printf '%dm%02ds' $((EL/60)) $((EL%60)))" \
      "$PHASE, ${MSGS} msgs${CPU:+, ${CPU}s cpu}${RSS:+, $RSS}"

    if [ "$PHASE" = "fan-out" ]; then
      printf '%-28s %-10s %-9s  ↳ %s\n' "" "" "" "agents working; transcript quiet ${QUIET}s (expected)"
    else
      LAST=$(tac "$TRANSCRIPT" 2>/dev/null | jq -r 'select(.message.content) | .message.content[]? | select(.type=="tool_use") | select(.name!="ToolSearch") | "\(.name): \((.input.description // .input.command // "") | tostring)"' 2>/dev/null | head -1)
      [ -n "$LAST" ] && printf '%-28s %-10s %-9s  ↳ %s\n' "" "" "" "${LAST:0:70}"
    fi
  else
    printf '#%-27s %-10s %-9s %s\n' "$NUM" "pending" "-" "${TITLE:0:44}"
  fi
done

echo
echo "load: $(cut -d' ' -f1-3 /proc/loadavg)   mem: $(free -h | awk '/^Mem:/{print $3"/"$2" used"}')"
