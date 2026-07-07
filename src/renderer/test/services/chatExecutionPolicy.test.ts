import { describe, expect, it } from "vitest";
import {
  buildMandatoryCrossChecks,
  DEEP_AGENT_TIMEOUT_MS,
  DEEP_WORKSPACE_QUERY_LIMIT,
  getChatExecutionPolicy,
  REGULAR_AGENT_TIMEOUT_MS,
} from "../../services/chatExecutionPolicy";
import { createAthenaService } from "../../services/athenaService";

describe("chat execution policy", () => {
  it("keeps regular mode prompt and lookup behavior bounded", () => {
    const policy = getChatExecutionPolicy(false);

    expect(policy.mode).toBe("regular");
    expect(policy.timeoutMs).toBe(REGULAR_AGENT_TIMEOUT_MS);
    expect(policy.workspaceQueryLimit).toBeNull();
    expect(policy.promptDirective).toContain("answer promptly");
    expect(policy.promptDirective).toContain("only a targeted lookup");
    expect(policy.promptDirective).toContain("without looping");
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

  it("creates deterministic reviews when Athena omits them", () => {
    expect(buildMandatoryCrossChecks(results, [])).toEqual([
      {
        from: "security",
        to: "engineer",
        reason: "Mandatory independent accuracy and consistency review",
      },
      {
        from: "engineer",
        to: "security",
        reason: "Mandatory independent accuracy and consistency review",
      },
    ]);
  });

  it("normalizes valid requested reviews and replaces invalid self-reviews", () => {
    const checks = buildMandatoryCrossChecks(results, [
      { from: "Security", to: "Engineer", reason: "Validate implementation" },
      { from: "security", to: "security", reason: "Invalid self-review" },
    ]);

    expect(checks[0]).toEqual({ from: "security", to: "engineer", reason: "Validate implementation" });
    expect(checks[1].from).toBe("engineer");
    expect(checks[1].to).toBe("security");
  });

  it("does not claim independent validation with fewer than two successful agents", () => {
    expect(buildMandatoryCrossChecks(results.slice(0, 1), [])).toEqual([]);
  });
});
