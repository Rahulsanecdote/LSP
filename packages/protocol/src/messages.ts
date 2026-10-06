import { z } from "zod";
import { ACT_BEATS_REQUIRED, BEAT_INTERVAL_MS, BEAT_WINDOW_MS, HORIZON_MS, PROJECTION_RATE_DEFAULT } from "./constants";

/**
 * Wire protocol. Every message is zod-validated JSON over the PartyKit WebSocket.
 * Shapes follow SLICE_HANDOFF.md §5 plus the three messages added in v0.2.1
 * (hello, snapshot, stats).
 */

const ms = z.number().finite();
const id = z.string().min(1).max(64);

export const RoleSchema = z.enum(["navigator", "synaesthete", "theorist"]);
export type Role = z.infer<typeof RoleSchema>;
export const ROLES: readonly Role[] = RoleSchema.options;

// ---------------------------------------------------------------------------
// Clock sync — client-initiated, 4+ round trips, client keeps the median offset.

export const PingSchema = z.object({
  t: z.literal("ping"),
  cid: id,
  /** client send time (client local clock) */
  c0: ms,
  /**
   * Amendment 4: the `s1` of the pong this ping was sent in immediate reply to, when it was.
   * Lets the server measure the round trip itself (`now − prev`) without trusting any client
   * clock; those samples feed the per-tap audit estimate.
   */
  prev: ms.optional(),
});
export type Ping = z.infer<typeof PingSchema>;

export const PongSchema = z.object({
  t: z.literal("pong"),
  cid: id,
  c0: ms,
  /** server receive/send time (same tick), in room time */
  s1: ms,
});
export type Pong = z.infer<typeof PongSchema>;

// ---------------------------------------------------------------------------
// Beat schedule — the server says WHEN beats will occur. Clients render locally.

export const ScheduleSchema = z.object({
  t: z.literal("schedule"),
  /** room-time ms of beat 0; fixed for the life of the room */
  epoch: ms,
  interval: z.literal(BEAT_INTERVAL_MS),
  /** room-time ms when this schedule ends; extended by each re-broadcast */
  until: ms,
  windowMs: z.literal(BEAT_WINDOW_MS),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

// ---------------------------------------------------------------------------
// Taps

export const TapSchema = z.object({
  t: z.literal("tap"),
  cid: id,
  role: RoleSchema,
  /** client local clock at the tap */
  cLocal: ms,
  /** client's estimate of room time at the tap, derived from pongs */
  cServerEst: ms,
});
export type Tap = z.infer<typeof TapSchema>;

export const TapScoreSchema = z.object({
  t: z.literal("tapScore"),
  /**
   * The tapper's cid in the direct reply. In the anonymised room broadcast this is the
   * tapper's anonymous player label (e.g. "p2") instead.
   */
  cid: id,
  beatIndex: z.number().int(),
  deltaMs: ms,
  hit: z.boolean(),
  /**
   * Amendment 4: delta of the server's independent audit estimate of the tap instant
   * (`receivedAt − medianRtt/2`) from the same beat. Null until the connection has an rtt sample.
   */
  auditDeltaMs: ms.nullable(),
});
export type TapScore = z.infer<typeof TapScoreSchema>;

// ---------------------------------------------------------------------------
// Consent act

export const ActStartSchema = z.object({
  t: z.literal("actStart"),
  actId: id,
  beatsRequired: z.literal(ACT_BEATS_REQUIRED),
  roles: z.array(RoleSchema).min(1),
});
export type ActStart = z.infer<typeof ActStartSchema>;

export const PerRoleResultSchema = z.object({
  hits: z.number().int().nonnegative(),
  deltas: z.array(ms),
});
export type PerRoleResult = z.infer<typeof PerRoleResultSchema>;

export const ActResultSchema = z.object({
  t: z.literal("actResult"),
  actId: id,
  ok: z.boolean(),
  perRole: z.record(RoleSchema, PerRoleResultSchema),
});
export type ActResult = z.infer<typeof ActResultSchema>;

// ---------------------------------------------------------------------------
// Added in v0.2.1 (amendment 3)

export const HelloSchema = z.object({
  t: z.literal("hello"),
  cid: id,
  role: RoleSchema,
});
export type Hello = z.infer<typeof HelloSchema>;

export const PlayerInfoSchema = z.object({
  /** anonymous, stable per room: "p1", "p2", … */
  label: z.string().min(1),
  role: RoleSchema,
  connected: z.boolean(),
});
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;

export const SnapshotSchema = z.object({
  t: z.literal("snapshot"),
  /** room time when the snapshot was taken */
  serverNow: ms,
  /** the receiving client's own anonymous label */
  you: z.string().min(1),
  schedule: ScheduleSchema.nullable(),
  players: z.array(PlayerInfoSchema),
  activeAct: z
    .object({
      actId: id,
      roles: z.array(RoleSchema),
      startBeat: z.number().int(),
      maxBeats: z.number().int().positive(),
    })
    .nullable(),
  /** Task 2: current DEBT and whether a read is in progress (who, since when) */
  debt: z.number().int().nonnegative(),
  activeRead: z.object({ readId: id, label: z.string().min(1), startedAt: ms }).nullable(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export const ClientStatsSchema = z.object({
  label: z.string().min(1),
  role: RoleSchema,
  connected: z.boolean(),
  /** taps scored */
  n: z.number().int().nonnegative(),
  /** hits / n, 0 when n = 0 */
  hitRate: z.number().min(0).max(1),
  /** median |deltaMs| over recent taps, 0 when n = 0 */
  medianAbsDelta: ms,
  /** median |auditDeltaMs| over recent taps that had one, null when none */
  medianAbsAuditDelta: ms.nullable(),
  /** server-measured median round trip for this connection, null until measured */
  rttMs: ms.nullable(),
  /**
   * Median of (auditDeltaMs − deltaMs) over recent taps: the server's estimate of how far this
   * client's clock sync is off. Averages out per-tap transit jitter, so it detects a sync
   * failure without the per-tap noise of the raw audit column.
   */
  syncBiasMs: ms.nullable(),
});
export type ClientStats = z.infer<typeof ClientStatsSchema>;

/** One recent beat's cross-client spread, both ways of measuring it (amendment 4). */
export const BeatSpreadSchema = z.object({
  beatIndex: z.number().int(),
  /** clients that tapped this beat */
  n: z.number().int().nonnegative(),
  /** max − min of deltaMs across tappers; null unless every connected player tapped */
  spread: ms.nullable(),
  /** max − min of auditDeltaMs across tappers; null unless every connected player has one */
  auditSpread: ms.nullable(),
  /** max − min of (deltaMs + that player's syncBiasMs): the sync-aware spread without per-tap jitter */
  correctedSpread: ms.nullable(),
});
export type BeatSpread = z.infer<typeof BeatSpreadSchema>;

export const StatsSchema = z.object({
  t: z.literal("stats"),
  clients: z.array(ClientStatsSchema),
  /** the most recent beats, oldest first */
  recentBeats: z.array(BeatSpreadSchema),
});
export type Stats = z.infer<typeof StatsSchema>;

// ---------------------------------------------------------------------------
// Task 2 — the Navigator's read (§6, amendment 6)

const unit = z.number().min(0).max(1);

export const StreamSchema = z.object({
  /** likelihood; drawn as width */
  p: unit,
  /** plain-language terminus, e.g. "seal failure, 00:01:29" */
  label: z.string().min(1).max(80),
  /** projected ms at which this stream ends */
  terminalMs: z.number().nonnegative().finite(),
  /** drawn as brightness; defaults to p */
  confidence: unit.optional(),
});
export type Stream = z.infer<typeof StreamSchema>;

/** Sent to the Navigator's connection only. The Synaesthete never receives stream content. */
export const BranchSetSchema = z.object({
  t: z.literal("branchSet"),
  streams: z.array(StreamSchema).min(3).max(7),
  horizonMs: z.literal(HORIZON_MS),
  /** projected ms per held ms */
  projectionRate: z.number().positive().finite().default(PROJECTION_RATE_DEFAULT),
});
export type BranchSet = z.infer<typeof BranchSetSchema>;
export type BranchSetInput = z.input<typeof BranchSetSchema>;

export const ReadStartSchema = z.object({
  t: z.literal("readStart"),
  cid: id,
  cLocal: ms,
  cServerEst: ms,
});
export type ReadStart = z.infer<typeof ReadStartSchema>;

export const ReadEndSchema = z.object({
  t: z.literal("readEnd"),
  cid: id,
  cLocal: ms,
  cServerEst: ms,
});
export type ReadEnd = z.infer<typeof ReadEndSchema>;

/**
 * Broadcast to the room on every read start and end. Carries WHO is reading and the cost,
 * never WHAT they see. The Synaesthete's flare and the Theorist's DEBT counter both hang off it.
 */
export const ReadEventSchema = z.object({
  t: z.literal("readEvent"),
  readId: id,
  /** the reader's anonymous player label */
  label: z.string().min(1),
  phase: z.enum(["start", "end"]),
  /** room time of the start or the release, from the server's own clock */
  serverTime: ms,
  /** DEBT after this event */
  debt: z.number().int().nonnegative(),
  /** end only: how long the read was held, in server time */
  durationMs: ms.optional(),
  /** end only: durationMs × projectionRate */
  projectedMs: ms.optional(),
  /** end only */
  pastHorizon: z.boolean().optional(),
  /** end only: DEBT added by this read */
  debtDelta: z.number().int().optional(),
  /** end only: a dropped socket releases the read */
  endedBy: z.enum(["release", "disconnect"]).optional(),
});
export type ReadEvent = z.infer<typeof ReadEventSchema>;

// ---------------------------------------------------------------------------
// Unions

export const ClientMessageSchema = z.discriminatedUnion("t", [
  HelloSchema,
  PingSchema,
  TapSchema,
  ActStartSchema,
  ReadStartSchema,
  ReadEndSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion("t", [
  PongSchema,
  ScheduleSchema,
  TapScoreSchema,
  ActStartSchema,
  ActResultSchema,
  SnapshotSchema,
  StatsSchema,
  BranchSetSchema,
  ReadEventSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export type ParseResult<T> = { ok: true; msg: T } | { ok: false; error: string };

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: "invalid JSON" };
    }
  }
  const r = schema.safeParse(data);
  return r.success ? { ok: true, msg: r.data } : { ok: false, error: r.error.message };
}

/** Parse a raw client → server frame (string or already-parsed JSON). */
export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  return parseWith(ClientMessageSchema, raw);
}

/** Parse a raw server → client frame (string or already-parsed JSON). */
export function parseServerMessage(raw: unknown): ParseResult<ServerMessage> {
  return parseWith(ServerMessageSchema, raw);
}
