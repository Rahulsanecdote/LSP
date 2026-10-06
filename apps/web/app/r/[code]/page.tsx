"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ROLES, type Role } from "@lsp/protocol";
import { NavigatorRead } from "@/components/instruments/NavigatorRead";
import { SynaestheteOverlay } from "@/components/instruments/SynaestheteOverlay";
import { TheoristLedger } from "@/components/instruments/TheoristLedger";
import { getRole, setRole as persistRole } from "@/lib/identity";
import { useRoomClient } from "@/lib/useRoomClient";

/**
 * Room entry: pick a role, then see only that role's instrument (handoff §4 file map). Scenes
 * (Task 3) will route from here; for Task 2 the instruments stand alone. `?role=` preselects,
 * which the e2e test and a shared link both use.
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
          Room <code>{code}</code>
        </h1>
        <p className="sub">Pick your role. Each phone sees only its own instrument.</p>
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          {ROLES.map((r) => (
            <button
              key={r}
              className="primary"
              type="button"
              data-testid={`role-${r}`}
              style={{ minHeight: 56, fontSize: 18, textTransform: "capitalize", opacity: getRole() === r ? 1 : 0.85 }}
              onClick={() => {
                persistRole(r);
                setRoleState(r);
              }}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 20, fontSize: 13 }}>
          Beat diagnostic for this room: <Link href={`/diag/${code}`}>/diag/{code}</Link>
        </p>
      </main>
    );
  }
  return <Instrument code={code} role={role} />;
}

function Instrument({ code, role }: { code: string; role: Role }) {
  const { snap, client } = useRoomClient(code, role);
  const header = (
    <div data-testid="conn" style={{ position: "fixed", top: 10, left: 16, right: 16, zIndex: 2, display: "flex", justifyContent: "space-between", fontSize: 12, color: "#7e818b", pointerEvents: "none" }}>
      <span>
        <span className={`status ${snap?.connected ? "on" : "off"}`} />
        {code} · {role}
        {snap?.label ? ` · ${snap.label}` : ""}
      </span>
      <span data-testid="offset">{snap?.offset === null || snap?.offset === undefined ? "syncing…" : `offset ${snap.offset.toFixed(0)} ms`}</span>
    </div>
  );
  switch (role) {
    case "navigator":
      return (
        <>
          {header}
          <NavigatorRead snap={snap} client={client} />
        </>
      );
    case "synaesthete":
      return (
        <>
          {header}
          <SynaestheteOverlay snap={snap} />
        </>
      );
    case "theorist":
      return (
        <>
          {header}
          <TheoristLedger snap={snap} />
        </>
      );
  }
}
