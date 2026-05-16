---
description: Take a Linear issue from In Progress to an open, review-ready PR
argument-hint: <LINEAR-ISSUE-ID> (e.g. ENG-123); omit to pick the next unblocked issue
---

Follow the operating loop in `CLAUDE.md`. Run autonomously end-to-end (the
autonomy boundary in CLAUDE.md applies — only money-spend and
destructive/irreversible actions need a go-ahead).

Issue: **$1** — if empty, use the Linear MCP to pick the next unblocked,
unassigned issue in the active project, lowest priority number first.

0. Linear MCP: ensure the project exists. List teams; if no project named
   **"Darwin's Lab"** exists, create it under the primary team (description:
   "Genetic-algorithm evolution sim — see repo CLAUDE.md"). If `$1` is empty
   and the project has no open issues, create a small backlog from the repo's
   obvious next steps before proceeding.
1. Linear MCP: read the issue (title, description, acceptance criteria,
   sub-tasks). Move it to **In Progress** and assign it to the current user.
2. `git switch main && git pull --ff-only` (bootstrap: if `origin/main`
   doesn't exist yet, that's the one allowed direct push to main). Create
   `git switch -c <initials>/<ISSUE-ID>-<slug>`.
3. Implement the smallest change that satisfies the issue. Do not fabricate
   simulation/UI numbers — they must come from deterministic world state.
4. Evidence, as applicable to the change:
   - `npx tsc -b`
   - `npx vitest run`
   - `npx vite build`
   - `npm run inspect` then read `inspect/dash-*.png`, `frame-*.png`,
     `phylo-*.png`, `inspect/report.json`; note what you observed.
   Iterate until the relevant evidence is clean.
5. Commit with a clear message. **No `Co-Authored-By` trailers.**
6. `git push -u origin HEAD`, then `gh pr create` with a body that:
   - contains `Fixes <ISSUE-ID>` (Linear↔GitHub auto-link),
   - summarizes the change and pastes the evidence (commands + what the
     inspection frames showed).
7. Post `gh pr comment <pr> --body "@codex review"` and report the PR URL.
   Then proceed to `/review-gate <pr>` (or chain into it automatically when
   running autonomously).

Keep a short running summary of: issue, branch, PR, evidence, gate status.
