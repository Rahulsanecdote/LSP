# SLICE HANDOFF — Last Stand Protocol: Vertical Slice
Version 0.2.1 · 2026-10-04 · Handoff from Rimuru (design/architecture) to Claude Code

## Amendments (v0.2.1)

Agreed between Rimuru and Claude Code during Task 1 planning, 2026-10-04. Amendments change the text of §5; clarifications fix a reading of it. Anything that comes up during the build is a deviation and belongs in the Task 1 report, not here.

### Amendments

1. **Sim is pure.** `packages/sim` is a virtual-time, deterministic simulator: no network, no `Date.now()`, seeded PRNG only. §5's "connect to a local party server" was a spec error; CLAUDE.md's purity rule wins. There is no live mode in Task 1. The real network is covered by the real-device test. A live driver, if ever wanted, lives in `apps/party/scripts/`, never in `packages/sim`.
2. **Clock-sync criterion is statistical.** The criterion as written ("within ±10 ms … within 4 round trips") was probabilistic under the stated noise: with per-direction sd 30 ms the median of 4 offset samples has an error sd near 13 ms, so a single-seed test fails by chance about half the time. The criterion now reads: over 1,000 seeded runs under 80 ± 30 ms one-way latency, (a) median absolute offset error ≤ 10 ms after 4 round trips, (b) median absolute error ≤ 5 ms after 12 round trips, (c) 95th-percentile absolute error ≤ 20 ms after 12 round trips. The test prints the error distribution. No literal changed.
3. **Three messages added to the protocol.** `hello` (client → server: `cid`, `role`), `snapshot` (server → client on connect/reconnect: current schedule, players, active act), and `stats` (server → room: per-client hit rate, median |delta|, sample count, keyed by an anonymous label). All zod-validated in `packages/protocol`.

4. **Audit column for the real-device criterion.** Because a client renders the beat and stamps its tap from the same offset estimate, its sync error cancels out of `deltaMs` exactly, so the §5 server-measured spread cannot detect a sync failure. The server now also records, per tap, `auditServerTime = receivedAt − medianRtt/2` and `auditDeltaMs` against the same beat, where the round trips are measured by the server itself: a `ping` sent in immediate reply to a `pong` carries that pong's `s1` as `prev`, and `rtt = now − prev`. Scoring stays on `cServerEst`. The audit is surfaced in `tapScore.auditDeltaMs`, in `stats.clients[].rttMs / medianAbsAuditDelta / syncBiasMs`, and in `stats.recentBeats[]` as `auditSpread`. Because a single tap's audit carries that tap's own one-way transit jitter, the server also estimates each client's sync error as `syncBiasMs = median(receivedAt − cServerEst) − medianRtt/2` over recent taps, and reports `correctedSpread` = spread of `deltaMs + syncBiasMs`. In sim the corrected column tracks ground truth with p50 4.5 ms, p90 12.5 ms error; the raw audit column's per-tap error is the link's one-way jitter (p90 ≈ 105 ms on the 250 ± 80 ms link). **The real-device criterion in §5 is read from the audit columns: `auditSpread` is the pessimistic bound, `correctedSpread` the best estimate; both are recorded.** Caveat: `syncBiasMs` is averaged over a player's taps, so it cannot distinguish a client's clock-sync bias from that player's systematic human bias (someone who always taps 60 ms early looks like a clock that is 60 ms off, and the correction absorbs it). The corrected column is therefore a sync-validation instrument only; it is never used for scoring. The sync burst is 8 round trips (≥ 4 as required) so each burst yields seven rtt samples.
5. **Estimator window and the low-rtt filter.** The sync window is 24 samples (was 32). The proposed NTP-style filter (median over the lowest-rtt half of the window) was implemented as an option (`keepFraction`) and evaluated over 1,000 seeds; it is **not** the default. Under independent per-direction jitter the round trip is statistically independent of the up/down asymmetry that causes offset error, so the filter only halves the sample count and converges slower; under a heavy-tailed model (20% of legs carrying an exponential spike) it trims the early p95 and nothing else, because the 2× median rtt rejection already drops those spikes. The shipping estimator is the median over the whole window. Thresholds from amendment 2 are unchanged and pass. Numbers (median / p95 of |offset error|, ms):

   | link, one-way | estimator | 4 RTT | 12 RTT |
   |---|---|---|---|
   | 80 ± 30 | median of all (shipping) | 7.6 / 22.9 | 4.5 / 14.5 |
   | 80 ± 30 | lowest-rtt half | 10.3 / 28.1 | 5.9 / 19.4 |
   | 250 ± 80 | median of all (shipping) | 20.3 / 61.0 | 11.9 / 38.6 |
   | 250 ± 80 | lowest-rtt half | 27.3 / 75.6 | 15.7 / 51.8 |
   | 80 ± 30, +20% spikes ~Exp(150) | median of all | 11.4 / 46.2 | 6.4 / 19.4 |
   | 80 ± 30, +20% spikes ~Exp(150) | lowest-rtt half | 11.1 / 33.1 | 6.7 / 21.2 |
   | 250 ± 80, +20% spikes ~Exp(300) | median of all | 28.6 / 105.4 | 16.9 / 48.3 |
   | 250 ± 80, +20% spikes ~Exp(300) | lowest-rtt half | 29.0 / 84.6 | 17.3 / 54.8 |

6. **Task 2 decisions (2026-10-05).** (a) The read advances through projected time at `projectionRate` ms per held ms, carried in the BranchSet, default 15, so a hold reaches the 90 s horizon after 6 s of real time; `horizonMs: 90000` stays literal and one real-time number governs both the clip and the double-debt threshold. (b) Streams in Task 2 are spring-eased ribbons growing over 600 ms; the differential-growth port is its own item, Task 2b, before Task 3. (c) No `.riv` assets exist; the DEBT counter and stream labels are plain DOM with a documented Rive slot. (d) `BranchSet.streams[].confidence` is added, optional, defaulting to `p`; brightness = confidence, width = p. The S2 seal read is the fixture: one stream p 0.94 / confidence 0.94 "safe at facility, 00:11" at 660 000 ms, three streams p 0.02 / confidence 0.98 "seal failure, 00:01:31" at 91 000 ms. Hold duration is measured from the server's own receive times (debt is scored); client estimates are recorded for audit. Out of Task 2: reflex reads at 0.5, the DEBT 7/9/10 effects, and +3 VISIBILITY (§8 forbids a meter). The Synaesthete overlay is in Task 2 per §6, although the design doc's §4 lists it under Task 3; the handoff is the authority.

### Clarifications

3. **Consent act.** The run is shared: one miss by any listed role resets every role's run. A listed role that does not tap on a beat has missed that beat. An act is capped at 12 beats; on the cap the server emits `actResult { ok: false }` with `perRole` filled so the crew can see who broke the run. Late joiner: taps from roles not in `roles` are ignored, and taps from a connection that joined after `actStart` are ignored. A listed role that disconnects and reconnects during the act stays listed and keeps its position in the run; reconnect never resets anyone.
4. **Tie at exactly ±260 ms.** `beatIndex = floor((serverTime − epoch) / interval + 0.5)`. A tap exactly halfway between two beats belongs to the later beat, on both sides. Documented in the scorer and tested at ±259, ±260, ±261 ms.
6. **Server clock.** Room time is server wall-clock ms minus a room-start anchor persisted in room storage. `performance.now()` cannot be the room clock on Workers: it is frozen during synchronous execution and resets on hibernation. All scoring is relative to the one anchor, so absolute drift does not matter. Explained in the README.
7. **Evaluation grace.** A beat closes for act evaluation 600 ms after its nominal time (hit window unchanged at ±150 ms). A tap arriving after its beat has closed is scored as a miss for that beat and is never reassigned to the next one.

Accepted as-is: scoring trusts `cServerEst` for the slice; the server records its own receive time alongside it for audit (one-line note in the Task 1 report). Playwright in Task 1 is one smoke test of the diagnostic page: loads, connects to a dev party server, shows a numeric offset within 5 s.

---

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

## 6b. Task 2b — differential-growth streams (after Task 2, before Task 3)

Port the differential-growth (differential-line) algorithm from its published description, not from any repository: nodes on a polyline attract to neighbours, repel nearby non-neighbours, align, and new nodes are inserted where neighbours separate. Drive the Navigator's streams with it so they grow over 600 ms as §1 of the design doc describes, replacing Task 2's spring-eased ribbons. Pure TypeScript simulation step in `packages/motion` (seeded, deterministic), rendered in R3F. Done when: a seeded run is reproducible under Vitest, and the S2 fixture's four streams grow without self-intersection on a phone at 60 fps.

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
- **v0.2.1 — 2026-10-04.** Amendments from Task 1 planning: pure virtual-time sim, statistical clock-sync criterion, three added protocol messages; clarifications on act semantics, tie-break, server clock, evaluation grace. Added after the sim checkpoint: amendment 4 (server audit column and bias-corrected spread; real-device criterion read from it) and amendment 5 (estimator window 24; low-rtt filter evaluated and rejected with numbers).
- **v0.2.0 — 2026-10-03.** Added Task 4 (Discriminator over fft.js) and Task 5 (counterfeit state machine + siege scheduler) as headless systems with bench pages; file map, scope, not-touch list and report format updated.

---

## Task 1 report

Written 2026-10-05 after two real-device runs (two devices, then three). Status: **engine done-criteria met; the real-device criterion is NOT met at the 150 ms window with three devices (15/19 beats, best 10-beat window 9/10, worst 7/10) and the cause is human tap error, not sync; see "Verdict".** **Accepted and closed by Rimuru, 2026-10-05.** The window decision (150 vs 180, calibration, Counterfeit tell) is open on the design side and gates Task 3's S7, not Task 2.

### Done-criteria

| Criterion | Status | Evidence |
|---|---|---|
| typecheck, test, CI green | met | CI check + e2e jobs green on `main` (Node 20) |
| Scorer boundaries ±259/260/261 | met | `packages/protocol/test/scoring.test.ts`; ties go to the later beat (clarification 4) |
| Clock sync converges (amendment 2) | met | 1,000 seeds at 80 ± 30 ms: median 7.6 ms after 4 RTT; 4.5 ms / p95 14.5 ms after 12 |
| Sim spread < 150 ms on ≥ 90% of 60 beats | met | 98.3% on seed 1; 10/10 seeds pass; distribution below |
| 1,500 ms stall recovers within 3 beats | met | `packages/sim/test/stall.test.ts`: first tap after reconnect is a hit |
| Consent act: clean, single-miss reset, late joiner | met | `packages/protocol/test/act.test.ts` + `apps/party/test/room.test.ts` (reconnect keeps position; late tap stays a miss; 12-beat cap) |
| Diagnostic page on iOS Safari and Android Chrome, 2 phones + laptop, 10 beats, spread < 150 on ≥ 9 | **not met at 150 ms; page works on both** | Three-device run (MacBook, S26 Ultra/Chrome, iPhone 16 Pro Max/Safari on cellular): 15/19 beats under 150 (best 10-beat window 9/10, worst 7/10); all columns agree, so the misses are human timing, not sync. Details below |
| README | met | root `README.md` |

### Real-device run A (2026-10-05): two devices

Two devices, not the three §5 asks for; run B below has three.

| Device | OS / browser | Network | RTT (server) | Sync bias |
|---|---|---|---|---|
| (1) MacBook | macOS, desktop browser | home Wi-Fi | not captured | not captured |
| (2) Samsung Galaxy S26 Ultra | Android, Chrome | cellular | not captured | not captured |

One person tapped both devices, so run A's "human error" is one player's two hands, not two players.

Room server: `lsp-party.rahulvarma2105.workers.dev` (Cloudflare Workers + Durable Objects). Web: `lsp-nu-amber.vercel.app`.

20 consecutive beats, both devices tapping on every one. Spread = max − min of the two deltas.

| Beat | Scored | Audit | Corrected |
|---|---|---|---|
| 85 | 83 | 7 | 81 |
| 86 | 25 | 22 | 27 |
| 87 | 93 | 94 | 91 |
| 88 | 16 | 16 | 14 |
| 89 | 61 | 134 | 63 |
| 90 | 57 | 51 | 55 |
| 91 | 10 | 10 | 12 |
| 92 | 10 | 52 | 12 |
| 93 | 124 | 126 | 122 |
| 94 | 111 | 135 | 113 |
| 95 | 25 | 73 | 27 |
| 96 | 76 | 79 | 78 |
| 97 | 41 | 44 | 39 |
| 98 | **176** | **179** | **174** |
| 99 | 62 | 149 | 64 |
| 100 | 64 | 61 | 61 |
| 101 | 11 | 15 | 13 |
| 102 | **155** | **153** | **152** |
| 103 | 41 | 41 | 39 |
| 104 | 66 | 67 | 64 |

| Column | < 150 ms | < 180 ms | median | p90 | max |
|---|---|---|---|---|---|
| Scored (§5 as written) | 18/20 | 20/20 | 62 | 124 | 176 |
| Audit (amendment 4, pessimistic) | 18/20 | 20/20 | 67 | 149 | 179 |
| Corrected (amendment 4, best estimate) | 18/20 | 20/20 | 63 | 122 | 174 |

Reading:

- **Clock sync is proven on real devices.** Corrected and Scored agree within ~3 ms on every beat, i.e. the server's independent estimate of each device's clock error is a few ms. The two over-window beats appear identically in all three columns, so they are human timing, not clocks or network.
- **The audit column behaves as predicted.** It departs from Scored by 3 ms at the median, 73 ms at p90 and 87 ms at worst: single-trip transit jitter, consistent with one device on a jittery link. It is the right instrument for catching a sync failure and the wrong one for judging agreement beat by beat; the Corrected column is the read.
- **Human tap error is ~57 ms sd per player, not the 40 ms the handoff and sim assumed.** Derived from the 20 two-player differences (57.6 ms from mean |d|, 56.1 ms from rms). This is the finding that matters for the window. Monte Carlo on independent normal tap errors:

  | per-player sd | 2 players < 150 | 3 players < 150 | 3 players < 180 |
  |---|---|---|---|
  | 40 ms (sim assumption) | 99% | 98% | 99.6% |
  | 58 ms (measured) | 93% | 84% | 93% |

  The sim at `--human 58` confirms it: the §5 criterion passes on only 1/10 seeds (seed 1: 80.0% of beats under 150 ms, p50 110 ms, p90 176 ms, max 242 ms). With the measured error, three players on a 150 ms window would land near 84%, under the 90% criterion; a 180 ms window brings that to ~93%. This is a 20-beat, two-person sample from people learning the rhythm, so read the sd as roughly 50–65 ms.
- **Likely sources** (design levers, not engine fixes): mobile-browser touch-to-event latency is variable by tens of ms, and players anticipate or trail a visual cue by a personal, fairly stable amount. A per-player calibration step that measures and subtracts a habitual lead/lag would cut the sd without widening the window. Not built; it is a design decision.

### Real-device run B (2026-10-05): three devices

| Device | OS / browser | Network | Tapper | RTT (server) | Sync bias |
|---|---|---|---|---|---|
| (1) MacBook | macOS, desktop browser | home Wi-Fi | person 1 | not captured | not captured |
| (2) Samsung Galaxy S26 Ultra | Android, Chrome | home Wi-Fi | person 1 | not captured | not captured |
| (3) iPhone 16 Pro Max | iOS, Safari | cellular | person 2 | not captured | not captured |

19 consecutive beats with all three tapping (beats 64–82; beat 83 had two tappers and is excluded). This run covers both mobile browsers §5 names, with the cellular device being the iPhone on Safari, the stricter of the two for timers and haptics; it still agreed with the Wi-Fi devices within single-digit milliseconds on the Corrected column.

| Beat | Scored | Audit | Corrected |
|---|---|---|---|
| 64 | **169** | **177** | **167** |
| 65 | **190** | **197** | **194** |
| 66 | 73 | 72 | 77 |
| 67 | 17 | 79 | 11 |
| 68 | 61 | 51 | 57 |
| 69 | **186** | **224** | **182** |
| 70 | 70 | 79 | 76 |
| 71 | 140 | 137 | 142 |
| 72 | 17 | 11 | 11 |
| 73 | 52 | 48 | 46 |
| 74 | 59 | 55 | 53 |
| 75 | 103 | 111 | 107 |
| 76 | **213** | **203** | **209** |
| 77 | 62 | 56 | 56 |
| 78 | 47 | 46 | 45 |
| 79 | 70 | 71 | 76 |
| 80 | 103 | 98 | 97 |
| 81 | 41 | 40 | 45 |
| 82 | 46 | 45 | 48 |

| Column | < 150 ms | < 180 ms | < 200 ms | median | p90 | max |
|---|---|---|---|---|---|---|
| Scored (§5 as written) | 15/19 | 16/19 | 18/19 | 70 | 186 | 213 |
| Audit (amendment 4) | 15/19 | 16/19 | 17/19 | 72 | 197 | 224 |
| Corrected (amendment 4) | 15/19 | 16/19 | 18/19 | 76 | 182 | 209 |

10-beat windows on the Scored column: best 9/10 (beats 73–82), worst 7/10 (beats 64–73). **The §5 criterion (≥ 9 of 10 under 150 ms) is met on the best window only; over the full run it is 79%.**

Reading:

- **Sync holds with three devices.** Corrected tracks Scored within 6 ms at the median and 10 ms at p90 (one 62 ms audit excursion on beat 67, a transit spike). All four over-window beats are over in all three columns: human timing again.
- **Implied per-player tap error ≈ 48–53 ms sd** (from the median and mean of the three-way range), consistent with run A's 57 ms. Call it 50–58 ms.
- **Projection at the measured error** (independent normal tap errors, Monte Carlo):

  | per-player sd | 3 players < 150 | < 180 | < 200 |
  |---|---|---|---|
  | 50 ms | 91.5% | 97.1% | 98.7% |
  | 55 ms | 87.0% | 94.6% | 97.3% |
  | 60 ms | 81.9% | 91.4% | 95.2% |

  The observed 79% is at the pessimistic end of that band, plausibly because the three-device run also carried a slower third device and the players were still learning. At 180 ms the same run reads 16/19 (84%); at 200 ms, 18/19 (95%).

### Verdict

The slice goal, three phones sharing a 520 ms beat accurately enough for the consent mechanic, is **met on the engine side**: the server owns the clock, beats are scheduled rather than pushed, sync on real devices is accurate to a few ms with two and with three devices, and a 1.5 s stall is invisible to timing.

The **§5 real-device criterion is not met at 150 ms with three devices**: 15/19 beats, 79%, against a requirement of 90%. Honest effort was made; the number is reported, not adjusted. **The kill criterion as written ("real phones cannot reach < 150 ms spread on 9/10 beats") is reached on the best ten-beat window and missed on the worst**, and the cause is unambiguous: human tap error of 50–58 ms sd per player against a design assumption of 40, with no sync failure observed in either run. This is therefore a product decision about the window and the cue, not an engineering shortfall in the beat engine, and the turn-based fallback is not indicated by the data: sync is good and 180 ms would already clear the bar at the measured error.

Options for the design side, in the order the data suggests: (a) widen the window to 180 ms (projected 91–97% for three players; the observed run reads 84% at 180 and 95% at 200), (b) add per-player tap calibration to cut the sd without widening, (c) make the Counterfeit's tell easier. iOS Safari on cellular is covered by run B; future runs should record RTT and sync bias per device from the Crew table.

### Sim distribution (final, `pnpm --filter @lsp/sim run spread -- --clients 3 --beats 60`)

```
spread: 60 beats measured from beat 6, 3 clients, human sd 40 ms, seed 1, 38.4 s simulated
  c1 navigator   link  40±15  ms taps  72 hits  72 mean Δ    0.7 ms  median |Δ|  22.6 ms  sync err    0.0 ms
  c2 synaesthete link 120±40  ms taps  71 hits  71 mean Δ    6.2 ms  median |Δ|  28.9 ms  sync err   -6.4 ms
  c3 theorist    link 250±80  ms taps  68 hits  68 mean Δ    7.0 ms  median |Δ|  34.6 ms  sync err    1.9 ms
  per-beat spread, server-measured (max − min of deltaMs from cServerEst) — the §5 criterion:
    0– 25 ms |   6 ################
   25– 50 ms |  14 #####################################
   50– 75 ms |  15 ########################################
   75–100 ms |  10 ###########################
  100–125 ms |  10 ###########################
  125–150 ms |   4 ###########
  150–175 ms |   1 ###
  175–200 ms |   0 
  200–225 ms |   0 
  225–250 ms |   0 
  250–275 ms |   0 
  275–300 ms |   0 
  300+    ms |   0 
  p50 69 ms   p90 117 ms   max 167 ms   < 150 ms on 98.3% of beats (need ≥ 90%)
  per-beat spread, ground truth (true tap instants; includes clock-sync error, which cancels out of the server view):
    0– 25 ms |   7 ####################
   25– 50 ms |  12 ##################################
   50– 75 ms |  14 ########################################
   75–100 ms |  12 ##################################
  100–125 ms |  10 #############################
  125–150 ms |   4 ###########
  150–175 ms |   1 ###
  175–200 ms |   0 
  200–225 ms |   0 
  225–250 ms |   0 
  250–275 ms |   0 
  275–300 ms |   0 
  300+    ms |   0 
  p50 67 ms   p90 123 ms   max 164 ms   < 150 ms on 98.3% of beats (need ≥ 90%)
  per-beat spread, server AUDIT column (receivedAt − rtt/2; amendment 4) — 60/60 beats audited; per-tap audit error vs truth p50 25.3 p90 105.3 max 195.1 ms (= one-way transit jitter):
    0– 25 ms |   3 ###########
   25– 50 ms |   6 ######################
   50– 75 ms |  11 ########################################
   75–100 ms |   8 #############################
  100–125 ms |   4 ###############
  125–150 ms |  10 ####################################
  150–175 ms |   9 #################################
  175–200 ms |   6 ######################
  200–225 ms |   0 
  225–250 ms |   1 ####
  250–275 ms |   0 
  275–300 ms |   2 #######
  300+    ms |   0 
  p50 115 ms   p90 194 ms   max 295 ms   < 150 ms on 70.0% of beats (need ≥ 90%)
  per-beat spread, BIAS-CORRECTED (deltaMs + server's per-client syncBias) — error vs truth p50 4.5 p90 12.5 max 32.9 ms:
    0– 25 ms |   6 ################
   25– 50 ms |  14 #####################################
   50– 75 ms |  15 ########################################
   75–100 ms |  10 ###########################
  100–125 ms |  10 ###########################
  125–150 ms |   4 ###########
  150–175 ms |   1 ###
  175–200 ms |   0 
  200–225 ms |   0 
  225–250 ms |   0 
  250–275 ms |   0 
  275–300 ms |   0 
  300+    ms |   0 
  p50 68 ms   p90 118 ms   max 167 ms   < 150 ms on 98.3% of beats (need ≥ 90%)
  server sync-bias estimate per client (should be −sync err above): c1 2.8 ms (client −0.0), c2 3.4 ms (client −-6.4), c3 2.0 ms (client −1.9)
  PASS
```

### Protocol deviations from §5 as written

- Three messages added (`hello`, `snapshot`, `stats`), `ping.prev`, `tapScore.auditDeltaMs`, and `stats.recentBeats` / per-client `rttMs`, `syncBiasMs` (amendments 3, 4).
- Sync burst is 8 round trips, estimator window 24, median over the whole window (amendments 4, 5).
- Server clock is a persisted wall-clock anchor (clarification 6).
- Beats close 600 ms after nominal for act evaluation; late taps stay misses (clarification 7).

### Deviations

1. **Host moved from PartyKit to Cloudflare Workers + Durable Objects** (allowed by §2). `partykit deploy` failed on 2026-10-04 with:

   ```
   You have exceeded the limit of 10000 Workers custom domains on zone 'partykit.dev'.
   ```

   That is PartyKit's shared zone being full, not this project's configuration. The PartyKit adapter was replaced by a Worker (`apps/party/src/worker.ts`) routing `/parties/main/:room` to one Durable Object per room (`apps/party/src/room-do.ts`, class `BeatRoom`, SQLite-backed so it runs on the free plan), using the WebSocket Hibernation API and storage alarms, with the wall-clock anchor persisted in DO storage exactly as before. `RoomCore` did not change. Because the Worker keeps the PartyKit URL shape, the client transport (`partysocket`) and the diagnostic page are unchanged apart from the env var, renamed `NEXT_PUBLIC_PARTYKIT_HOST` → `NEXT_PUBLIC_PARTY_HOST`. Deploy is `pnpm --filter @lsp/party deploy:party` (`wrangler deploy`); pnpm 10 reserves the script name `deploy`.
2. **Server clock is a persisted wall-clock anchor, not `performance.now()`** (clarification 6). Recorded there; repeated here because it is a departure from §5's literal text.
3. **Toolchain pinned to hold the Node 20 floor** (§2 "Node 20+"). Node 20 reached end of life in April 2026 and current tooling has moved past it: `@commitlint/cli` ≥ 20 and `wrangler` ≥ 4.87.0 require Node 22, and `undici` 8 requires 22.19. To keep `engines.node >= 20` honest, commitlint is pinned to 19.x and wrangler to 4.86.0 (the last release allowing Node 20), with pnpm overrides lifting wrangler's bundled `undici`, `ws`, `sharp` and `esbuild` to patched versions that still run on Node 20. CI runs on Node 20. This will keep breaking on dependency bumps; the recommendation is to raise the floor to Node 22 (`engines`, `.nvmrc`, CI) as a §2 amendment. Not done here because §2 is a hard constraint and the change is the design side's call.
4. **Scoring trusts `cServerEst`** (§5, accepted). The server records its own receive time and the audit estimate alongside it (amendment 4). A client can still fabricate hits; the audit columns make it visible after the fact, not preventable.
5. **Real-device runs did not capture the Crew table.** Server RTT and sync-bias per device were not recorded for either run, and run A had one person tapping both devices. Devices, browsers and networks are recorded above. Future runs should capture the Crew table per device.



