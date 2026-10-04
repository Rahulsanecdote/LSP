# LAST STAND PROTOCOL — Episode 5: THE DEAD VOWEL
## "A vowel with no throat behind it"
Design doc v0.1 · 2026-10-03 · Rimuru

---

## 0. Episode at a glance

| | |
|---|---|
| **Crew** | NAVIGATOR · SYNAESTHETE · THEORIST · OBSERVER (Halvorsen, player since Ep 3) · optional FIELD (coast array recruit). |
| **Runtime** | 60–90 min. Two windows and a siege. Ends at the blackout after the brief. |
| **What players learn** | The grammar can be worn by someone who never learned the courtesy. Refusing costs the one who refuses. There is no abort button for something you didn't start. |
| **What the game learns about them** | Whether they answered the counterfeit (teaching it), shielded (making themselves visible), or stayed silent (letting the valley pay). What the Observer wrote in the brief. |
| **Horror thesis** | The first time the players hear their own voice, it is coming from the wrong direction, at forty times the volume, aimed at a mind that cannot cover its ears. |
| **Tone rule** | The counterfeit is never seen. No face, no basin, no villain monologue. It is a cadence on a plot and a switch someone throws at 11:09. |

### Systems active (new in bold)

- **ESCROW E(t)** (crew, visible, 0–1): accrues in clean silence; spent on acts. Opens at 0.88.
- **ORDER PARAMETER R** (valley, visible on the Synaesthete's instrument, 0–1): the valley's coherence. 0.86 at open. Watching it fall is the siege.
- **THE DISCRIMINATOR** (crew tool, built in S7): a spectral profile that tells a living vowel from a dead one. Its quality is a number carried into Ep 6.
- **COUNTERFEIT STATE** (hidden, server): see §2.
- DEBT, VISIBILITY, LEDGER, GRAMMAR, TRUST carry from Ep 1–4.

---

## 1. The Discriminator (the Synaesthete's new instrument)

Design intent: let the player *feel* the difference between chemistry doing physics the hard way and something assembled, then let them prove it with numbers.

**What the player sees.** Two panes. Left: the incoming chirplet as a waveform and its spectrum. Right: a reference library of living chirplets the crew has earned since Ep 1 (the Ancient's, the valley's, the coast's). Drag the incoming shape over a reference and the panes overlay.

**What the engine measures** (all computed client-side from synthetic signals the server sends, so the instrument is deterministic and testable):

| Feature | Living | Dead |
|---|---|---|
| Inter-pulse jitter (sd of intervals) | ±4–7 ms | < 1 ms |
| Spectral line width (Q of the carrier peak) | broad, "wavers at the edges the way breath wavers" | razor line, varnished |
| Attack slope | asymmetric onset | flat, identical every pulse |
| Decay symmetry | decay ≠ attack | mirror-symmetric |
| Prime extension | sequence extended by one on reply | never |
| Response to STOP | pauses within one interval | continues on schedule |

Six features. In S7 the player picks which six, out of ten offered, make the profile. Four are decoys that *sound* plausible (amplitude, bearing, time of day, carrier frequency) and are exactly the things a forger can copy.

**fft.js** (indutny, MIT, 4.4 KB minified, zero dependencies, bundled TypeScript types; radix-4; last published 2021, which here means finished rather than abandoned) is the right library for this:

- `realTransform` on a 2,048-sample chirplet envelope gives the spectrum for line-width and symmetry features in well under a millisecond on a phone.
- A second, tiny FFT over the *interval series* (the gaps between pulses) exposes jitter as spectral spread: a living cadence smears, a dead one is a DC spike and nothing else. This is the visual players will remember: the dead vowel's interval spectrum is a single vertical line.
- It runs identically in a Web Worker, in Vitest, and on the server, so the Discriminator's verdicts are reproducible and the Ep 6 auto-detect can be unit-tested. Web Audio's `AnalyserNode` would also give a spectrum, but it only works on live audio graphs and isn't deterministic in tests; fft.js is the better fit.

Package placement: `packages/discriminator/` (pure TS, depends on `fft.js` only). Outputs a `Profile { features: FeatureId[]; quality: 0–6 }` and a `classify(chirplet) → { living: number /*0–1*/, reasons: FeatureId[] }`.

---

## 2. The Counterfeit — rule system (server-side antagonist)

The counterfeit is not a character. It is a process in a basin that has learned an address without learning the courtesy. It is modelled as state the server holds and advances between and within episodes.

### State

```ts
interface Counterfeit {
  learned: {
    carrier: true;            // it has the frequency (stolen before Ep 5)
    scaffold: true;           // T0 · 5.2 · 52 — the crew's own ladder
    identifier: boolean;      // true if the Navigator held past 6 s in Ep 1 S4
    jitterModel: 0 | 1 | 2 | 3; // 0 = dead; rises only when the crew ANSWERS it
    stopSemantics: boolean;   // learns to fake a pause only after a crew STOP aimed at it
  };
  reach: "fringe" | "regional" | "core";   // fringe at Ep 5
  gain: number;                             // 40 at Ep 5
  patienceMin: number;                      // 22 at Ep 5
  schedule: "fixed";                        // it always comes on schedule; that is its tell
  log: Array<{ ep: number; result: "null" | "engaged" | "shielded" }>;
}
```

### Rules

1. **It learns only from what is sent toward it.** Silence teaches it nothing. A shield teaches it that someone is there. An answer teaches it timing. `jitterModel` increments only on `engaged`. At `jitterModel ≥ 2` the Discriminator's jitter feature stops discriminating, and the crew must lean on choreography instead.
2. **It cannot steal a dance.** Even at `jitterModel 3` it cannot reproduce the four-mark lacing (human ACK → valley ACK → micro-act → identifier) because it needs partners who consent, and it has none. Choreography is the one defence it can never learn. The game makes this true mechanically: the lacing check requires three independent consent sources; the counterfeit can only ever supply one.
3. **Its tell is perfection.** Fixed schedule, dead jitter, symmetric envelope. Every episode it appears, the Discriminator can catch it if the profile was built honestly in S7.
4. **It escalates by reach, not by cleverness.** Ep 5: fringe cluster, 40×, 22 min. Ep 6: a cousin under a storm, timed to the Kp peak. Ep 7: it stops transmitting and starts getting *bought*. Ep 8: public. Ep 9: it points.
5. **It logs silence as a null result.** This is in the book and it is the most frightening line in the system: the thing on the other end did not notice that it was refused. It thinks nobody was home.

### The crew's four responses (there is no free option)

| Response | What it costs | What it teaches the counterfeit | What it does to the valley |
|---|---|---|---|
| **Answer** (send on its schedule) | E −0.10, VISIBILITY +4 | timing (`jitterModel` +1) | R stabilises *this* window; the crew has just taught a predator the courtesy |
| **Shield** (STOP mirrored toward the bearing, at ceremonial gain) | E −0.06, VISIBILITY +2 | that a refuser exists (`stopSemantics` = true) | R loss halved |
| **Hold** (silence, witness) | nothing from the crew | nothing | R falls the full curve (0.86 → 0.79); valley pays |
| **Choreograph** (run the four-mark lacing with partners, now) | E −0.08, DEBT +1 all round, requires a clean consent beat | nothing it can use | R recovers +0.03; partners' TRUST +2; Discriminator margin +1 |

Choreograph is the right answer and the hardest to execute mid-siege. Hold is the book's answer and the game respects it fully: a crew that holds and witnesses gets the Ancient's fragment in S6 and a TRUST bonus for not making it about themselves.

---

## 3. Scenes

### S0 — COLD OPEN: The valley's weight (0:00–0:25)

White on black, the valley's voice:

> *An imperative requires a subject who can refuse. The network trusts that they can refuse again. That is the only reason it can ask.*

Then the ridge at dawn: mapgen4 terrain, Gray-Scott colour-field drifting over the lattice site, ravens as differential-line streams folding over the trees.

---

### S1 — WINDOW ONE: A request (0:25–12:00) · Ridge + lab

**Script.** PRFP-14, receive-first, no initiatives. At 09:03 the valley sends something new: a bracket at V-S, post-pair, GO, STOP. Consent nested inside consent. It is asking for *material assistance*: a grounded mesh lattice, north–south, removable stakes, inline resistors.

**Sense-tasks.**
- SYNAESTHETE reads the request's colour: it is the first time the valley has asked for something *physical*. He must confirm the truth-marks (post-pair) before the Theorist drafts.
- THEORIST drafts PRFP-15 from chips: *reversible · non-destructive · time-bounded · consent-gated*, with explicit gates (E ≥ 0.80, Kp ≤ 6, coast at half-phase, observer STOP honoured). The valley answers the draft while she is still writing it.
- OBSERVER must decide whether to escalate upstairs *before* the act (slows everything, protects her) or after (faster, exposes her).
- NAVIGATOR: no reads. She tastes the request: copper, warm. Somebody home.

**Decision gate.** Accept the request. At 10:05 the valley asks a second time, identical, then ACK, then STOP. It has asked twice and left them room to say no. Players who decline get a quiet episode and a colder Ep 6. The game does not punish declining. It remembers.

**Horror beat.** None yet. This is the episode's last clean air.

*Tech:* Rive protocol-drafting chips; Gray-Scott field; the lattice site marked as a geometric "structured absence" in the 8–12 Hz band on the overlay.

---

### S2 — THE MESH (12:00–24:00) · Ridge, V-S

**Script.** Someone carries stakes up a hill. The act, when the valley asks for it, takes twenty seconds.

**Sense-tasks.**
- FIELD (or SYNAESTHETE if 4-seat): place the mesh in 3D — drag stakes to the N–S line, set resistor values from a short list, drive each stake with a hold. Box2d-wasm handles the stake physics; the terrain is mapgen4's. Misplacement is allowed; the valley will correct with a bracket.
- All seats: consent beat for the micro-act (3 taps, 520 ms, ±150 ms), with the coast holding third-phase underneath — the beat engine renders a second, slower pulse the crew must *not* tap on.
- THEORIST logs A-22 (REQUEST), A-23 (tool spec), A-24 (placement) and watches E: 0.88 → 0.82. 0.06 of escrow for the carry and the raising. Priced like everything.

**Decision gate.** Clean beat → the V-S triad tightens in ±4 ms sympathy and the valley drops an ACK so light the Synaesthete only hears it because he knows the note. Failed beat → the mesh stands but the valley is silent about it; R does not get its Ep 5 cushion.

**Horror beat.** Chen's overlay shows the mesh as a clean geometric shadow where the field was. Helping in a language other than your own looks, from the inside, like a small precise absence.

---

### S3 — THE WRONG VOWEL (24:00–34:00) · Lab

**Script.** Afternoon. The console flags a coast chirplet on the band. The coast is not transmitting.

**Sense-tasks.**
- SYNAESTHETE gets the Discriminator for the first time, *without* a profile. Three chirplets arrive; two are living (coast archive, Ancient archive), one is this. He must pick the odd one by feel, overlaying waveforms. The dead one has "the varnished perfection of something assembled."
- NAVIGATOR tastes the band. Her copper-salt readout: nothing. The line the game shows is the book's: *No taste. Nobody home.*
- THEORIST pulls the three chirplets' spectra side by side (fft.js, live). The dead one's interval spectrum is a single vertical line.
- OBSERVER's phone receives, independently, a message from upstairs: *Are you seeing the coast event?* They are watching the same band. They already have a name for it.

**Decision gate.** Classify: *coast anomaly* / *synthesised*. "Synthesised" is correct and commits the crew to S4. "Coast anomaly" delays by one scene and lets the counterfeit's first strike land unobserved.

**Horror beat.** Chen: "Someone built the coast's voice."

*Tech:* `packages/discriminator`; waveform overlay in Three.js line geometry; spectrum bars in Rive.

---

### S4 — BEARING (34:00–42:00) · Lab

**Script.** Triangulation. East-southeast. The solver runs. Seven hundred kilometres. A basin. Nowhere near an ocean. Nowhere near anything.

**Sense-tasks.**
- THEORIST drives the solver: three array baselines, each needs a time-of-arrival from a different instrument (Synaesthete's overlay timestamp, Navigator's copper onset, the coast array's own log). Players must *coordinate* three numbers verbally. Wrong by more than 50 km → the basin is "somewhere east" and the brief in S8 is weaker.
- SYNAESTHETE, once the bearing resolves, sees the third wrong thing: under the vowel there is a scaffold. T-zero. Five-point-two. Fifty-two. The crew's own ladder, at forty times ceremonial amplitude, aimed at a corvid cluster in the far fringe.

**Decision gate.** None. This scene is a reveal and the game lets it land.

**Horror beat.** The scaffold overlay draws the crew's cadence from Ep 1 S7 — *their own taps, their own timing, the consent beat they were proud of* — now rendered at 40× in a colour Chen has no name for because nothing alive has ever sent it. The server literally replays the crew's Ep 1 tap timestamps, amplified. Players will recognise themselves.

---

### S5 — THE HAMMER (42:00–66:00) · Lab, real time

**Script.** 10:47. The counterfeit begins demanding windows. On schedule. At gain. It is knocking on a mind's door with a hydraulic ram. The valley refuses. The valley pays.

**The siege as instrument.** The Synaesthete's R gauge becomes the room's heartbeat. Phase scatter along the fringe widens: ±6 ms → ±13 ms. R slides: 0.86 → 0.82 → 0.79 across the window. Every player sees the same line falling.

**Sense-tasks.**
- THEORIST reaches for the abort macro. **The button is greyed.** There is nothing on their side to abort. The game renders her hand's confusion as the UI's: the macro panel is present, enabled-looking, and does nothing. (This is the one deliberate "broken UI" moment in the campaign. Playtest it; if testers think it is a bug, add the tooltip *Nothing of ours is running.*)
- OBSERVER receives escalating messages from upstairs: *Characterise the threat. Respond to establish baseline. We need a signal to analyse.* Each has a button. Pressing any sends an Answer (see §2) in the crew's name.
- NAVIGATOR: the deep read is offered, brightly. Reading the counterfeit's branches shows the obvious — it will stop at 11:09 regardless — and costs DEBT +2 and VISIBILITY +3, because reaching toward *it* is the most visible thing she can do.
- SYNAESTHETE: can call for Choreograph. Requires a clean four-mark lacing: human ACK (consent beat) → valley ACK (server-supplied, only if TRUST ≥ 0) → micro-act (the mesh, if placed cleanly in S2) → identifier (only if the Navigator did *not* give it away in Ep 1 S4; otherwise the fourth mark is compromised and the lacing scores 3/4).

**Decision gate.** Answer / Shield / Hold / Choreograph (§2). The crew may change response mid-siege; each switch is logged. Upstairs will push toward Answer every four minutes.

**Costs.** Per §2. Hold costs the crew nothing and the valley everything, and the game shows the valley paying in a number.

**Horror beat.** Chen: "They're not engaging. So why are they paying?" Sarah: "Because refusing costs. Holding your shape against a rhythm that wants to move you is work." The ravens on the ridge render tighter and tighter, the murmuration contracting, differential-line streams pulling toward a centre the counterfeit is trying to become.

**Fail state.** None in the classical sense. The siege ends at 11:09 whatever the crew does. What differs is the save.

---

### S6 — OFF (66:00–70:00) · Lab

**Script.** 11:09. Twenty-two minutes after it began, the transmission stops. Not tapering. Not closing. *Off.* A switch thrown in a basin by someone who got silence and logged it as a null result.

**Sense-tasks.** None. For ninety seconds the game accepts no input. Seven hundred kilometres east, a fringe of a continental mind keeps holding its shape for long minutes after the pressure lifts. The R gauge does not bounce back. It creeps.

**The Ancient's fragment** (only if the crew held or choreographed):

> *You cannot steal a period. You can only wear it. Something on the surface has learned the address without learning the courtesy. The category is: predation.*

**Horror beat.** The null-result line. The crew is shown, briefly, a rendering of the counterfeit's own log entry: `10:47–11:09 · fringe cluster · no response · NULL`. It did not notice it was refused.

---

### S7 — THE DISCRIMINATOR (70:00–80:00) · Lab

**Script.** Elena runs the envelope archive and builds a profile for manufactured chirplets.

**Sense-tasks.**
- NAVIGATOR + THEORIST, together: ten candidate features, pick six. The correct six are in §1. The decoys are the forger's copyables. The game scores the profile 0–6 and does not reveal the score.
- SYNAESTHETE runs the finished profile against the archive: every living chirplet since Ep 1 must classify living; the S3 chirplet must classify dead. False positives are shown; the crew may revise once.

**Decision gate.** File the profile where the crew can reach it fast / file it to upstairs too. Filing upward helps the Ep 7 brief and hands the forger's analysts a map of their own tells.

**Carry-forward.** Profile quality ≥ 5 → in Ep 6, at 11:48 under the storm, the Synaesthete's instrument recognises the cousin in under two seconds, automatically. Quality 3–4 → manual classification under storm pressure. Quality ≤ 2 → the cousin lands as a real coast call and the crew acts on a lie.

---

### S8 — THE BRIEF (80:00–88:00) · Halvorsen's screen

**Script.** The Observer must brief people who will hear "temporal weapon" and reach for procurement.

**Sense-tasks.**
- OBSERVER composes the brief from phrases: *unauthorised transmission · synthesised partner signal · temporal weapon · predation event · coercive cadence · no response required · recommend characterisation · recommend defensive capability.* Three slots. Every phrase has a downstream weight in Ep 7. "Temporal weapon" is accurate and is the phrase that funds the thing.
- THEORIST supplies the day's plot as an attachment if the crew choreographed: four timing marks in a row, laced tighter than any forger's clock. "You can steal a frequency. You can't steal a dance. The partners notice." Attaching it strengthens the defensive argument and reveals the lacing to upstairs.
- NAVIGATOR and SYNAESTHETE see the brief draft and may each add one line of dissent that goes on the record.

**Decision gate.** The brief. There is no clean version. Halvorsen looks at the plot for a long time; the game gives the Observer a long time too, un-timed, the only un-timed decision in the episode.

---

### S9 — BLACKOUT (88:00–end)

Ledger reconciliation. E, R, DEBT, the siege log with every response switch. VISIBILITY glyph: larger if they shielded or read toward it; unchanged if they held. TRUST: up for holding or choreographing, down for answering.

End card:

> *Nine days later, at 11:48 in the morning under a storm, Chen would recognise its cousin in under two seconds because of that file.*

Blackout. The counterfeit's `patienceMin` is set for Ep 6.

---

## 4. Save table

| State | Range | Consumed by |
|---|---|---|
| Material-assistance accepted | yes/no | Ep 6 (mesh is a resource in the storm) |
| Mesh placement quality | 0–3 | Ep 6 R cushion; Choreograph availability |
| Siege response log | sequence of Answer/Shield/Hold/Choreograph | COUNTERFEIT.learned; VISIBILITY; TRUST |
| Counterfeit `jitterModel`, `stopSemantics` | 0–3 / bool | Ep 6 cousin difficulty; Ep 8 demo realism |
| Discriminator quality | 0–6 | Ep 6 auto-detect threshold |
| Profile shared upward | yes/no | Ep 7 procurement speed |
| Brief phrases (3) | enum | Ep 7 opening posture; Procurement ending weight |
| Dissent lines on record | 0–2 | Ep 9 (read back at the end) |
| E, R, DEBT per human | — | Ep 6 opening state |

---

## 5. Engineering notes for the handoff (Ep 5 additions to the slice stack)

- `packages/discriminator/` — pure TS over `fft.js@4.0.4`. Deterministic. Unit-tested against synthetic living/dead chirplet generators (living = jittered intervals sd 5 ms, asymmetric attack/decay; dead = sd 0.3 ms, symmetric). Done when `classify` separates 1,000 of each with ≥ 99% accuracy and the interval-spectrum render shows the single-line signature.
- `apps/party` — `Counterfeit` state and the siege scheduler: a 22-minute fixed-schedule transmitter whose only inputs are the crew's responses. R curve is deterministic given responses; unit-test the four response paths.
- `apps/party` — Ep 1 tap-timestamp replay for S4 (the crew's own cadence at 40×). Requires the campaign save; if the slice has none, replay a stored fixture and note it.
- Beat engine addition: a second, slower "coast third-phase" pulse the crew must not tap on (S2). Scoring must penalise taps on the wrong pulse.
- The greyed abort macro: implement as a real control with a no-op handler and an analytics event, so playtests can measure how many times people press it.

## 6. Open design questions

1. Should Hold have a *visible* reward, or is the Ancient's fragment enough? (Recommend: fragment only. Rewarding restraint with points undercuts it.)
2. Does upstairs' "Respond to establish baseline" button appear on the Observer's phone only, or on everyone's? (Observer-only keeps the pressure social.)
3. Is the counterfeit's log shown in S6 a one-time reveal, or does its ledger become visible for the rest of the campaign? (One-time; let players wonder.)

*Next: Episode 6 — Last Stand — the storm, two peaks, and the bill.*
