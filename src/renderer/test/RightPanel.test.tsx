import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { RightPanel } from "../components/RightPanel";

describe("RightPanel insights", () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    };
  });

  it("shows a question-driven insights dashboard backed by session data", () => {
    render(
      <RightPanel
        statusText="SYNTHESIZING ANSWER"
        sessionSummary=""
        onSummarize={() => undefined}
        thinking={[
          { id: "t1", agent: "Athena", thought: "CALL_GATEWAY", timestamp: 1, type: "mcp_call" },
          { id: "t2", agent: "Engineer", thought: "Completed analysis", timestamp: 2, type: "worker_end" },
        ]}
        messages={[
          { id: "m1", role: "user", content: "Check the PMI status", timestamp: 1 },
          { id: "m2", role: "agent-whisper", from: "Engineer", content: "Found project evidence [CITE:1]", timestamp: 2 },
          { id: "m-status", role: "athena", content: "Engineer still digging and pulling results", timestamp: 2.5 },
          { id: "m-tool", role: "architect", content: "Search savant-knowledge integration design evidence payload", timestamp: 2.75 },
          {
            id: "m3",
            role: "athena",
            content: "PMI is active. [CITE:1]\n\n## Citations\n| Citation | Source | Evidence |\n| --- | --- | --- |\n| [CITE:1] | Monday | Project status |",
            timestamp: 3,
          },
        ]}
        sessionMetadata={{
          pulseIntents: [{
            request: "Check the PMI status",
            timestamp: 1,
            source: "ai",
            summary: "Verify the current PMI delivery status",
            goal: "Determine whether PMI is active",
            action: "Check current project evidence",
            entities: ["PMI"],
            constraints: [],
            expectedOutcome: "A confirmed PMI status",
            topics: ["PMI delivery status"],
            rankedIntents: [],
          }],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /pulse insights/i }));

    expect(screen.getByRole("heading", { name: "Topic drift" })).toBeInTheDocument();
    expect(screen.getByText("Topic drift timeline")).toBeInTheDocument();
    expect(screen.getByText("Confirmation bias")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /agreement \d+, challenge \d+/i })).toBeInTheDocument();
    expect(screen.getByLabelText("AI INTENT to ATHENA")).toBeInTheDocument();
    expect(screen.queryByText(/Engineer still digging/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Search savant-knowledge/i)).not.toBeInTheDocument();
    expect(screen.getByText("Context retention")).toBeInTheDocument();
    expect(screen.getByText("Hallucination risk")).toBeInTheDocument();
    expect(screen.getByText("Human input adoption")).toBeInTheDocument();
    expect(screen.getByText("Contradiction handling")).toBeInTheDocument();
    expect(screen.getByText("Quality attention queue")).toBeInTheDocument();
    expect(screen.getByText("Topics discussed")).toBeInTheDocument();
    expect(screen.getByText("User Request Topics")).toBeInTheDocument();
    expect(screen.getAllByText("PMI delivery status").length).toBeGreaterThan(0);
    expect(screen.queryByText("Lexical Keyword Frequency")).not.toBeInTheDocument();
    expect(screen.getByText("Tools used")).toBeInTheDocument();
    expect(screen.getByText("Agent contribution ledger")).toBeInTheDocument();
    expect(screen.getByText("Models and usage")).toBeInTheDocument();
    expect(screen.getByText("Verify the current PMI delivery status")).toBeInTheDocument();
  });

  it("offers rendered and source modes for markdown summaries", () => {
    render(
      <RightPanel
        statusText="IDLE"
        sessionSummary={"# PMI Status\n\n- Project is **Building**"}
        onSummarize={() => undefined}
        thinking={[]}
        messages={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /summary insights/i }));
    fireEvent.click(screen.getByRole("button", { name: /markdown source/i }));

    expect(screen.getByText(/# PMI Status/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy markdown/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download markdown/i })).toBeInTheDocument();
  });

  it("converts legacy transcript summaries into readable markdown turns", () => {
    render(
      <RightPanel
        statusText="IDLE"
        sessionSummary={'- User asked: "How does user ACL work?"\n- Athena engaged: a1\n- Outcome: "## Answer The gem fetches ACL data. --- ## Evidence and reasoning It caches the result."'}
        onSummarize={() => undefined}
        thinking={[]}
        messages={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /summary insights/i }));

    expect(screen.getByRole("heading", { name: "Session Summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Turn 1" })).toBeInTheDocument();
    expect(screen.getByText("How does user ACL work?")).toBeInTheDocument();
    expect(screen.getByText("Agents:")).toBeInTheDocument();
    expect(screen.getByText("The gem fetches ACL data.")).toBeInTheDocument();
  });
});
