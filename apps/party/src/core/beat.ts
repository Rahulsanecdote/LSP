import {
  BEAT_INTERVAL_MS,
  BEAT_WINDOW_MS,
  SCHEDULE_HORIZON_MS,
  SCHEDULE_REBROADCAST_MS,
  type Schedule,
} from "@lsp/protocol";

/**
 * Schedule, don't tick (SLICE_HANDOFF.md §5). The server tells clients WHEN beats will occur;
 * clients render beats locally from `epoch + n·interval − offset`.
 *
 * The epoch is fixed when the room issues its first schedule and never moves, so beat indices
 * are stable for the life of the room. Each re-broadcast only extends `until`.
 */

export function issueSchedule(now: number, previous: Schedule | null): Schedule {
  return {
    t: "schedule",
    epoch: previous?.epoch ?? now,
    interval: BEAT_INTERVAL_MS,
    until: now + SCHEDULE_HORIZON_MS,
    windowMs: BEAT_WINDOW_MS,
  };
}

export function scheduleDue(now: number, issuedAt: number | null): boolean {
  return issuedAt === null || now - issuedAt >= SCHEDULE_REBROADCAST_MS;
}

export function nextScheduleAt(issuedAt: number | null): number | null {
  return issuedAt === null ? null : issuedAt + SCHEDULE_REBROADCAST_MS;
}
