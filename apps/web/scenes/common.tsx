"use client";

import { BEAT_INTERVAL_MS, type Role, type SceneView } from "@lsp/protocol";
import type { ReactNode, RefObject } from "react";
import type { BeatClient } from "@/lib/beatClient";

/** Room time → local performance.now() time, or null until the clock sync is ready. */
export function toLocal(client: RefObject<BeatClient | null>, roomMs: number | null | undefined): number | null {
  if (roomMs === null || roomMs === undefined) return null;
  return client.current?.toLocal(roomMs) ?? null;
}

export function roomNow(client: RefObject<BeatClient | null>): number | null {
  return client.current?.roomNow() ?? null;
}

export const ROLE_NAMES: Record<Role, string> = { navigator: "Elena", synaesthete: "Chen", theorist: "Sarah" };

/** Per-human DEBT, visible to all (design §0). */
export function Debts({ debts }: { debts: SceneView["debts"] }) {
  return (
    <div className="debts" data-testid="debts">
      <span>DEBT</span>
      {(["navigator", "synaesthete", "theorist"] as Role[]).map((r) => (
        <span key={r}>
          {ROLE_NAMES[r]}
          <b>{debts[r] ?? 0}</b>
        </span>
      ))}
    </div>
  );
}

const WHO_CLASS: Record<Role, string> = { navigator: "elena", synaesthete: "chen", theorist: "sarah" };

/** A line somebody said: the speaker in the console's mono, the words in the serif. */
export function Said({ who, role, children, testId }: { who: string; role?: Role; children: ReactNode; testId?: string }) {
  return (
    <div className="said" data-testid={testId}>
      <span className={`who${role ? ` ${WHO_CLASS[role]}` : ""}`}>{who}</span>
      <span className="what">{children}</span>
    </div>
  );
}

/**
 * The console's view of the rhythm: pulse—pause—pulse at the beat interval, as a waveform. A
 * cursor runs along it in room time from `startBeat`, so three screens show the same thing.
 */
export function Waveform({ startBeat, beats, epoch, now, active }: { startBeat: number; beats: number; epoch: number; now: number | null; active: boolean }) {
  const w = 320;
  const h = 64;
  const per = w / beats;
  const t0 = epoch + startBeat * BEAT_INTERVAL_MS;
  const cursor = now === null ? null : ((now - t0) / (beats * BEAT_INTERVAL_MS)) * w;
  const path: string[] = [];
  for (let k = 0; k < beats; k++) {
    const x = k * per;
    const pulse = k % 3 !== 1;
    path.push(`M${x.toFixed(1)} ${h / 2}`);
    if (pulse) path.push(`L${(x + per * 0.15).toFixed(1)} ${h * 0.12} L${(x + per * 0.3).toFixed(1)} ${h * 0.88} L${(x + per * 0.45).toFixed(1)} ${h / 2}`);
    path.push(`L${(x + per).toFixed(1)} ${h / 2}`);
  }
  return (
    <svg className="waveform" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="var(--line)" strokeWidth={1} />
      <path d={path.join(" ")} fill="none" stroke={active ? "var(--ink)" : "var(--ink-3)"} strokeWidth={1.25} strokeLinejoin="round" />
      {cursor !== null && cursor >= 0 && cursor <= w && <line x1={cursor} x2={cursor} y1={0} y2={h} stroke="var(--accent)" strokeWidth={1.25} />}
    </svg>
  );
}

/**
 * A wheel of options, plain DOM (the Rive slot). `speech` marks options that are words someone
 * says aloud (Elena's lines, Sarah's phrasings); those read in the serif.
 */
export function Wheel({ options, chosen, onPick, testPrefix, disabled = false, speech = false }: { options: { id: string; text: string }[]; chosen: string | null; onPick: (id: string) => void; testPrefix: string; disabled?: boolean; speech?: boolean }) {
  return (
    <div className={speech ? "wheel speech" : "wheel"} role="group">
      {options.map((o) => (
        <button key={o.id} type="button" data-testid={`${testPrefix}-${o.id}`} className={chosen === o.id ? "chosen" : ""} disabled={disabled || (chosen !== null && chosen !== o.id)} onClick={() => onPick(o.id)}>
          <span>{o.text}</span>
        </button>
      ))}
    </div>
  );
}
