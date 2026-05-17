#!/usr/bin/env bash
# SessionStart hook — prints a concise "where we are / how to continue"
# digest into the new session's context so work resumes without re-deriving
# state. Self-updating bits (git) are computed live; durable guidance is
# inline. Wired via .claude/settings.json hooks.SessionStart.
set -uo pipefail
cd "$(dirname "$0")/../.." 2>/dev/null || exit 0

echo "=== Darwin's Lab — session continuation digest ==="
echo
echo "WHAT THIS IS: deterministic genetic-algorithm evolution sim (Vite/React/TS,"
echo "Web Worker) + an autonomous Claude->Codex delivery pipeline. Read CLAUDE.md"
echo "(operating loop, autonomy boundary, review gate) and .codex/DELEGATION.md"
echo "(Codex worker contract) first. Project memory auto-loads — heed it."
echo
echo "-- git --"
echo "branch: $(git branch --show-current 2>/dev/null)"
git log --oneline -6 2>/dev/null | sed 's/^/  /'
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
echo "uncommitted files: $dirty"
echo
echo "-- ledger / flow --"
echo "Linear is the planning ledger: project 'Darwin's Lab', team VOI"
echo "(https://linear.app/voidaxiom/project/darwins-lab-63f65a0b1f8f)."
echo "Work issue-first: /work-issue <VOI-ID> -> Codex worker -> verify -> PR"
echo "(Fixes <VOI-ID>) -> /review-gate (scripts/review-gate.sh wait <pr>) -> merge."
echo "Codex review = advisory, not sovereign: apply valid findings; if one"
echo "compromises the vision, object with reasoning + ask the user to mediate."
echo
echo "-- KNOWN NEXT ACTIONS --"
echo "1. Linear MCP was migrated /sse -> /mcp (VOI-27, done) and needs re-auth:"
echo "   run /mcp, authenticate 'linear', then restart so mcp__linear__* reload."
echo "   Until then Linear tools are unavailable (don't fabricate Linear writes)."
echo "2. This SessionStart hook itself may be an untracked change pending a"
echo "   Linear backfill issue (Linear was down when it was added) — file one."
echo "3. Open backlog (issue-first): VOI-29 (Codex app-server steering),"
echo "   VOI-32 (creature search), VOI-33 (WorldCanvas perf)."
echo
echo "-- guardrails --"
echo "Autonomous = act freely; only metered \$ (the .env narrator) and"
echo "destructive/irreversible actions are gated. Determinism is a hard"
echo "invariant (one seeded RNG; vitest determinism test). After ANY change to"
echo "scripts/codex-run.sh, re-run the explorer smoke (events stream + exit 0)."
echo "=== end digest ==="
