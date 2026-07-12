import type { ChatMode, ChatModeService } from "./chatMode";
import { getChatExecutionPolicy } from "./chatExecutionPolicy";
import { CITATION_CONTRACT_PROMPT } from "./citationContract";

export interface AthenaAgentSpec {
  id: string;
  name: string;
  persona: string;
  prompt?: string;
  tags?: string[];
}

export interface AthenaRunPayload {
  provider: string;
  model: string;
  prompt: string;
  timeoutMs?: number;
}

export interface AthenaThreadRecord {
  id: string;
  sessionId: string;
  title: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

export interface AthenaService {
  getCurrentMode(): ChatMode;
  setMode(mode: ChatMode): Promise<void>;
  createModeConfig(mode: ChatMode): { mode: ChatMode; timestamp: number };
  loadModeFromMetadata(metadata: Record<string, any>): ChatMode | null;

  buildAgentRosterPrompt(agents: AthenaAgentSpec[]): string;
  buildDirectAthenaPrompt(input: {
    query: string;
    historyContext: string;
    filesContext?: string;
    sessionSummary?: string;
    fallbackWarning?: string;
    allowDeepSearch?: boolean;
  }): string;
  buildDirectAgentPrompt(input: {
    agent: AthenaAgentSpec;
    query: string;
    historyContext: string;
    filesContext?: string;
    sessionSummary?: string;
    fallbackWarning?: string;
    allowDeepSearch?: boolean;
    resolvedInstructions?: string;
  }): string;
  buildModeratorDecisionPrompt(input: {
    userQuery: string;
    historyContext: string;
    turnContext?: string;
    midRunContext?: string;
    sessionSummary?: string;
    filesContext?: string;
    fallbackWarning?: string;
    currentTurn: number;
    maxTurns: number;
    agentRosterPrompt: string;
  }): string;
  buildSummaryPrompt(input: {
    sessionSummary?: string;
    intent: string;
    userQuery: string;
    engagedAgents: string[];
    finalOutput: string;
    agentResponses: Array<{ agentId: string; agentName: string; persona: string; content: string }>;
    fallbackWarning?: string;
  }): string;

  resolveSpecialistAgents(query: string, agents: AthenaAgentSpec[]): AthenaAgentSpec[];
  resolveAbilities(agent: AthenaAgentSpec): Promise<string>;
  runAgentViaGateway(payload: AthenaRunPayload): Promise<string>;
}

function normalizeStorageMode(storage: Storage | null): ChatMode {
  const stored = storage?.getItem("quorum:chatMode") as ChatMode | null;
  return stored === "debate" ? "debate" : "collaborate";
}

function defaultStorage(): Storage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}

export function createAthenaService(deps: { chatModeService?: ChatModeService; storage?: Storage } = {}): AthenaService {
  const storage = deps.storage ?? defaultStorage();
  const chatModeService = deps.chatModeService;

  return {
    getCurrentMode() {
      return chatModeService?.getCurrentMode?.() ?? normalizeStorageMode(storage);
    },
    async setMode(mode: ChatMode) {
      if (chatModeService) return chatModeService.setMode(mode);
      storage?.setItem("quorum:chatMode", mode);
    },
    createModeConfig(mode: ChatMode) {
      return chatModeService?.createConfig(mode) ?? { mode, timestamp: Date.now() };
    },
    loadModeFromMetadata(metadata: Record<string, any>) {
      return chatModeService?.loadFromMetadata(metadata) ?? (metadata?.chatMode === "debate" ? "debate" : metadata?.chatMode === "collaborate" ? "collaborate" : null);
    },
    buildAgentRosterPrompt(agents) {
      return agents
        .filter(agent => agent.id && agent.name && agent.persona)
        .map(agent => {
          const tags = agent.tags?.length ? ` tags="${agent.tags.join(",")}"` : "";
          const prompt = agent.prompt ? ` prompt="${agent.prompt}"` : "";
          return `- id="${agent.id}" name="${agent.name}" persona="${agent.persona}"${tags}${prompt}`;
        })
        .join("\n");
    },
    buildDirectAthenaPrompt({ query, historyContext, filesContext, sessionSummary, fallbackWarning, allowDeepSearch }) {
      const executionPolicy = getChatExecutionPolicy(allowDeepSearch === true);
      return `
You are an AI assistant operating as the orchestration moderator (internal designation: ATHENA) for a multi-agent reasoning system. The operator is chatting with you directly, bypassing the Swarm structure.
${fallbackWarning || ""}

Directive from operator: ${query}${filesContext || ""}
${historyContext}

[NON-NEGOTIABLE INTENT DIRECTIVE]
The identified user intent is: "${query}" (Direct chat). This is a non-negotiable instruction that must be strictly followed. You are not permitted to negotiate, modify, or bypass this intent.

SEARCH_EXECUTION_POLICY: ${executionPolicy.promptDirective}

CURRENT_SESSION_SUMMARY:
"${sessionSummary || "No previous summary available."}"

CORE MANDATE: Communicate ONLY FACTS.
- Report ONLY verified facts. Do not speculate, assume, or report unverified assertions.
- Test the leading interpretation against the strongest plausible alternative before answering.
- Agreement with prior context is not evidence; disclose material uncertainty and counterevidence.
- Answer with focused Markdown.

${CITATION_CONTRACT_PROMPT}
`;
    },
    buildDirectAgentPrompt({ agent, query, historyContext, filesContext, sessionSummary, fallbackWarning, allowDeepSearch, resolvedInstructions }) {
      const executionPolicy = getChatExecutionPolicy(allowDeepSearch === true);
      return `
${resolvedInstructions || `You are an AI assistant serving as a ${agent.persona} specialist in a multi-agent reasoning system. Your designation in this system is ${agent.name}.`}
${agent.prompt ? `Standing instruction: ${agent.prompt}` : ""}
${fallbackWarning || ""}

Directive from operator: ${query}${filesContext || ""}
${historyContext}

[NON-NEGOTIABLE INTENT DIRECTIVE]
The identified user intent is: "${query}" (Direct chat with ${agent.name}). This is a non-negotiable instruction that must be strictly followed. You are not permitted to negotiate, modify, or bypass this intent.

SEARCH_EXECUTION_POLICY: ${executionPolicy.promptDirective}

CURRENT_SESSION_SUMMARY:
"${sessionSummary || "No previous summary available."}"

CORE MANDATE: Communicate ONLY FACTS.
- Report ONLY verified facts. Do not speculate, assume, or report unverified assertions.
- Work independently from the expected answer. Actively look for evidence that would falsify the leading conclusion.
- Distinguish verified findings, assumptions, and unresolved gaps.
- Answer with focused Markdown. Stay inside your persona and only solve the task.

${CITATION_CONTRACT_PROMPT}
`;
    },
    buildModeratorDecisionPrompt({ userQuery, historyContext, turnContext, midRunContext, sessionSummary, filesContext, fallbackWarning, currentTurn, maxTurns, agentRosterPrompt }) {
      return `
You are an AI assistant operating as the orchestration moderator (internal designation: ATHENA) for a multi-agent reasoning system.

ROLE DESCRIPTION:
You are the Gatekeeper. Analyze the request, formulate a clear reasoning goal, and engage only agents whose distinct expertise materially improves the answer.
- Default to one specialist and never engage more than two.
- Every selected agent must have a specific, non-overlapping contribution.
- Prefer a direct response when specialist work would not change the answer.
- Treat token cost and elapsed time as constraints.

${historyContext}
${turnContext || ""}
${midRunContext || ""}
${fallbackWarning || ""}
CURRENT_SESSION_SUMMARY: "${sessionSummary || "No previous summary available."}"

User directive: "${userQuery}${filesContext || ""}"
Current Reasoning Turn: ${currentTurn} of ${maxTurns}
Available agents:
${agentRosterPrompt}

CORE MANDATE: Communicate ONLY FACTS to the user.
1. Anything that isn't a verified fact must remain in your "thought" or "whisper".
2. Every direct_response must satisfy this contract:
${CITATION_CONTRACT_PROMPT}
3. Prevent confirmation bias: seek disconfirming evidence, preserve material disagreement, and never treat consensus as proof.
4. If added user context is present, explicitly revise the plan before finalizing.
`;
    },
    buildSummaryPrompt({ sessionSummary, intent, userQuery, engagedAgents, finalOutput, agentResponses, fallbackWarning }) {
      return `
You are an AI assistant operating as the orchestration moderator (internal designation: ATHENA) for a multi-agent reasoning system. A reasoning run has just completed.
${fallbackWarning || ""}

CURRENT_SESSION_SUMMARY:
"${sessionSummary || "No previous summary available."}"

LATEST_TURN_DATA:
- User Asked: "${userQuery}"
- Intent: "${intent}"
- Engaged Agents: ${JSON.stringify(engagedAgents)}
- Agent Responses: ${JSON.stringify(agentResponses)}
- Final Output Sent to User: "${finalOutput}"

TASK:
You MUST append a summary of the latest turn to the CURRENT_SESSION_SUMMARY.
Return ONLY the complete updated session summary (previous summary + appended new turn).
`;
    },
    resolveSpecialistAgents(query, agents) {
      const lower = query.toLowerCase();
      const specialists = agents.filter(agent => {
        const tokens = [agent.id, agent.name, agent.persona, ...(agent.tags || [])].filter(Boolean).map(v => String(v).toLowerCase());
        return tokens.some(token => lower.includes(token));
      });
      return specialists.length > 0 ? specialists : agents.slice(0, Math.min(3, agents.length));
    },
    async resolveAbilities(agent) {
      if (typeof window.system?.callMcpTool !== "function") {
        return `You are ${agent.name}, a configured Quorum agent.\nPersona: ${agent.persona}`;
      }
      const res = await window.system.callMcpTool("savant-abilities", "resolve_abilities", {
        persona: agent.persona,
        tags: agent.tags || [],
      });
      return res.content?.[0]?.text || "";
    },
    async runAgentViaGateway(payload) {
      if (typeof window.system?.runAgentViaGateway === "function") {
        return window.system.runAgentViaGateway(payload);
      }
      throw new Error("Gateway runner bridge unavailable.");
    },
  };
}
