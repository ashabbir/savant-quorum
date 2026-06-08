import { useState, useEffect, useRef } from "react";
import { TopBar } from "./components/TopBar";
import { ActionBar } from "./components/ActionBar";
import { LeftSidebar, ChatItem, FolderItem } from "./components/LeftSidebar";
import { ChatArea, Message } from "./components/ChatArea";
import { RightPanel } from "./components/RightPanel";
import { BottomBar } from "./components/BottomBar";
import StartupScreen from './components/StartupScreen';
import { LoginScreen } from "./components/LoginScreen";
import { clearStoredApiKey, getStoredApiKey, setStoredApiKey } from "./services/auth";
import mermaid from "mermaid";

export interface Thinking {
  id: string
  agent: string
  thought: string
  timestamp: number
  type?: "thought" | "mcp_call" | "mcp_response" | "shell" | "worker_start" | "worker_end" | "data_transfer" | "redecision" | "timeout" | "loop_check" | "error"
}

interface AgentConfig {
  id: string
  name: string
  persona: string
  prompt?: string
  tags?: string[]
}

const DEFAULT_AGENTS: AgentConfig[] = [
  { id: "engineer", name: "Engineer", persona: "engineer", tags: ["backend", "frontend", "implementation"] },
  { id: "architect", name: "Architect", persona: "architect", tags: ["systems", "design"] },
  { id: "security", name: "Security", persona: "security", tags: ["review", "risk"] },
]

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true)
  const [startupProgress, setStartupProgress] = useState('BOOTING_SYSTEM')
  const [startupSubtext, setStartupSubtext] = useState('Initializing secure kernel...')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  
  const [messages, setMessages] = useState<Message[]>([])
  const [thinking, setThinking] = useState<Thinking[]>([])
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("IDLE")
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [sessionSummary, setSessionSummary] = useState<string>("");
  const midRunBuffer = useRef<string[]>([]);
  const resolvedAbilitiesCache = useRef<Record<string, string>>({});
  
  const [sessions, setSessions] = useState<any[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState('New Session')

  // UI state for folders (mocked for now as we don't have persistent folders yet)
  const [folders, setFolders] = useState<FolderItem[]>([
    { id: "f1", name: "research" },
    { id: "f2", name: "code sessions" },
  ]);

  const [sessionFolders, setSessionFolders] = useState<Record<string, string | null>>({});

  const loadSessionList = async () => {
    const list = await window.sessions.list()
    setSessions(list)
  }

  const startNewSession = (title?: string) => {
    const newId = `quorum-${Date.now()}`
    setCurrentSessionId(newId)
    setMessages([])
    setThinking([])
    setSessionSummary("")
    setSessionTitle(title || "New Quorum")
    addThinking('System', 'INITIALIZING_QUORUM_HEURISTICS...'); 
    addThinking('System', '----------------------------'); 
    addThinking('System', 'QUORUM_ONLINE')
  }

  const loadSession = async (id: string) => {
    addThinking('System', `SWITCHING_TO_QUORUM: ${id}`)
    const data = await window.sessions.load(id)
    if (data) {
      setCurrentSessionId(id)
      setMessages(data.messages || [])
      setThinking(data.thinking || [])
      setSessionSummary(data.summary || "")
      setSessionTitle(data.title || 'Untitled Quorum')
    }
  }

  const saveCurrentSession = async (updatedMessages?: Message[], updatedThinking?: Thinking[], updatedSummary?: string) => {
    if (!currentSessionId) return
    
    let newTitle = sessionTitle
    const firstUserMsg = (updatedMessages || messages).find(m => m.role === 'user')
    if ((newTitle === 'New Session' || newTitle === 'New Quorum') && firstUserMsg) {
      newTitle = firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '')
      setSessionTitle(newTitle)
    }

    await window.sessions.save({
      id: currentSessionId,
      title: newTitle,
      messages: updatedMessages || messages,
      thinking: updatedThinking || thinking,
      summary: updatedSummary !== undefined ? updatedSummary : sessionSummary
    })
    loadSessionList()
  }

  const deleteSession = async (id: string) => {
    const ok = await window.sessions.delete(id)
    if (ok) {
      setSessionFolders(prev => {
        const updated = { ...prev };
        delete updated[id];
        window.system.saveSetting("system:sessionFolders", updated);
        return updated;
      });
      if (id === currentSessionId) {
        startNewSession()
      } else {
        loadSessionList()
      }
    }
  }

  const renameSession = async (name: string) => {
    if (!currentSessionId) return;
    setSessionTitle(name);
    // save will be triggered by useEffect
  }

  const handleSettingsChanged = async () => {
    const loadedSettings = await window.system.getSettings();
    const localApiKey = getStoredApiKey();
    if (localApiKey && loadedSettings["user:apiKey"] !== localApiKey) {
      loadedSettings["user:apiKey"] = localApiKey;
    }
    setSettings(loadedSettings);
    if (loadedSettings["system:folders"]) {
      setFolders(loadedSettings["system:folders"]);
    }
    if (loadedSettings["system:sessionFolders"]) {
      setSessionFolders(loadedSettings["system:sessionFolders"]);
    }
    addThinking('System', 'SETTINGS_UPDATED_FROM_DATABASE');
  }

  const validateSavantApiKey = async (apiKey: string, loadedSettings: Record<string, any>) => {
    const serverUrl = loadedSettings["server:config"]?.url || "http://127.0.0.1:8090";
    let res: Response;
    try {
      res = await fetch(`${serverUrl.replace(/\/+$/, "")}/api/auth/validate`, {
        headers: { "X-API-Key": apiKey },
      });
    } catch (_e) {
      throw new Error("Cannot reach Savant server auth. Check that savant-server is running and allows X-API-Key CORS preflight.");
    }
    if (!res.ok) {
      throw new Error(res.status === 401 ? "Invalid Savant API key." : `Savant auth failed with ${res.status}.`);
    }
    return await res.json();
  }

  const initializeQuorum = async (loadedSettings: Record<string, any>) => {
    setIsInitializing(true)
    setStartupProgress('CONNECTING_TO_DATABASE')
    setStartupSubtext('Opening persistence layer...')
    await loadSessionList()
    
    setStartupProgress('CHECKING_GATEWAY_LINK')
    setStartupSubtext('Scanning for configured gateway...')
    
    setSettings(loadedSettings);
    if (loadedSettings["system:sessionFolders"]) {
      setSessionFolders(loadedSettings["system:sessionFolders"]);
    }
    
    const gatewayUrl = loadedSettings["gateway:config"]?.url || "http://127.0.0.1:3100";
    const gatewayEnabled = loadedSettings["gateway:config"]?.enabled !== false;

    if (gatewayEnabled) {
      try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/health`)
        if (res.ok) {
          addThinking('System', `GATEWAY_ACP_LINK_ESTABLISHED (${gatewayUrl})`)
        } else {
          addThinking('System', `GATEWAY_RESPONDED_WITH_ERROR (${res.status})`, 'timeout')
        }
      } catch (e) {
        addThinking('System', `GATEWAY_OFFLINE: ${gatewayUrl} (LOCAL_MODE_ENGAGED)`, 'timeout')
      }
    } else {
      addThinking('System', 'GATEWAY_DISABLED (LOCAL_MODE_ENGAGED)')
    }

    const list = await window.sessions.list()
    if (list.length > 0) {
      setStartupProgress('RESTORING_QUORUM')
      setStartupSubtext(`Loading: ${list[0].title}`)
      await loadSession(list[0].id)
    } else {
      setStartupProgress('PROVISIONING_QUORUM')
      setStartupSubtext('Creating initial session...')
      startNewSession()
    }
    
    setStartupProgress('SYSTEM_READY')
    setStartupSubtext('Hand over control to operator...')
    setTimeout(() => setIsInitializing(false), 800)
  }

  useEffect(() => {
    const init = async () => {
      setStartupProgress('AUTHENTICATING_OPERATOR')
      setStartupSubtext('Checking local Savant credential...')

      const loadedSettings = await window.system.getSettings();
      if (loadedSettings["system:folders"]) {
        setFolders(loadedSettings["system:folders"]);
      }
      if (loadedSettings["system:sessionFolders"]) {
        setSessionFolders(loadedSettings["system:sessionFolders"]);
      }
      const localApiKey = getStoredApiKey();
      const persistedApiKey = String(loadedSettings["user:apiKey"] || "").trim();
      const effectiveApiKey = localApiKey || persistedApiKey;

      if (!effectiveApiKey) {
        setSettings(loadedSettings);
        setIsAuthenticated(false);
        setIsInitializing(false);
        return;
      }

      try {
        const auth = await validateSavantApiKey(effectiveApiKey, loadedSettings);
        if (auth?.name && !loadedSettings["user:name"]) {
          loadedSettings["user:name"] = auth.name;
          await window.system.saveSetting("user:name", auth.name);
        }
      } catch (_e) {
        clearStoredApiKey();
        await window.system.saveSetting("user:apiKey", "");
        setSettings({ ...loadedSettings, "user:apiKey": "" });
        setIsAuthenticated(false);
        setIsInitializing(false);
        return;
      }

      setStoredApiKey(effectiveApiKey);
      if (persistedApiKey !== effectiveApiKey) {
        await window.system.saveSetting("user:apiKey", effectiveApiKey);
        loadedSettings["user:apiKey"] = effectiveApiKey;
      }
      setIsAuthenticated(true);
      await initializeQuorum(loadedSettings);
    }
    init()
  }, [])

  const handleLogin = async (apiKey: string) => {
    const trimmed = apiKey.trim();
    const loadedSettings = await window.system.getSettings();
    if (loadedSettings["system:folders"]) {
      setFolders(loadedSettings["system:folders"]);
    }
    if (loadedSettings["system:sessionFolders"]) {
      setSessionFolders(loadedSettings["system:sessionFolders"]);
    }
    const auth = await validateSavantApiKey(trimmed, loadedSettings);
    setStoredApiKey(trimmed);
    await window.system.saveSetting("user:apiKey", trimmed);
    if (auth?.name) {
      await window.system.saveSetting("user:name", auth.name);
      loadedSettings["user:name"] = auth.name;
    }
    loadedSettings["user:apiKey"] = trimmed;
    setIsAuthenticated(true);
    await initializeQuorum(loadedSettings);
  }

  const handleLogout = async () => {
    clearStoredApiKey();
    await window.system.saveSetting("user:apiKey", "");
    setIsAuthenticated(false);
    setIsInitializing(false);
    setIsLoading(false);
    setMessages([]);
    setThinking([]);
    setSessions([]);
    setCurrentSessionId(null);
    setSessionTitle("New Session");
    setSettings(prev => ({ ...prev, "user:apiKey": "" }));
  }

  useEffect(() => {
    if (messages.length > 0 || thinking.length > 0) {
      saveCurrentSession()
    }
  }, [messages, thinking, sessionTitle])

  const addThinking = (agent: string, thought: string, type: Thinking['type'] = 'thought') => {
    setThinking(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      agent,
      thought,
      type,
      timestamp: Date.now()
    }, ...prev])
  }

  const addMessage = (role: Message['role'], content: string, from?: string, to?: string, provider?: string, model?: string) => {
    const id = Math.random().toString(36).substr(2, 9)
    setMessages(prev => [...prev, {
      id,
      role,
      content,
      from,
      to,
      provider,
      model,
      timestamp: Date.now()
    }])
  }

  const cleanResponse = (text: string) => {
    try {
      const trimmed = text.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const obj = JSON.parse(trimmed);
        const extracted = obj.direct_response || obj.content || obj.summary || obj.thought || text;
        return typeof extracted === 'string' ? extracted : JSON.stringify(extracted, null, 2);
      }
    } catch (e) {}
    let cleaned = text.trim();
    if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
    }
    return cleaned;
  }

  const preferredProviderIndexRef = useRef(0);

  const getAgentRoster = (): AgentConfig[] => {
    const configuredAgents = settings["agents:list"];
    if (!Array.isArray(configuredAgents) || configuredAgents.length === 0) {
      return DEFAULT_AGENTS;
    }

    return configuredAgents
      .map((agent: any, index: number) => {
        const name = String(agent.name || agent.id || `agent_${String(index + 1).padStart(2, "0")}`).trim();
        const id = String(agent.id || name).trim();
        const persona = String(agent.persona || "generalist").trim();
        return {
          id,
          name,
          persona,
          prompt: typeof agent.prompt === "string" ? agent.prompt.trim() : "",
          tags: Array.isArray(agent.tags) ? agent.tags.map((tag: any) => String(tag)) : [],
        };
      })
      .filter((agent: AgentConfig) => agent.id && agent.name && agent.persona);
  }

  const formatAgentRosterForPrompt = (agents: AgentConfig[]) => {
    return agents.map(agent => {
      const tags = agent.tags?.length ? ` tags=${agent.tags.join(", ")}` : "";
      const prompt = agent.prompt ? ` instruction="${agent.prompt}"` : "";
      return `- id="${agent.id}" name="${agent.name}" persona="${agent.persona}"${tags}${prompt}`;
    }).join("\n");
  }

  const resolveEngagedAgents = (requestedAgents: unknown, roster: AgentConfig[]) => {
    const requested = Array.isArray(requestedAgents) ? requestedAgents : [];
    const seen = new Set<string>();
    const normalizedRoster = roster.map(agent => ({
      agent,
      keys: [agent.id, agent.name, agent.persona]
        .filter(Boolean)
        .map(value => String(value).toLowerCase()),
    }));

    return requested
      .map(value => String(value || "").trim().toLowerCase())
      .map(value => normalizedRoster.find(item => item.keys.includes(value))?.agent)
      .filter((agent): agent is AgentConfig => Boolean(agent))
      .filter(agent => {
        if (seen.has(agent.id)) return false;
        seen.add(agent.id);
        return true;
      });
  }

  const runWithFallback = async (prompt: string, agentName: string, timeoutMs: number = 90000) => {
    const chain = settings["provider:chain"] || [
      { provider: 'gemini', model: 'gemini-2.0-flash' },
      { provider: 'claude', model: 'haiku' }
    ];
    
    let startIndex = preferredProviderIndexRef.current;
    if (startIndex >= chain.length) startIndex = 0;
    
    const effectiveChain = [...chain.slice(startIndex), ...chain.slice(0, startIndex)];
    
    let lastError = null;
    let attempt = 1;

    for (const item of effectiveChain) {
      const adapterName = item.provider;
      const model = item.model;
      const attemptPrefix = attempt > 1 ? `[Fallback ${attempt-1}] ` : '';
      
      try {
        const timeoutPromise = new Promise<string>((_, reject) => setTimeout(() => reject(new Error('AGENT_TIMEOUT')), timeoutMs));
        
        const responseRaw = await Promise.race([
          window.agents.run(adapterName, model, prompt),
          timeoutPromise
        ]);

        // Basic quota/error checks
        if (/429|QUOTA_EXHAUSTED|rate_limit|rate limit/i.test(responseRaw)) {
          lastError = new Error(`Quota exhausted on ${adapterName}`);
          attempt++;
          continue;
        }
        if (responseRaw.startsWith('Error:') || /ModelNotFoundError|An unexpected critical error occurred|Error when talking to.*API/i.test(responseRaw) || responseRaw.trim().startsWith('Warning:')) {
          lastError = new Error(responseRaw);
          attempt++;
          continue;
        }
        
        preferredProviderIndexRef.current = chain.findIndex((p: any) => p.id === item.id || (p.provider === item.provider && p.model === item.model));
        return { content: responseRaw, provider: adapterName, model };
      } catch (e: any) {
        lastError = e;
        addThinking(agentName, `PROVIDER_FAILED (${adapterName}): ${e.message}`, 'error');
        attempt++;
        continue;
      }
    }
    
    throw new Error(`ALL_PROVIDERS_EXHAUSTED: ${lastError?.message || 'Unknown'}`);
  }

  const handleSummarize = async () => {
    if (!currentSessionId || isLoading) return;
    setIsLoading(true);
    setStatusText('RECALIBRATING...');
    addThinking('Moderator', 'MANUAL_NEURAL_RECALIBRATION_TRIGGERED');
    
    try {
      const summaryPrompt = `
        You are the MASTER_CONTROL_MODERATOR. The user has requested a manual neural recalibration of the session state.
        
        CURRENT_SESSION_SUMMARY:
        "${sessionSummary || "No previous summary available."}"
        
        FULL_CHAT_HISTORY:
        ${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}
        
        TASK: Provide a fresh, comprehensive, and cohesive SESSION_SUMMARY based on the entire history.
        - Merge existing summary points with any missed details from the full history.
        - Ensure all key decisions, architectural shifts, and agent findings are represented.
        - Use concise, technical bullet points.
        - Return ONLY the updated summary text.
      `;
      
      const { content: updatedSummary } = await runWithFallback(summaryPrompt, 'Moderator');
      setSessionSummary(updatedSummary);
      saveCurrentSession(undefined, undefined, updatedSummary);
      addThinking('Moderator', 'NEURAL_SUMMARY_RECALIBRATED');
    } catch (e: any) {
      addMessage('error', `Recalibration failed: ${e.message}`);
    } finally {
      setIsLoading(false);
      setStatusText('IDLE');
    }
  };

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    if (isLoading) {
      addMessage('user', text)
      midRunBuffer.current.push(text)
      addMessage(
        'moderator-whisper' as any,
        `I've captured your added intel: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}". I am relaying this to the working agents and integrating it into the current reasoning cycle.`
      );
      return
    }

    const userQuery = text
    const chatHistory = messages
      .filter(m => m.role !== 'internal' && m.role !== 'error' && m.role !== 'system')
      .slice(-10)
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');
    const historyContext = chatHistory ? `\n\nPREVIOUS_DISCUSSION_CONTEXT:\n${chatHistory}` : ""

    addMessage('user', userQuery)
    setIsLoading(true); 
    setStatusText('ANALYZING_INTENT...')

    let currentTurn = 1;
    const maxTurns = 2;
    let accumulatedAgentContext: { agentId: string, agentName: string, persona: string, content: string }[] = [];
    let allAddedInfo = "";
    let isFinalized = false;
    let hasCrossChecked = false;
    const agentRoster = getAgentRoster();
    const agentRosterPrompt = formatAgentRosterForPrompt(agentRoster);

    try {
      while (currentTurn <= maxTurns && !isFinalized) {
        if (midRunBuffer.current.length > 0) {
          const newInfo = midRunBuffer.current.join('\n');
          allAddedInfo += (allAddedInfo ? '\n' : '') + newInfo;
          midRunBuffer.current = [];
        }

        const currentChain = settings["provider:chain"] || [];
        const activeProvIdx = preferredProviderIndexRef.current;
        const fallbackWarning = activeProvIdx > 0 && currentChain[activeProvIdx]
          ? `\n\nSYSTEM_STATUS: Operational on fallback provider (${currentChain[activeProvIdx].provider}:${currentChain[activeProvIdx].model}). Calibration adjusted for decreased capabilities.` 
          : "";

        addThinking('Moderator', `QUORUM_LOOP_TURN_${currentTurn}: Evaluating state...`)
        addThinking('Moderator', 'CALL_GATEWAY: POST /runs', 'mcp_call')
        
        const turnContext = accumulatedAgentContext.length > 0 
          ? `\n\nCURRENT_TURN_INTEL:\n${JSON.stringify(accumulatedAgentContext)}`
          : "";
        
        const midRunContext = allAddedInfo ? `\n\nADDED_USER_INTEL_DURING_RUN:\n${allAddedInfo}` : "";

        const moderatorDecisionPrompt = `
          You are the MASTER_CONTROL_MODERATOR in a high-security cyber-environment.
          ${historyContext}
          ${turnContext}
          ${midRunContext}
          ${fallbackWarning}
          CURRENT_SESSION_SUMMARY: "${sessionSummary || "No previous summary available."}"
          
          User directive: "${userQuery}"
          Current Reasoning Turn: ${currentTurn} of ${maxTurns}
          Available agents:
          ${agentRosterPrompt}

          CORE MANDATE: Communicate ONLY FACTS to the user.
          1. Anything that isn't a verified fact must remain in your "thought" or "whisper".
          2. Every fact in your "direct_response" MUST be marked with a superscript index (e.g., Fact[1]).

          STRATEGY FOR THIS TURN:
          - If this is Turn 2, you MUST prioritize "action": "finalize" unless the agents have provided critically contradicting information that makes a decision impossible.
          - If agents AGREE or provide complementary info, merge their findings and finalize.
          - If you are NOT SURE about any agent claim, you MUST QUESTION that agent directly if you decide to engage for one more turn (only if absolutely necessary).

          AMBIGUITY & UNCERTAINTY:
          - If the user's request or agent responses are AMBIGUOUS, you MUST ask the agents (or user) for more questions/clarification.

          VISUALIZATION REQUIREMENT: Include Mermaid diagrams and visuals as much as possible in your direct_response.
          
          HUMAN_IN_THE_LOOP: If "ADDED_USER_INTEL_DURING_RUN" is present, prioritize this context.
          
          Decide which configured agents can materially help. Select by agent id only.
          Output ONLY valid JSON.
          {
            "thought": "...",
            "action": "engage" | "finalize",
            "engage": ["agent_id"],
            "queries": { 
              "agent_id": {
                "task": "specific task for that agent. Instruct agent to identify and mark facts with [FACT:index]",
                "context_strategy": "full" | "summary"
              }
            },
            "direct_response": "... (FACTS ONLY. Mark with Fact[index]. EXPLAIN results, do not just summarize.)"
          }
        `
        
        const { content: decisionRaw, provider: modProvider, model: modModel } = await runWithFallback(moderatorDecisionPrompt, 'Moderator')
        
        // Whisper the moderator's initial acknowledgment
        if (currentTurn === 1) {
          addMessage(
            'moderator-whisper' as any,
            `I've received your directive: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}". I am analyzing the state and looking at the roster to determine the best approach.`
          );
        }

        let decision;
        try {
          // First, attempt to extract a markdown JSON block if the model used one
          const jsonBlockMatch = decisionRaw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
          let jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : decisionRaw;
          
          if (!jsonBlockMatch) {
            // Strip out any trailing markdown code ticks if they exist without opening tags
            jsonStr = jsonStr.replace(/```/g, '').trim();
            const firstBrace = jsonStr.indexOf('{');
            const lastBrace = jsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }
          }
          
          decision = JSON.parse(jsonStr);
        } catch (e: any) {
          // If parsing completely fails, the model likely ignored the system prompt and answered directly.
          // Log the parse error, but display the raw text to the user so the answer isn't lost.
          addThinking('System', `Neural parsing error: ${e.message}. Assuming rogue direct response.`, 'error');
          decision = { action: 'finalize', direct_response: decisionRaw, thought: `Parsing error fallback: ${e.message}` };
        }

        addThinking("Moderator", `TURN_${currentTurn}_THOUGHT: ` + decision.thought); 

        if (decision.action === 'finalize' || (decision.engage || []).length === 0) {
          isFinalized = true;
          if (decision.direct_response && currentTurn === 1) {
             addMessage('moderator', decision.direct_response, undefined, undefined, modProvider, modModel);
          }
          break;
        }

        const agentsToEngage = resolveEngagedAgents(decision.engage, agentRoster);
        setStatusText(`TURN_${currentTurn}: ${agentsToEngage.length} AGENTS`);
        addMessage(
          'moderator-whisper' as any,
          `I've analyzed the intent and am now looking at the agent roster to engage the best specialists for your task. Turn ${currentTurn}: Engaging ${agentsToEngage.map(agent => `**${agent.name}** (${agent.persona})`).join(', ')}.`
        );

        // ── SUPERVISED PARALLEL AGENT EXECUTION ──
        const agentPromises = agentsToEngage.map(async (agent) => {
          const queryData = decision.queries && (decision.queries[agent.id] || decision.queries[agent.name] || decision.queries[agent.persona]);
          const query = typeof queryData === 'string' ? queryData : (queryData?.task || userQuery);
          const strategy = typeof queryData === 'object' ? queryData.context_strategy : 'full';
          const agentLabel = agent.name || agent.id;

          // Start Ability Resolution and Context Setup in parallel
          addThinking(agentLabel, `RESOLVING_ABILITIES: ${agent.persona}...`)
          
          const resolveAgentAbilities = async () => {
            const cacheKey = `${agent.persona}:${(agent.tags || []).join(',')}`;
            if (resolvedAbilitiesCache.current[cacheKey]) {
              addThinking(agentLabel, `ABILITIES_CACHED: Using resolved prompt for ${agent.persona}`)
              return { content: [{ text: resolvedAbilitiesCache.current[cacheKey] }] };
            }

            if (typeof window.system.callMcpTool !== 'function') {
              addThinking(agentLabel, `MCP_BRIDGE_UNAVAILABLE: Falling back to local persona.`);
              return { content: [] };
            }
            try {
              const res = await window.system.callMcpTool('savant-abilities', 'resolve_abilities', { 
                persona: agent.persona, 
                tags: agent.tags || [] 
              });
              const text = res.content?.[0]?.text;
              if (text) {
                resolvedAbilitiesCache.current[cacheKey] = text;
                const manifestHash = res.manifest?.hash?.substring(0, 12) || 'n/a';
                const appliedRules = res.manifest?.applied?.rules?.length || 0;
                const appliedPolicies = res.manifest?.applied?.policies?.length || 0;
                addThinking(agentLabel, `ABILITIES_RESOLVED: ${agent.persona} [${appliedRules} rules, ${appliedPolicies} policies, hash:${manifestHash}]`, 'mcp_response')
              }
              return res;
            } catch (e: any) {
              addThinking(agentLabel, `ABILITY_RESOLUTION_FAILED: ${e.message}`, 'error');
              return { content: [] };
            }
          };

          const mcpPromise = resolveAgentAbilities();
          const resolvedInstructions = (await mcpPromise).content?.[0]?.text || "";
          addThinking(agentLabel, `ANALYZING_QUERY (strategy: ${strategy}): ${query.substring(0, 30)}...`)
          
          const effectiveContext = strategy === 'summary' 
            ? `\n\nCURRENT_SESSION_SUMMARY:\n${sessionSummary || "No previous summary."}\n\nCURRENT_TURN_INTEL:\n${JSON.stringify(accumulatedAgentContext)}`
            : `${historyContext}\n\n${turnContext}`;

          const prompt = `
            ${resolvedInstructions || `You are ${agentLabel}, a configured Quorum agent.\nPersona: ${agent.persona}`}
            ${agent.prompt ? `Standing instruction: ${agent.prompt}` : ""}
            ${fallbackWarning}

            Task from moderator: ${query}
            ${effectiveContext}
            ${midRunContext}

            CORE MANDATE: Communicate ONLY FACTS. 
            - Mark every verified fact with a superscript marker like Fact[1].
            - Explain how/where each fact was verified.
            - Answer with focused Markdown. Stay inside your persona and only solve the delegated task.
          `;

          try {
            const { content: responseRaw, provider: agentProvider, model: agentModel } = await runWithFallback(prompt, agentLabel, 90000);
            const response = cleanResponse(responseRaw)
            addMessage('agent-whisper' as any, response, agentLabel, undefined, agentProvider, agentModel)
            return { agentId: agent.id, agentName: agentLabel, persona: agent.persona, content: response, status: 'complete' as const };
          } catch (e: any) {
            addThinking(agentLabel, `FAILURE_SIGNAL: ${e.message}`, 'error');
            return { agentId: agent.id, agentName: agentLabel, persona: agent.persona, content: `CRITICAL_ERROR: ${e.message}`, status: 'error' as const };
          }
        });

        // Supervisor loop for monitoring
        const watchSwarm = async (tasks: Promise<any>[], labels: string[]) => {
          let results: any[] = [];
          const taskStatuses = labels.map(label => ({ label, done: false }));
          const checkInterval = 15000; // Check back every 15s
          
          const monitor = setInterval(() => {
            const pending = taskStatuses.filter(t => !t.done).map(t => t.label);
            if (pending.length > 0) {
              addMessage('moderator-whisper' as any, `I am checking back on the agents. **${pending.join(', ')}** are still processing. Stand by.`);
            }
          }, checkInterval);

          try {
            results = await Promise.all(tasks.map((p, i) => p.then(r => {
              taskStatuses[i].done = true;
              return r;
            })));
          } finally {
            clearInterval(monitor);
          }
          return results;
        };

        const turnResults = await watchSwarm(agentPromises, agentsToEngage.map(a => a.name || a.id));

        // ── SUPERVISED PARALLEL NEURAL CROSS-CHECK ──
        if (turnResults.length > 1 && !hasCrossChecked) {
          addThinking('Moderator', 'INITIATING_NEURAL_CROSS_CHECK...')
          setStatusText(`TURN_${currentTurn}: CROSS-CHECK`);
          hasCrossChecked = true;

          const allCrossCheckPromises = turnResults.flatMap((res) => {
            if (res.status !== 'complete') return [];
            const others = turnResults.filter(r => r.agentId !== res.agentId && r.status === 'complete');
            return others.map(async (other) => {
               const checkPrompt = `
                 You are ${other.agentName}, performing a neural cross-check on ${res.agentName}'s work.
                 ${res.agentName}'s Output: "${res.content}"
                 Original Task: "${userQuery}"
                 TASK: Review for accuracy/consistency with your persona (${other.persona}). Brief feedback ONLY.
               `;
               try {
                 const { content: feedback } = await runWithFallback(checkPrompt, other.agentName, 45000); // 45s for checks
                 addMessage('agent-whisper' as any, `CROSS-CHECK feedback on ${res.agentName}: ${feedback}`, other.agentName);
                 return { from: other.agentId, on: res.agentId, feedback };
               } catch (e) {
                 return { from: other.agentId, on: res.agentId, feedback: "Cross-check failed." };
               }
            });
          });

          const crossCheckResults = await Promise.all(allCrossCheckPromises);
          accumulatedAgentContext = [
            ...accumulatedAgentContext, 
            ...turnResults,
            ...crossCheckResults.map(r => ({ 
              agentId: 'system', 
              agentName: 'CrossCheck', 
              persona: 'internal', 
              content: `Agent ${r.from} feedback on ${r.on}: ${r.feedback}` 
            }))
          ];
        } else {
          accumulatedAgentContext = [...accumulatedAgentContext, ...turnResults];
        }

        currentTurn++;

      }

      if (accumulatedAgentContext.length > 0) {
        setStatusText('SYNTHESIZING...'); 
        addThinking('Moderator', 'PERFORMING_POST_RUN_NEURAL_SYNTHESIS...')

        const currentChain = settings["provider:chain"] || [];
        const activeProvIdx = preferredProviderIndexRef.current;
        const fallbackWarning = activeProvIdx > 0 && currentChain[activeProvIdx]
          ? `\n\nSYSTEM_STATUS: Operational on fallback provider (${currentChain[activeProvIdx].provider}:${currentChain[activeProvIdx].model}). Calibration adjusted for decreased capabilities.` 
          : "";

        // Update the persistent summary
        const summaryPrompt = `
          You are the MASTER_CONTROL_MODERATOR. A reasoning run has just completed.
          ${fallbackWarning}
          
          CURRENT_SESSION_SUMMARY:
          "${sessionSummary || "No previous summary available."}"
          
          NEW_INTEL_FROM_THIS_RUN:
          ${JSON.stringify(accumulatedAgentContext)}
          
          USER_DIRECTIVE: "${userQuery}"
          
          TASK: Provide an updated, cohesive SESSION_SUMMARY. 
          - Integrate new achievements, decisions, and findings from the latest run.
          - DO NOT blindly add text; perform an intelligent merge.
          - If new info contradicts or modifies previous summary points, update them accordingly.
          - Use concise, technical bullet points. Keep it professional.
          - Return ONLY the updated summary text.
        `;
        
        const { content: updatedSummary } = await runWithFallback(summaryPrompt, 'Moderator');
        setSessionSummary(updatedSummary);
        saveCurrentSession(undefined, undefined, updatedSummary);
        addThinking('Moderator', 'NEURAL_SUMMARY_UPDATED')

        const finalPrompt = `
          You are the MASTER_CONTROL_MODERATOR delivering the FINAL_COMPREHENSIVE_REPORT to the user.

          USER'S ORIGINAL REQUEST: "${userQuery}"
          UPDATED SESSION SUMMARY: ${updatedSummary}
          LATEST AGENT INTEL: ${JSON.stringify(accumulatedAgentContext)}
          ${fallbackWarning}

          YOUR REPORT MUST FOLLOW THIS EXACT STRUCTURE:

          ## 1. RESTATE THE ASK
          In your own words, rephrase what the user asked for. Make sure the user knows you fully understood their intent. Start with something like "You asked..." or "The question was...". Be specific.

          ## 2. THE ANSWER
          Give a clear, direct, definitive answer. Do not hedge. If there is a recommendation, make it. If there is a result, present it. The user should be able to read ONLY this section and know the answer.

          ## 3. HOW IT WORKS — Full Explanation
          Now explain the "how" in depth. Assume the reader has ZERO prior knowledge about this topic. Walk through:
          - What each component/concept is
          - How the pieces connect to each other
          - What happens step-by-step when the system/process runs
          - Why it was designed or works this way

          Use **Mermaid diagrams** liberally. You MUST include at least one diagram. Choose the most appropriate type:
          - \`\`\`mermaid graph TD\`\`\` for architecture/dependency maps
          - \`\`\`mermaid sequenceDiagram\`\`\` for step-by-step flows
          - \`\`\`mermaid flowchart LR\`\`\` for decision trees or pipelines
          - \`\`\`mermaid classDiagram\`\`\` for data models or type hierarchies
          - \`\`\`mermaid stateDiagram-v2\`\`\` for state machines or lifecycle flows

          Use multiple diagrams if the topic has multiple dimensions (e.g., architecture + data flow).

          IMPORTANT MERMAID RULES:
          - For all node labels containing special characters, HTML, or parentheses, you MUST use DOUBLE QUOTES (e.g., A["Label (Text)"] or B["Line 1 <br> Line 2"]).
          - Ensure all arrows are valid (e.g., use "-->" or "-- text -->" or "<-->").

          ## 4. WHY — Rationale & Context
          Explain the reasoning behind the approach, trade-offs, or design decisions. Why was this method chosen over alternatives? What constraints or goals informed the design?

          ## 5. KEY DETAILS & EVIDENCE
          Present the important technical details, configuration specifics, code references, or data points. Use tables, code blocks, and structured formatting for clarity. Every fact MUST be marked with a superscript index (e.g., Fact[1]).

          ## 6. FACT_GLOSSARY
          At the very end, list each Fact[N] index and explain how/where each fact was verified (e.g., "Fact[1]: Confirmed via analysis of src/renderer/App.tsx, lines 644-670").

          FORMATTING RULES:
          - Use rich Markdown throughout (headers, bold, tables, code blocks, bullet lists).
          - Write in clear, plain language. Avoid unnecessary jargon. When you must use technical terms, define them inline.
          - Be thorough. The user should NOT need to ask a follow-up question. If they read this report, they should fully understand the topic.
          - Do NOT include greetings, sign-offs, or filler text. Every sentence must carry information.
          - Do NOT summarize — EXPLAIN. The difference is critical.
        `;
        const { content: finalResponseRaw, provider: finalProvider, model: finalModel } = await runWithFallback(finalPrompt, 'Moderator')
        let finalResponse = cleanResponse(finalResponseRaw)

        // ── SELF-CORRECTION: MERMAID VALIDATION LOOP ──
        let validationAttempts = 0;
        const maxValidationAttempts = 3;
        let hasErrors = true;

        while (hasErrors && validationAttempts < maxValidationAttempts) {
          const mermaidBlocks = finalResponse.match(/```mermaid([\s\S]*?)```/g);
          if (!mermaidBlocks) {
            hasErrors = false;
            break;
          }

          addThinking('Moderator', `NEURAL_OUTPUT_VALIDATION (Attempt ${validationAttempts + 1}/${maxValidationAttempts})...`);
          let currentErrors = [];
          
          for (const block of mermaidBlocks) {
            const code = block.replace(/```mermaid/, '').replace(/```/, '').trim();
            try {
              await mermaid.parse(code);
            } catch (e: any) {
              currentErrors.push({ block, error: e.message });
            }
          }

          if (currentErrors.length > 0) {
            validationAttempts++;
            addThinking('Moderator', `VALIDATION_FAILED: ${currentErrors.length} errors detected.`, 'error');
            
            if (validationAttempts < maxValidationAttempts) {
              const correctionPrompt = `
                You are the MASTER_CONTROL_MODERATOR. Your previous final report contained Mermaid syntax errors.
                
                ERRORS_DETECTED:
                ${currentErrors.map(err => `- Error: ${err.error}\n  In Block:\n  ${err.block}`).join('\n\n')}
                
                TASK: Fix the Mermaid syntax errors and provide the FULL FINAL REPORT again. 
                - IMPORTANT: For all node labels containing special characters, HTML, or parentheses, use DOUBLE QUOTES (e.g., A["Label (Text)"] or B["Line 1 <br> Line 2"]).
                - Ensure all arrows are valid (e.g., use "-->" or "-- text -->" or "<-->").
                - Return the entire report with fixed diagrams.
              `;
              const { content: correctedRaw } = await runWithFallback(correctionPrompt, 'Moderator');
              finalResponse = cleanResponse(correctedRaw);
            } else {
              addThinking('Moderator', 'MAX_VALIDATION_ATTEMPTS_REACHED. Delivering best-effort output.', 'error');
              hasErrors = false;
            }
          } else {
            addThinking('Moderator', 'NEURAL_OUTPUT_VALIDATED: 0 errors');
            hasErrors = false;
          }
        }

        addMessage('moderator', finalResponse, undefined, undefined, finalProvider, finalModel); 
      }
    } catch (error: any) {
      addMessage('error', `CRITICAL_EXCEPTION: ${error.message}`)
    } finally {
      setIsLoading(false); 
      setStatusText('IDLE')
    }
  }

  const handleDeleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }

  const handleAddFolder = () => {
    setFolders(prev => {
      const updated = [...prev, { id: `f-${Date.now()}`, name: `folder_${prev.length + 1}` }];
      window.system.saveSetting("system:folders", updated);
      return updated;
    });
  }

  const handleDeleteFolder = (id: string) => {
    const hasSessions = chatItems.some(chat => chat.folderId === id)
    if (!hasSessions) {
      setFolders(prev => {
        const updated = prev.filter(folder => folder.id !== id);
        window.system.saveSetting("system:folders", updated);
        return updated;
      });
    }
  }

  const handleRenameFolder = (id: string, newName: string) => {
    setFolders(prev => {
      const updated = prev.map(folder => folder.id === id ? { ...folder, name: newName } : folder);
      window.system.saveSetting("system:folders", updated);
      return updated;
    });
  }

  const handleMoveToFolder = (chatId: string, folderId: string | null) => {
    setSessionFolders(prev => {
      const updated = { ...prev, [chatId]: folderId };
      window.system.saveSetting("system:sessionFolders", updated);
      return updated;
    });
  }

  if (isInitializing) {
    return <StartupScreen progress={startupProgress} subtext={startupSubtext} />
  }

  if (!isAuthenticated || !getStoredApiKey()) {
    return <LoginScreen onLogin={handleLogin} />
  }

  // Map sessions to ChatItem for LeftSidebar
  const chatItems: ChatItem[] = sessions.map(s => ({
    id: s.id,
    name: s.title,
    folderId: sessionFolders[s.id] || null
  }));

  return (
    <div
      className="size-full flex flex-col overflow-hidden"
      style={{ background: "var(--cp-bg-0)", color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }}
    >
      {/* scanline overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[999]"
        style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        }}
      />

      <TopBar />

      <ActionBar
        currentChatName={sessionTitle}
        onCreateChat={startNewSession}
        onRenameChat={renameSession}
        folders={folders}
        chats={chatItems}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <LeftSidebar
          chats={chatItems}
          folders={folders}
          activeChatId={currentSessionId}
          onSelectChat={loadSession}
          onMoveToFolder={handleMoveToFolder}
          onDeleteChat={deleteSession}
          onAddFolder={handleAddFolder}
          onDeleteFolder={handleDeleteFolder}
          onRenameFolder={handleRenameFolder}
          onSettingsChanged={handleSettingsChanged}
          onLogout={handleLogout}
        />

        <main className="flex-1 overflow-hidden">
          {currentSessionId ? (
            <ChatArea 
              messages={messages} 
              sessionTitle={sessionTitle}
              onSend={handleSend} 
              onDeleteMessage={handleDeleteMessage}
              isLoading={isLoading}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span
                style={{ color: "var(--cp-cyan)", fontFamily: "'Share Tech Mono', monospace" }}
                className="text-xs opacity-20"
              >
                no active session
              </span>
            </div>
          )}
        </main>

        <RightPanel 
          thinking={thinking} 
          messages={messages} 
          statusText={statusText} 
          sessionSummary={sessionSummary}
          onSummarize={handleSummarize}
        />
      </div>

      <BottomBar sessionTitle={sessionTitle} />
    </div>
  );
}
