import { describe, expect, it } from "vitest";
import { beatTime, nearestBeatIndex, scoreTap, type Schedule } from "../src/index.js";

const schedule: Schedule = { t: "schedule", epoch: 10_000, interval: 520, until: 10_000 + 520 * 100, windowMs: 150 };

describe("scoreTap", () => {
  it("scores a tap exactly on a beat as a hit with delta 0", () => {
    expect(scoreTap(schedule, beatTime(schedule, 7))).toEqual({ beatIndex: 7, deltaMs: 0, hit: true });
  });

  it("hits at the edge of the window and misses just outside it", () => {
    const b = beatTime(schedule, 3);
    expect(scoreTap(schedule, b + 150)?.hit).toBe(true);
    expect(scoreTap(schedule, b - 150)?.hit).toBe(true);
    expect(scoreTap(schedule, b + 151)?.hit).toBe(false);
    expect(scoreTap(schedule, b - 151)?.hit).toBe(false);
  });

  // Done-criterion: boundaries at ±259, ±260, ±261 ms around beat 5.
  // Tie rule (clarification 4): exactly ±260 belongs to the LATER beat.
  describe.each([
    { offset: 259, beatIndex: 5, deltaMs: 259 },
    { offset: 260, beatIndex: 6, deltaMs: -260 },
    { offset: 261, beatIndex: 6, deltaMs: -259 },
    { offset: -259, beatIndex: 5, deltaMs: -259 },
    { offset: -260, beatIndex: 5, deltaMs: -260 },
    { offset: -261, beatIndex: 4, deltaMs: 259 },
  ])("tap at beat 5 %s ms", ({ offset, beatIndex, deltaMs }) => {
    it(`maps to beat ${beatIndex} with delta ${deltaMs}`, () => {
      const s = scoreTap(schedule, beatTime(schedule, 5) + offset);
      expect(s).not.toBeNull();
      expect(s?.beatIndex).toBe(beatIndex);
      expect(s?.deltaMs).toBeCloseTo(deltaMs, 9);
      expect(s?.hit).toBe(false);
    });
  });

  it("ties resolve to the later beat on both sides of a beat", () => {
    const b = beatTime(schedule, 5);
    expect(nearestBeatIndex(schedule, b + 260)).toBe(6);
    expect(nearestBeatIndex(schedule, b - 260)).toBe(5);
  });

  it("rejects taps whose nearest beat is before beat 0", () => {
    expect(scoreTap(schedule, schedule.epoch - 261)).toBeNull();
    expect(scoreTap(schedule, schedule.epoch - 260)).not.toBeNull();
  });

  it("rejects taps after the schedule ends", () => {
    expect(scoreTap(schedule, schedule.until + 1)).toBeNull();
    expect(scoreTap(schedule, schedule.until)).not.toBeNull();
  });

  it("rejects non-finite times", () => {
    expect(scoreTap(schedule, Number.NaN)).toBeNull();
  });
});
