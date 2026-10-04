"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BEAT_INTERVAL_MS, BEAT_WINDOW_MS, ROLES, type Role } from "@lsp/protocol";
import { BeatClient, type BeatClientSnapshot } from "@/lib/beatClient";
import { getCid, getRole, partyHost, setRole as persistRole } from "@/lib/identity";

/**
 * Task 1 beat diagnostic (SLICE_HANDOFF.md §5). No art. Visible numbers so a human can stand
 * three phones next to each other and see whether they agree.
 *
 * Beat cue: a background pulse (visual) plus navigator.vibrate(20) (haptic), never audio.
 * The beat is 1.92 Hz, under the 3 Hz flash limit. Hit/miss is shown as text, not colour alone.
 */

const fmt = (n: number | null | undefined, d = 0): string => (n === null || n === undefined || !Number.isFinite(n) ? "–" : n.toFixed(d));
const pct = (n: number): string => `${(n * 100).toFixed(0)}%`;

export default function DiagPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params.code).toUpperCase();
  const [role, setRoleState] = useState<Role>("navigator");
  const [cid, setCid] = useState<string>("");
  const [snap, setSnap] = useState<BeatClientSnapshot | null>(null);
  const [tick, setTick] = useState(0);
  const [lastBeat, setLastBeat] = useState<number | null>(null);
  const clientRef = useRef<BeatClient | null>(null);

  // identity lives in localStorage; read it once on the client
  useEffect(() => {
    setCid(getCid());
    setRoleState(getRole());
  }, []);

  const onBeat = useCallback((beatIndex: number) => {
    setLastBeat(beatIndex);
    document.body.classList.add("pulse");
    window.setTimeout(() => document.body.classList.remove("pulse"), 110);
    try {
      navigator.vibrate?.(20);
    } catch {
      /* not every browser allows it */
    }
  }, []);

  // (re)connect when identity or role changes
  useEffect(() => {
    if (!cid) return;
    const client = new BeatClient({ host: partyHost(), room: code, cid, role, onBeat, onChange: setSnap });
    clientRef.current = client;
    setSnap(client.snapshot());
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [cid, role, code, onBeat]);

  // countdown refresh at 20 Hz; cheap for a diagnostic page
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1_000_000), 50);
    return () => window.clearInterval(id);
  }, []);

  const live = useMemo(() => clientRef.current?.snapshot() ?? snap, [snap, tick]);
  const nextIn = live?.nextBeatIn ?? null;
  const progress = nextIn === null ? 0 : 1 - Math.min(1, Math.max(0, nextIn / BEAT_INTERVAL_MS));
  const recentBeats = live?.stats?.recentBeats ?? [];
  const spreadSummary = (key: "spread" | "auditSpread" | "correctedSpread") => {
    const xs = recentBeats.map((b) => b[key]).filter((v): v is number => v !== null);
    if (!xs.length) return { n: 0, under: 0, max: null as number | null };
    return { n: xs.length, under: xs.filter((v) => v < BEAT_WINDOW_MS).length, max: Math.max(...xs) };
  };
  const sServer = spreadSummary("spread");
  const sAudit = spreadSummary("auditSpread");
  const sCorrected = spreadSummary("correctedSpread");

  function chooseRole(r: Role) {
    persistRole(r);
    setRoleState(r);
  }

  return (
    <main>
      <h1>
        Room <code>{code}</code>
        <span className="muted" style={{ fontWeight: 400, marginLeft: 10, fontSize: 13 }}>
          <span className={`status ${live?.connected ? "on" : "off"}`} />
          {live?.connected ? "connected" : "connecting…"}
          {live?.label ? ` · you are ${live.label}` : ""}
        </span>
      </h1>
      <p className="sub">
        Beat every {BEAT_INTERVAL_MS} ms, hit window ±{BEAT_WINDOW_MS} ms. Party host <code>{partyHost()}</code>.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <label className="muted" htmlFor="role">
          Role
        </label>
        <select id="role" value={role} onChange={(e) => chooseRole(e.target.value as Role)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button className="secondary" type="button" onClick={() => clientRef.current?.startAct([...ROLES])} disabled={!live?.connected}>
          Start consent act
        </button>
      </div>

      <div className="grid">
        <div className="kv">
          <div className="k">Offset</div>
          <div className="v" data-testid="offset">
            {fmt(live?.offset, 1)}
            <small>ms</small>
          </div>
        </div>
        <div className="kv">
          <div className="k">RTT</div>
          <div className="v" data-testid="rtt">
            {fmt(live?.rtt, 0)}
            <small>ms · {live?.samples ?? 0} samples</small>
          </div>
        </div>
        <div className="kv">
          <div className="k">Next beat</div>
          <div className="v" data-testid="countdown">
            {nextIn === null ? "–" : fmt(Math.max(0, nextIn), 0)}
            <small>ms{live?.nextBeat !== null && live?.nextBeat !== undefined ? ` · #${live.nextBeat}` : ""}</small>
          </div>
        </div>
        <div className="kv">
          <div className="k">Hit rate</div>
          <div className="v" data-testid="hitrate">
            {live && live.taps > 0 ? pct(live.hits / live.taps) : "–"}
            <small>
              {live?.hits ?? 0}/{live?.taps ?? 0}
            </small>
          </div>
        </div>
      </div>

      <div className="tapwrap">
        <div className="countdown" aria-hidden>
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <button
          className="tap"
          type="button"
          data-testid="tap"
          disabled={!live?.connected || live.offset === null}
          onPointerDown={(e) => {
            e.preventDefault();
            clientRef.current?.tap();
          }}
        >
          TAP
        </button>
        <div className="muted" style={{ fontSize: 13 }}>
          {lastBeat === null ? "waiting for sync and schedule…" : `last local beat #${lastBeat}`}
        </div>
      </div>

      <h2>Your last 10 taps (Δ ms, scored on your estimate · audit)</h2>
      <div className="chips" data-testid="recent">
        {live?.recent.length ? (
          live.recent.map((s, i) => (
            <span key={`${s.beatIndex}-${i}`} className={`chip ${s.hit ? "hit" : "miss"}`}>
              #{s.beatIndex} {s.deltaMs > 0 ? "+" : ""}
              {fmt(s.deltaMs, 0)} {s.hit ? "hit" : "miss"}
              {s.auditDeltaMs !== null ? ` · audit ${s.auditDeltaMs > 0 ? "+" : ""}${fmt(s.auditDeltaMs, 0)}` : ""}
            </span>
          ))
        ) : (
          <span className="muted">no taps yet</span>
        )}
      </div>

      <h2>Crew</h2>
      <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
        <table data-testid="crew">
          <thead>
            <tr>
              <th>Player</th>
              <th>Role</th>
              <th>Taps</th>
              <th>Hit rate</th>
              <th>Median |Δ|</th>
              <th>RTT (server)</th>
              <th>Sync bias</th>
            </tr>
          </thead>
          <tbody>
            {(live?.stats?.clients ?? []).map((c) => (
              <tr key={c.label} className={c.connected ? "" : "muted"}>
                <td>
                  {c.label}
                  {c.label === live?.label ? " (you)" : ""}
                  {c.connected ? "" : " · offline"}
                </td>
                <td>{c.role}</td>
                <td>{c.n}</td>
                <td>{c.n ? pct(c.hitRate) : "–"}</td>
                <td>{c.n ? `${fmt(c.medianAbsDelta, 0)} ms` : "–"}</td>
                <td>{c.rttMs === null ? "–" : `${fmt(c.rttMs, 0)} ms`}</td>
                <td>{c.syncBiasMs === null ? "–" : `${c.syncBiasMs > 0 ? "+" : ""}${fmt(c.syncBiasMs, 0)} ms`}</td>
              </tr>
            ))}
            {!live?.stats?.clients.length && (
              <tr>
                <td colSpan={7} className="muted">
                  nobody yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Cross-client spread, last {recentBeats.length} beats</h2>
      <p className="sub">
        Spread = max − min of the crew&apos;s deltas on one beat; only beats every connected player tapped count. <b>Scored</b> is from
        each phone&apos;s own estimate and cannot see sync error. <b>Audit</b> is the server&apos;s independent estimate (receive time − rtt/2),
        pessimistic because it carries each tap&apos;s own transit jitter. <b>Corrected</b> is scored + the server&apos;s per-player sync-bias
        estimate: the best read of real agreement. The §5 real-device criterion is read from the audit columns.
      </p>
      <div className="grid" data-testid="spread-summary">
        {(
          [
            ["Scored", sServer],
            ["Audit", sAudit],
            ["Corrected", sCorrected],
          ] as const
        ).map(([name, s]) => (
          <div className="kv" key={name}>
            <div className="k">{name} &lt; {BEAT_WINDOW_MS} ms</div>
            <div className="v">
              {s.n ? `${s.under}/${s.n}` : "–"}
              <small>{s.max === null ? "" : `max ${fmt(s.max, 0)} ms`}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="panel" style={{ padding: 0, overflowX: "auto", marginTop: 8 }}>
        <table data-testid="beats">
          <thead>
            <tr>
              <th>Beat</th>
              <th>Tappers</th>
              <th>Scored spread</th>
              <th>Audit spread</th>
              <th>Corrected spread</th>
            </tr>
          </thead>
          <tbody>
            {[...recentBeats].reverse().map((b) => (
              <tr key={b.beatIndex}>
                <td>#{b.beatIndex}</td>
                <td>{b.n}</td>
                <td className={b.spread === null ? "muted" : b.spread < BEAT_WINDOW_MS ? "ok" : "bad"}>{b.spread === null ? "–" : `${fmt(b.spread, 0)} ms`}</td>
                <td className={b.auditSpread === null ? "muted" : b.auditSpread < BEAT_WINDOW_MS ? "ok" : "bad"}>{b.auditSpread === null ? "–" : `${fmt(b.auditSpread, 0)} ms`}</td>
                <td className={b.correctedSpread === null ? "muted" : b.correctedSpread < BEAT_WINDOW_MS ? "ok" : "bad"}>{b.correctedSpread === null ? "–" : `${fmt(b.correctedSpread, 0)} ms`}</td>
              </tr>
            ))}
            {!recentBeats.length && (
              <tr>
                <td colSpan={5} className="muted">
                  no beats yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {live?.lastActResult && (
        <>
          <h2>Last consent act</h2>
          <div className="panel" data-testid="act">
            <div>
              <b>{live.lastActResult.ok ? "OK" : "Failed"}</b> · {live.lastActResult.actId}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {Object.entries(live.lastActResult.perRole)
                .map(([r, v]) => `${r}: ${v.hits} hits`)
                .join(" · ")}
            </div>
          </div>
        </>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 24 }}>
        cid <code>{cid || "…"}</code>
        {live?.badFrames ? ` · ${live.badFrames} unparseable frames` : ""}
      </p>
    </main>
  );
}
