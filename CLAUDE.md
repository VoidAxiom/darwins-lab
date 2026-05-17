# Darwin's Lab — agent operating guide

A deterministic genetic-algorithm evolution sim. Vite + React + TypeScript;
the simulation runs in a Web Worker. No backend. Optional, opt-in LLM narrator.

## Delegation & authority (Claude is director)

`codex exec` is the **primary code-writing workhorse** — feature slices, impl,
bug fixes, fixtures. Delegate bounded, verifiable packets to it by default
(full contract: `.codex/DELEGATION.md`, helper: `scripts/codex-run.sh`,
worker rules: `AGENTS.md`).

Claude does **not** become a passive dispatcher *or* a dogmatic
over-delegator. Claude retains authorship of, and final judgment over:

- product direction, architecture, decomposition, taste;
- task packets, schemas, and acceptance tests/specs (the definition of
  "good");
- orchestration tooling and scripts (e.g. the scripts in `scripts/`);
- integration glue and **surgical fixes where delegating is slower than
  fixing directly**;
- runtime/visual inspection — Claude-owned via the inspection harness and the
  chrome-devtools MCP, **not** delegated to Codex;
- accept / revise / discard of every Codex result; Claude is final
  integrator and never trusts Codex output blindly.

If an instruction would reduce Claude to a relay or force delegation of work
that is faster/safer done directly, push back and adjust scaffolding —
honoring the one near-invariant: Codex writes the bulk of the code.

## Autonomy boundary (read first)

When asked to "work autonomously", run the **entire operating loop
end-to-end** — including the network and delivery steps — without stopping
for approval. The only things you may **never** do without an explicit,
in-context go-ahead are money-spend and destructive/irreversible actions.

**Autonomous — no need to ask:**

- Read/edit/create files in this repo.
- `npx tsc -b`, `npx vitest run`, `npx vite build`, `npm run inspect`,
  `npm run sim:headless`.
- Git: branch, add, commit, **`git push`** (normal, non-force).
- GitHub via `gh`: read queries, **`gh pr create`**, `gh pr comment`
  (including posting `@codex review`), `gh api` GraphQL **mutations** that
  resolve review threads, **`gh pr merge --squash --delete-branch`** (the
  merged feature branch).
- **Linear writes** via MCP: move issue state, add comments.

**Never without an explicit go-ahead:**

- **Metered API spend**: running the LLM narrator server or any pay-per-call
  API. This means the **app's `.env` Anthropic/OpenAI keys** specifically —
  those are metered. Subscription-covered tools are **not** gated: Codex
  (`codex-exec`, `@codex review`) is included in the user's plan, not a
  metered key, so spawning/triggering it is allowed and unattended.
- **Destructive / irreversible**: `git push --force`, history rewrite,
  deleting or overwriting files this agent did not create, deleting the
  repo or branches other than the just-merged PR branch, removing/leaking
  secrets, `rm -rf`, dropping data, force-merging past a failed gate.

If you hit one of those, stop and present the exact commands as a checklist,
then wait. Everything else in the loop runs unattended.

## Ledgers

- **Linear is the planning ledger.** Issues, milestones, state. Use the Linear
  MCP. Reading is autonomous; transitions/comments are gated.
- **GitHub is the delivery ledger.** Branches, PRs, review, merge via `gh`.

## Operating loop (per issue)

1. Read the Linear issue; move it to **In Progress**.
2. Branch off `main`, named with the Linear issue ID:
   `<initials>/<ISSUE-ID>-<short-slug>` (e.g. `sk/ENG-123-clan-colors`).
   `main` is protected — only direct bootstrap commits needed to make
   PR-based development usable are allowed on it.
3. Implement. Keep changes small enough to verify in one review.
4. **Gather evidence** (see below). Every meaningful change needs it.
5. Commit. **Do not add `Co-Authored-By` trailers.**
6. Push; open a PR whose body contains `Fixes <ISSUE-ID>` so the
   Linear↔GitHub integration links it.
7. Run the **Review gate** below until it is CLEAN.
8. `gh pr merge --squash --delete-branch`.
9. Move the Linear issue to **Done**; comment the merged PR link.

`/work-issue <ISSUE-ID>` runs 1–6. `/review-gate <pr>` runs 7–9. Run
autonomously they chain straight through with no stops.

## Evidence (no change merges without it)

UI metrics and simulation stats **must come from deterministic world state** —
never fabricate, hardcode, or mock numbers shown in the UI. The whole sim is
driven by one seeded RNG; same seed must reproduce the same history.

For a meaningful change, attach the relevant subset:

- `npx tsc -b` clean.
- `npx vitest run` green (includes the determinism/reproducibility test).
- `npx vite build` clean.
- `npm run inspect` → read `inspect/dash-*.png` / `frame-*.png` /
  `phylo-*.png` and `inspect/report.json`. This headless render **is** the
  "screenshot / manual browser inspection" evidence for visual or balance
  changes — include what you observed.
- After delivery: `gh pr checks` (CI) and the Codex review status.

If you change the order or count of `this.rng` calls in the tick loop, re-run
`vitest` and an inspection and say so — it changes history (still
deterministic, but a behavior change to call out).

## GitHub review gate (the Codex gate)

Codex review is required for PRs to `main`. `chatgpt-codex-connector` posts
review **comments**, not formal approving reviews, and cannot be added as a
normal reviewer — so **GitHub's conversation state is the gate**.

Before merging:

1. With the PR ready, trigger review: `gh pr comment <pr> --body "@codex review"`.
2. Read every Codex comment and inline review thread
   (`scripts/review-gate.sh threads <pr>`).
3. Fix actionable feedback on the PR branch locally (this part is autonomous).
4. Push the fix. **Reply IN the review thread Codex spawned** — never a
   top-level PR comment — citing the fix commit, and **tag `@codex`** so it
   re-evaluates:
   `scripts/review-gate.sh reply <threadId> "Fixed in <sha>: … @codex please re-review"`.
5. **Resolve only AFTER** Codex has re-evaluated the thread (or, for a
   trivial fix, with the in-thread reply as the record — never resolve a
   substantive thread unilaterally without the `@codex` reply posted):
   `scripts/review-gate.sh resolve <threadId>`.
6. Confirm CI green: `gh pr checks <pr>`.
7. Confirm threads resolved **and** `mergeStateStatus` is `CLEAN`
   (`scripts/review-gate.sh status <pr>`).

Do **not** merge while GitHub reports unresolved conversations, failed checks,
or a blocked merge state. Never resolve a Codex conversation with only a
top-level PR comment or no `@codex` reply. A clean Codex comment like "Didn't
find any major issues" counts as review evidence **only after** any earlier
Codex conversations on the PR have been fixed, replied to in-thread with
`@codex`, and resolved.

## Project specifics

- Dev: `npm run dev` (auto-falls back off :5173 if taken; or `-- --port N`).
- The inspection harness (`scripts/`, `npm run inspect`) is the visual
  feedback loop; `inspect/` is gitignored.
- LLM narrator keys live in gitignored `.env`. Never commit or log them; the
  narrator is opt-in and the only thing here that can cost money.
- See `~/.claude` project memory for the inspection-loop/determinism note.
