import { HORIZON_MS, PROJECTION_RATE_DEFAULT, type BranchSet, type Option, type S5QuestionKind } from "@lsp/protocol";

/**
 * Episode 1 content for the slice (docs/design/ep1-descent.md §2: S2, S5, S7). Lines the design
 * doc gives verbatim are quoted as written; the rest was written for the slice and is flagged
 * in the Task 3 report for the design side. Ids carrying rules live in @lsp/protocol scene.ts.
 */

// ---------------------------------------------------------------------------
// S2 — the seal

/** The Navigator's wheel. Only "humor-me" asks for the fix without revealing the read. */
export const S2_NAV_LINES: readonly Option[] = [
  { id: "humor-me", text: "Sarah, run a seal diagnostic for me, humor me." },
  { id: "i-read-it", text: "I read it. The seal goes at minus fourteen-twenty." },
  { id: "seal-four", text: "Something is wrong with seal four. I saw it." },
  { id: "abort", text: "Abort the descent. I know what I'm looking at." },
];

export const S2_SYN_CHOICES: readonly Option[] = [
  { id: "silent", text: "Say nothing." },
  { id: "ask-elena", text: "Private channel to Elena: \"Did you just read?\"" },
  { id: "vouch", text: "To Sarah: \"She read. Act on it.\"" },
];

export const S2_TOOLS: readonly Option[] = [
  { id: "diagnostic", text: "Run diagnostic (30 s, delays descent)" },
  { id: "tighten", text: "Tighten remotely (logs a manual intervention)" },
  { id: "hold-course", text: "Hold course" },
];

export const S2_TELEMETRY = { seal: 4, differentialKPa: 0.3, tolerance: "inside tolerance" } as const;

/** The re-read to confirm: "the three failing streams are now four" (design S2, Cost). */
export const S2_CONFIRM_BRANCHSET: BranchSet = {
  t: "branchSet",
  horizonMs: HORIZON_MS,
  projectionRate: PROJECTION_RATE_DEFAULT,
  streams: [
    { p: 0.92, confidence: 0.92, label: "safe at facility, 00:11", terminalMs: 660_000 },
    { p: 0.02, confidence: 0.98, label: "seal failure, 00:01:29", terminalMs: 89_000 },
    { p: 0.02, confidence: 0.98, label: "seal failure, 00:01:29", terminalMs: 89_000 },
    { p: 0.02, confidence: 0.98, label: "seal failure, 00:01:29", terminalMs: 89_000 },
    { p: 0.02, confidence: 0.98, label: "seal failure, 00:01:29", terminalMs: 89_000 },
  ],
};

// ---------------------------------------------------------------------------
// Interlude — S3 and S4 are not played in the slice; one dated card each.

export const INTERLUDE_CARDS: readonly { title: string; text: string }[] = [
  { title: "18:00 — ARRIVAL", text: "Airlock, corridor, the lab. Straight-edged, roofed, slightly different from the drawings. The water temperature display reads 3.3 °C. It has not moved in fourteen months." },
  { title: "24:00 — THE DEEP BRANCH", text: "Elena alone at the console. The first optional read of the game. Nobody will say what she saw past the horizon." },
];

// ---------------------------------------------------------------------------
// S5 — the 0.3 second

export const S5_QUESTIONS: readonly (Option & { kind: S5QuestionKind })[][] = [
  [
    { id: "q1-what", text: "What are you?", kind: "ancient" },
    { id: "q1-wait", text: "How long have you been waiting?", kind: "ancient" },
    { id: "q1-me", text: "Am I the one you were waiting for?", kind: "self" },
    { id: "q1-hear", text: "Can you hear me think this?", kind: "self" },
    { id: "q1-stop", text: "If I asked you to stop, would you?", kind: "self" },
  ],
  [
    { id: "q2-where", text: "Where are you?", kind: "ancient" },
    { id: "q2-alone", text: "Are you alone down here?", kind: "ancient" },
    { id: "q2-seal", text: "Did you know about the seal?", kind: "self" },
    { id: "q2-see", text: "What do you see when I read?", kind: "self" },
    { id: "q2-back", text: "Will I get back up?", kind: "self" },
  ],
];

/** The Theorist's console line for the control trial (design S5, horror beat). */
export const S5_CONTROL_NOTE = "Trial three: Elena asks nothing. The reply arrives anyway.";

// ---------------------------------------------------------------------------
// S7 — the sending lesson

/** Only "clean" is "I am here. I am willing." The others add a condition; the Ancient answers conditions with silence. */
export const S7_PHRASINGS: readonly Option[] = [
  { id: "clean", text: "I am here. I am willing." },
  { id: "cond-safe", text: "I am here. I am willing, if it is safe." },
  { id: "cond-once", text: "I am here. I am willing, once." },
];

export const S7_CHEN_LINE = "It's conserving something.";
