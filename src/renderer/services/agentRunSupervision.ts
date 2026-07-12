export interface AgentRunDisplayState {
  status: string;
  runId?: string;
  events?: any[];
  startedAt?: number;
  lastActivityAt?: number;
  idleTimeoutMs?: number;
}

export function formatRunDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function getStallWarningMs(idleTimeoutMs: number): number {
  return Math.max(30_000, Math.min(90_000, Math.floor(idleTimeoutMs * 0.6)));
}

export function getRunTiming(
  state: Pick<AgentRunDisplayState, "startedAt" | "lastActivityAt" | "idleTimeoutMs">,
  now = Date.now(),
) {
  const startedAt = state.startedAt || now;
  const lastActivityAt = state.lastActivityAt || startedAt;
  const idleTimeoutMs = state.idleTimeoutMs || 180_000;
  const elapsedMs = Math.max(0, now - startedAt);
  const idleMs = Math.max(0, now - lastActivityAt);

  return {
    elapsedMs,
    idleMs,
    idleRemainingMs: Math.max(0, idleTimeoutMs - idleMs),
    stallWarningMs: getStallWarningMs(idleTimeoutMs),
  };
}
