import { describe, expect, it } from "vitest";
import {
  buildWithheldCitationResponse,
  validateCitationContract,
} from "../../services/citationContract";
import { createAthenaService } from "../../services/athenaService";

describe("citation contract", () => {
  it("accepts inline citations with a matching proper table", () => {
    const response = `The timeout is 90 seconds. [CITE:1]

## Citations
| Citation | Source | Evidence |
| --- | --- | --- |
| [CITE:1] | src/renderer/services/chatExecutionPolicy.ts | REGULAR_AGENT_TIMEOUT_MS is 90_000 |`;

    expect(validateCitationContract(response)).toEqual({ valid: true, errors: [] });
  });

  it("rejects missing, unmatched, duplicate, and placeholder citations", () => {
    const response = `A claim. [CITE:1]

## Citations
| Citation | Source | Evidence |
| --- | --- | --- |
| [CITE:2] | unknown | evidence |
| [CITE:2] | unknown | evidence |`;
    const result = validateCitationContract(response);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("[CITE:1] is used inline but missing from the citation table");
    expect(result.errors).toContain("[CITE:2] appears in the table but is not used inline");
    expect(result.errors).toContain("Citation table contains duplicate citation IDs");
  });

  it("produces a valid, non-fabricated withheld response", () => {
    const response = buildWithheldCitationResponse("Engineer", ["Missing citation table"]);
    expect(validateCitationContract(response).valid).toBe(true);
    expect(response).toContain("Quorum citation validator");
  });

  it("injects the same citation contract into direct and moderator prompts", () => {
    const service = createAthenaService({ storage: null });
    const direct = service.buildDirectAthenaPrompt({
      query: "Explain the flow",
      historyContext: "",
      filesContext: "",
      sessionSummary: "",
      fallbackWarning: "",
      allowDeepSearch: false,
    });
    const moderator = service.buildModeratorDecisionPrompt({
      userQuery: "Explain the flow",
      historyContext: "",
      turnContext: "",
      midRunContext: "",
      sessionSummary: "",
      filesContext: "",
      fallbackWarning: "",
      currentTurn: 1,
      maxTurns: 2,
      agentRosterPrompt: "- engineer",
    });

    for (const prompt of [direct, moderator]) {
      expect(prompt).toContain("CITATION CONTRACT (MANDATORY FOR EVERY RESPONSE)");
      expect(prompt).toContain("| Citation | Source | Evidence |");
    }
  });
});
