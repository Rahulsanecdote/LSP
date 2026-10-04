# SLICE HANDOFF — Last Stand Protocol: Vertical Slice
Version 0.2.0 · 2026-10-03 · Handoff from Rimuru (design/architecture) to Claude Code

Self-contained. Execute without conversation history. Companion design docs: `docs/design/ep1-descent.md` (read §1 and §4 before Task 2) and `docs/design/ep5-dead-vowel.md` (read §1–§2 and §5 before Tasks 4–5). Neither is needed for Task 1.

---

## 1. North Star and goal

**North Star:** a playable, multiplayer slice that two outside testers finish and talk about afterwards — not an engine.

**What this is:** a browser-based, 3-player cooperative narrative game. Each player holds a phone, joins a room by code, and sees only their role's instrument. The three roles are NAVIGATOR, SYNAESTHETE, THEORIST. The game's signature verbs are (a) the Navigator's hold-to-read probability instrument and (b) the **consent beat**: all players tapping on a shared 520 ms rhythm within a tolerance window.

**Goal of this slice (≈4 weeks):** prove that three phones on three different networks can share a 520 ms beat accurately enough for the consent mechanic to feel like a dance. Everything else in the game depends on that. If it can't be done, the design falls back to a turn-based consent window and the rhythm layer is cut.

**Slice scope:** three scenes from Episode 1 — S2 (the seal), S5 (the 0.3 second), S7 (the consent beat) — plus two Episode 5 systems built headless with bench pages: the Discriminator (Task 4) and the counterfeit siege scheduler (Task 5). About 20 minutes of play. No save system, no campaign, no other scenes.

---

## 2. Hard constraints

- **Language:** TypeScript, `strict: true`, no `any`. Node 20+. pnpm workspaces.
- **Client:** Next.js (App Router) for the shell and routing only. Game scenes render with Three.js via React Three Fiber. Mobile Safari and Chrome Android are the primary targets; desktop is secondary.
- **Realtime:** PartyKit (default) or Cloudflare Durable Objects. One room (party) per crew. **The server owns the clock.** Clients never trust their own `Date.now()` for anything scored.
- **No game-state authority on clients.** Debt, beat scores, scene progression, and the Ledger live on the server. Clients render and send intents.
- **UI instruments:** Rive (`@rive-app/react-canvas`) for 2D gauges, chips, tap feedback. Keep Rive files under `apps/web/public/rive/`.
- **Shaders:** GLSL, inlined via R3F `shaderMaterial`. Three ports are expected in later tasks (volume noise, Gray-Scott, differential growth); none in Task 1.
- **Animation easing:** a small spring library at `packages/motion/` (critically damped spring, `springTo(current, target, velocity, halflife, dt)`). Implement from the standard damped-spring equations. **Do not copy code from third-party repos** — the reference material's license is unverified.
- **Quality gates:** `tsc --noEmit`, Vitest, Playwright for one end-to-end flow, Husky pre-commit, conventional commits, GitHub Actions on push.
- **Licensing:** repo AGPL-3.0. Add `LICENSE` at root in Task 1.
- **Budget:** free tiers. PartyKit free tier / Cloudflare Workers free tier; Vercel Hobby for the shell.
- **Accessibility floor:** tap targets ≥ 44 px; every beat cue has a visual and a haptic (`navigator.vibrate`) channel, never audio-only; colour never carries meaning alone.
- **Content constraint:** no jump scares, no gore, no flashing above 3 Hz. Dread comes from precision and silence.

---

## 3. Current state (verified)

- **Nothing exists.** Greenfield. No repo, no scaffold, no assets.
- Design is fixed in `docs/design/ep1-descent.md` and `docs/design/ep5-dead-vowel.md`. Treat them as spec for scene content and system behaviour; treat this file as spec for engineering.
- Do not assume any prior implementation. Do not search for one.

---

## 4. File / module map

```
lsp/
├── CLAUDE.md                         ← Claude Code project memory (short)
├── docs/handoff/SLICE_HANDOFF.md     ← this file
├── LICENSE                           ← AGPL-3.0
├── docs/design/ep1-descent.md      ← scene spec (copy in during Task 1)
├── docs/design/ep5-dead-vowel.md    ← Discriminator + counterfeit spec (copy in during Task 1)
├── package.json · pnpm-workspace.yaml · tsconfig.base.json
├── .github/workflows/ci.yml
├── packages/
│   ├── protocol/                     ← OWNER: Task 1. Shared types + message schemas (zod). Pure TS.
│   │   └── src/{messages.ts,clock.ts,scoring.ts,index.ts}
│   ├── motion/                       ← Task 2. Spring easing. Pure TS.
│   ├── sim/                          ← Task 1 (test harness). Simulated clients with jitter.
│   ├── discriminator/                ← OWNER: Task 4. Living/dead chirplet classifier over fft.js. Pure TS.
│   │   └── src/{synth.ts,features.ts,profile.ts,classify.ts,index.ts}
│   └── counterfeit/                  ← OWNER: Task 5. Antagonist state machine + siege scheduler. Pure TS, no I/O.
│       └── src/{state.ts,siege.ts,responses.ts,rCurve.ts,index.ts}
├── apps/
│   ├── party/                        ← OWNER: Task 1. PartyKit server: room, clock, beat scheduler, scoring, state.
│   │   └── src/{server.ts,clock.ts,beat.ts,state.ts,siege.ts}   ← siege.ts: Task 5 wiring
│   └── web/                          ← Task 1 (diagnostic page only) · Task 2+ (scenes)
│       ├── app/
│       │   ├── page.tsx              ← create/join room
│       │   ├── r/[code]/page.tsx     ← role select → scene router
│       │   ├── diag/[code]/page.tsx  ← Task 1 beat diagnostic (visible numbers, no art)
│       │   ├── lab/discriminator/page.tsx ← Task 4 bench: overlay two chirplets, spectra, verdict
│       │   └── lab/siege/page.tsx    ← Task 5 bench: run a siege, pick responses, watch R fall
│       ├── components/instruments/   ← Task 2: NavigatorRead, SynaestheteOverlay, TheoristLedger
│       ├── scenes/                   ← Task 3: S2Seal, S5PointThree, S7Consent
│       └── public/rive/
└── scripts/
```

Ownership: Task 1 owns `packages/protocol`, `packages/sim`, `apps/party`, and `apps/web/app/diag`. Nothing under `scenes/` or `instruments/` is to be created in Task 1.

---

## 5. Task 1 — the beat engine

### Objective

A room server that broadcasts a monotonic 520 ms beat, a client clock-sync routine, and a scorer that measures each client's tap against the nearest beat in server time. Prove sub-150 ms cross-device agreement on real phones.

### Protocol (`packages/protocol`)

All messages are zod-validated JSON over the PartyKit WebSocket.

```ts
// clock sync — client-initiated, 4+ round trips, client keeps median offset
type Ping  = { t: "ping";  cid: string; c0: number };            // client send time
type Pong  = { t: "pong";  cid: string; c0: number; s1: number }; // server receive/send time (same tick)

// beat schedule — server tells clients WHEN beats will occur, not just that one happened
type Schedule = {
  t: "schedule";
  epoch: number;        // server ms of beat 0
  interval: 520;        // literal
  until: number;        // server ms when schedule ends
  windowMs: 150;        // ± tolerance, literal for the slice
};

// taps
type Tap       = { t: "tap"; cid: string; role: Role; cLocal: number; cServerEst: number }; // client's local + estimated-server time
type TapScore  = { t: "tapScore"; cid: string; beatIndex: number; deltaMs: number; hit: boolean };

// consent act
type ActStart  = { t: "actStart"; actId: string; beatsRequired: 3; roles: Role[] };
type ActResult = { t: "actResult"; actId: string; ok: boolean; perRole: Record<Role, { hits: number; deltas: number[] }> };

type Role = "navigator" | "synaesthete" | "theorist";
```

### Server (`apps/party`)

1. **Clock.** One monotonic clock per room (`performance.now()` + room start). All scoring in this clock.
2. **Sync.** Answer `ping` with `pong` immediately. Clients compute `offset = s1 − (c0 + rtt/2)` per round trip, take the median of ≥ 4, repeat every 10 s, and reject samples with rtt > 2× running median.
3. **Schedule, don't tick.** Broadcast a `Schedule` covering the next 30 s; clients render beats locally from `epoch + n*interval − offset`. Re-broadcast every 20 s. (Per-beat broadcast over WebSocket is jitter-bound; schedules aren't.)
4. **Scoring.** On `tap`, compute `serverTime = cServerEst` (trusting the client's estimate is acceptable only because it was derived from server pongs; also record server receive time for audit). `beatIndex = round((serverTime − epoch)/interval)`, `deltaMs = serverTime − (epoch + beatIndex*interval)`, `hit = |deltaMs| ≤ windowMs`. Reply `TapScore` to the tapper and broadcast an anonymised version to the room.
5. **Consent act.** `actStart` opens a 3-beat window. The act is `ok` only if every listed role has ≥ 3 hits on 3 consecutive beats with no miss in between. One miss by anyone resets that run. Emit `actResult`.
6. **State.** Room state is a single object (`players`, `schedule`, `activeAct`, `tapLog`) persisted in PartyKit storage; survives reconnects.

### Client diagnostic page (`apps/web/app/diag/[code]`)

No art. Shows: measured offset, rtt, next-beat countdown, a 44 px tap button, the last 10 `deltaMs` values, hit rate, and a live table of every connected client's hit rate and median |delta|. Pulses the screen background and fires `navigator.vibrate(20)` on each local beat. Purpose: a human can stand three phones next to each other and see whether they agree.

### Simulation harness (`packages/sim`)

Headless simulated clients that connect to a local party server with configurable one-way latency (normal distribution, mean + sd) and tap with configurable human error (normal, sd 40 ms around the perceived beat). Runs N clients for M beats and prints spread statistics. Used by tests and by you.

### Done-criteria

- [ ] `pnpm -r typecheck` and `pnpm -r test` pass; CI green.
- [ ] Unit: scorer maps taps to the nearest beat correctly at boundaries (±259 ms, ±260 ms, ±261 ms).
- [ ] Unit: clock sync converges to within ±10 ms of a simulated offset under 80 ms ± 30 ms latency within 4 round trips.
- [ ] Sim: 3 clients, latencies {40±15, 120±40, 250±80} ms one-way, human sd 40 ms, 60 beats → cross-client spread (max − min of per-beat deltas) < 150 ms on ≥ 90% of beats. Print the distribution.
- [ ] Sim: a 1,500 ms network stall on one client recovers to in-window taps within 3 beats of reconnection (schedule-based rendering should make this nearly free).
- [ ] Consent act logic: unit tests for clean success, single miss resetting the run, and a late joiner not counting.
- [ ] Diagnostic page works on iOS Safari and Android Chrome: two real phones + one laptop on different networks (one on cellular) complete 10 beats with server-measured spread < 150 ms on ≥ 9 of them. Record the numbers in the Task 1 report with device and network details.
- [ ] `README.md` at root explaining room lifecycle, clock sync, and why beats are scheduled rather than pushed.

### Validation command

```bash
pnpm install && pnpm -r typecheck && pnpm -r test && pnpm --filter @lsp/sim run spread -- --clients 3 --beats 60
```

### Kill criterion (report, don't decide)

If, after honest effort, real phones cannot reach < 150 ms spread on 9/10 beats, write that plainly in the report with the numbers. The design fallback (turn-based consent) is a product decision, not yours.

---

## 6. Task 2 — the Navigator instrument (after Task 1 report is accepted)

Build `components/instruments/NavigatorRead` and `SynaestheteOverlay` against the spec in `docs/design/ep1-descent.md` §1.

- Hold-to-read: pointer down starts a read; server receives `readStart`/`readEnd`; server assigns DEBT (+1 per read, +2 if held past the 90 s horizon marker) and emits `readEvent` to the room.
- Streams: 3–7 branches from a server-supplied `BranchSet { streams: { p: number; label: string; terminalMs: number }[] ; horizonMs: 90000 }`. Content is scripted per scene in the slice; the Monte Carlo engine is **not** in scope.
- Horizon: streams clip to black at `horizonMs`; holding past it darkens the field, drops audio pitch by one octave via Web Audio, and flags the read.
- Synaesthete overlay: a blob per crew member; the Navigator's blob flares white on `readEvent` with spring-damped decay (use `packages/motion`). The overlay never receives stream content.
- Shaders: port a tileable 3D noise and a Gray-Scott reaction-diffusion as GLSL from first principles (textbook formulas), not by copying repository code.

Done when: the Navigator holds on one phone, the Synaesthete's phone flares within 200 ms, and the debt counter on the Theorist's phone increments — all server-mediated.

## 7. Task 3 — scenes S2, S5, S7

Assemble the three scenes from the design doc using Task 1 and Task 2 components. Scripted content (dialogue wheels, telemetry values, the 0.3 s reply timing) is in the design doc. Playwright test: three browser contexts complete S7 with a scripted clean beat.

---

## 7a. Task 4 — the Discriminator (independent of Tasks 2–3; may run in parallel with Task 1)

### Objective

A pure-TypeScript package that tells a living chirplet from a dead (synthesised) one, exactly as `docs/design/ep5-dead-vowel.md` §1 specifies, plus a bench page to look at it.

### Dependency

`fft.js@4.0.4` (indutny; MIT; zero deps; bundled `.d.ts`). This is the **only** runtime dependency of the package. Use `realTransform` for the envelope spectrum and a second small transform over the interval series.

### Package API (`packages/discriminator`)

```ts
export type FeatureId =
  | "intervalJitter" | "lineWidth" | "attackSlope" | "decaySymmetry" | "primeExtension" | "stopResponse"   // the six real ones
  | "amplitude" | "bearing" | "timeOfDay" | "carrierHz";                                                     // the four decoys

export interface Chirplet {
  sampleRate: number;           // Hz; 2048-sample envelopes at 1 kHz for the slice
  envelope: Float32Array;       // length 2048
  pulseTimesMs: number[];       // onset of each pulse inside the chirplet, ≥ 8 pulses
  meta: { amplitude: number; bearingDeg: number; hourOfDay: number; carrierHz: number;
          primeExtended: boolean; pausedOnStop: boolean };
}

export interface SynthOpts { jitterModel: 0|1|2|3; pulses: number; gain: number }
export interface Profile { features: FeatureId[]; quality: 0|1|2|3|4|5|6 }  // quality = count of real features chosen

export function synthLiving(seed: number, opts?: Partial<SynthOpts>): Chirplet;   // interval sd 4–7 ms, asymmetric attack/decay, broad peak
export function synthDead(seed: number, opts?: Partial<SynthOpts>): Chirplet;     // interval sd < 1 ms, symmetric envelope, razor peak
export function extractFeatures(c: Chirplet): Record<FeatureId, number>;          // normalised 0–1 "deadness" per feature
export function buildProfile(chosen: FeatureId[]): Profile;                       // scores quality; never reveals which were wrong
export function classify(c: Chirplet, p: Profile): { living: number; reasons: FeatureId[] };  // living ∈ [0,1]
export function intervalSpectrum(c: Chirplet): Float32Array;                       // for the "single vertical line" render
```

### Rules

- Deterministic: same seed → identical chirplet; same chirplet + profile → identical verdict. No `Math.random`; use a seeded PRNG.
- `classify` with a quality-6 profile must separate the synthetic sets cleanly; with quality ≤ 2 it must sit near chance. Degrade gracefully, no cliff.
- Decoy features are computed honestly (they are real numbers) but carry **zero** discriminative weight; a profile of decoys yields `living ≈ 0.5` for everything.
- `jitterModel` (from Task 5): `synthDead(seed, { jitterModel: 2 })` must produce interval jitter indistinguishable from living, so `intervalJitter` stops helping while the other five still work.
- Runs in a Web Worker on the client and in Node under Vitest without modification.

### Bench page (`apps/web/app/lab/discriminator`)

Dropdown of seeded living/dead chirplets, overlaid waveforms, envelope spectrum, interval spectrum, a ten-checkbox feature picker, the verdict. Numbers and lines; no art. For design review, not players.

### Done-criteria

- [ ] `pnpm --filter @lsp/discriminator typecheck` and `test` pass; CI green.
- [ ] Unit: 1,000 living + 1,000 dead (seeds 0–999, `jitterModel 0`) with a quality-6 profile → ≥ 99% accuracy at threshold `living < 0.5`.
- [ ] Unit: same sets with the four-decoy profile → accuracy within 45–55%.
- [ ] Unit: `jitterModel 2` dead set → `intervalJitter` AUC < 0.6 while the five-feature profile still reaches ≥ 97%.
- [ ] Unit: `intervalSpectrum` of a dead chirplet has ≥ 95% of its energy in the DC bin; of a living one, < 60%.
- [ ] Perf: `classify` on a 2,048-sample chirplet < 2 ms in Node on CI hardware (log the measurement).
- [ ] Bench page renders the single-vertical-line signature for dead chirplets on a phone.
- [ ] Package `README.md`: the six features and why the four decoys are decoys, ≤ 300 words.

### Validation command

```bash
pnpm --filter @lsp/discriminator typecheck && pnpm --filter @lsp/discriminator test
```

---

## 7b. Task 5 — the counterfeit scheduler (after Task 1; depends on Task 4 for `jitterModel`)

### Objective

The antagonist as a pure state machine plus a server-side siege scheduler, per `docs/design/ep5-dead-vowel.md` §2. Headless; one bench page.

### Package (`packages/counterfeit`) — pure, no I/O

```ts
export interface CounterfeitState {
  learned: { carrier: true; scaffold: true; identifier: boolean; jitterModel: 0|1|2|3; stopSemantics: boolean };
  reach: "fringe" | "regional" | "core";
  gain: number;            // 40 at Ep 5
  patienceMin: number;     // 22 at Ep 5
  log: Array<{ ep: number; result: "null" | "engaged" | "shielded" }>;
}

export type CrewResponse = "answer" | "shield" | "hold" | "choreograph";

export interface SiegeInput {
  state: CounterfeitState;
  startR: number;                 // 0.86 at Ep 5
  startE: number;                 // 0.82 after the mesh; 0.88 if declined
  meshQuality: 0|1|2|3;
  trust: number;                  // partners' TRUST; valley ACK available iff ≥ 0
  identifierCompromised: boolean; // Ep 1 S4 held > 6 s
  responses: Array<{ atMin: number; response: CrewResponse; beatClean?: boolean }>; // beatClean required for choreograph
}

export interface SiegeTick { tMin: number; R: number; scatterMs: number; E: number; visibilityDelta: number; debtDelta: number }
export interface SiegeResult { ticks: SiegeTick[]; finalState: CounterfeitState; lacingScore: 0|1|2|3|4; trustDelta: number; visibilityTotal: number }

export function runSiege(input: SiegeInput): SiegeResult;      // deterministic; 1 tick per 30 s over patienceMin
export function initialEp5State(ep1: { identifierGivenAway: boolean }): CounterfeitState;
```

### Rules (encode exactly; these are design law)

1. **It learns only from what is sent toward it.** `hold` → no state change. `shield` → `stopSemantics = true`, log `shielded`. `answer` → `jitterModel = min(3, jitterModel + 1)`, log `engaged`. `choreograph` → no learning (it cannot see the lacing as addressed to it).
2. **It cannot steal a dance.** `lacingScore` counts: human ACK (if `beatClean`), valley ACK (if `trust ≥ 0`), micro-act (if `meshQuality ≥ 2`), identifier (if `!identifierCompromised`). Max 4. `CounterfeitState` never gains a field that reproduces this.
3. **Fixed schedule.** Starts at t=0, transmits every tick regardless of responses, stops at `patienceMin` exactly. Nothing the crew does shortens or lengthens it.
4. **R curve** (`rCurve.ts`): hold-only → R falls linearly 0.86 → 0.79 over 22 min, scatter widens ±6 → ±13 ms. `shield` halves per-tick loss while active. `answer` zeroes loss for that tick (VISIBILITY +4, E −0.10). `choreograph` with `lacingScore ≥ 3` adds +0.03 R once and +1 Discriminator margin; with `< 3` it behaves as `shield`. After stop, R recovers at 0.005/min toward pre-siege (never fully within the episode).
5. **Costs** per response exactly as the Ep 5 doc §2 table; `choreograph` also DEBT +1 all round.
6. **Null-result log.** If no `answer` occurred, the counterfeit logs `null`. It did not notice it was refused.
7. **Ep 6 carry-forward:** next `patienceMin` = 22 + 6 × (count of `answer`), capped at 40. It gets more patient when fed.

### Server wiring (`apps/party/src/siege.ts`)

- Room command `siege:start` runs the scheduler in real time (1 tick / 30 s), broadcasting `SiegeTick` to all roles; accepts `siege:respond { response }`, with `choreograph` additionally requiring a successful Task 1 `actResult` within the same tick.
- The **abort macro** is a real command `siege:abort` whose handler does nothing but emit analytics event `abort_pressed_noop`. It must look enabled on the client.
- Observer pressure: every 4 min the server emits `upstairs:prompt` to the Observer role only, with a one-tap `answer` affordance.
- Ep 1 cadence replay for the S4 reveal: the server stores the crew's consent-beat tap timestamps from Task 1 and can emit them as `scaffoldReplay` at 40× amplitude. If no campaign save exists, load `fixtures/ep1-taps.json` and say so in the report.

### Bench page (`apps/web/app/lab/siege`)

22-minute siege at 10× speed. Four response buttons. Live R and scatter lines, E, VISIBILITY delta, the counterfeit's learned fields and log. A greyed-looking abort macro that counts presses. Numbers, not art.

### Done-criteria

- [ ] `pnpm --filter @lsp/counterfeit typecheck` and `test` pass; CI green.
- [ ] Unit: four pure-response runs produce the design-table end states — all-hold → R 0.79, no learning, log null; all-shield → R ≈ 0.825, `stopSemantics` true; three answers → R held at 0.86, `jitterModel` 3, VISIBILITY +12; one clean choreograph (lacing 4) at min 4 → +0.03 R path, TRUST +2, log null.
- [ ] Unit: `lacingScore` degrades correctly for each missing mark (trust < 0, meshQuality < 2, identifier compromised, beat not clean).
- [ ] Unit: schedule invariance — siege length identical across all response patterns.
- [ ] Unit: `patienceMin` carry-forward (22 → 28 → 34 → 40 cap).
- [ ] Integration with Task 4: `synthDead(seed, { jitterModel: finalState.learned.jitterModel })` after an all-answer run defeats `intervalJitter`; after an all-hold run it does not.
- [ ] Server: a real room runs a 10×-speed siege with three phones; only the Observer receives `upstairs:prompt`; `siege:abort` emits the event and changes nothing.
- [ ] Package `README.md`: the seven rules in plain language, ≤ 400 words.

### Validation command

```bash
pnpm --filter @lsp/counterfeit typecheck && pnpm --filter @lsp/counterfeit test && pnpm --filter @lsp/discriminator test
```

---

## 8. What NOT to touch

- Do not implement the Monte Carlo branch engine, save system, Ledger editing, or any scenes beyond Ep 1 S2/S5/S7. VISIBILITY exists only as the per-response deltas Task 5 emits; no persistent meter.
- Do not give `packages/counterfeit` any field, method, or code path that reproduces the four-mark lacing. If a test seems to need it, the test is wrong.
- Do not add dependencies to `packages/discriminator` beyond `fft.js`. No DSP frameworks, no Web Audio inside the package.
- Do not render the counterfeit visually anywhere. It is a cadence on a plot and a log line.
- Do not build the Episode 5 scenes (S1–S9). Tasks 4–5 are headless systems plus bench pages.
- Do not put game-state authority on the client. No client-side debt counters that aren't echoes of server state.
- Do not use per-beat WebSocket pushes as the timing source. Schedule and render locally.
- Do not copy code from third-party repositories into `packages/motion` or shader files; implement from the underlying math.
- Do not add audio that carries information without a visual + haptic equivalent.
- Do not widen the `windowMs` or `interval` literals to make tests pass. Report instead.

---

## 9. Report back

Append a `## Task N report` section to this file as each task completes. Task 1: real-device spread table (device, OS, network, 10-beat deltas), sim distribution, protocol deviations and why. Task 4: accuracy table per profile quality 0–6, perf numbers, the decoy-profile result. Task 5: the four end-state tables, lacing degradation matrix, and whether the Ep 1 tap replay used a real save or the fixture.

## 10. Version

- **v0.1.0 — 2026-10-03.** Initial slice handoff. Scope: beat engine (Task 1), with Tasks 2–3 outlined.
- **v0.2.0 — 2026-10-03.** Added Task 4 (Discriminator over fft.js) and Task 5 (counterfeit state machine + siege scheduler) as headless systems with bench pages; file map, scope, not-touch list and report format updated.
