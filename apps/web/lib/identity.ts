import type { Role } from "@lsp/protocol";
import { ROLES } from "@lsp/protocol";

const CID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * A stable per-device client id. Reconnects reuse it, so the server keeps the player's label,
 * stats and act participation across socket drops. Stored in localStorage; the whole page is
 * client-only so there is no SSR concern beyond guarding `window`.
 *
 * `override` (from `?cid=`) bypasses storage without touching it, so one browser can hold three
 * tabs as three distinct players for a one-device demo. Invalid overrides fall back to storage.
 */
export function getCid(override?: string | null): string {
  if (override && CID_PATTERN.test(override)) return override;
  const key = "lsp.cid";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const fresh = `c-${crypto.randomUUID().slice(0, 8)}`;
    window.localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return `c-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getRole(): Role {
  try {
    const r = window.localStorage.getItem("lsp.role");
    if (r && (ROLES as readonly string[]).includes(r)) return r as Role;
  } catch {
    /* ignore */
  }
  return "navigator";
}

export function setRole(role: Role): void {
  try {
    window.localStorage.setItem("lsp.role", role);
  } catch {
    /* ignore */
  }
}

/**
 * Room-server host, without protocol. Set NEXT_PUBLIC_PARTY_HOST to the deployed Worker, e.g.
 * `lsp-party.<account>.workers.dev`; partysocket picks ws:// for localhost and wss:// otherwise.
 */
export function partyHost(): string {
  return process.env.NEXT_PUBLIC_PARTY_HOST ?? "127.0.0.1:1999";
}
