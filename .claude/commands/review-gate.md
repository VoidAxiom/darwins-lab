---
description: Drive a PR through the Codex review gate to a clean merge + Linear Done
argument-hint: <PR-NUMBER> (defaults to the PR for the current branch)
---

Follow the "GitHub review gate" in `CLAUDE.md`. Run autonomously; the only
hard stops are money-spend and destructive/irreversible actions.

PR: **$1** — if empty, resolve it from the current branch
(`gh pr view --json number -q .number`).

Loop until the gate is CLEAN:

1. `scripts/review-gate.sh status $1` — print CI checks + `mergeStateStatus`
   + unresolved review-thread count.
2. `scripts/review-gate.sh threads $1` — list Codex (`chatgpt-codex-connector`)
   comments and inline threads with their IDs and bodies.
3. For each actionable thread:
   - Fix it on the PR branch locally.
   - Re-run the relevant evidence from `CLAUDE.md` (tsc / vitest / build /
     `npm run inspect`).
   - Commit + `git push`.
   - **Reply IN the thread for the audit record (never a top-level PR
     comment)**, then **resolve it** — the fix commit + in-thread reply are
     the record:
     `scripts/review-gate.sh reply <id> "Fixed in <sha>: <what>"` then
     `scripts/review-gate.sh resolve <id>`.
4. Re-trigger: `gh pr comment $1 --body "@codex review"`. Codex's re-review
   arrives as **NEW threads** (it does not reply in the old one) — loop back
   to step 1 and handle those the same way until **zero unresolved Codex
   threads**. As final judge, a non-actionable nitpick may be resolved with
   a reasoned in-thread reply rather than looped forever.
5. When **zero Codex threads are unresolved**, `gh pr checks $1` is green,
   and `mergeStateStatus` is `CLEAN`:
   - `gh pr merge $1 --squash --delete-branch`.
   - Linear MCP: move the linked issue to **Done** and add a comment with
     the merged PR URL.

Never merge with unresolved conversations, failing checks, or a non-`CLEAN`
merge state. "Didn't find any major issues" from Codex is acceptable evidence
only after every earlier Codex conversation on the PR is fixed and resolved.

If Codex hasn't responded yet, wait and re-poll (short backoff); do not merge
on a stale state.
