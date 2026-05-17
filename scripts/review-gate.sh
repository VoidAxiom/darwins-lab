#!/usr/bin/env bash
# Codex review-gate helper for the GitHub delivery flow (see CLAUDE.md).
#
#   scripts/review-gate.sh status  <pr>          CI checks + merge state + open threads
#   scripts/review-gate.sh threads <pr>          list review threads (id, resolved, body)
#   scripts/review-gate.sh resolve <threadId>    resolve one review conversation
#
# Read subcommands (status, threads) are side-effect free. `resolve` performs a
# GraphQL mutation — part of the normal delivery flow, not destructive.
set -uo pipefail

cmd="${1:-}"
arg="${2:-}"

repo_json="$(gh repo view --json owner,name)"
OWNER="$(printf '%s' "$repo_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["owner"]["login"])')"
REPO="$(printf '%s' "$repo_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])')"

Q='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){mergeable mergeStateStatus reviewThreads(first:100){nodes{id isResolved isOutdated comments(first:1){nodes{author{login} body path}}}}}}}'

case "$cmd" in
  status)
    [ -n "$arg" ] || { echo "usage: review-gate.sh status <pr>" >&2; exit 2; }
    echo "== CI checks =="
    gh pr checks "$arg" || true
    echo
    echo "== merge state =="
    resp="$(gh api graphql -F owner="$OWNER" -F repo="$REPO" -F pr="$arg" -f query="$Q")"
    printf '%s' "$resp" | python3 -c '
import json,sys
d=json.load(sys.stdin)["data"]["repository"]["pullRequest"]
th=d["reviewThreads"]["nodes"]
openn=[t for t in th if not t["isResolved"]]
mss=d["mergeStateStatus"]
print("mergeable=%s mergeStateStatus=%s" % (d["mergeable"], mss))
print("review threads: %d total, %d UNRESOLVED" % (len(th), len(openn)))
for t in openn:
    c=(t["comments"]["nodes"] or [{}])[0]
    who=(c.get("author") or {}).get("login","?")
    body=" ".join((c.get("body") or "").split())[:140]
    print("  [open] %s  @%s: %s" % (t["id"], who, body))
clean = mss=="CLEAN" and len(openn)==0
print("\nGATE:", "CLEAN (mergeable once CI green)" if clean else "BLOCKED")
'
    ;;

  threads)
    [ -n "$arg" ] || { echo "usage: review-gate.sh threads <pr>" >&2; exit 2; }
    resp="$(gh api graphql -F owner="$OWNER" -F repo="$REPO" -F pr="$arg" -f query="$Q")"
    printf '%s' "$resp" | python3 -c '
import json,sys
th=json.load(sys.stdin)["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
if not th:
    print("no review threads"); sys.exit()
for t in th:
    c=(t["comments"]["nodes"] or [{}])[0]
    who=(c.get("author") or {}).get("login","?")
    path=c.get("path") or "-"
    state="resolved" if t["isResolved"] else "OPEN"
    print("%s  [%s] @%s (%s)" % (t["id"], state, who, path))
    print("   "+" ".join((c.get("body") or "").split())[:400])
'
    ;;

  reply)
    # reply <threadId> <body...> — posts IN the review thread Codex spawned
    # (not a top-level PR comment) so the conversation is correctly answered.
    # Include "@codex" in the body when a re-review is wanted; resolve only
    # AFTER Codex has re-evaluated (or for a trivial fix, with the in-thread
    # reply as the record).
    body="${*:3}"
    { [ -n "$arg" ] && [ -n "$body" ]; } || {
      echo 'usage: review-gate.sh reply <threadId> <body...>' >&2; exit 2; }
    resp="$(gh api graphql -F tid="$arg" -F body="$body" -f query='mutation($tid:ID!,$body:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$tid,body:$body}){comment{url}}}')"
    printf '%s' "$resp" | python3 -c 'import json,sys;print("replied:",json.load(sys.stdin)["data"]["addPullRequestReviewThreadReply"]["comment"]["url"])'
    ;;

  resolve)
    [ -n "$arg" ] || { echo "usage: review-gate.sh resolve <threadId>" >&2; exit 2; }
    resp="$(gh api graphql -F threadId="$arg" -f query='mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{id isResolved}}}')"
    printf '%s' "$resp" | python3 -c 'import json,sys;t=json.load(sys.stdin)["data"]["resolveReviewThread"]["thread"];print("resolved",t["id"],t["isResolved"])'
    ;;

  *)
    echo "usage: review-gate.sh {status|threads|reply|resolve} <pr|threadId> [body]" >&2
    exit 2
    ;;
esac
