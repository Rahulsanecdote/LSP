import { describe, expect, it } from "vitest";
import { parseClientMessage, parseServerMessage } from "../src/index.js";

describe("message parsing", () => {
  it("parses a valid tap from a JSON string", () => {
    const r = parseClientMessage(JSON.stringify({ t: "tap", cid: "abc", role: "navigator", cLocal: 1, cServerEst: 2 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.msg.t).toBe("tap");
  });

  it("rejects malformed JSON and unknown message types", () => {
    expect(parseClientMessage("{nope").ok).toBe(false);
    expect(parseClientMessage({ t: "explode" }).ok).toBe(false);
  });

  it("refuses a schedule whose interval or window literal has been changed", () => {
    const base = { t: "schedule", epoch: 0, until: 1000 };
    expect(parseServerMessage({ ...base, interval: 520, windowMs: 150 }).ok).toBe(true);
    expect(parseServerMessage({ ...base, interval: 500, windowMs: 150 }).ok).toBe(false);
    expect(parseServerMessage({ ...base, interval: 520, windowMs: 200 }).ok).toBe(false);
  });

  it("refuses an actStart with a beatsRequired other than 3", () => {
    expect(parseClientMessage({ t: "actStart", actId: "a", beatsRequired: 3, roles: ["navigator"] }).ok).toBe(true);
    expect(parseClientMessage({ t: "actStart", actId: "a", beatsRequired: 2, roles: ["navigator"] }).ok).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    expect(parseClientMessage({ t: "ping", cid: "a", c0: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });
});
