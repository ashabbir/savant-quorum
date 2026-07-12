import { describe, expect, it } from "vitest";
import {
  buildMandatoryCrossChecks,
  DEEP_AGENT_TIMEOUT_MS,
  DEEP_WORKSPACE_QUERY_LIMIT,
  getRecoverableAgentRunId,
  getChatExecutionPolicy,
  MODERATOR_DECISION_TIMEOUT_MS,
  requiresIndependentReview,
  REGULAR_AGENT_TIMEOUT_MS,
  selectValueAddingAgents,
  shouldDecomposeRequest,
} from "../../services/chatExecutionPolicy";
import { createAthenaService } from "../../services/athenaService";

describe("chat execution policy", () => {
  it("extracts a recoverable gateway run ID from Electron-wrapped timeout errors", () => {
    const error = new Error(
      "Error invoking remote method 'run-agent-via-gateway': Error: RECOVERABLE_AGENT_TIMEOUT runId=run-123 after 180000ms",
    );

    expect(getRecoverableAgentRunId(error)).toBe("run-123");
    expect(getRecoverableAgentRunId("RECOVERABLE_AGENT_DISCONNECT runId=run-456 after 300000ms")).toBe("run-456");
    expect(getRecoverableAgentRunId(new Error("AGENT_TIMEOUT after 180000ms"))).toBeNull();
  });

  it("keeps regular mode prompt and lookup behavior bounded", () => {
    const policy = getChatExecutionPolicy(false);

    expect(policy.mode).toBe("regular");
    expect(policy.timeoutMs).toBe(REGULAR_AGENT_TIMEOUT_MS);
    expect(policy.workspaceQueryLimit).toBeNull();
    expect(policy.promptDirective).toContain("answer promptly");
    expect(policy.promptDirective).toContain("only a targeted lookup");
    expect(policy.promptDirective).toContain("without looping");
  });

  it("keeps Athena moderation fast enough to fall back without blocking the chat", () => {
    expect(MODERATOR_DECISION_TIMEOUT_MS).toBe(30_000);
    expect(MODERATOR_DECISION_TIMEOUT_MS).toBeLessThan(REGULAR_AGENT_TIMEOUT_MS);
  });

  it("requires systematic, resilient deep research within three queries", () => {
    const policy = getChatExecutionPolicy(true);

    expect(policy.mode).toBe("deep");
    expect(policy.timeoutMs).toBe(DEEP_AGENT_TIMEOUT_MS);
    expect(policy.workspaceQueryLimit).toBe(DEEP_WORKSPACE_QUERY_LIMIT);
    expect(policy.promptDirective).toContain("no more than 3 targeted workspace queries");
    expect(policy.promptDirective).toContain("at least 2 relevant sources");
    expect(policy.promptDirective).toContain("failed searches");
    expect(policy.promptDirective).toContain("best evidence-backed result");
  });

  it("injects the selected execution policy into agent prompts", () => {
    const service = createAthenaService({ storage: null });
    const base = {
      agent: { id: "engineer", name: "Engineer", persona: "engineer" },
      query: "Investigate the flow",
      historyContext: "",
      filesContext: "",
      sessionSummary: "",
      fallbackWarning: "",
      resolvedInstructions: "",
    };

    const regularPrompt = service.buildDirectAgentPrompt({ ...base, allowDeepSearch: false });
    const deepPrompt = service.buildDirectAgentPrompt({ ...base, allowDeepSearch: true });

    expect(regularPrompt).toContain("REGULAR SEARCH: answer promptly");
    expect(deepPrompt).toContain("DEEP SEARCH: systematically investigate");
    expect(deepPrompt).toContain("no more than 3 targeted workspace queries");
  });
});

describe("mandatory swarm cross-checks", () => {
  const results = [
    { agentId: "engineer", agentName: "Engineer", status: "complete" },
    { agentId: "security", agentName: "Security", status: "complete" },
    { agentId: "architect", agentName: "Architect", status: "error" },
  ];

  it("creates one deterministic adversarial review when Athena omits it", () => {
    expect(buildMandatoryCrossChecks(results, [])).toEqual([
      {
        from: "security",
        to: "engineer",
        reason: "Targeted adversarial review of the most material output",
      },
    ]);
  });

  it("normalizes the first valid requested review and ignores invalid extras", () => {
    const checks = buildMandatoryCrossChecks(results, [
      { from: "Security", to: "Engineer", reason: "Validate implementation" },
      { from: "security", to: "security", reason: "Invalid self-review" },
    ]);

    expect(checks).toEqual([{ from: "security", to: "engineer", reason: "Validate implementation" }]);
  });

  it("does not claim independent validation with fewer than two successful agents", () => {
    expect(buildMandatoryCrossChecks(results.slice(0, 1), [])).toEqual([]);
  });

  it("skips cross-check cost when the task does not require independent review", () => {
    expect(buildMandatoryCrossChecks(results, [], false)).toEqual([]);
  });
});

describe("cost-aware swarm moderation", () => {
  const agents = [
    { id: "engineer", name: "Engineer", persona: "engineer", tags: ["implementation", "frontend"] },
    { id: "architect", name: "Architect", persona: "architect", tags: ["systems", "design"] },
    { id: "security", name: "Security", persona: "security", tags: ["risk", "audit"] },
  ];

  it("uses one relevant agent for a focused low-risk request", () => {
    expect(selectValueAddingAgents(["engineer"], agents, "Fix the frontend button")).toEqual([
      agents[0],
    ]);
  });

  it("preserves two complementary agents explicitly selected by Athena", () => {
    expect(selectValueAddingAgents(["architect", "engineer"], agents, "Design and implement the flow")).toEqual([
      agents[1],
      agents[0],
    ]);
  });

  it("adds one distinct reviewer for material decisions and never exceeds two agents", () => {
    expect(selectValueAddingAgents(["engineer"], agents, "Audit the production security risk")).toEqual([
      agents[0],
      agents[2],
    ]);
  });

  it("detects when independent review is worth its cost", () => {
    expect(requiresIndependentReview("Audit the production migration risk")).toBe(true);
    expect(requiresIndependentReview("Is this safe to ship to prod?")).toBe(true);
    expect(requiresIndependentReview("Render an asterisk")).toBe(false);
    expect(requiresIndependentReview("Rename this button")).toBe(false);
  });

  it("avoids an intent-analysis model call for normal single-focus messages", () => {
    expect(shouldDecomposeRequest("Explain how Athena selects an agent.")).toBe(false);
    expect(shouldDecomposeRequest("First inspect selection;\n- reduce cost\n- add bias controls")).toBe(true);
  });
});
