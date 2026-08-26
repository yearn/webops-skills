#!/usr/bin/env bash
# Resolve PR refs, ensure a local clone, fetch base + head, create one detached
# worktree per PR, mint a session UUID per PR, and emit <run-dir>/manifest.json.
#
# usage: prepare.sh <run-dir> <pr-ref>...
#   pr-ref: https://github.com/OWNER/REPO/pull/N | OWNER/REPO#N | OWNER/REPO/N
set -euo pipefail

RUN_DIR="${1:?usage: prepare.sh <run-dir> <pr-ref>...}"
shift
[ $# -gt 0 ] || { echo "prepare: no PR refs given" >&2; exit 2; }

CLONE_DIRS="${PR_REVIEW_CLONE_DIRS:-$HOME/git}"
CACHE_DIR="${PR_REVIEW_CLONE_CACHE:-$HOME/.cache/pr-review-clones}"

SKIP_DEPS="${SKIP_DEPS:-0}"
ALLOW_TMPFS="${ALLOW_TMPFS:-0}"

mkdir -p "$RUN_DIR/worktrees" "$RUN_DIR/logs" "$CACHE_DIR"

# A worktree is a full checkout AND a full node_modules — think gigabytes each.
# On this class of box /tmp is a tmpfs, i.e. RAM: installing there has wedged the
# machine before. Refuse rather than repeat it.
RUN_FSTYPE=$(findmnt -no FSTYPE -T "$RUN_DIR" 2>/dev/null || echo unknown)
if [ "$RUN_FSTYPE" = "tmpfs" ] && [ "$ALLOW_TMPFS" != "1" ]; then
  cat >&2 <<TMPFSERR
prepare: refusing to build worktrees under $RUN_DIR — it is on a tmpfs (RAM).
         A checkout plus its node_modules runs to gigabytes; installing into RAM
         has taken this machine down. Use a disk-backed path such as
         ~/.cache/pr-review-batch/<batch-id>, or set ALLOW_TMPFS=1 to override.
TMPFSERR
  exit 3
fi

normalize_remote() {
  local u="${1%.git}"
  u="${u#git@github.com:}"
  u="${u#https://github.com/}"
  u="${u#ssh://git@github.com/}"
  printf '%s' "$u" | tr '[:upper:]' '[:lower:]'
}

parse_ref() {
  # -> "owner/repo number"
  local r="$1" slug num
  r="${r%/}"
  case "$r" in
    *github.com/*/pull/*)
      slug="${r#*github.com/}"; num="${slug##*/pull/}"; num="${num%%/*}"
      slug="${slug%%/pull/*}" ;;
    */*'#'*)
      num="${r##*#}"; slug="${r%%#*}" ;;
    */*/*)
      num="${r##*/}"; slug="${r%/*}" ;;
    *) echo "prepare: cannot parse PR ref: $r" >&2; return 1 ;;
  esac
  case "$num" in ''|*[!0-9]*) echo "prepare: bad PR number in: $r" >&2; return 1 ;; esac
  printf '%s %s' "$slug" "$num"
}

find_clone() {
  local slug="$1" base d url
  for base in ${CLONE_DIRS//:/ }; do
    [ -d "$base" ] || continue
    for d in "$base"/*/; do
      [ -d "$d/.git" ] || continue
      url=$(git -C "$d" remote get-url origin 2>/dev/null) || continue
      [ "$(normalize_remote "$url")" = "$slug" ] || continue
      printf '%s' "${d%/}"; return 0
    done
  done
  return 1
}

ensure_clone() {
  local slug="$1" path
  if path=$(find_clone "$slug"); then printf '%s' "$path"; return 0; fi
  path="$CACHE_DIR/${slug//\//__}"
  if [ ! -d "$path/.git" ]; then
    echo "prepare: no local clone of $slug — cloning into $path" >&2
    gh repo clone "$slug" "$path" -- --filter=blob:none >&2
  fi
  printf '%s' "$path"
}

# Install once, here, serially and de-prioritised. Left to the review session it
# would run mid-fan-out, competing with that review's own agents, and its cost
# would be invisible until it bit.
install_deps() {
  local wt="$1" mgr=""
  [ "$SKIP_DEPS" = "1" ] && { echo "prepare: SKIP_DEPS=1 — leaving $wt without node_modules" >&2; return 0; }
  if   [ -f "$wt/bun.lock" ] || [ -f "$wt/bun.lockb" ]; then mgr="bun install"
  elif [ -f "$wt/pnpm-lock.yaml" ];                     then mgr="pnpm install --frozen-lockfile"
  elif [ -f "$wt/package-lock.json" ];                  then mgr="npm ci"
  elif [ -f "$wt/yarn.lock" ];                          then mgr="yarn install --frozen-lockfile"
  elif [ -f "$wt/package.json" ];                       then mgr="npm install"
  else echo "prepare: no lockfile in $wt — skipping install" >&2; return 0; fi

  echo "prepare: installing deps in $wt ($mgr)" >&2
  if ( cd "$wt" && nice -n 10 ionice -c3 timeout 1800 $mgr ) >"$wt/.prepare-install.log" 2>&1; then
    echo "prepare:   ok ($(du -sh "$wt/node_modules" 2>/dev/null | cut -f1) node_modules)" >&2
  else
    echo "prepare:   WARNING install failed — see $wt/.prepare-install.log; lint will be skipped in review" >&2
  fi
}

entries=()
for ref in "$@"; do
  read -r SLUG NUM <<<"$(parse_ref "$ref")"
  echo "prepare: resolving $SLUG#$NUM" >&2

  meta=$(gh pr view "$NUM" -R "$SLUG" --json number,title,url,state,isDraft,headRefName,baseRefName,author,changedFiles,additions,deletions)
  state=$(jq -r .state <<<"$meta")
  if [ "$state" != "OPEN" ]; then
    echo "prepare: WARNING $SLUG#$NUM is $state — reviewing anyway" >&2
  fi
  BASE_REF=$(jq -r .baseRefName <<<"$meta")

  CLONE=$(ensure_clone "$SLUG")
  REPO_NAME="${SLUG##*/}"

  # Base first, PR head second, each into an explicit ref so nothing depends on FETCH_HEAD.
  git -C "$CLONE" fetch --quiet origin "+refs/heads/$BASE_REF:refs/remotes/origin/$BASE_REF"
  git -C "$CLONE" fetch --quiet origin "+refs/pull/$NUM/head:refs/pr-review/$NUM"
  HEAD_SHA=$(git -C "$CLONE" rev-parse "refs/pr-review/$NUM")
  BASE_SHA=$(git -C "$CLONE" rev-parse "refs/remotes/origin/$BASE_REF")

  WT="$RUN_DIR/worktrees/$REPO_NAME-$NUM"
  if [ -e "$WT" ]; then git -C "$CLONE" worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"; fi
  git -C "$CLONE" worktree add --detach --quiet "$WT" "$HEAD_SHA"

  install_deps "$WT"

  UUID=$(cat /proc/sys/kernel/random/uuid)

  entries+=("$(jq -n \
    --argjson meta "$meta" \
    --arg slug "$SLUG" --arg repo "$REPO_NAME" --arg uuid "$UUID" \
    --arg clone "$CLONE" --arg worktree "$WT" \
    --arg headSha "$HEAD_SHA" --arg baseSha "$BASE_SHA" --arg baseRef "$BASE_REF" \
    '{repo:$slug, repoName:$repo, number:$meta.number, title:$meta.title, url:$meta.url,
      state:$meta.state, isDraft:$meta.isDraft, author:$meta.author.login,
      changedFiles:$meta.changedFiles, additions:$meta.additions, deletions:$meta.deletions,
      baseRef:$baseRef, headRef:$meta.headRefName, headSha:$headSha, baseSha:$baseSha,
      clone:$clone, worktree:$worktree, sessionId:$uuid}')")
done

printf '%s\n' "${entries[@]}" | jq -s '.' > "$RUN_DIR/manifest.json"
echo "prepare: wrote $RUN_DIR/manifest.json ($# PRs)" >&2
