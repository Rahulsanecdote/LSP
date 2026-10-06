"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Role } from "@lsp/protocol";
import { BeatClient, type BeatClientSnapshot } from "@/lib/beatClient";
import { getCid, partyHost } from "@/lib/identity";

/**
 * One BeatClient per (room, role, cid); reconnects when any changes. Snapshots refresh at ~20 Hz.
 * `cidOverride` comes from `?cid=` and lets one browser be several players (see identity.ts).
 */
export function useRoomClient(
  code: string,
  role: Role,
  onBeat: (beatIndex: number) => void = () => {},
  cidOverride: string | null = null,
): { snap: BeatClientSnapshot | null; client: RefObject<BeatClient | null>; cid: string } {
  const [cid, setCid] = useState("");
  const [snap, setSnap] = useState<BeatClientSnapshot | null>(null);
  const [tick, setTick] = useState(0);
  const client = useRef<BeatClient | null>(null);
  const beatRef = useRef(onBeat);
  beatRef.current = onBeat;

  useEffect(() => setCid(getCid(cidOverride)), [cidOverride]);

  useEffect(() => {
    if (!cid) return;
    const c = new BeatClient({ host: partyHost(), room: code, cid, role, onBeat: (i) => beatRef.current(i), onChange: setSnap });
    client.current = c;
    setSnap(c.snapshot());
    return () => {
      c.close();
      client.current = null;
    };
  }, [cid, role, code]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1_000_000), 50);
    return () => window.clearInterval(id);
  }, []);

  const live = useMemo(() => client.current?.snapshot() ?? snap, [snap, tick]);
  return { snap: live, client, cid };
}
