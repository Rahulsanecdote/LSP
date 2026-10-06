import { describe, expect, it } from "vitest";
import { BranchSetSchema, HORIZON_MS, PROJECTION_RATE_DEFAULT, parseClientMessage, parseServerMessage } from "../src/index";

describe("Task 2 messages", () => {
  const streams = [
    { p: 0.94, label: "safe at facility, 00:11", terminalMs: 660_000, confidence: 0.94 },
    { p: 0.02, label: "seal failure, 00:01:29", terminalMs: 89_000, confidence: 0.98 },
    { p: 0.02, label: "seal failure, 00:01:29", terminalMs: 89_000, confidence: 0.98 },
    { p: 0.02, label: "seal failure, 00:01:29", terminalMs: 89_000, confidence: 0.98 },
  ];

  it("a BranchSet defaults projectionRate and holds the horizon literal", () => {
    const r = BranchSetSchema.safeParse({ t: "branchSet", streams, horizonMs: HORIZON_MS });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.projectionRate).toBe(PROJECTION_RATE_DEFAULT);
    expect(BranchSetSchema.safeParse({ t: "branchSet", streams, horizonMs: 60_000 }).success).toBe(false);
  });

  it("a BranchSet needs 3 to 7 streams", () => {
    expect(BranchSetSchema.safeParse({ t: "branchSet", streams: streams.slice(0, 2), horizonMs: HORIZON_MS }).success).toBe(false);
    expect(BranchSetSchema.safeParse({ t: "branchSet", streams: [...streams, ...streams], horizonMs: HORIZON_MS }).success).toBe(false);
  });

  it("confidence is optional and bounded", () => {
    const [s] = streams;
    expect(BranchSetSchema.safeParse({ t: "branchSet", streams: [{ ...s, confidence: undefined }, streams[1], streams[2]], horizonMs: HORIZON_MS }).success).toBe(true);
    expect(BranchSetSchema.safeParse({ t: "branchSet", streams: [{ ...s, confidence: 1.2 }, streams[1], streams[2]], horizonMs: HORIZON_MS }).success).toBe(false);
  });

  it("readStart / readEnd parse as client messages", () => {
    expect(parseClientMessage({ t: "readStart", cid: "c", cLocal: 1, cServerEst: 2 }).ok).toBe(true);
    expect(parseClientMessage({ t: "readEnd", cid: "c", cLocal: 1, cServerEst: 2 }).ok).toBe(true);
  });

  it("readEvent and branchSet parse as server messages", () => {
    expect(parseServerMessage({ t: "readEvent", readId: "r1", label: "p1", phase: "start", serverTime: 5, debt: 0 }).ok).toBe(true);
    expect(parseServerMessage({ t: "readEvent", readId: "r1", label: "p1", phase: "end", serverTime: 9, debt: 2, durationMs: 7000, projectedMs: 105_000, pastHorizon: true, debtDelta: 2, endedBy: "release" }).ok).toBe(true);
    expect(parseServerMessage({ t: "branchSet", streams, horizonMs: HORIZON_MS, projectionRate: 15 }).ok).toBe(true);
  });
});
