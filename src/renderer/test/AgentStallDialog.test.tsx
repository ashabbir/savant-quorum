import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentStallDialog } from "../components/AgentStallDialog";

describe("AgentStallDialog", () => {
  it("asks the operator whether to kill or wait on a stalled run", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T20:00:00.000Z"));
    const now = Date.now();
    const onDecision = vi.fn().mockResolvedValue(undefined);

    try {
      render(
        <AgentStallDialog
          agents={{
            Engineer: {
              status: "Running Splunk and MCP tools...",
              runId: "run-stalled",
              startedAt: now - 120_000,
              lastActivityAt: now - 100_000,
              idleTimeoutMs: 180_000,
            },
          }}
          onDecision={onDecision}
        />,
      );

      expect(screen.getByText(/possible stalled run/i)).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /keep waiting/i }));
      });

      expect(onDecision).toHaveBeenCalledWith("run-stalled", "wait");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not prompt for runs that are already terminal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T20:00:00.000Z"));
    const now = Date.now();

    try {
      render(
        <AgentStallDialog
          agents={{
            Engineer: {
              status: "Run completed successfully.",
              runId: "run-complete",
              startedAt: now - 120_000,
              lastActivityAt: now - 100_000,
              idleTimeoutMs: 180_000,
            },
          }}
          onDecision={vi.fn().mockResolvedValue(undefined)}
        />,
      );

      expect(screen.queryByText(/possible stalled run/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
