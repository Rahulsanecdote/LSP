"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ROLES, type Role } from "@lsp/protocol";
import type { BeatClientSnapshot } from "@/lib/beatClient";
import { getRole, setRole as persistRole } from "@/lib/identity";
import { useRoomClient } from "@/lib/useRoomClient";
import { EndCard } from "@/scenes/EndCard";
import { Interlude } from "@/scenes/Interlude";
import { Lobby } from "@/scenes/Lobby";
import { S2Seal } from "@/scenes/S2Seal";
import { S5PointThree } from "@/scenes/S5PointThree";
import { S7Consent, actStartLocal } from "@/scenes/S7Consent";

/**
 * Room entry: pick a role, then the scene router (handoff §4 file map). The server owns the
 * scene; this page renders the role's view of it (Task 3). `?role=` preselects, which the e2e
 * tests and a shared link both use; `?cid=` pins the client id so three tabs in one browser can
 * be three players.
 */
export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = decodeURIComponent(params.code).toUpperCase();
  const [role, setRoleState] = useState<Role | null>(null);

  useEffect(() => {
    const q = search.get("role");
    if (q && (ROLES as readonly string[]).includes(q)) {
      persistRole(q as Role);
      setRoleState(q as Role);
    }
  }, [search]);

  if (!role) {
    return (
      <main>
        <h1>
          Room {code} <span className="muted">· Last Stand Protocol</span>
        </h1>
        <p className="sub">Pick your role. Each phone sees only its own instrument.</p>
        <div className="grid">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              className="primary"
              data-testid={`role-${r}`}
              style={{ minHeight: 64, textTransform: "capitalize", opacity: getRole() === r ? 1 : 0.85 }}
              onClick={() => {
                persistRole(r);
                setRoleState(r);
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="sub" style={{ marginTop: 18 }}>
          <Link href={`/diag/${encodeURIComponent(code)}`}>beat diagnostic</Link>
        </p>
      </main>
    );
  }
  return <Episode code={code} role={role} cidOverride={search.get("cid")} />;
}

function Episode({ code, role, cidOverride }: { code: string; role: Role; cidOverride: string | null }) {
  const snapRef = useRef<BeatClientSnapshot | null>(null);
  // Beat cue (S7 only): a background pulse plus a 20 ms haptic, never audio; under 3 Hz.
  // During the demonstration the cue follows pulse—pause—pulse; during the act, every beat.
  const onBeat = useCallback((beat: number) => {
    const s7 = snapRef.current?.scene?.s7;
    if (!s7) return;
    if (s7.phase === "demo") {
      if ((beat - s7.demoStartBeat) % 3 === 1) return;
    } else if (s7.phase !== "act") return;
    document.body.classList.add("pulse");
    window.setTimeout(() => document.body.classList.remove("pulse"), 110);
    try {
      navigator.vibrate?.(20);
    } catch {
      /* no haptics */
    }
  }, []);
  const { snap, client } = useRoomClient(code, role, onBeat, cidOverride);
  snapRef.current = snap;
  const scene = snap?.scene ?? null;
  const dim = snap?.dim ?? 0;
  const act = actStartLocal(snap, client);

  const header = (
    <div data-testid="conn" style={{ position: "fixed", top: 10, left: 16, right: 16, zIndex: 2, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#7e818b", pointerEvents: "none" }}>
      <span>
        <span className={`status ${snap?.connected ? "on" : "off"}`} />
        {code} · {role}
        {snap?.label ? ` · ${snap.label}` : ""}
        {scene && scene.id !== "lobby" ? ` · ${scene.id.toUpperCase()}` : ""}
      </span>
      <span data-testid="offset">{snap?.offset === null || snap?.offset === undefined ? "syncing…" : `offset ${snap.offset.toFixed(0)} ms`}</span>
    </div>
  );

  let content;
  if (!scene || scene.id === "lobby") content = <Lobby snap={snap} client={client} role={role} scene={scene} />;
  else if (scene.id === "s2") content = <S2Seal snap={snap} client={client} role={role} scene={scene} />;
  else if (scene.id === "interlude") content = <Interlude scene={scene} />;
  else if (scene.id === "s5") content = <S5PointThree snap={snap} client={client} role={role} scene={scene} />;
  else if (scene.id === "s7") content = <S7Consent snap={snap} client={client} role={role} scene={scene} />;
  else content = <EndCard scene={scene} />;

  return (
    <div
      data-testid="scene"
      data-scene={scene?.id ?? "connecting"}
      data-phase={scene?.s7?.phase ?? ""}
      data-dim={dim.toFixed(2)}
      data-act-start-local={act ? act.startLocal.toFixed(0) : ""}
      data-interval={act ? String(act.interval) : ""}
    >
      {header}
      {content}
      <div className="dim" aria-hidden style={{ opacity: dim }} />
    </div>
  );
}
