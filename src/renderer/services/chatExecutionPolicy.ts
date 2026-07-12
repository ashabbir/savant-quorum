export const REGULAR_AGENT_TIMEOUT_MS = 180_000;
export const DEEP_AGENT_TIMEOUT_MS = 300_000;
export const MODERATOR_DECISION_TIMEOUT_MS = 30_000;
export const DEEP_WORKSPACE_QUERY_LIMIT = 3;
export const DEEP_MIN_RELEVANT_SOURCES = 2;
export const MAX_SWARM_AGENTS = 2;

export function getRecoverableAgentRunId(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.match(/RECOVERABLE_AGENT_(?:TIMEOUT|DISCONNECT) runId=([^\s]+)/)?.[1] || null;
}
export const MAX_CROSS_CHECKS = 1;

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

export interface SelectableAgent {
  id: string;
  name: string;
  persona: string;
  tags?: string[];
}

export interface CrossCheckRequest {
  from: string;
  to: string;
  reason: string;
}

const INDEPENDENT_REVIEW_TERMS = [
  "audit",
  "break",
  "compare",
  "compliance",
  "critical",
  "decision",
  "migration",
  "prod",
  "production",
  "recommend",
  "risk",
  "safe",
  "security",
  "ship",
  "validate",
  "verify",
];

export function requiresIndependentReview(query: string): boolean {
  const normalized = query.toLowerCase();
  return INDEPENDENT_REVIEW_TERMS.some(term => new RegExp(`\\b${term}\\b`, "i").test(normalized));
}

export function shouldDecomposeRequest(query: string): boolean {
  const nonEmptyLines = query.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const bulletCount = nonEmptyLines.filter(line => /^[-*]\s+|^\d+[.)]\s+/.test(line)).length;
  if (bulletCount >= 2) return true;

  const clauses = query.split(";").map(clause => clause.trim()).filter(Boolean);
  if (clauses.length >= 2) return true;

  return query.length > 140 && /\b(and then|as well as|also|plus)\b/i.test(query);
}

function agentRelevance(agent: SelectableAgent, query: string): number {
  const normalized = query.toLowerCase();
  return [agent.id, agent.name, agent.persona, ...(agent.tags || [])]
    .filter(Boolean)
    .reduce((score, token) => score + (normalized.includes(String(token).toLowerCase()) ? 1 : 0), 0);
}

export function selectValueAddingAgents<T extends SelectableAgent>(
  requestedAgents: unknown,
  roster: T[],
  query: string,
): T[] {
  if (roster.length === 0) return [];

  const requested = Array.isArray(requestedAgents) ? requestedAgents : [];
  const seen = new Set<string>();
  const candidates = requested
    .map(value => String(value || "").trim().toLowerCase())
    .map(value => roster.find(agent =>
      [agent.id, agent.name, agent.persona]
        .filter(Boolean)
        .some(key => String(key).toLowerCase() === value)
    ))
    .filter((agent): agent is T => Boolean(agent))
    .filter(agent => {
      if (seen.has(agent.id)) return false;
      seen.add(agent.id);
      return true;
    });
  const rankedRoster = roster
    .map((agent, index) => ({ agent, index, score: agentRelevance(agent, query) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = candidates.length > 0
    ? candidates.slice(0, MAX_SWARM_AGENTS)
    : [rankedRoster[0].agent];

  if (requiresIndependentReview(query) && selected.length === 1) {
    const reviewer = rankedRoster
      .find(item => item.agent.id !== selected[0].id)?.agent;
    if (reviewer) selected.push(reviewer);
  }
  return selected.slice(0, MAX_SWARM_AGENTS);
}

export function buildMandatoryCrossChecks(
  results: CompletedAgentResult[],
  requested: unknown,
  requireReview = true,
): CrossCheckRequest[] {
  if (!requireReview) return [];
  const successful = results.filter(result => result.status === "complete");
  if (successful.length < 2) return [];

  const requestedChecks = Array.isArray(requested) ? requested : [];
  const findAgent = (value: unknown) => successful.find(result =>
    result.agentId === value || result.agentName.toLowerCase() === String(value).toLowerCase()
  );
  const validCheck = requestedChecks.find((request: any) => {
    const from = findAgent(request?.from);
    const to = findAgent(request?.to);
    return from && to && from.agentId !== to.agentId;
  });

  if (validCheck) {
    return [{
      from: findAgent(validCheck.from)!.agentId,
      to: findAgent(validCheck.to)!.agentId,
      reason: validCheck.reason || "Targeted adversarial review of the most material output",
    }];
  }

  return [{
    from: successful[1].agentId,
    to: successful[0].agentId,
    reason: "Targeted adversarial review of the most material output",
  }].slice(0, MAX_CROSS_CHECKS);
}
