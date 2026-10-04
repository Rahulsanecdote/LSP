# Last Stand Protocol

A browser-based, three-player cooperative narrative game. Each player holds a phone, joins a
room by code, and sees only their role's instrument. The signature verb is the **consent
beat**: all three players tapping on a shared 520 ms rhythm within a ±150 ms window.

This repository is the vertical slice. `docs/handoff/SLICE_HANDOFF.md` is the engineering
contract; `docs/design/` holds the episode specs. Task 1, the beat engine, is what exists so far.

## Layout

```
packages/protocol   shared types, zod message schemas, clock sync, scoring, consent act (pure)
packages/sim        virtual-time simulation harness: seeded PRNG, latency links, simulated phones (pure)
apps/party          Cloudflare Workers + Durable Objects room server; src/core is the pure room state machine the sim also drives
apps/web            Next.js shell; Task 1 ships only the beat diagnostic at /diag/[code]
```

## Commands

```bash
pnpm install
pnpm -r typecheck                                   # tsc --noEmit everywhere
pnpm -r test                                        # vitest
pnpm --filter @lsp/sim run spread -- --clients 3 --beats 60   # the §5 spread criterion, exits 1 on failure
pnpm --filter @lsp/party dev                        # room server via wrangler dev on :1999
pnpm --filter @lsp/party deploy:party               # wrangler deploy (prints the *.workers.dev host)
pnpm --filter @lsp/web dev                          # Next.js on :3000 (set NEXT_PUBLIC_PARTY_HOST to the deployed host)
pnpm --filter @lsp/web e2e                          # Playwright smoke test; starts both dev servers itself
```

## Room lifecycle

A room is one Durable Object; its name is the room code. The Worker routes
`/parties/main/<CODE>` (the URL shape `partysocket` builds) to it, and the first connection
creates it.

1. **Connect.** The server sends the current `schedule` at once, so a client can start rendering
   beats as soon as its clock sync is ready.
2. **Hello.** The client sends `hello { cid, role }`. `cid` is a per-device id kept in
   localStorage, so a reconnect is the same player: same anonymous label (`p1`, `p2`, …), same
   stats, same place in any consent act in progress. The server answers with a `snapshot`
   (schedule, players, active act) and broadcasts `stats`.
3. **Sync.** The client runs an 8-round-trip ping burst, then another every 10 s. Each follow-up
   ping names the pong it answers (`prev`), which lets the server measure the round trip itself.
4. **Beats.** Rendered locally from the schedule (below). Every beat is a background pulse plus
   `navigator.vibrate(20)`; never audio-only. 520 ms is 1.92 Hz, under the 3 Hz flash limit.
5. **Taps.** The client sends `tap { cLocal, cServerEst }`. The server scores it, replies
   `tapScore` to the tapper, broadcasts an anonymised copy, and re-broadcasts `stats`.
6. **Consent act.** `actStart` opens an act for a set of roles. The server closes each beat
   600 ms after its nominal time; a listed role that did not tap has missed it, and one miss by
   anyone resets the shared run. Three consecutive clean beats succeed; twelve beats without
   that fail. `actResult` carries per-role hits and deltas either way.
7. **Persistence.** The whole room state is written to Durable Object storage after every
   change and reloaded on start, so the room survives reconnects and hibernation. Sockets use
   the WebSocket Hibernation API and carry their connection id as an attachment; timers are
   storage alarms for the same reason.

## Clock sync

The server owns the clock. Room time is milliseconds since a wall-clock anchor persisted when
the room first starts: `now = Date.now() − anchor`. Everything scored is relative to that one
anchor, so absolute drift of the server's wall clock does not matter.

`performance.now()` is **not** the room clock, although §5 names it. On Cloudflare Workers it
is frozen during synchronous execution and resets when the Durable Object is evicted, so a
schedule epoch persisted against it would be in a dead clock after the first idle minute.

Clients never trust their own `Date.now()` for anything scored. Their local clock is
`performance.now()`, and the offset to room time comes from an NTP-style exchange:

```
client sends   ping { c0 }            c0 = local send time
server replies pong { c0, s1 }        s1 = room time at receipt (= send; same tick)
client notes   c1                     local receive time

rtt    = c1 − c0
offset = s1 − (c0 + rtt/2)            room ≈ local + offset
```

The estimator keeps a sliding window of 24 samples, rejects any whose rtt exceeds twice the
running median rtt, and reports the median offset once it has four. Over 1,000 seeded runs at
80 ± 30 ms one-way latency the error is 7.6 ms median after 4 round trips and 4.5 ms median,
14.5 ms p95, after 12. The NTP-style "lowest-rtt half" filter was evaluated and not adopted;
`docs/handoff/SLICE_HANDOFF.md` amendment 5 has the table and the reason.

## Why beats are scheduled, not pushed

A WebSocket message arrives after one network trip whose duration varies by tens of
milliseconds on Wi-Fi and hundreds on cellular. If the server pushed "beat now" every 520 ms,
every phone would render it late by its own latency and late by a different amount each time.
The beat would jitter exactly as much as the network does, and three phones on three networks
would never agree.

So the server never says *that* a beat happened. It says *when* beats will happen:

```
schedule { epoch, interval: 520, until, windowMs: 150 }
```

`epoch` is the room time of beat 0 and never changes for the life of the room, so beat
indices are stable. `until` is extended by a re-broadcast every 20 s covering the next 30 s.
Each client renders beat *n* at local time `epoch + n·520 − offset`. Network jitter affects
only how early the client learns the schedule, not when it renders beats. A 1,500 ms stall
changes nothing about beat timing; the client keeps rendering from the schedule it already
has and its taps resume as soon as the socket is back.

Scoring uses the same idea in reverse. A tap carries the client's estimate of room time,
`cServerEst = cLocal + offset`, and the server scores that against the nearest beat:

```
beatIndex = floor((cServerEst − epoch) / 520 + 0.5)      ties go to the later beat
deltaMs   = cServerEst − (epoch + beatIndex · 520)
hit       = |deltaMs| ≤ 150
```

The tap's own transit time never enters the score.

## The audit column

Trusting `cServerEst` has a blind spot. A phone renders the beat and stamps its tap from the
same offset estimate, so if its sync is wrong by 200 ms it taps 200 ms late in reality and
still reports a perfect delta. The scored spread across phones cannot see this.

The server therefore also records, per tap, an independent estimate from its own clock and
its own round-trip measurements:

```
auditServerTime = receivedAt − medianRtt/2
```

A single tap's audit carries that tap's one-way transit jitter, so it is honest but noisy.
Averaging over recent taps removes the jitter and leaves the client's sync error:

```
syncBiasMs      = median(receivedAt − cServerEst) − medianRtt/2
correctedDelta  = deltaMs + syncBiasMs
```

`stats.recentBeats` carries the cross-client spread from all three columns. In simulation the
corrected column tracks the true tap instants within 4.5 ms median, 12.5 ms p90. The
real-device criterion in §5 is read from the audit columns: `auditSpread` is the pessimistic
bound, `correctedSpread` the best estimate.

## Simulation

`packages/sim` is a discrete-event simulator with a virtual clock and a seeded PRNG. It drives
the real `RoomCore` with simulated phones over links of configurable normal one-way latency,
each tapping with normal human error around its locally rendered beat. Because it knows the
true instant of every tap, it can report the spread the server sees, the ground truth, and how
well the audit columns recover that truth. `pnpm --filter @lsp/sim run spread` prints the
distributions and fails when the §5 criterion does not hold; CI runs it on every push.

## Deploying

The room server is a Cloudflare Worker with one Durable Object class, SQLite-backed so it runs
on the free plan. (It began life on PartyKit; PartyKit's shared `partykit.dev` zone had hit its
custom-domain limit at deploy time, see the Task 1 report.)

```bash
pnpm --filter @lsp/party exec wrangler login       # once; opens a browser
pnpm --filter @lsp/party deploy:party              # prints  https://lsp-party.<account>.workers.dev
```

Set `NEXT_PUBLIC_PARTY_HOST` to that host **without** the protocol (`lsp-party.<account>.workers.dev`)
wherever the web app is built, e.g. the Vercel project's environment variables, with the project's
root directory set to `apps/web`. The client picks `wss://` for any non-localhost host.

## Licence

AGPL-3.0-only. See `LICENSE`.
