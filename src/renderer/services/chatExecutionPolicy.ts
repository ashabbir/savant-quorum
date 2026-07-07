export const REGULAR_AGENT_TIMEOUT_MS = 90_000;
export const DEEP_AGENT_TIMEOUT_MS = 300_000;
export const DEEP_WORKSPACE_QUERY_LIMIT = 3;
export const DEEP_MIN_RELEVANT_SOURCES = 2;

export type SearchMode = "regular" | "deep";

export interface ChatExecutionPolicy {
  mode: SearchMode;
  timeoutMs: number;
  workspaceQueryLimit: number | null;
  promptDirective: string;
}

export function getChatExecutionPolicy(allowDeepSearch: boolean): ChatExecutionPolicy {
  if (allowDeepSearch) {
    return {
      mode: "deep",
      timeoutMs: DEEP_AGENT_TIMEOUT_MS,
      workspaceQueryLimit: DEEP_WORKSPACE_QUERY_LIMIT,
      promptDirective: [
        "DEEP SEARCH: systematically investigate the relevant workspace evidence.",
        `Run no more than ${DEEP_WORKSPACE_QUERY_LIMIT} targeted workspace queries for this response.`,
        `Use at least ${DEEP_MIN_RELEVANT_SOURCES} relevant sources when available and cross-check material claims between them.`,
        "Record unavailable or failed searches, continue with the remaining evidence, and return the best evidence-backed result within the budget.",
        "Stop immediately when additional searching produces duplicate or immaterial evidence.",
      ].join(" "),
    };
  }

  return {
    mode: "regular",
    timeoutMs: REGULAR_AGENT_TIMEOUT_MS,
    workspaceQueryLimit: null,
    promptDirective: [
      "REGULAR SEARCH: answer promptly from the supplied session context.",
      "Perform only a targeted lookup that is required to make a material claim correct; do not run broad, recursive, or exploratory workspace searches.",
      "If required evidence is unavailable, state the limitation and return the best supported answer without looping.",
    ].join(" "),
  };
}

export interface CompletedAgentResult {
  agentId: string;
  agentName: string;
  status: string;
}

export interface CrossCheckRequest {
  from: string;
  to: string;
  reason: string;
}

export function buildMandatoryCrossChecks(results: CompletedAgentResult[], requested: unknown): CrossCheckRequest[] {
  const successful = results.filter(result => result.status === "complete");
  if (successful.length < 2) return [];

  const requestedChecks = Array.isArray(requested) ? requested : [];
  const findAgent = (value: unknown) => successful.find(result =>
    result.agentId === value || result.agentName.toLowerCase() === String(value).toLowerCase()
  );
  const validChecks = requestedChecks.filter((request: any) => {
    const from = findAgent(request?.from);
    const to = findAgent(request?.to);
    return from && to && from.agentId !== to.agentId;
  });

  return successful.map((result, index) => {
    const requestedCheck = validChecks.find((request: any) => findAgent(request.to)?.agentId === result.agentId);
    if (requestedCheck) {
      return {
        from: findAgent(requestedCheck.from)!.agentId,
        to: result.agentId,
        reason: requestedCheck.reason || "Independent accuracy and consistency review",
      };
    }

    return {
      from: successful[(index + 1) % successful.length].agentId,
      to: result.agentId,
      reason: "Mandatory independent accuracy and consistency review",
    };
  });
}
