import { describe, expect, it } from "vitest";
import { BEAT_INTERVAL_MS, nearestBeatIndex, type Schedule } from "@lsp/protocol";
import { criterionConfig, formatReport, runSpread } from "../src/index.js";

/**
 * Done-criterion: a 1,500 ms network stall on one client recovers to in-window taps within
 * 3 beats of reconnection. Schedule-based rendering should make this nearly free: the client
 * keeps rendering beats locally through the stall and its taps resume as soon as the socket is back.
 */
describe("network stall", () => {
  const STALL_AT = 12_000;
  const STALL_MS = 1_500;
  const config = { ...criterionConfig(2, 60, 3), stall: { clientIndex: 2, atMs: STALL_AT, durationMs: STALL_MS } };
  const report = runSpread(config);
  console.log(formatReport(report));
  const stalled = report.sims[2];
  if (!stalled) throw new Error("no stalled client");
  const schedule = stalled.schedule as Schedule;
  const reconnectAt = stalled.connectedAt;
  const reconnectBeat = nearestBeatIndex(schedule, reconnectAt);
  const taps = report.tapLog.filter((r) => r.cid === stalled.cid);
  const before = taps.filter((r) => r.receivedAt < STALL_AT);
  const after = taps.filter((r) => r.receivedAt >= reconnectAt);

  it("actually stalled and reconnected once", () => {
    expect(stalled.reconnects).toBe(1);
    expect(reconnectAt).toBeCloseTo(STALL_AT + STALL_MS, 0);
    expect(stalled.dropped).toBeGreaterThan(0);
    // no tap from the stalled client was received during the outage
    expect(taps.some((r) => r.receivedAt >= STALL_AT && r.receivedAt < reconnectAt)).toBe(false);
  });

  it("was tapping in-window before the stall", () => {
    expect(before.length).toBeGreaterThan(5);
    expect(before.filter((r) => r.hit).length / before.length).toBeGreaterThan(0.9);
  });

  it("resumes within 3 beats of reconnection and every tap from then on is a hit", () => {
    expect(after.length).toBeGreaterThan(10);
    const firstBack = after[0]?.beatIndex as number;
    expect(firstBack).toBeLessThanOrEqual(reconnectBeat + 3);
    const settled = after.filter((r) => r.beatIndex >= reconnectBeat + 3);
    expect(settled.length).toBeGreaterThan(5);
    expect(settled.every((r) => r.hit)).toBe(true);
  });

  it("the other two clients were unaffected", () => {
    for (const cid of ["c1", "c2"]) {
      const rows = report.tapLog.filter((r) => r.cid === cid && r.receivedAt > STALL_AT - 2 * BEAT_INTERVAL_MS && r.receivedAt < STALL_AT + STALL_MS + 2 * BEAT_INTERVAL_MS);
      expect(rows.length).toBeGreaterThan(3);
      expect(rows.every((r) => r.hit)).toBe(true);
    }
  });
});
