import { describe, expect, it } from "vitest";
import {
  buildWithheldCitationResponse,
  validateCitationContract,
  parseCitationsFromMarkdown,
  normalizeCitationResponse,
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

  it("accepts user-friendly fact-centric 4-column citation tables", () => {
    const response = `The database uses SQLite WAL mode for fast writes. [CITE:1]

## Citations
| Citation | Key Fact | Source | Details |
| --- | --- | --- | --- |
| [CITE:1] | SQLite uses WAL journal mode | src/main/electron/main.ts | Enables high concurrency without read locks |`;

    expect(validateCitationContract(response)).toEqual({ valid: true, errors: [] });
  });

  it("parses structured citation items from markdown", () => {
    const response = `Here is the conclusion. [CITE:1]

## Citations
| Citation | Key Fact | Source | Details |
| --- | --- | --- | --- |
| [CITE:1] | Memory limit is 4GB | package.json | Configured for Node heap safety |`;

    const parsed = parseCitationsFromMarkdown(response);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("1");
    expect(parsed[0].source).toBe("package.json");
    expect(parsed[0].fact).toBe("Memory limit is 4GB");
  });

  it("auto-normalizes responses missing full citation tables to ensure fast resilience", () => {
    const raw = `The system runs at 60 FPS smoothly.`;
    const normalized = normalizeCitationResponse(raw, "Athena");
    expect(validateCitationContract(normalized).valid).toBe(true);
    expect(normalized).toContain("## Citations");
    expect(normalized).toContain("[CITE:1]");
  });
});

