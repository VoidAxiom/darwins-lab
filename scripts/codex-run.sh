#!/usr/bin/env bash
# Codex exec dispatch + run-packet helper. See .codex/DELEGATION.md.
#
#   scripts/codex-run.sh <explorer|worker> <run-id> [task-file]
#
# Builds .codex-runs/<run-id>/, runs codex exec with the canonical flags for
# the role, and captures the full transcript + git diff so Claude can inspect
# (never trust Codex blindly). Claude invokes this with run_in_background.
#
# CODEX_MODEL overrides the model id (default below). Network stays disabled.
set -uo pipefail

ROLE="${1:-}"
RUN_ID="${2:-}"
TASK_SRC="${3:-}"
CODEX_MODEL="${CODEX_MODEL:-gpt-5.3-codex-spark}"
SCHEMA=".codex/schemas/codex-result.schema.json"

[ "$ROLE" = "explorer" ] || [ "$ROLE" = "worker" ] || {
  echo "usage: codex-run.sh <explorer|worker> <run-id> [task-file]" >&2; exit 2; }
[ -n "$RUN_ID" ] || { echo "run-id required" >&2; exit 2; }

RUN=".codex-runs/$RUN_ID"
mkdir -p "$RUN/artifacts"

# Task packet: use provided file, else expect $RUN/task.md to already exist.
if [ -n "$TASK_SRC" ]; then cp "$TASK_SRC" "$RUN/task.md"; fi
[ -s "$RUN/task.md" ] || { echo "missing task: $RUN/task.md (see .codex/task-template.md)" >&2; exit 2; }

BASE_SHA="$(git rev-parse HEAD 2>/dev/null || echo '?')"
cat > "$RUN/metadata.json" <<EOF
{ "run_id": "$RUN_ID", "role": "$ROLE", "model": "$CODEX_MODEL",
  "base_sha": "$BASE_SHA", "branch": "$(git branch --show-current 2>/dev/null)",
  "started": "$(date -u +%FT%TZ)" }
EOF

if [ "$ROLE" = "explorer" ]; then
  set -- codex exec --json --sandbox read-only \
    -c model="$CODEX_MODEL" \
    --output-schema "$SCHEMA" -o "$RUN/result.json" "$(cat "$RUN/task.md")"
else
  set -- codex exec --json --sandbox workspace-write \
    --ask-for-approval on-request \
    -c approvals_reviewer=auto_review \
    -c sandbox_workspace_write.network_access=false \
    -c model="$CODEX_MODEL" \
    --output-schema "$SCHEMA" -o "$RUN/result.json" "$(cat "$RUN/task.md")"
fi

# Record the exact command (task arg elided for readability).
{ printf '%q ' "${@:1:$(($#-1))}"; echo '"$(cat '"$RUN"'/task.md)"'; } > "$RUN/command.sh"

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found on PATH — packet prepared, run skipped" \
    | tee "$RUN/stderr.log"
  echo 127 > "$RUN/exit_code.txt"
  exit 127
fi

"$@" > "$RUN/events.jsonl" 2> "$RUN/stderr.log"
CODE=$?
echo "$CODE" > "$RUN/exit_code.txt"

# Defensive result extraction: prefer -o result.json; else last JSON line.
if [ ! -s "$RUN/result.json" ] && [ -s "$RUN/events.jsonl" ]; then
  tail -n 50 "$RUN/events.jsonl" | grep -E '^\s*\{' | tail -n 1 \
    > "$RUN/result.json" 2>/dev/null || true
fi
cp "$RUN/events.jsonl" "$RUN/stdout.md" 2>/dev/null || true

# External-subagent transcript: what actually changed on disk.
git diff --stat > "$RUN/git_diff_stat.txt" 2>/dev/null || true
git diff --name-only > "$RUN/files_changed.txt" 2>/dev/null || true
git diff > "$RUN/git_diff.patch" 2>/dev/null || true

echo "run $RUN_ID ($ROLE) exit=$CODE — packet: $RUN/" >&2
exit "$CODE"
