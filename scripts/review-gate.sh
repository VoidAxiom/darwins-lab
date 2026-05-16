#!/usr/bin/env bash
# Codex review-gate helper for the GitHub delivery flow (see CLAUDE.md).
#
#   scripts/review-gate.sh status  <pr>          CI checks + merge state + open threads
#   scripts/review-gate.sh threads <pr>          list review threads (id, resolved, body)
#   scripts/review-gate.sh resolve <threadId>    resolve one review conversation
#
# Read subcommands (status, threads) are side-effect free. `resolve` performs a
# GraphQL mutation — it is part of the normal delivery flow, not destructive.
set -euo pipefail

cmd="${1:-}"
arg="${2:-}"

repo_json="$(gh repo view --json owner,name)"
OWNER="$(echo "$repo_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["owner"]["login"])')"
REPO="$(echo "$repo_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])')"

threads_query='
query($owner:String!,$repo:String!,$pr:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$pr){
      mergeable
      mergeStateStatus
      reviewThreads(first:100){
        nodes{
          id isResolved isOutdated
          comments(first:1){nodes{author{login} body path}}
        }
      }
    }
  }
}'

case "$cmd" in
  status)
    [ -n "$arg" ] || { echo "usage: review-gate.sh status <pr>" >&2; exit 2; }
    echo "== CI checks =="
    gh pr checks "$arg" || true
    echo
    echo "== merge state =="
    gh api graphql -F owner="$OWNER" -F repo="$REPO" -F pr="$arg" -f query="$threads_query" \
      | python3 - <<'PY'
import json,sys
d=json.load(sys.stdin)["data"]["repository"]["pullRequest"]
th=d["reviewThreads"]["nodes"]
openn=[t for t in th if not t["isResolved"]]
print(f"mergeable={d['mergeable']} mergeStateStatus={d['mergeStateStatus']}")
print(f"review threads: {len(th)} total, {len(openn)} UNRESOLVED")
for t in openn:
    c=(t["comments"]["nodes"] or [{}])[0]
    who=(c.get('author') or {}).get('login','?')
    body=' '.join((c.get('body') or '').split())[:120]
    print(f"  [open] {t['id']}  @{who}: {body}")
clean = d['mergeStateStatus']=='CLEAN' and len(openn)==0
print("\nGATE:", "CLEAN ✅ (safe to merge once CI green)" if clean else "BLOCKED ❌")
PY
    ;;

  threads)
    [ -n "$arg" ] || { echo "usage: review-gate.sh threads <pr>" >&2; exit 2; }
    gh api graphql -F owner="$OWNER" -F repo="$REPO" -F pr="$arg" -f query="$threads_query" \
      | python3 - <<'PY'
import json,sys
th=json.load(sys.stdin)["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
if not th: print("no review threads"); raise SystemExit
for t in th:
    c=(t["comments"]["nodes"] or [{}])[0]
    who=(c.get('author') or {}).get('login','?')
    path=c.get('path') or '-'
    state='resolved' if t['isResolved'] else 'OPEN'
    print(f"{t['id']}  [{state}] @{who} ({path})")
    print("   "+' '.join((c.get('body') or '').split())[:300])
PY
    ;;

  resolve)
    [ -n "$arg" ] || { echo "usage: review-gate.sh resolve <threadId>" >&2; exit 2; }
    gh api graphql -F threadId="$arg" -f query='
      mutation($threadId:ID!){
        resolveReviewThread(input:{threadId:$threadId}){thread{id isResolved}}
      }' | python3 -c 'import json,sys;t=json.load(sys.stdin)["data"]["resolveReviewThread"]["thread"];print("resolved",t["id"],t["isResolved"])'
    ;;

  *)
    echo "usage: review-gate.sh {status|threads|resolve} <pr|threadId>" >&2
    exit 2
    ;;
esac
