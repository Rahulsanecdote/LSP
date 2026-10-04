import type { Role } from "@lsp/protocol";
import { ROLES } from "@lsp/protocol";

/**
 * A stable per-device client id. Reconnects reuse it, so the server keeps the player's label,
 * stats and act participation across socket drops. Stored in localStorage; the whole page is
 * client-only so there is no SSR concern beyond guarding `window`.
 */
export function getCid(): string {
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

/** PartyKit host, without protocol. Set NEXT_PUBLIC_PARTYKIT_HOST for a deployed party. */
export function partyHost(): string {
  return process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "127.0.0.1:1999";
}
