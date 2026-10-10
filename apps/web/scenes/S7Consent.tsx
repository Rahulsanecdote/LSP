"use client";

import { ACT_BEATS_REQUIRED, BEAT_INTERVAL_MS, beatTime, type Role, type SceneView } from "@lsp/protocol";
import type { RefObject } from "react";
import { Ledger } from "@/components/instruments/Ledger";
import { NavigatorRead } from "@/components/instruments/NavigatorRead";
import { SynaestheteOverlay } from "@/components/instruments/SynaestheteOverlay";
import type { BeatClient, BeatClientSnapshot } from "@/lib/beatClient";
import { Debts, Waveform, Wheel, roomNow } from "./common";

const CHEN_LINE = "It's conserving something.";

export function S7Consent({ snap, client, role, scene }: { snap: BeatClientSnapshot | null; client: RefObject<BeatClient | null>; role: Role; scene: SceneView }) {
  const s7 = scene.s7;
  const schedule = snap?.schedule ?? null;
  const now = roomNow(client);
  if (!s7) return null;
  const act = s7.phase === "act";
  const converge = act ? s7.run / ACT_BEATS_REQUIRED : s7.outcome === "clean" || s7.outcome === "silent" ? 1 : 0;
  const replied = (snap?.sceneEvents ?? []).some((e) => e.ev.kind === "lightsReply");
  const phaseText =
    s7.phase === "demo" ? "the Ancient demonstrates: pulse—pause—pulse" : s7.phase === "phrasing" ? "Sarah chooses the words" : act ? `answer it together — ${s7.run}/${ACT_BEATS_REQUIRED}` : s7.phase === "between" ? "the window closed" : s7.outcome === "clean" ? "the lights dim" : s7.outcome === "silent" ? "silence" : "blackout";
  const wave = schedule ? <Waveform startBeat={s7.demoStartBeat} beats={s7.demoBeats} epoch={schedule.epoch} now={now} active={s7.phase === "demo" || act} /> : null;
  const tapColours = role === "synaesthete" ? lastBeatTaps(snap) : null;

  switch (role) {
    case "navigator":
      return (
        <NavigatorRead snap={snap} client={client} mode="tap" converge={converge} prompt={act ? "tap on the beat — your taps are the collapse" : phaseText}>
          <div className="scene-ui">
            <div className="card">{wave}</div>
            {act && (
              <div className="card muted" data-testid="run" style={{ fontSize: 12 }}>
                run {s7.run}/{ACT_BEATS_REQUIRED} · misses {s7.missed}
              </div>
            )}
          </div>
        </NavigatorRead>
      );
    case "synaesthete":
      return (
        <SynaestheteOverlay snap={snap} ringY={0.68} floor={replied ? s7.dim : 0} tapColours={act || s7.phase === "between" ? tapColours : null} caption={phaseText}>
          <div className="scene-ui" style={{ alignItems: "center" }}>
            <div className="card" style={{ alignSelf: "stretch" }}>{wave}</div>
            {replied && (
              <div className="card" data-testid="chen-line" style={{ alignSelf: "stretch" }}>
                <span className="muted">You, before you can stop yourself:</span> “{CHEN_LINE}”
              </div>
            )}
            {s7.againAvailable && (
              <button type="button" className="primary" data-testid="again" style={{ pointerEvents: "auto" }} onClick={() => client.current?.callAgain()}>
                Again.
              </button>
            )}
            <button
              type="button"
              className="bigtap"
              data-testid="tap"
              disabled={!act}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                client.current?.tap();
              }}
            >
              TAP
            </button>
          </div>
        </SynaestheteOverlay>
      );
    case "theorist":
      return (
        <main style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 40 }}>
          <div className="panel">
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>{phaseText}</div>
            {wave}
          </div>
          <Debts debts={scene.debts} />
          {s7.phase === "phrasing" && s7.phrasings && (
            <>
              <div className="muted" style={{ fontSize: 13 }}>Before you tap, choose what the act means. The Ancient answers conditions with silence.</div>
              <Wheel options={s7.phrasings} chosen={s7.phrasing} onPick={(id) => client.current?.choose("s7", "phrasing", id)} testPrefix="phrasing" />
            </>
          )}
          {s7.phrasing && s7.phrasings && (
            <div className="panel" data-testid="phrasing-chosen" style={{ fontSize: 14 }}>
              “{s7.phrasings.find((p) => p.id === s7.phrasing)?.text}”
            </div>
          )}
          <div className="tapwrap">
            <button
              type="button"
              className="tap"
              data-testid="tap"
              disabled={!act}
              onPointerDown={(e) => {
                e.preventDefault();
                client.current?.tap();
              }}
            >
              TAP
            </button>
            {act && (
              <div className="muted" data-testid="run" style={{ fontSize: 12 }}>
                window {s7.window} · run {s7.run}/{ACT_BEATS_REQUIRED} · misses {s7.missed}
              </div>
            )}
          </div>
          <Ledger log={scene.log} />
        </main>
      );
  }
}

/** The latest beat anyone tapped, as (role, hit) pairs: the colour of the crew's taps. */
function lastBeatTaps(snap: BeatClientSnapshot | null): { role: string; hit: boolean }[] {
  if (!snap) return [];
  const labelRole = new Map<string, string>();
  for (const c of snap.stats?.clients ?? []) labelRole.set(c.label, c.role);
  const own = snap.recent.map((t) => ({ beat: t.beatIndex, role: "synaesthete", hit: t.hit }));
  const crew = snap.crewTaps.map((t) => ({ beat: t.beatIndex, role: labelRole.get(t.cid) ?? "?", hit: t.hit }));
  const all = [...own, ...crew];
  if (all.length === 0) return [];
  const last = Math.max(...all.map((t) => t.beat));
  return all.filter((t) => t.beat === last).map((t) => ({ role: t.role, hit: t.hit }));
}

/** Local time of the act's first beat, for the e2e run's scripted taps. */
export function actStartLocal(snap: BeatClientSnapshot | null, client: RefObject<BeatClient | null>): { startLocal: number; interval: number } | null {
  const s7 = snap?.scene?.s7;
  const schedule = snap?.schedule;
  if (!s7 || !schedule || s7.phase !== "act" || s7.startBeat === null) return null;
  const local = client.current?.toLocal(beatTime(schedule, s7.startBeat));
  return local === null || local === undefined ? null : { startLocal: local, interval: BEAT_INTERVAL_MS };
}
