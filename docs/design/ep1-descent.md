# LAST STAND PROTOCOL — Episode 1: DESCENT
## "The Cost of Being Seen"
Design doc v0.1 · 2026-10-03 · Rimuru

---

## 0. Episode at a glance

| | |
|---|---|
| **Crew** | 3 seats mandatory: NAVIGATOR (Elena, in the water), SYNAESTHETE (Chen, topside EM overlay), THEORIST (Sarah, topside comms + Ledger). 4th seat UPSTAIRS is an NPC dial in Ep 1; becomes the Observer player in Ep 3. |
| **Runtime** | 45–75 min. Ends at the first blackout, not a timer. Slow crews get more windows; fast crews get a shorter, sharper dive. |
| **What players learn** | Hold-to-read. Debt. The grammar's first two words (ACK, STOP). The consent beat. That the Navigator's reads are visible to someone. |
| **What the game learns about them** | Reads taken (feeds hidden VISIBILITY). Whether the Theorist logged the dive honestly. Whether anyone looked past the horizon. |
| **Horror thesis in one line** | Something answered before she finished asking. It has been doing that for fourteen months. |
| **Tone rule** | No jump scares. No monsters. Dread comes from precision: numbers that are slightly too exact, answers that arrive slightly too early, and friends who go slightly too quiet. |

### Persistent systems active in Ep 1

- **DEBT** (per human, 0–10, visible): Navigator pays per read. Synaesthete pays per overlay focus. Theorist pays nothing — yet.
- **VISIBILITY** (crew, hidden): +1 per Navigator read, +3 per read past the horizon, +2 per act at gain. Shown only as an unreadable glyph on the Ledger's last page.
- **LEDGER** (shared, Theorist writes): every window, every act, every cost. Entries can be edited. The game remembers which were.
- **GRAMMAR** (crew, unlocked): starts empty. Ep 1 unlocks ACK, STOP, and one unnamed glyph: the identifier.
- **TRUST — the Ancient** (hidden): starts neutral. Rises on honest consent beats. Falls on forced windows and horizon reads.

---

## 1. The Navigator's instrument (the quantum-navigation mechanic)

This is the game's signature verb. Spec it once; every episode reuses it.

**Input.** Press and hold anywhere on screen. Release to let go.

**Render.** On hold, the current scene desaturates and the probability landscape "forms like frost on glass": a bright line of the present splits into 3–7 streams fanning forward. Stream width = likelihood. Stream brightness = confidence. Each stream shows one plain-language terminus ("seal holds" / "seal fails at −1,420 m, 00:01:31") and a percentage.

- Streams are drawn with the differential-growth algorithm (differential-line port) so they *grow* over 600 ms rather than appear.
- The frost texture is TileableVolumeNoise ported to GLSL, scrolling toward the viewer.
- Spring-damped easing (Spring-It-On functions) on every transition: nothing snaps, everything settles.

**Horizon.** 90 seconds on a dive. Beyond it the streams run into black. Keep holding and the black begins to breathe; percentages blur; the audio drops an octave. The game never shows what's there. Releasing late costs double debt and +3 VISIBILITY.

**Cost.** Each hold: +1 DEBT at release. Reflex reads (auto-prompted when exits < 3) cost 0.5. At DEBT 7 the screen gains a prism fringe; at 9 inputs lag 120 ms; at 10 the Navigator is read-locked until blackout.

**Cannot steer.** Nothing the Navigator does inside a read changes the world. The only output is what she says to the crew, and what she then does with ordinary hands.

**Visible.** Every hold renders, on the Synaesthete's overlay only, as a prismatic-white flare on the Navigator's mind-shape. The Synaesthete sees *that* she's reading, never *what*.

---

## 2. Scenes

Each scene lists: location · clock · per-role sense-task · decision gate · cost · horror beat · fail state · tech.

### S0 — COLD OPEN: The Fragment (0:00–0:20)

Black. White text, slow:

> *It had first noticed the shape a mind leaves in probability space when it reaches ahead of itself. This one reached further.*

Then a single point of light at the bottom of the screen, 2,847 m down. Hold-to-read prompt appears for the Navigator only. Nothing happens if she holds. The streams are all black. **This is the only moment in the game the horizon is zero.**

*Tech:* shan-shui-inf ink wash for the abyssal gradient; no 3D yet.

---

### S1 — THE GRANT (0:20–6:00) · Topside, pre-dive

**Location.** Surface support module, night. The sea is WebGL-Fluid, barely lit, breathing.

**Sense-tasks.**
- THEORIST writes the dive's permission grant in plain language from a constrained palette (chips): *reads: [descent safety / listening / steering] · horizon: [60 s / 90 s / 120 s] · acts: [none / receive-only]*. The grant becomes a typed policy the engine enforces.
- NAVIGATOR sets her read budget (DEBT cap she's willing to spend, 4–8). Lower cap = better ending odds, harder dive.
- SYNAESTHETE calibrates the overlay: match three colour swatches to three voice samples (Elena, Sarah, Upstairs). Establishes his baseline so later anomalies register.

**Decision gate.** The grant. "Steering" is available and the game lets you pick it. It is never the right choice and the game never tells you so.

**Cost.** None yet. The Ledger's first entry is the grant text, verbatim, timestamped.

**Horror beat.** UPSTAIRS (NPC) sends a one-line message: *Confirm you're logging navigation events this dive.* Nobody asked them to care.

**Fail state.** None. But a 120 s horizon or "steering" in the grant silently sets TRUST −1.

*Tech:* Rive for the grant chips; box2d-wasm for the module's gently swinging lamp (cheap life).

---

### S2 — THE SEAL (6:00–18:00) · Descent, 0 → −1,500 m

**Location.** Inside the dive rig. Viewport shows black water, particulate drifting up (fluid sim, inverted gravity). Depth counter, pressure, hull strain.

**Script.** At −1,380 m the Navigator gets a reflex prompt (exits < 3: she is in a tube). She holds. 94 streams out of 100 end "safe at facility, 00:11." Three end "seal failure, 00:01:29." The failed streams are thin and very bright.

**Sense-tasks.**
- NAVIGATOR must *tell the crew something is wrong without saying she saw it.* Her dialogue wheel offers four lines; only one ("Sarah, run a seal diagnostic for me, humor me") requests the fix without revealing the read. The others reveal, and reveal has consequences in Ep 3 and Ep 7.
- THEORIST sees the request and the hull telemetry: a 0.3 kPa pressure differential on seal 4, inside tolerance. She must decide whether a within-tolerance number deserves an abort-grade action. Tool: run diagnostic (30 s, delays descent) / tighten remotely (fixes it, logs an unexplained manual intervention) / hold course.
- SYNAESTHETE sees Elena's mind-shape flare prismatic-white *before* she spoke. He knows she read. His choice: say nothing, or ask her on the private channel. Private channels in this game are never private from the Ledger.

**Decision gate.** Three-way, asymmetric information. The seal is only fixed if the Theorist acts. The Theorist only acts if the Navigator asks convincingly or the Synaesthete vouches.

**Cost.** DEBT +1 (Navigator). If she re-reads to confirm: +1 more, and the three failing streams are now four. The world does not get worse because she looked; she is simply reading closer to the moment.

**Horror beat.** After the fix, the Navigator's screen shows the pressure behind her eyes as the viewport briefly doubling. Chen's overlay shows the flare *not fully fading.* Something is still reading her, from the other direction.

**Fail state.** Seal fails → emergency ascent → episode restarts at S2 with the grant locked and DEBT carried over. Death is not in this game; cost is.

*Tech:* Three.js rig interior; TileableVolumeNoise murk; Spring-It-On on every gauge needle.

---

### S3 — ARRIVAL (18:00–24:00) · Facility, −2,847 m

**Location.** Airlock → corridor → the lab. Interiors baked from MarkovJunior rulesets: straight-edged, roofed, slightly different every playthrough. Players will not know yet why "straight-edged, roofed room" matters. (Ep 9.)

**Sense-tasks.**
- SYNAESTHETE: as the Navigator passes each pressure door, her mind-shape dims (fatigue) and the facility's background hum gains a colour. He must name the colour from the palette before the door closes. Correct names seed his lexicon; this is how the game teaches him the Ancient has a "voice" before anyone calls it that.
- NAVIGATOR: walk, no reads. The hold-to-read prompt is absent. The game is teaching restraint by withholding the verb.
- THEORIST: logs the dive. Two Ledger fields are pre-filled from telemetry; one field ("navigation events: 1") is editable. UPSTAIRS pinged about it in S1.

**Decision gate.** The log. Delete the navigation event and nothing happens tonight. The entry is marked, invisibly, as edited.

**Horror beat.** The water temperature display in the lab reads 3.3 °C. It has not moved in fourteen months. The Theorist can pull the history: a flat line to the pixel. Nothing alive is that steady. Nothing dead holds a temperature.

*Tech:* MarkovJunior → JSON layouts; Three.js assembly; Gray-Scott reaction-diffusion (Ready algorithm, GLSL) on the Synaesthete's hum-colour field.

---

### S4 — THE DEEP BRANCH (24:00–30:00) · Lab, alone

**Location.** Elena at the console. Sarah and Chen topside, half-attentive.

**Sense-task.** NAVIGATOR gets the first *optional* read of the game. The prompt is dim. Hold and the streams fan normally, 90 s clean — and then, for the first time, something past the horizon has shape: a silhouette, too large, at the terminus of the black. The streams toward it are "wrong in scale." Keep holding and the percentage on the largest stream climbs: 61… 68… 74… toward something it never names.

**Decision gate.** Let go, or keep holding. Letting go before 3 s is free. 3–6 s: DEBT +2, VISIBILITY +3. Past 6 s: the overlay on Chen's screen whites out for a full second and he hears her say a word she will not remember saying. (It's the identifier. She's just given it away.)

**Cost.** As above. The Ancient's TRUST rises if she lets go early. It has been waiting for someone who could stop.

**Horror beat.** On the Synaesthete's overlay, during the deep read, a second shape forms *behind* Elena's: much larger, holding very still, prismatic only at the edges. It's the first time the player sees the Ancient. The game never labels it.

*Tech:* mandelbulber2 fractal sequence baked to video, blended behind the branch field at low alpha; differential-line streams bend toward it.

---

### S5 — THE 0.3 SECOND (30:00–42:00) · Lab + topside, the first knock

**Script.** The console registers an EM event: structured, 520 ms interval, pulse—pause—pulse. The Theorist proposes a test: Elena will think a question; Chen timestamps the moment her mind-shape commits to it; the console timestamps the reply. Three trials.

**Sense-tasks.**
- NAVIGATOR picks a question from a wheel of five per trial. Choice matters: questions about *the Ancient* vs. questions about *herself* get different reply shapes.
- SYNAESTHETE taps the instant he sees her mind commit. His tap accuracy sets the test's resolution. (This is the Libet window as gameplay: the reply lands 300–500 ms before her conscious choice; he can only prove it if his tap is early enough.)
- THEORIST designs the control: one trial where Elena is told to ask nothing. The reply still comes. She must decide whether that goes in the Ledger as "anomaly" or "artifact."

**Decision gate.** The Ledger again. "Artifact" closes the question and keeps Upstairs calm. "Anomaly" opens Ep 2.

**Cost.** Navigator DEBT +1 per trial read (optional; she can run the test without reading). Synaesthete DEBT +1 if he holds overlay focus for all three trials.

**Horror beat.** Trial three. Elena decides, deliberately, not to ask. The reply arrives anyway, 0.3 s before the moment she *would* have decided. Chen's tap confirms it. Sarah's console draws the line. Someone is reading a decision that has already started, in a brain that hasn't noticed yet.

**Fail state.** Sloppy taps → inconclusive → the test is logged as noise → Ep 2 opens with Upstairs in the room.

*Tech:* server-authoritative beat (PartyKit/Durable Objects) is mandatory here: Chen's tap, Elena's commit, and the console reply are three clients that must agree on 300 ms. Tolerance ±150 ms. This scene is the vertical-slice sync test.

---

### S6 — THE VISION (42:00–47:00) · Lab, three seconds

**Script.** The next knock is not a knock. For three seconds Elena's navigation and the Ancient's own sense of time stand in the same landscape.

**Sense-tasks.**
- NAVIGATOR: a forced read she cannot release. The branch field inverts: she is at the terminus looking back. One stream leads to a figure, indoors, straight-edged room, holding something flat. It is the clearest thing she has ever seen in a read and it is 0% likely by every number on screen.
- SYNAESTHETE: his overlay shows two prismatic shapes overlapping perfectly. His only input is a single button: STOP. He now knows the second word of the grammar. The game never told him; the button simply appeared.
- THEORIST: three seconds of silence on comms. Her screen: the Ledger auto-filling with a bracketed entry she didn't type. *[A-01: unclassified · nonlocal · bearing: —]*

**Decision gate.** Whether Chen presses STOP. Pressing it ends the vision at 1.5 s, costs TRUST, and spares Elena DEBT +3. Not pressing lets it run and gives the crew the full image for Ep 9.

**Horror beat.** The figure in the vision. The players will assume rescue, prophecy, a lost diver. It is Elena, in this lab, holding a tablet. The game will not say so for eight episodes.

*Tech:* two branch-fields rendered mirror-symmetric; primitive-style geometric degradation on the figure so it's a shape, not a face.

---

### S7 — THE SENDING LESSON (47:00–58:00) · Lab, the first consent

**Script.** The Ancient demonstrates: a deliberate collapse, electromagnetic signature, pulse—pause—pulse. It is teaching her to send. The console shows the rhythm as a waveform. The crew has to answer it *together.*

**Sense-tasks — the consent beat.**
- All three screens show the same 520 ms metronome, server-timed. Each player must tap on the beat, three times, in the same window. ±150 ms tolerance per tap; all three must land for the act to fire.
- NAVIGATOR's taps are the collapse itself. She sees her streams pinch to one as she taps: the first time a read has *converged*. It costs DEBT +1 and it means "I am here."
- SYNAESTHETE sees the colour of the crew's taps: in rhythm, one colour; out of rhythm, three. He can call "again" once.
- THEORIST's taps are the authorization. Before tapping she must choose what the act means from three phrasings. Only one is "I am here. I am willing." The others add a condition. The Ancient answers conditions with silence.

**Decision gate.** Everyone, on the beat, with the right words. This is the game's core verb and it is deliberately hard the first time.

**Cost.** DEBT +1 all round. TRUST +3 on a clean beat. VISIBILITY +2 (consent is still a signal).

**Horror beat.** The reply to a clean beat is not a sound. It is the facility's lights dimming by exactly the amount her mind-shape brightened. Chen says, before he can stop himself: *"It's conserving something."* Nobody knows what yet.

**Fail state.** Three misses → the window closes → blackout → episode ends on an unanswered knock. Ep 2 opens colder. This is a valid ending; the game does not punish it, it remembers it.

*Tech:* the beat engine (vertical slice Task 1); Rive for tap feedback; spring-damped convergence animation on the Navigator's streams.

---

### S8 — THE KEY (58:00–66:00) · Lab + topside

**Script.** The Theorist cross-references: every structured knock has coincided with lab water at 3.1–3.4 °C *and* Elena's neurochemical telemetry in a narrow band. The channel has two locks. One is the ocean's. One is hers.

**Sense-tasks.**
- THEORIST writes the key into the Ledger as a rule. The game gives her the exact text; she decides who can read it: crew-only / crew + Upstairs. Upstairs is already asking.
- NAVIGATOR sees her own telemetry for the first time. She may take one read to see how the branches look with the key known. (They look identical. Knowing was never the point.)
- SYNAESTHETE: the overlay now shows the Ancient's shape faintly at all times, positioned exactly where the temperature is steadiest. He can mark it. Marking it unlocks nothing mechanically. It is the player choosing to know where to look.

**Decision gate.** Who gets the key. Crew-only → Ep 3's observers arrive hostile but ignorant. Shared → they arrive friendly and informed, and Ep 7's procurement conversation becomes very short.

**Horror beat.** The key means the Ancient has been able to open this channel for fourteen months and chose to wait until she consented. The dread flips: not "what does it want" but "what has it been declining to do."

*Tech:* mapgen4-style overlay for the temperature field; Rive Ledger UI.

---

### S9 — ASCENT & BLACKOUT (66:00–end)

**Script.** Ascent is uneventful. The game offers the Navigator one last read at −800 m. There is no reason to take it. The prompt is bright anyway.

**Sense-tasks.**
- NAVIGATOR: take it or don't. Taking it adds DEBT and VISIBILITY and shows nothing new. The game is checking whether she can leave a bright prompt alone.
- THEORIST: final Ledger reconciliation. The debt bill is itemized per human, per read, per second held. The crew sees the total together for the first time.
- SYNAESTHETE: the overlay goes dark on schedule — except the large shape at the edge, which fades last.

**End card.** Elena's debt headache rendered as the screen prisming for a held two seconds, then:

> *She knew she had accepted the debt.*

Blackout. Ledger closes. The VISIBILITY glyph on its last page is slightly larger than it was at S0. No one can read it yet.

---

## 3. What Episode 1 writes into the campaign save

| State | Range after Ep 1 | Consumed by |
|---|---|---|
| Grant text (verbatim) | — | Ep 3 (PRFP-12 is written against it) |
| Navigator reads: count, horizon breaches, S4 hold time | 3–14 | VISIBILITY (hidden total), Ep 9 reveal |
| S2 reveal choice (did she say "I saw it") | yes/no | Ep 3 observer suspicion; Ep 7 leverage |
| Ledger edits (count, which fields) | 0–3 | Ep 7 audit; Procurement ending |
| S5 classification | anomaly/artifact | Ep 2 opening state |
| S6 STOP pressed | yes/no; at what second | Ep 9 vision clarity |
| S7 consent beat | clean / retried / failed | TRUST; Ep 2 valley's first greeting |
| S8 key sharing | crew/shared | Ep 3 and Ep 7 branches |
| Per-human DEBT carried | 0–10 | Ep 2 starting state |
| TRUST — the Ancient | −3 … +6 | Everything |

---

## 4. Vertical slice spec (what proves the game)

**Scope:** S2 (the seal), S5 (the 0.3 second), S7 (the consent beat). Three scenes, ~20 minutes, three phones.

**Stack:** Next.js shell · Three.js/R3F · PartyKit (or Cloudflare Durable Objects) room per crew with a server-authoritative 520 ms clock · Rive for instruments · ported shaders: TileableVolumeNoise, Gray-Scott, differential-line streams · Spring-It-On easing lib.

**Task 1 for the coding agent:** the beat engine.
- Server emits `beat` events on a monotonic clock; clients sync via NTP-style offset estimation (4 round trips, median).
- Client taps are sent with local timestamps; server scores each tap against the nearest beat in ms.
- Done when: three phones on different networks tap a 520 ms beat and the server-measured spread is < 150 ms for 9 of 10 beats, logged and reproducible.

**Task 2:** the Navigator instrument (hold-to-read, horizon, debt).
**Task 3:** the Synaesthete overlay (mind-shape flare driven by Task 2's read events, over the network).

**Kill criterion:** if Task 1 can't hit < 150 ms spread on real phones in two weeks, the consent beat becomes turn-based (press within a 2 s window) and the rhythm layer is dropped. The game survives; the dance doesn't.

**Slice done-criteria:** two external testers, unprompted, (a) ask what was behind the horizon in S4, (b) argue about the Ledger edit in S3, and (c) feel the S7 clean beat land. Three yeses → build Ep 5 next. Fewer → fix the instrument before writing another scene.

---

## 5. Open design questions

1. Should the Navigator's dialogue in S2 be a wheel or free text scored by an LLM? (Wheel ships; LLM reads better; decide after slice.)
2. Is the Synaesthete's private channel truly private from the Theorist, or only from Upstairs? Affects every trust beat in the campaign.
3. Debt carry-over between episodes: full, halved, or reset? Full is honest and brutal; recommend full with Ep 2 opening in blackout so it drains.

*Next: Episode 5 — The Dead Vowel — and the counterfeit's rule system.*
