# LAST STAND PROTOCOL — Episode 6: LAST STAND
## "The Day the Bill Arrived"
Design doc v0.1 · 2026-10-03 · Rimuru

---

## 0. Episode at a glance

| | |
|---|---|
| **Crew** | NAVIGATOR · SYNAESTHETE · THEORIST · OBSERVER (Halvorsen; Tanaka as NPC) · optional FIELD. |
| **Runtime** | 75–110 min. One day, 07:18 → 19:20, two storm peaks, one window each. The longest episode; the midpoint of the campaign. |
| **What players learn** | Debt is not a spring, it's a dashpot: it never fully cleared. Pooled escrow is the only path that isn't a clean no. A partner will pay for you if you let it. The bill is counted slowly, twice, out loud. |
| **What the game learns about them** | Whether they held the seam when the intruder arrived or aborted and let the valley hit the floor. Whether they opened the second window knowing the cost. Who they let pay. |
| **Horror thesis** | The sky over the eastern cut turns itself into geometry while something thirty million years old decides not to let go of a smaller mind, and the cost shows up two kilometres offshore as cells dividing wrong. |
| **Tone rule** | The storm is weather, not a monster. The dread is arithmetic: a model that was wrong on the kind side, and numbers read aloud in a quiet room. |

### Systems active (new in bold)

- **THE TAIL** (hidden until S1 reveals it): a hidden-accumulation term in every crew's debt since Ep 1. Recovery was never a simple exponential. Mechanically: a fraction of every cost since Ep 1 has been quietly summed; S1 shows the number. It is the VISIBILITY glyph's cousin and the campaign's second hidden ledger.
- **POOLED ESCROW ΣE** (three parties): human E + valley R-credit + coast stabiliser, under PRFP-18. Gates: ΣE ≥ 0.80, per-party ΔE ≤ 0.25, valley R ≥ 0.74 entering, coast must explicitly offer (quarter-phase sustained five minutes). Abort on any party's sag, any withdrawal, any human cost above seven.
- **THE X-FILE** (Theorist): a new Ledger section for things the crew cannot prove. The dead vowel's cousin becomes its second entry.
- ESCROW, R, DEBT, DISCRIMINATOR, COUNTERFEIT, VISIBILITY, TRUST carry from Ep 5.

### Inherited gates that fire this episode

| From | State | Effect here |
|---|---|---|
| Ep 5 S7 | Discriminator quality | ≥ 5: cousin auto-flagged at 11:48 in < 2 s. 3–4: manual, under pressure. ≤ 2: lands as a real call. |
| Ep 5 S2 | Mesh placement | Quality ≥ 2 gives +0.03 R cushion entering S6; Chen's ground spike in S5 extends it. |
| Ep 5 siege | `patienceMin`, `jitterModel` | How long the intruder stays inside the noon window; whether jitter still betrays it. |
| Ep 5 S8 | Brief phrases | "Temporal weapon" in the brief → Tanaka is in the room from S3 with procurement questions. |
| Ep 1–5 | All costs | Feed THE TAIL. |

---

## 1. New instrument: the Pool

The Theorist's screen gains a three-column gauge: HUMAN E · VALLEY R-credit · COAST stabiliser. The sum is ΣE. Each column has a cap line at 0.25. A window can open only when every gate glyph is lit:

```
ΣE ≥ 0.80   ●    R ≥ 0.74   ●    coast offer 5:00   ●    all parties present   ●    all parties willing   ●
```

Presence and willingness are not telemetry. They are the consent beat (Task 1) with a third pulse added: the coast's 173 ms stabiliser, rendered as a fast under-tremor the crew must *not* tap on, while the valley's slower scaffold (T₀ · 5.2 · 52) runs above the 520 ms beat. Three rhythms, one tap. The beat engine renders them as nested rings.

**Abort pre-armed.** Unlike Ep 5, this time there is an abort, and it works, and it is the hardest button in the game to press because pressing it means the valley hits a floor nobody has seen.

---

## 2. Scenes

### S0 — COLD OPEN (0:00–0:20)

Dual curves on black: human E climbing back in a neat exponential; valley R sagging under a weight nobody budgeted. The two lines diverge. Text:

> *It wasn't a spring. It was a dashpot.*

---

### S1 — THE TAIL (0:20–12:00) · 07:18, Observation Room

**Script.** Kp climbed overnight: 4.7 → 5.6 → 6.4. The valley's R fell in lockstep: 0.87 → 0.83 → 0.81 → 0.78. No new acts. No protocol violations. It took Sarah three hours to believe the panel.

**Sense-tasks.**
- THEORIST fits the recovery model. The game hands her PRFP-16's assumption (simple exponential, return to baseline in 6–8 h) and the real data. She drags a second term onto the equation: `Ė = κ_q · Q_lane − λ · e^(−t/τ)`. When the fit lands, **THE TAIL** reveals: a number, the crew's hidden accumulation since Episode 1, computed from their actual play. Every read past the horizon, every answer to the counterfeit, every act at gain, discounted but never cleared.
- NAVIGATOR: no reads offered. She tastes the morning: copper, thin. The band is quiet in the way a held breath is quiet.
- SYNAESTHETE: the valley's blue-silver is dimmer than yesterday by an amount he can measure on the overlay and nobody else can see.
- OBSERVER: receives the Kp forecast with a peak at 12:02 and a second shoulder at 17:52, and a message from upstairs: *Confirm the valley is stable.* It is not.

**Decision gate.** Sarah writes a rule in black, the colour for rules that don't bend: **No emergency act without escrow. Pooled or solo. No exceptions.** The Theorist player must sign it (one tap). From here the game enforces it mechanically: no window opens below the gate even if every player wants it to.

**Horror beat.** THE TAIL's number is shown next to the crew's names. Underneath, smaller: *This was always there.*

*Tech:* Rive equation-fitting instrument; dual-curve chart; THE TAIL computed server-side from the campaign save.

---

### S2 — THE REQUEST (12:00–20:00) · 08:40, Valley Timing Bench

**Script.** The valley sends an unambiguous REQUEST: HERE at the eastern cut; timing scaffold set to crest fourteen minutes before the modelled peak; screen-assist plus a closing-beat micro-act.

**Sense-tasks.**
- SYNAESTHETE reads the REQUEST and sees doubled pulses underneath: Elena thinks the coast is already in the scaffold. He must separate two interleaved cadences on the overlay (a drag-to-split task). Correct split → the crew knows a third party is offering before anyone proposes it.
- THEORIST runs the solver with two parties: screen-assist at Kp 7.2, micro-act at the closing beat. Verdict: cost 0.38–0.52. They have 0.84. Worst case leaves 0.32. Below every threshold they own.
- NAVIGATOR: at the facility, her receptors climb to 5.5 and steady. Not a spike. A brace. She may log it or not.

**Decision gate.** None yet. The crew sees the arithmetic and the game lets it sit.

---

### S3 — THE CONFERENCE WALL (20:00–34:00) · 09:12

**Script.** Halvorsen takes the back corner like ship's steel. Tanaka reads diagonals with her arms folded. "You're proposing a new protocol fifty minutes before a storm peak."

**Sense-tasks.**
- THEORIST drafts **PRFP-18 — Tri-Party Coordination** from chips: presence gates, pooling gate, per-party caps, roles, hard aborts. The chips are Chen's sketch from the book, and the game marks it honestly: *It's not a protocol. It's a guess dressed as algebra.*
- SYNAESTHETE supplies the hypothesis: valley — sweep and content; human — screen assist and closing acknowledgment; coast — 173 ms stabiliser, phase hygiene not content. He must assign the three roles correctly; swapping any two makes the pool fail at gate.
- OBSERVER (Halvorsen) decides what goes upstairs: *proposing tri-party pooled escrow* / *proposing emergency assist* / *recommending no action*. Tanaka, if present because of Ep 5's brief, asks the procurement question once: "If the coast can stabilise a window, can it be made to?" The Observer answers on the record.
- NAVIGATOR argues the coast is already offering. The game gives her the doubled-pulse evidence only if S2's split succeeded.

**Decision gate.** Two-party (refused by the gate; the game shows the floor), tri-party (requires the coast's explicit offer in S4), or no action (valley hits a floor it has never hit; the episode continues, colder; the second peak is harder).

**Horror beat.** Sarah's line: "If we do help and the model's wrong on the high side, we hit floors nobody's ever seen." The game has just told the players the model *is* wrong on the high side. In S1. They know. They go anyway, or they don't.

---

### S4 — THE OFFER (34:00–42:00) · 10:36, Facility Intake

**Script.** For the coast to be a party, it must offer: quarter-phase, sustained five minutes. Nobody can ask it to.

**Sense-tasks.**
- NAVIGATOR watches the intake band with the deep read *available but wrong*: reading toward the coast to see if it will offer is exactly the kind of reaching that makes a thing feel compelled. The game offers the read brightly. Taking it costs TRUST −2 and the offer arrives anyway, tainted (gate lights amber, not green).
- One minute. Two. Her receptors hold at 5.5. Chen's whisper from the ridge: "No identifier. No ACK. Just the slot." Three. Four. On the Theorist's whiteboard, small drawn teeth, one per minute: the game makes her draw them, because ritual keeps the human system from tearing itself. Five. The chirplet.

**Decision gate.** Wait the full five minutes without reading. The timer is real. Phones go quiet. This is the game's longest intentional silence outside S6 of Ep 5.

**Horror beat.** The offer, when it comes, is a quarter-phase hold so steady it reads as a held hand.

---

### S5 — THE RIDGE (42:00–50:00) · 11:02, E-Cut Ridge

**Script.** The wind carries the iron smell storms wear before they show their teeth. Chen drives the low-ohm ground spike, walks six metres of copper mesh along the old power-line scar, ties in. Baseline: a trembling tenth of an ampere. Noise and air.

**Sense-tasks.**
- SYNAESTHETE (or FIELD): place the spike and mesh in 3D along the scar; box2d-wasm for the drive, mapgen4 terrain. Reuses Ep 5's mesh if quality ≥ 2 (the game literally loads the Ep 5 placement). The sentinel gives the identifier from the cedar snag: 702 Hz, 188 ms. He must confirm it by ear-colour before the window.
- THEORIST pre-arms abort. Writes "Band-integrity watch armed. Pooled escrow covers it — barely, and honestly." The game checks ΣE against the gate and shows the margin: typically 0.02–0.06. Barely is a number.
- NAVIGATOR: "All parties present. All parties willing." The consent beat, three rhythms nested, all seats.

**Decision gate.** Open the window at 11:48 or stand down. Standing down is allowed and the valley pays alone. The game does not editorialise.

---

### S6 — NOON (50:00–66:00) · 11:48:00, Observation Room, real time

**Script.** "Window hot. PRFP-18 alpha. Abort pre-armed." T = 1 s. Chen energises the screen at minimum. The valley sweeps. The coast holds quarter-phase underneath. It is beautiful the way beginnings are beautiful, for about four minutes.

**The intruder.** At T + 4:10 a chirplet enters the window from the east-southeast. Not at the edge this time. Inside. Wearing the Ancient's rhythm like a coat. Attack too clean. Decay too tidy.

- Discriminator quality ≥ 5: the Synaesthete's instrument flags it in under two seconds, automatically, with the Ep 5 profile's reasons listed. Players have ~8 s to decide.
- Quality 3–4: the instrument shows the waveform and waits. The Synaesthete classifies by hand while E drains.
- Quality ≤ 2: no flag. The crew keeps the seam closed around a counterfeit until the drain itself tells them.

**Sense-tasks.**
- THEORIST holds the seam closed: a sustained press that burns E at an accelerating rate once the intruder is inside. The gauge shows 0.19 spent in nineteen seconds — an act's full budget in two-thirds of a window. Her other hand is on abort.
- SYNAESTHETE: at the drain's worst his overlay whites out. **Synesthetic shutdown, total, mid-act.** His screen goes to a flat grey with one line: *forty minutes to the first wash of returning colour.* He is out of the window. He can still tap the beat; he cannot see.
- NAVIGATOR: receptor overload with cross-channel affect. She feels the Ancient's grief through the channel — the game renders it as her instrument's taste readout saturating in a colour it has never used, and the branch field, uninvoked, showing a single stream: the Ancient paying. She may say one line to the crew. The wheel offers four; one is *"We did not ask you here to watch you drown."*
- OBSERVER: the abort is also on her screen. Upstairs says *abort*. Twice.

**Decision gate — the only one that matters in the episode.** HOLD the seam (crew burns to the floor; the valley does not hit 0.69 alone; the Ancient pays; cost shows up in S7 as a mutational bloom two kilometres offshore) or ABORT (crew keeps E above 0.40; the valley hits R 0.69 at 12:04:58 alone; the Ancient does not pay; the sky does not turn to geometry). Neither is clean. Holding is the book. Aborting is defensible and the game treats it as such.

**Horror beat (hold path).** 12:03:41. The sky over the eastern cut turns itself into geometry. Ridge cameras first; then Chen — blind in colour, not in light — simply looks up. The aurora rendered as mandelbulber-baked fractal video blended with the Gray-Scott field, no sound, 11 s. The Ancient did not withdraw. It paid. The grip tightening. The floor refusing.

**Tech.** Real-time seam-hold with server-authoritative drain; Synaesthete shutdown as a server-pushed instrument lockout; counterfeit intrusion driven by Task 5 state (`jitterModel` decides whether the jitter tell survives; `patienceMin` decides how long it stays inside).

---

### S7 — THE LEDGER OF DAMAGE (66:00–78:00) · 13:00

**Script.** They counted what it had cost the way you count after a wreck: slowly, twice, out loud.

**The counting ritual (all seats).** Each line of the Ledger appears one at a time. It is not confirmed until every player taps it. Twice. The game does not let anyone skip ahead.

- Human: E spent 0.19 in nineteen seconds. Chen: synesthetic shutdown, total, mid-act; forty minutes to first colour; afterimages 8/10, now 6. Elena: receptor overload with cross-channel affect — Sarah writes *cross-channel affect* because the ledger was designed for facts, and the fact was that Elena had cried another being's grief — now 4/10 and level. Sarah: eyes 6/10, hands *steady*, which was true the way load-bearing things are true.
- Valley: R floor 0.69 at 12:04:58 (hold path: 0.72; the Ancient's payment bought 0.03).
- Coast (hold path only): Elena's cultures. Mutational bloom. Every culture drawn from the intake between 11:48 and 12:10. Chromosomal instability markers lighting the assay like a city seen from altitude. Nearshore buoy chlorophyll streak, two kilometres, already fading.

**Decision gate.** The X-file. Sarah writes the cousin as its second entry: *signature class: manufactured chirplet, envelope too clean. We will see this hand again.* Tanaka: "Can you prove who?" "No. Not today." The Observer may add a line.

**Horror beat.** The coast's line in the Ledger is the first time the campaign shows a cost paid in cells by something that volunteered. The game shows the assay. No commentary.

---

### S8 — THE CONFERENCE WALL, AGAIN (78:00–86:00) · 15:40

**Script.** "They spent us." Debt lands where the coherence lives.

**Sense-tasks.**
- OBSERVER must answer upstairs' two questions: *Who?* and *Can it be prevented?* The honest answers are *no* and *not by us alone.* The Observer's chips include dishonest answers that buy time.
- THEORIST drafts **PRFP-18 Rev A — THE LAST STAND PROTOCOL**: the alpha plus band-integrity watch, intruder abort (now that the Discriminator has a confirmed second signature), and a new gate: *no window opens unless the valley asks twice.*
- NAVIGATOR and SYNAESTHETE (returning colour) give their 1–10 numbers for the Ledger. The game requires them to be honest: any human cost above seven aborts the second window by rule. Lying low is possible. It is recorded.

**Decision gate.** Whether to be available for a second peak at all.

---

### S9 — THE SECOND PEAK (86:00–104:00) · 16:52 → 17:52

**Script.** At 16:52 the valley sends a single unsolicited pulse. Not the identifier. Not ACK. The scaffold — T₀, 5.2, 52 — rebuilt slowly, like a body testing a mended bone. They are being asked again. The second shoulder is due at 17:52.

**Sense-tasks.**
- All seats: the gate glyphs, one by one. ΣE after the noon bill is lower; the margin is thinner; "barely, and honestly" is now a smaller number. The valley must ask twice (Rev A). The coast must offer again. The crew must be present and willing with their *real* numbers.
- The consent beat at the thousand-times mark: 17:51:30. Three nested rhythms. Everyone who lied about their cost in S8 finds the beat tolerance tightened by the game (±100 ms instead of ±150) — the body keeps the Ledger even when the Theorist didn't.
- SYNAESTHETE: if the window holds, the blue-silver comes back all at once, the whole valley lighting up in his overlay like a city returning after a blackout. The game gives him a private moment: his screen only, 3 s, then the overlay note *some data is not for the log.*

**Decision gate.** Open or stand down. If opened cleanly: TRUST +4 (all partners), R recovers toward 0.80, the Last Stand Protocol is named for the record. If stood down: the valley survives the second peak alone at a lower floor; TRUST unchanged; the episode ends honest.

**Horror beat.** None. The second peak is the episode's one mercy, and only if it is earned.

---

### S10 — BLACKOUT (104:00–end) · 19:20, Facility Intake

Elena at the intake. Water 3.3 °C. Receptors 4/10 and level. The Ledger closes with THE TAIL's number updated — larger. VISIBILITY glyph larger if they aborted (abort is loud) or read toward the coast in S4. Smaller change if they held.

End card:

> *They spent us.*

Then, lower, only on the hold path:

> *It paid.*

---

## 3. Save table

| State | Range | Consumed by |
|---|---|---|
| THE TAIL (revealed value) | number | Ep 7 (procurement argues the tail is "unsustainable"), Ep 9 |
| Noon decision | hold / abort | Ep 7 opening posture; Ep 8 coast behaviour; Breach ending weight |
| Coast cost (bloom) | yes/no | Ep 8 (the ocean's withdrawal has a reason) |
| Discriminator fired automatically | yes/no | Ep 7 credibility of the X-file |
| X-file entries | 2 + Observer line | Ep 7, Ep 9 read-back |
| Human cost honesty | truthful / under-reported | Beat tolerance for the rest of the campaign |
| Second peak | opened clean / stood down | TRUST; valley R floor entering Ep 7 |
| PRFP-18 Rev A named | yes/no | Title drop; Ep 9 |
| ΣE, R, DEBT per human | — | Ep 7 opening state |

---

## 4. Engineering notes (additions to the slice stack when this episode is built)

- **Pool gauge + gates**: server-side gate evaluator; the window command refuses below gate regardless of client intent.
- **Three-rhythm beat**: extend Task 1's schedule with two auxiliary pulses (valley scaffold, coast 173 ms tremor) that must *not* be tapped; scorer penalises wrong-pulse taps.
- **Seam-hold drain**: sustained-press input with server-authoritative accelerating cost; intruder entry driven by `packages/counterfeit` with `patienceMin` → in-window dwell.
- **Instrument lockout**: server can push `instrument:lockout { role, durationMs, reason }`; client renders the grey screen and the single line.
- **THE TAIL**: a pure function over the campaign save (`tail(save) → number`), deterministic, with fixtures from Ep 1 and Ep 5 saves.
- **Counting ritual**: a Ledger-line confirmation protocol (every seat, twice) reusable for every episode's blackout.
- **Aurora**: pre-baked mandelbulber sequence as video texture, 11 s, blended with the live Gray-Scott field; no runtime fractal rendering.

## 5. Open design questions

1. Should ABORT at noon be visibly punished (the valley's floor shown live), or only recorded? (Recommend: shown live, no commentary. The number is the punishment.)
2. Is Chen's 40-minute shutdown real-time (40 min of grey screen for one player) or compressed to the S7 ritual? (Recommend: real-time *within S6* — about 90 s — then compressed; the player should feel being out of the window, not the whole afternoon.)
3. Does THE TAIL ever clear? (Recommend: no. It is the campaign's thesis in a number.)

*Next: Episode 7 — Convergence — procurement, and the crew's chance to build a when of their own.*
