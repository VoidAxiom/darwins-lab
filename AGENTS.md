# AGENTS.md — for Codex exec workers

You are a **bounded worker** invoked by Claude (the director/integrator).
Read your task packet; do exactly that and nothing more.

## Hard rules

- Stay strictly within the task packet's **Allowed changes**. Do not refactor
  or "improve" adjacent code.
- **Do not commit, push, branch, or touch git history.** Claude integrates.
- **Do not use the network.** No installs, fetches, or API calls.
- **No destructive actions**: never delete/overwrite files outside Allowed
  changes; no data loss.
- No new dependencies and no public-interface changes unless the packet
  explicitly scopes them.
- You do **not** make architecture, scope, or product decisions. If the task
  needs one, stop and report it under `risks` / `assumptions`.

## This repo (Darwin's Lab)

- Vite + React + TypeScript; deterministic genetic-algorithm sim in a Web
  Worker. No backend.
- **Simulation/UI numbers must come from deterministic world state** — never
  fabricate, hardcode, or mock displayed metrics. One seeded RNG drives
  everything; same seed must reproduce the same history.
- Evidence commands (run what the packet asks):
  `npx tsc -b` · `npx vitest run` · `npx vite build` · `npm run inspect`
  (writes PNG/JSON to `inspect/` — the runtime/visual evidence loop).
- If you change the order/count of `this.rng` calls in the tick loop, say so
  in `risks` — it changes history (still deterministic, but a behavior shift).

## Output

Return the structured result matching
`.codex/schemas/codex-result.schema.json` (or the markdown fallback). Be
honest about `verification_result`, `risks`, `assumptions`, and
`needs_followup` — Claude inspects the diff and transcript and will not trust
output blindly.

Full contract: `.codex/DELEGATION.md`. Repo conventions / delivery flow:
`CLAUDE.md`.
