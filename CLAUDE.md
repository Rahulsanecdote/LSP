# Last Stand Protocol — project memory for Claude Code

A browser-based, multiplayer cooperative narrative game. Three players on phones share a room; each sees only their role's instrument. Signature verbs: the Navigator's hold-to-read probability instrument and the **consent beat** (all players tapping on a shared 520 ms rhythm within tolerance).

## Read first, every session
1. `docs/handoff/SLICE_HANDOFF.md` — the engineering contract: scope, constraints, file map, tasks, done-criteria. **It is the authority.** If anything here or in a prompt conflicts with it, stop and ask.
2. The design doc named in the task you're on (`docs/design/`). Design docs are spec for behaviour and content, not suggestions.

## Current task
Task 1 — the beat engine — is built and its report is written (`docs/handoff/SLICE_HANDOFF.md`, "Task 1 report"). **Awaiting acceptance** and a design decision on the 150 ms window: with three real devices the §5 criterion reads 15/19 beats (79%), caused by human tap error of ~50–58 ms sd, not sync. Do not start Tasks 2–5 until the report is accepted. (Task 4 may run in parallel in a separate session if asked.)

## Non-negotiables (summary — the handoff has the full list)
- TypeScript `strict`, no `any`. pnpm workspaces. Node 20+.
- **The server owns the clock and all game state.** Clients render and send intents. Timing is schedule-based from a shared epoch, never per-beat pushes.
- `packages/engine`-style purity for `packages/protocol`, `packages/sim`, `packages/discriminator`, `packages/counterfeit`: no I/O, no network, no `Date.now()`, seeded PRNG only.
- No code copied from third-party repos into `packages/motion` or shaders; implement from the math.
- `packages/discriminator` depends on `fft.js` and nothing else.
- Nothing in `packages/counterfeit` may reproduce the four-mark lacing.
- Do not widen tolerance or interval literals to make tests pass. Report instead.
- No audio-only cues; every beat cue is visual + haptic. No flashing above 3 Hz.

## Commands
```bash
pnpm install
pnpm -r typecheck          # tsc --noEmit everywhere
pnpm -r test               # vitest
pnpm --filter @lsp/sim run spread -- --clients 3 --beats 60
pnpm --filter @lsp/party dev   # room server (wrangler dev, Workers + Durable Objects) on :1999
pnpm --filter @lsp/party deploy:party   # wrangler deploy to your Cloudflare account
pnpm --filter @lsp/web dev     # Next.js shell on :3000 (NEXT_PUBLIC_PARTY_HOST for a deployed room server)
pnpm --filter @lsp/web e2e     # Playwright smoke test of the diag page; starts both dev servers
```

## Working style
- Use plan mode for anything touching more than one package. Show the plan; wait for approval.
- Small commits, conventional messages (`feat(protocol): …`, `test(sim): …`).
- When a done-criterion can't be met, write that in the task report with numbers. Don't quietly relax it.
- Append `## Task N report` to `docs/handoff/SLICE_HANDOFF.md` when a task completes.

## What NOT to do
See `docs/handoff/SLICE_HANDOFF.md` §8. In short: no scenes beyond Ep 1 S2/S5/S7, no save system, no client-side authority, no visual rendering of the counterfeit, no third-party code in motion/shaders.
