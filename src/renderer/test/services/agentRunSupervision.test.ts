import { describe, expect, it } from "vitest";
import {
  formatRunDuration,
  getRunTiming,
  getStallWarningMs,
} from "../../services/agentRunSupervision";

describe("agent run supervision", () => {
  it("reports elapsed and idle time from the latest activity heartbeat", () => {
    const timing = getRunTiming({
      startedAt: 1_000,
      lastActivityAt: 61_000,
      idleTimeoutMs: 180_000,
    }, 91_000);

    expect(timing.elapsedMs).toBe(90_000);
    expect(timing.idleMs).toBe(30_000);
    expect(timing.idleRemainingMs).toBe(150_000);
  });

  it("bounds the stalled-run warning window", () => {
    expect(getStallWarningMs(30_000)).toBe(30_000);
    expect(getStallWarningMs(180_000)).toBe(90_000);
    expect(getStallWarningMs(600_000)).toBe(90_000);
  });

  it("formats visible run timers", () => {
    expect(formatRunDuration(0)).toBe("00:00");
    expect(formatRunDuration(125_000)).toBe("02:05");
  });
});
