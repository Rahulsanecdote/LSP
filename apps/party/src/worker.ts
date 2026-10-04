import { BeatRoom } from "./room-do";

export { BeatRoom };

export interface Env {
  BEAT_ROOM: DurableObjectNamespace<BeatRoom>;
}

/**
 * Worker entry. Routes `/parties/:party/:room` to the Durable Object named after the room,
 * which is the URL shape `partysocket` builds on the client, so the web app needed no
 * transport change when the host moved from PartyKit to Workers (Task 1 report, deviation 1).
 */
const ROUTE = /^\/parties\/([^/]+)\/([^/]+)\/?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "lsp-party", host: "cloudflare-workers" });
    }
    const m = ROUTE.exec(url.pathname);
    if (!m) return new Response("not found", { status: 404 });
    const room = decodeURIComponent(m[2] as string).toUpperCase();
    if (!/^[A-Z0-9-]{1,32}$/.test(room)) return new Response("bad room code", { status: 400 });
    const id = env.BEAT_ROOM.idFromName(room);
    return env.BEAT_ROOM.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}
