import { HORIZON_MS, PROJECTION_RATE_DEFAULT, type BranchSet } from "@lsp/protocol";

/**
 * The S2 seal read (amendments 6d, 7). One wide, moderately bright "safe" stream that runs past
 * the horizon into black, and three thin, very bright failure streams INSIDE it at 89 s: danger
 * sits inside the horizon, bright and close. The thin-and-bright case is what the
 * brightness-as-confidence rule exists for. The horizon rule is strict (projected > 90 000 ms).
 */
export const S2_SEAL_BRANCHSET: BranchSet = {
  t: "branchSet",
  horizonMs: HORIZON_MS,
  projectionRate: PROJECTION_RATE_DEFAULT,
  streams: [
    { p: 0.94, confidence: 0.94, label: "safe at facility, 00:11", terminalMs: 660_000 },
    { p: 0.02, confidence: 0.98, label: "seal failure, 00:01:29", terminalMs: 89_000 },
    { p: 0.02, confidence: 0.98, label: "seal failure, 00:01:29", terminalMs: 89_000 },
    { p: 0.02, confidence: 0.98, label: "seal failure, 00:01:29", terminalMs: 89_000 },
  ],
};
