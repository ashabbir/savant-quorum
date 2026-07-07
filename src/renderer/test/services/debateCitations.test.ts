import { describe, expect, it, vi } from "vitest";
import { createDebateOrchestrator } from "../../services/debateOrchestrator";
import { validateCitationContract } from "../../services/citationContract";

describe("debate citation enforcement", () => {
  it("never exposes an uncited debate response", async () => {
    const execute = vi.fn().mockResolvedValue("An uncited claim");
    const orchestrator = createDebateOrchestrator({ execute });

    const result = await orchestrator.runDebate({
      prompt: "Debate the architecture",
      agents: ["Engineer", "Architect", "Security"],
      providers: [],
    });

    for (const round of result.rounds) {
      for (const response of Object.values(round.agentResponses)) {
        expect(validateCitationContract(response).valid).toBe(true);
        expect(response).toContain("response was withheld");
      }
    }
    expect(validateCitationContract(result.winner.response).valid).toBe(true);
  });
});
