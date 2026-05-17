#!/usr/bin/env bash
# Codex review-gate helper for the GitHub delivery flow (see CLAUDE.md).
#
#   scripts/review-gate.sh status  <pr>          CI checks + merge state + open threads
#   scripts/review-gate.sh threads <pr>          list review threads (id, resolved, body)
#   scripts/review-gate.sh reply   <id> <body>   in-thread audit note (optional)
#   scripts/review-gate.sh resolve <threadId>    resolve one review conversation
#   scripts/review-gate.sh wait    <pr> [maxSec] poll until Codex responds / clean
#
# Read subcommands (status, threads, wait) are side-effect free. `resolve`/
# `reply` perform GraphQL mutations — part of the normal delivery flow, not
# destructive.
#
# `wait` exists so the caller does not hand-roll a slow fixed loop: it polls
# every ~15s and returns the instant Codex has acted (a new review thread, or
# a chatgpt-codex-connector PR comment with CI settled), instead of grinding a
# long deadline (VOI-28).
set -uo pipefail

cmd="${1:-}"
arg="${2:-}"

repo_json="$(gh repo view --json owner,name)"
OWNER="$(printf '%s' "$repo_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["owner"]["login"])')"
REPO="$(printf '%s' "$repo_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])')"

# `finding` = the original review comment (first), fetched separately so it is
# never lost no matter how many replies a thread accrues; `recent` = the tail
# (latest state, e.g. a fix reply). Codex re-reviews land as NEW threads, so
# the gate is "zero unresolved Codex threads", not an in-thread re-review.
Q='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){mergeable mergeStateStatus reviewThreads(first:100){nodes{id isResolved isOutdated finding:comments(first:1){nodes{author{login} body path}} recent:comments(last:20){totalCount nodes{author{login} body}}}}}}}'

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
    f=((t["finding"]["nodes"] or [{}])[0])
    rec=t["recent"]["nodes"] or [{}]
    last=rec[-1]
    fw=(f.get("author") or {}).get("login","?")
    lw=(last.get("author") or {}).get("login","?")
    body=" ".join((last.get("body") or f.get("body") or "").split())[:140]
    print("  [open] %s  (%d msgs, finding @%s, latest @%s): %s"
          % (t["id"], t["recent"]["totalCount"], fw, lw, body))
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
    first=(t["finding"]["nodes"] or [{}])[0]
    rec=t["recent"]["nodes"] or [{}]
    last=rec[-1]
    n=t["recent"]["totalCount"]
    path=first.get("path") or "-"
    state="resolved" if t["isResolved"] else "OPEN"
    print("%s  [%s] (%s)  %d msg(s)" % (t["id"], state, path, n))
    fw=(first.get("author") or {}).get("login","?")
    print("   finding @%s: %s" % (fw, " ".join((first.get("body") or "").split())[:300]))
    if n > 1:
        lw=(last.get("author") or {}).get("login","?")
        print("   latest  @%s: %s" % (lw, " ".join((last.get("body") or "").split())[:300]))
'
    ;;

  reply)
    # reply <threadId> <body...> — OPTIONAL in-thread note (audit only).
    # The convention is to acknowledge via a TOP-LEVEL `@codex` PR comment
    # highlighting the change, then `resolve` the old thread, then wait for
    # Codex's re-review (which arrives as NEW threads). See CLAUDE.md.
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

  wait)
    [ -n "$arg" ] || { echo "usage: review-gate.sh wait <pr> [maxSec]" >&2; exit 2; }
    MAX="${3:-360}"
    INT=15
    WQ='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){mergeStateStatus comments(last:50){nodes{author{login}}} reviewThreads(first:100){nodes{isResolved}}}}}'
    # Baseline the Codex-comment count at invocation. REVIEWED-CLEAN requires
    # a NEW chatgpt-codex-connector comment since now — not any historical
    # one — so a prior clean comment can't short-circuit the re-review (P1).
    # The baseline MUST be established from a successful fetch; a failed/
    # transient/non-JSON response must NOT default to 0 (that would make
    # historical comments look fresh and reopen the stale-clean shortcut).
    # Retry, then abort rather than guess (P1).
    BASE_CODEX=""
    for _attempt in 1 2 3 4 5; do
      base_resp="$(gh api graphql -F o="$OWNER" -F r="$REPO" -F n="$arg" -f query="$WQ" 2>/dev/null)"
      parsed="$(printf '%s' "$base_resp" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)["data"]["repository"]["pullRequest"]
    print("OK", sum(1 for c in d["comments"]["nodes"] if (c.get("author") or {}).get("login")=="chatgpt-codex-connector"))
except Exception:
    print("ERR")')"
      case "$parsed" in
        "OK "*) BASE_CODEX="${parsed#OK }"; break ;;
      esac
      sleep 3
    done
    [ -n "$BASE_CODEX" ] || {
      echo "wait: could not establish Codex-comment baseline after retries — aborting (refusing to risk a stale-clean shortcut)" >&2
      exit 3; }
    echo "baseline: $BASE_CODEX prior Codex comment(s) — waiting for a fresh one"
    elapsed=0
    while :; do
      ci="$(gh pr checks "$arg" --json bucket -q '.[0].bucket' 2>/dev/null || echo '?')"
      resp="$(gh api graphql -F o="$OWNER" -F r="$REPO" -F n="$arg" -f query="$WQ" 2>/dev/null)"
      verdict="$(printf '%s' "$resp" | CI="$ci" BASE="${BASE_CODEX:-0}" python3 -c '
import json,os,sys
try:
    d=json.load(sys.stdin)["data"]["repository"]["pullRequest"]
except Exception:
    print("ERR retry"); sys.exit()
th=d["reviewThreads"]["nodes"]
openn=sum(1 for t in th if not t["isResolved"])
codex=sum(1 for c in d["comments"]["nodes"] if (c.get("author") or {}).get("login")=="chatgpt-codex-connector")
base=int(os.environ.get("BASE","0")); fresh=codex-base
mss=d["mergeStateStatus"]; ci=os.environ.get("CI","?")
if openn>0:
    print("FINDINGS open=%d mss=%s ci=%s" % (openn,mss,ci))
elif fresh>0 and ci!="pending":
    print("REVIEWED-CLEAN fresh_codex=%d open=0 mss=%s ci=%s" % (fresh,mss,ci))
else:
    print("WAITING codex=%d fresh=%d open=%d ci=%s" % (codex,fresh,openn,ci))
')"
      echo "t=${elapsed}s ${verdict}"
      case "$verdict" in
        FINDINGS*|REVIEWED-CLEAN*) exit 0 ;;
      esac
      [ "$elapsed" -ge "$MAX" ] && { echo "TIMEOUT after ${MAX}s"; exit 0; }
      sleep "$INT"; elapsed=$((elapsed+INT))
    done
    ;;

  *)
    echo "usage: review-gate.sh {status|threads|reply|resolve|wait} <pr|threadId> [body|maxSec]" >&2
    exit 2
    ;;
esac
