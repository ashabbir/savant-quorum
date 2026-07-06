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
import { createAthenaService } from "./services/athenaService";
import mermaid from "mermaid";
import { sanitizeMermaidCode } from "./utils/mermaidSanitizer";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

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
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [sessionSummary, setSessionSummary] = useState<string>("");
  const midRunBuffer = useRef<string[]>([]);
  const resolvedAbilitiesCache = useRef<Record<string, string>>({});
  const athenaServiceRef = useRef(createAthenaService());
  
  const [sessions, setSessions] = useState<any[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState('New Session')

  // UI state for folders (mocked for now as we don't have persistent folders yet)
  const [folders, setFolders] = useState<FolderItem[]>([
    { id: "f1", name: "research" },
    { id: "f2", name: "code sessions" },
  ]);

  const [sessionFolders, setSessionFolders] = useState<Record<string, string | null>>({});
  const [sessionMetadata, setSessionMetadata] = useState<Record<string, any>>({ allowDeepSearch: false, files: [] });

  const messagesRef = useRef<Message[]>([]);
  const thinkingRef = useRef<Thinking[]>([]);
  const sessionMetadataRef = useRef<Record<string, any>>({ allowDeepSearch: false, files: [] });
  const currentSessionIdRef = useRef<string | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);
  useEffect(() => { sessionMetadataRef.current = sessionMetadata; }, [sessionMetadata]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);

  const updateSessionMetadata = (newMeta: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => {
    if (typeof newMeta === 'function') {
      setSessionMetadata(prev => {
        const next = newMeta(prev);
        sessionMetadataRef.current = next;
        return next;
      });
    } else {
      sessionMetadataRef.current = newMeta;
      setSessionMetadata(newMeta);
    }
  };

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      toast(customEvent.detail || "");
    };
    window.addEventListener('toast', handleToastEvent);
    return () => window.removeEventListener('toast', handleToastEvent);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLoading) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isLoading]);

  const loadSessionList = async () => {
    const list = await window.sessions.list()
    setSessions(list)
  }

  const startNewSession = (title?: string) => {
    const newId = `quorum-${Date.now()}`
    setCurrentSessionId(newId)
    setMessages([])
    setThinking([])
    messagesRef.current = []
    thinkingRef.current = []
    setSessionSummary("")
    updateSessionMetadata({ allowDeepSearch: false, files: [] })
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
      const msgs = data.messages || [];
      const thinks = data.thinking || [];
      setMessages(msgs)
      setThinking(thinks)
      messagesRef.current = msgs
      thinkingRef.current = thinks
      setSessionSummary(data.summary || "")
      setSessionTitle(data.title || 'Untitled Quorum')
      if (data.metadata) {
        try {
          const parsed = JSON.parse(data.metadata);
          if (!parsed.files) parsed.files = [];
          updateSessionMetadata(parsed);
        } catch {
          updateSessionMetadata({ allowDeepSearch: false, files: [] });
        }
      } else {
        updateSessionMetadata({ allowDeepSearch: false, files: [] });
      }
    }
  }

  const saveCurrentSession = async (updatedMessages?: Message[], updatedThinking?: Thinking[], updatedSummary?: string, updatedMetadata?: Record<string, any>) => {
    if (!currentSessionId) return
    
    let newTitle = sessionTitle
    const firstUserMsg = (updatedMessages || messagesRef.current).find(m => m.role === 'user')
    if ((newTitle === 'New Session' || newTitle === 'New Quorum') && firstUserMsg) {
      newTitle = firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '')
      setSessionTitle(newTitle)
    }

    const metaToSave = updatedMetadata !== undefined ? updatedMetadata : sessionMetadataRef.current;
    await window.sessions.save({
      id: currentSessionId,
      title: newTitle,
      messages: updatedMessages || messagesRef.current,
      thinking: updatedThinking || thinkingRef.current,
      summary: updatedSummary !== undefined ? updatedSummary : sessionSummary,
      metadata: JSON.stringify(metaToSave)
    })
    loadSessionList()
  }

  const saveSessionDirectly = async (sessionId: string, msgs: Message[], thinks: Thinking[]) => {
    if (!sessionId) return;
    
    let title = sessionTitle;
    if (sessionId === currentSessionIdRef.current) {
      title = sessionTitle;
    } else {
      const existing = sessions.find(s => s.id === sessionId);
      if (existing) title = existing.title;
    }

    const firstUserMsg = msgs.find(m => m.role === 'user');
    if ((title === 'New Session' || title === 'New Quorum') && firstUserMsg) {
      title = firstUserMsg.content.substring(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '');
    }

    let metadataStr = null;
    let existingSummary = "";
    if (sessionId === currentSessionIdRef.current) {
      metadataStr = JSON.stringify(sessionMetadataRef.current);
      existingSummary = sessionSummary;
    } else {
      try {
        const data = await window.sessions.load(sessionId);
        if (data) {
          if (data.metadata) metadataStr = data.metadata;
          if (data.summary) existingSummary = data.summary;
        }
      } catch (e) {}
    }

    await window.sessions.save({
      id: sessionId,
      title,
      messages: msgs,
      thinking: thinks,
      summary: existingSummary, 
      metadata: metadataStr
    });
    
    loadSessionList();
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

  const handleLogin = async (apiKey: string, serverUrl?: string) => {
    const trimmed = apiKey.trim();
    const loadedSettings = await window.system.getSettings();
    if (loadedSettings["system:folders"]) {
      setFolders(loadedSettings["system:folders"]);
    }
    if (loadedSettings["system:sessionFolders"]) {
      setSessionFolders(loadedSettings["system:sessionFolders"]);
    }
    if (serverUrl) {
      const serverConfig = { url: serverUrl.trim(), enabled: true, status: "idle" };
      await window.system.saveSetting("server:config", serverConfig);
      loadedSettings["server:config"] = serverConfig;
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
  }, [messages, thinking, sessionTitle, sessionMetadata])

  const addThinking = (agent: string, thought: string, type: Thinking['type'] = 'thought') => {
    const newThink = {
      id: Math.random().toString(36).substr(2, 9),
      agent,
      thought,
      type,
      timestamp: Date.now()
    }
    thinkingRef.current = [newThink, ...thinkingRef.current]
    setThinking(prev => [newThink, ...prev])
  }

  const addMessage = (role: Message['role'], content: string, from?: string, to?: string, provider?: string, model?: string, attachments?: { name: string; content: string }[]) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newMsg = {
      id,
      role,
      content,
      from,
      to,
      provider,
      model,
      attachments,
      timestamp: Date.now()
    }
    messagesRef.current = [...messagesRef.current, newMsg]
    setMessages(prev => [...prev, newMsg])
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
          window.system.runAgentViaGateway({ provider: adapterName, model, prompt }),
          timeoutPromise
        ]);

        // Basic quota/error checks (ensure it's actually an error message and not user-facing text containing these words)
        const isLikelyErrorResponse = responseRaw.startsWith('Error:') || responseRaw.startsWith('Warning:') || responseRaw.length < 200;
        if (isLikelyErrorResponse && /429|QUOTA_EXHAUSTED|rate_limit|rate limit/i.test(responseRaw)) {
          lastError = new Error(`Quota exhausted on ${adapterName}`);
          attempt++;
          continue;
        }
        if (responseRaw.startsWith('Error:') || /ModelNotFoundError|An unexpected critical error occurred|Error when talking to.*API/i.test(responseRaw) || responseRaw.trim().startsWith('Warning:')) {
          lastError = new Error(responseRaw);
          attempt++;
          continue;
        }
        
        preferredProviderIndexRef.current = chain.findIndex((p: any) => 
          (item.id !== undefined && p.id === item.id) || 
          (p.provider === item.provider && p.model === item.model)
        );
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

  const validateAndCorrectMermaid = async (
    rawResponse: string,
    agentLabel: string,
    originalPrompt: string,
    timeoutMs: number = 90000
  ): Promise<{ response: string; provider?: string; model?: string }> => {
    let response = cleanResponse(rawResponse);
    let validationAttempts = 0;
    const maxValidationAttempts = 3;
    let hasErrors = true;
    let finalProvider: string | undefined;
    let finalModel: string | undefined;

    while (hasErrors && validationAttempts < maxValidationAttempts) {
      const mermaidBlockRegex = /```\s*mermaid[\s\S]*?```/gi;
      const mermaidBlocks = response.match(mermaidBlockRegex);
      if (!mermaidBlocks) {
        hasErrors = false;
        break;
      }

      addThinking(agentLabel, `NEURAL_OUTPUT_VALIDATION (Attempt ${validationAttempts + 1}/${maxValidationAttempts})...`);
      let currentErrors: { block: string; error: string }[] = [];
      let updatedResponse = response;

      for (const block of mermaidBlocks) {
        const code = block.replace(/```\s*mermaid/i, '').replace(/```$/, '').trim();
        const sanitizedCode = sanitizeMermaidCode(code);
        const sanitizedBlock = `\`\`\`mermaid\n${sanitizedCode}\n\`\`\``;
        
        updatedResponse = updatedResponse.replace(block, sanitizedBlock);

        try {
          await mermaid.parse(sanitizedCode);
        } catch (e: any) {
          currentErrors.push({ block: sanitizedBlock, error: e.message });
        }
      }

      response = updatedResponse;

      if (currentErrors.length > 0) {
        validationAttempts++;
        addThinking(agentLabel, `VALIDATION_FAILED: ${currentErrors.length} errors detected.`, 'error');
        
        if (validationAttempts < maxValidationAttempts) {
          const correctionPrompt = `
            You are ${agentLabel}. Your previous output contained Mermaid syntax errors.
            
            ERRORS_DETECTED:
            ${currentErrors.map(err => `- Error: ${err.error}\n  In Block:\n  ${err.block}`).join('\n\n')}
            
            TASK: Fix the Mermaid syntax errors and provide the FULL response again.
            - IMPORTANT: For all node labels containing special characters, HTML, or parentheses, you MUST use DOUBLE QUOTES (e.g., A["Label (Text)"] or B["Line 1 <br> Line 2"]).
            - Ensure all arrows are valid (e.g., use "-->" or "-- text -->" or "<-->").
            - Return the entire response with fixed diagrams.
          `;
          try {
            const { content: correctedRaw, provider: corrProvider, model: corrModel } = await runWithFallback(correctionPrompt, agentLabel, timeoutMs);
            response = cleanResponse(correctedRaw);
            finalProvider = corrProvider;
            finalModel = corrModel;
          } catch (e: any) {
            addThinking(agentLabel, `CORRECTION_ATTEMPT_FAILED: ${e.message}`, 'error');
            break;
          }
        } else {
          addThinking(agentLabel, 'MAX_VALIDATION_ATTEMPTS_REACHED. Delivering best-effort output.', 'error');
          hasErrors = false;
        }
      } else {
        addThinking(agentLabel, 'NEURAL_OUTPUT_VALIDATED: 0 errors');
        hasErrors = false;
      }
    }

    return { response, provider: finalProvider, model: finalModel };
  };

  const handleSummarize = async () => {
    if (!currentSessionId || isLoading) return;
    setIsLoading(true);
    setStatusText('RECALIBRATING...');
    addThinking('Athena', 'MANUAL_NEURAL_RECALIBRATION_TRIGGERED');
    
    try {
      const summaryPrompt = `
        You are ATHENA, the MASTER_CONTROL_MODERATOR. The user has requested a manual neural recalibration of the session state.
        
        CURRENT_SESSION_SUMMARY:
        "${sessionSummary || "No previous summary available."}"
        
        FULL_CHAT_HISTORY:
        ${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}
        
        TASK: Provide a fresh, comprehensive, and cohesive SESSION_SUMMARY based on the entire history.
        The summary MUST be structured chronologically for each turn in the chat history following this exact format:

        - User asked: "[Brief summary of what the user asked]"
        - Athena: intent is "[Brief summary of identified intent]" and engaged [List of engaged agents, or "Athena (direct/moderator)"]
        [If agents were engaged in that turn, include one bullet point per engaged agent:
        - [Agent Name]: "[Extracted key findings/message from this agent]"]
        - Athena synthesized and told the user: "[Brief summary of the final response/report sent to the user]"

        IMPORTANT RULES:
        1. Do NOT lose key data, decisions, or facts from the agents' messages or the history.
        2. Keep the user's question, intent, and clean extracted messages in focus for every turn.
        3. Format the entire history turn-by-turn.
        4. Return ONLY the complete updated summary text. Do not include any other conversational text or formatting.
      `;
      
      const { content: updatedSummary } = await runWithFallback(summaryPrompt, 'Athena');
      setSessionSummary(updatedSummary);
      saveCurrentSession(undefined, undefined, updatedSummary);
      addThinking('Athena', 'NEURAL_SUMMARY_RECALIBRATED');
    } catch (e: any) {
      addMessage('error', `Recalibration failed: ${e.message}`);
    } finally {
      setIsLoading(false);
      setStatusText('IDLE');
    }
  };

  const handleUploadFile = async (name: string, content: string): Promise<string> => {
    // 1. Add file to session files list in sessionMetadata with loading: true using functional state update
    let alreadyExists = false;
    
    updateSessionMetadata(prev => {
      const currentFiles = prev.files || [];
      if (currentFiles.some((f: any) => f.name === name)) {
        alreadyExists = true;
        return prev;
      }
      const updatedFiles = [...currentFiles, { name, content, summary: "Generating summary...", loading: true }];
      const nextMeta = { ...prev, files: updatedFiles };
      saveCurrentSession(undefined, undefined, undefined, nextMeta);
      return nextMeta;
    });

    if (alreadyExists) {
      const existing = (sessionMetadataRef.current.files || []).find((f: any) => f.name === name);
      return existing?.summary || "";
    }

    addThinking('System', `Summarizing document: ${name}...`);
    const summaryPrompt = `
      You are an AI assistant. Analyze and summarize the following document.
      Provide a clear, concise summary followed by key bullet points.
      Document name: ${name}
      
      Document content:
      ${content}
    `;
    let fileSummary = "";
    try {
      const { content: summaryResult } = await runWithFallback(summaryPrompt, 'System');
      fileSummary = summaryResult;
      addThinking('System', `Document summarized successfully: ${name}`, 'worker_end');
      
      // Update session files with the summary
      updateSessionMetadata(prev => {
        const files = (prev.files || []).map((f: any) => 
          f.name === name ? { ...f, summary: fileSummary, loading: false } : f
        );
        const nextMeta = { ...prev, files };
        saveCurrentSession(undefined, undefined, undefined, nextMeta);
        return nextMeta;
      });

      addMessage('system', `File **${name}** is uploaded.\n\n**Agent Summary:**\n${fileSummary}`);
    } catch (e: any) {
      addThinking('System', `Failed to summarize document: ${e.message}`, 'error');
      fileSummary = `Error generating summary: ${e.message}`;
      updateSessionMetadata(prev => {
        const files = (prev.files || []).map((f: any) => 
          f.name === name ? { ...f, summary: fileSummary, loading: false } : f
        );
        const nextMeta = { ...prev, files };
        saveCurrentSession(undefined, undefined, undefined, nextMeta);
        return nextMeta;
      });
      addMessage('system', `File **${name}** is uploaded (Summary generation failed: ${e.message}).`);
    }

    return fileSummary;
  };

  const handleDeleteSessionFile = (fileName: string) => {
    updateSessionMetadata(prev => {
      const files = (prev.files || []).filter((f: any) => f.name !== fileName);
      const nextMeta = { ...prev, files };
      saveCurrentSession(undefined, undefined, undefined, nextMeta);
      return nextMeta;
    });
    addMessage('system', `File **${fileName}** removed from session files.`);
  };

  const handleSend = async (text: string) => {
    if (!text.trim()) return

    const sessionForThisRun = currentSessionId;
    if (!sessionForThisRun) return;

    let runMessages = [...messagesRef.current];
    let runThinking = [...thinkingRef.current];

    const addThinking = (agent: string, thought: string, type: Thinking['type'] = 'thought') => {
      const newThink = {
        id: Math.random().toString(36).substr(2, 9),
        agent,
        thought,
        type,
        timestamp: Date.now()
      };
      runThinking = [newThink, ...runThinking];
      
      if (currentSessionIdRef.current === sessionForThisRun) {
        thinkingRef.current = [newThink, ...thinkingRef.current];
        setThinking(thinkingRef.current);
      }
      
      saveSessionDirectly(sessionForThisRun, runMessages, runThinking);
    };

    const addMessage = (role: Message['role'], content: string, from?: string, to?: string, provider?: string, model?: string) => {
      const id = Math.random().toString(36).substr(2, 9);
      const newMsg: Message = {
        id,
        role,
        content,
        from,
        to,
        provider,
        model,
        timestamp: Date.now()
      };
      runMessages = [...runMessages, newMsg];
      
      if (currentSessionIdRef.current === sessionForThisRun) {
        messagesRef.current = [...messagesRef.current, newMsg];
        setMessages(messagesRef.current);
      }
      
      saveSessionDirectly(sessionForThisRun, runMessages, runThinking);
    };

    // Scan for reference chat in the user query
    let referencedSession = null;
    for (const s of sessions) {
      if (s.id === sessionForThisRun) continue; // Don't reference current session
      const matchesId = text.includes(`@${s.id}`);
      const matchesTitle = text.toLowerCase().includes(`@${s.title.toLowerCase()}`) || 
                           text.toLowerCase().includes(`referencing chat ${s.title.toLowerCase()}`) ||
                           text.toLowerCase().includes(`reference chat ${s.title.toLowerCase()}`);
      if (matchesId || matchesTitle) {
        referencedSession = s;
        break;
      }
    }

    let injectedReferencePrompt = "";
    if (referencedSession) {
      addThinking('Athena', `LOADING_REFERENCE_CHAT: "${referencedSession.title}"`);
      try {
        const refData = await window.sessions.load(referencedSession.id);
        if (refData) {
          let refSummary = refData.summary || "";
          if (!refSummary.trim() && refData.messages && refData.messages.length > 0) {
            addThinking('Athena', `GENERATING_SUMMARY_FOR_REFERENCE_CHAT: "${referencedSession.title}"`);
            const refSummaryPrompt = `
              You are ATHENA, the MASTER_CONTROL_MODERATOR. The operator has referenced the session "${referencedSession.title}".
              
              FULL_CHAT_HISTORY OF REFERENCED SESSION:
              ${refData.messages.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}
              
              TASK: Provide a comprehensive session summary based on the history above.
              Return ONLY the complete summary text. Do not include any other conversational text or formatting.
            `;
            const { content: generatedRefSummary } = await runWithFallback(refSummaryPrompt, 'Athena');
            refSummary = generatedRefSummary.trim();
            
            // Save the newly generated summary to the reference session in the DB
            await window.sessions.save({
              id: referencedSession.id,
              title: refData.title || referencedSession.title,
              messages: refData.messages,
              thinking: refData.thinking || [],
              summary: refSummary,
              metadata: refData.metadata
            });
            addThinking('Athena', `REFERENCE_CHAT_SUMMARY_UPDATED: "${referencedSession.title}"`);
          }
          
          if (refSummary.trim()) {
            injectedReferencePrompt = `\n\n[INJECTED REFERENCE CONTEXT FROM CHAT "${referencedSession.title}"]: \n${refSummary}\n`;
          }
        }
      } catch (err: any) {
        addThinking('Athena', `REFERENCE_CHAT_LOAD_FAILED: ${err.message}`, 'error');
      }
    }

    if (isLoading) {
      addMessage('user', text)
      midRunBuffer.current.push(text)
      addMessage(
        'athena-whisper' as any,
        `I've captured your added intel: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}". I am relaying this to the working agents and integrating it into the current reasoning cycle.`
      );
      return
    }

    setRunningSessionId(sessionForThisRun);

    const sessionFiles = sessionMetadata.files || [];
    const filesContext = sessionFiles.length > 0
      ? `\n\nSESSION_UPLOADED_FILES_CONTEXT:\n${sessionFiles.map((att: any) => `[UPLOADED_FILE: ${att.name}]\nSummary: ${att.summary || att.content.substring(0, 1000)}`).join('\n\n')}`
      : "";

    const userQuery = text
    const chatHistory = messages
      .filter(m => m.role !== 'internal' && m.role !== 'error' && m.role !== 'system')
      .slice(sessionSummary ? -3 : -10)
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');
    const historyContext = 
      (sessionSummary ? `\n\nSESSION_SUMMARY_OF_PAST_CONTEXT:\n${sessionSummary}\n` : "") +
      (chatHistory ? `\n\nRECENT_NEW_MESSAGES_CONTEXT:\n${chatHistory}` : "") + 
      injectedReferencePrompt +
      filesContext;

    const agentRoster = getAgentRoster();
    const currentChain = settings["provider:chain"] || [];
    const activeProvIdx = preferredProviderIndexRef.current;
    const fallbackWarning = activeProvIdx > 0 && currentChain[activeProvIdx]
      ? `\n\nSYSTEM_STATUS: Operational on fallback provider (${currentChain[activeProvIdx].provider}:${currentChain[activeProvIdx].model}). Calibration adjusted for decreased capabilities.` 
      : "";

    // Direct Agent Execution Check
    let directAgentMatch = null;
    const firstWordMatch = userQuery.trim().match(/^@([a-zA-Z0-9_-]+)\s+([\s\S]+)$/);
    if (firstWordMatch) {
      const targetId = firstWordMatch[1].toLowerCase();
      if (targetId === 'athena') {
        const cleanQuery = firstWordMatch[2].trim();
        addMessage('user', userQuery);
        setIsLoading(true);
        setStatusText(`DIRECT: ATHENA...`);
        addThinking('Athena', `DIRECT_ATHENA_EXECUTION_TRIGGERED: Bypassing Swarm processing.`);
        
        try {
          const agentLabel = 'Athena';
          const allowDeepSearch = sessionMetadata.allowDeepSearch === true;
          const agentTimeout = allowDeepSearch ? 300000 : 90000;
          
          const prompt = athenaServiceRef.current.buildDirectAthenaPrompt({
            query: cleanQuery,
            historyContext,
            filesContext,
            sessionSummary,
            fallbackWarning,
            allowDeepSearch,
          });

          const { content: responseRaw, provider: agentProvider, model: agentModel } = await runWithFallback(prompt, agentLabel, agentTimeout);
          const validationResult = await validateAndCorrectMermaid(responseRaw, agentLabel, prompt, agentTimeout);
          const finalResponse = validationResult.response;
          const finalAgentProvider = validationResult.provider || agentProvider;
          const finalAgentModel = validationResult.model || agentModel;

          addMessage('athena', finalResponse, agentLabel, undefined, finalAgentProvider, finalAgentModel);
          addThinking(agentLabel, `DIRECT_EXECUTION_COMPLETE`, 'worker_end');

          // Update the persistent summary after direct run
          const directSummaryPrompt = `
            You are ATHENA, the MASTER_CONTROL_MODERATOR. An agent direct run has just completed.
            ${fallbackWarning}
            
            CURRENT_SESSION_SUMMARY:
            "${sessionSummary || "No previous summary available."}"
            
            LATEST_TURN_DATA:
            - User Asked: "${cleanQuery}"
            - Intent: "Direct chat with Athena"
            - Engaged Agents: ["Athena"]
            - Agent Responses: ${JSON.stringify([{ agentId: 'athena', agentName: 'Athena', persona: 'moderator', content: finalResponse }])}
            - Final Output Sent to User: "${finalResponse}"
            
            TASK:
            You MUST append a summary of the latest turn to the CURRENT_SESSION_SUMMARY.
            The summary of this latest turn MUST follow this exact format:

            - User asked: "[Brief summary of what the user asked]"
            - Athena: intent is "Direct chat" and engaged Athena
            - Athena: "[Extracted key findings/message]"
            - Athena synthesized and told the user: "[Brief summary of the final response]"

            IMPORTANT RULES:
            1. Do NOT lose key data, decisions, or facts from the messages.
            2. Keep the user's question, intent, and clean extracted messages in focus.
            3. Keep the previous session summary intact (exactly as it is), and append this new turn summary at the end.
            4. If there is no previous summary, start directly with the new turn summary.
            5. Return ONLY the complete updated session summary (previous summary + appended new turn). Do not include any other conversational text or formatting.
          `;
          try {
            const summaryResult = await runWithFallback(directSummaryPrompt, 'Athena');
            const updatedSummary = summaryResult.content.trim();
            setSessionSummary(updatedSummary);
            saveCurrentSession(undefined, undefined, updatedSummary);
            addThinking('Athena', 'NEURAL_SUMMARY_UPDATED');
          } catch (sumErr) {
            console.error("Post-run direct agent summarization failed:", sumErr);
          }
        } catch (e: any) {
          addThinking('Athena', `DIRECT_EXECUTION_FAILED: ${e.message}`, 'error');
          addMessage('error', `Direct agent execution failed: ${e.message}`);
        } finally {
          setIsLoading(false);
          setStatusText('IDLE');
          setRunningSessionId(null);
        }
        return;
      }

      const agent = agentRoster.find(a => 
        a.id.toLowerCase() === targetId || 
        a.name.toLowerCase() === targetId ||
        a.name.toLowerCase().replace(/\s+/g, '-') === targetId
      );
      if (agent) {
        directAgentMatch = { agent, cleanQuery: firstWordMatch[2].trim() };
      }
    }

    if (directAgentMatch) {
      const { agent, cleanQuery } = directAgentMatch;
        addMessage('user', userQuery);
        setIsLoading(true);
        setStatusText(`DIRECT: ${agent.name.toUpperCase()}...`);
        addThinking(agent.name, `DIRECT_AGENT_EXECUTION_TRIGGERED: Bypassing Moderator.`);

        try {
          const agentLabel = agent.name;
          addThinking(agentLabel, `RESOLVING_ABILITIES: ${agent.persona}...`);
          
          let resolvedInstructions = "";
          try {
            resolvedInstructions = await athenaServiceRef.current.resolveAbilities(agent);
            if (resolvedInstructions) {
              addThinking(agentLabel, `ABILITIES_RESOLVED: ${agent.persona}`, 'mcp_response');
            }
          } catch (e: any) {
            addThinking(agentLabel, `ABILITY_RESOLUTION_FAILED: ${e.message}`, 'error');
          }

          const allowDeepSearch = sessionMetadata.allowDeepSearch === true;
          const agentTimeout = allowDeepSearch ? 300000 : 90000;

          const prompt = athenaServiceRef.current.buildDirectAgentPrompt({
            agent,
            query: cleanQuery,
            historyContext,
            filesContext,
            sessionSummary,
            fallbackWarning,
            allowDeepSearch,
            resolvedInstructions,
          }) + `

ANTI-LOOP & PERFORMANCE POLICY:
- DO NOT engage in repetitive tool calls, lookup loops, or recursive file/code checks. If a search or tool command yields duplicate or minimal new data, stop immediately.
- Give a direct, rapid response. Avoid conversational filler or verbose explanations. Keep the execution clean and fast.
`;

          const { content: responseRaw, provider: agentProvider, model: agentModel } = await runWithFallback(prompt, agentLabel, agentTimeout);
          const validationResult = await validateAndCorrectMermaid(responseRaw, agentLabel, prompt, agentTimeout);
          const finalResponse = validationResult.response;
          const finalAgentProvider = validationResult.provider || agentProvider;
          const finalAgentModel = validationResult.model || agentModel;

          addMessage(agent.id as any, finalResponse, agentLabel, undefined, finalAgentProvider, finalAgentModel);
          addThinking(agentLabel, `DIRECT_EXECUTION_COMPLETE`, 'worker_end');

          // Update the persistent summary after direct run
          const directSummaryPrompt = `
            You are ATHENA, the MASTER_CONTROL_MODERATOR. An agent direct run has just completed.
            ${fallbackWarning}
            
            CURRENT_SESSION_SUMMARY:
            "${sessionSummary || "No previous summary available."}"
            
            LATEST_TURN_DATA:
            - User Asked: "${cleanQuery}"
            - Intent: "Direct chat with ${agentLabel}"
            - Engaged Agents: ["${agentLabel}"]
            - Agent Responses: ${JSON.stringify([{ agentId: agent.id, agentName: agentLabel, persona: agent.persona, content: finalResponse }])}
            - Final Output Sent to User: "${finalResponse}"
            
            TASK:
            You MUST append a summary of the latest turn to the CURRENT_SESSION_SUMMARY.
            The summary of this latest turn MUST follow this exact format:

            - User asked: "[Brief summary of what the user asked]"
            - Athena: intent is "Direct chat with ${agentLabel}" and engaged ${agentLabel}
            - ${agentLabel}: "[Extracted key findings/message]"
            - Athena synthesized and told the user: "[Brief summary of the final response]"

            IMPORTANT RULES:
            1. Do NOT lose key data, decisions, or facts from the messages.
            2. Keep the user's question, intent, and clean extracted messages in focus.
            3. Keep the previous session summary intact (exactly as it is), and append this new turn summary at the end.
            4. If there is no previous summary, start directly with the new turn summary.
            5. Return ONLY the complete updated session summary (previous summary + appended new turn). Do not include any other conversational text or formatting.
          `;
          try {
            const summaryResult = await runWithFallback(directSummaryPrompt, 'Athena');
            const updatedSummary = summaryResult.content.trim();
            setSessionSummary(updatedSummary);
            saveCurrentSession(undefined, undefined, updatedSummary);
            addThinking('Athena', 'NEURAL_SUMMARY_UPDATED');
          } catch (sumErr) {
            console.error("Post-run direct agent summarization failed:", sumErr);
          }
        } catch (e: any) {
          addThinking(agent.name, `DIRECT_EXECUTION_FAILED: ${e.message}`, 'error');
          addMessage('error', `Direct agent execution failed: ${e.message}`);
        } finally {
          setIsLoading(false);
          setStatusText('IDLE');
          setRunningSessionId(null);
        }
        return;
      }

    addMessage('user', userQuery)
    setIsLoading(true); 
    setStatusText('ANALYZING_INTENT...')

    let currentTurn = 1;
    const maxTurns = 2;
    let accumulatedAgentContext: { agentId: string, agentName: string, persona: string, content: string }[] = [];
    let allAddedInfo = "";
    let isFinalized = false;
    let hasCrossChecked = false;
    let latestDecision: any = null;
    let finalDirResponse = "";
    const agentRosterPrompt = athenaServiceRef.current.buildAgentRosterPrompt(agentRoster);

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

        addThinking('Athena', `QUORUM_LOOP_TURN_${currentTurn}: Evaluating state...`)
        addThinking('Athena', 'CALL_GATEWAY: POST /runs', 'mcp_call')
        
        const turnContext = accumulatedAgentContext.length > 0 
          ? `\n\nCURRENT_TURN_INTEL:\n${JSON.stringify(accumulatedAgentContext)}`
          : "";
        
        const midRunContext = allAddedInfo ? `\n\nADDED_USER_INTEL_DURING_RUN:\n${allAddedInfo}` : "";

        const moderatorDecisionPrompt = athenaServiceRef.current.buildModeratorDecisionPrompt({
          userQuery,
          historyContext,
          turnContext,
          midRunContext,
          sessionSummary,
          filesContext,
          fallbackWarning,
          currentTurn,
          maxTurns,
          agentRosterPrompt,
        }) + `

STRATEGY FOR THIS TURN:
- If this is Turn 2, you MUST prioritize "action": "finalize" unless the agents have provided critically contradicting information that makes a decision impossible.
- If agents AGREE or provide complementary info, merge their findings and finalize.
- If you are NOT SURE about any agent claim, you MUST QUESTION that agent directly if you decide to engage for one more turn (only if absolutely necessary).
- Limit agent exploration: Do NOT allow agents to perform deep search / deep exploration unless you explicitly prompt them to (default should be false).
- Control agent-to-agent validation: Specify target cross_checks explicitly so agents don't engage in excessive all-to-all cross-checks.

AMBIGUITY & UNCERTAINTY:
- If the user's request or agent responses are AMBIGUOUS, you MUST ask the agents (or user) for more questions/clarification.

VISUALIZATION REQUIREMENT: Include Mermaid diagrams and visuals as much as possible in your direct_response.

HUMAN_IN_THE_LOOP: If "ADDED_USER_INTEL_DURING_RUN" is present, prioritize this context.

Decide which configured agents can materially help. Select by agent id only.
Output ONLY valid JSON.
{
  "thought": "description of intent and reasoning path",
  "intent": "identified user ask intent",
  "goal": "reasoning goal of this swarm run",
  "action": "engage" | "finalize",
  "engage": ["agent_id"],
  "queries": {
    "agent_id": {
      "task": "specific task for that agent. Instruct agent to identify and mark facts with [FACT:index]",
      "context_strategy": "full" | "summary",
      "allow_deep_search": true | false
    }
  },
  "cross_checks": [
    { "from": "agent_id", "to": "agent_id", "reason": "why they are validating this output" }
  ],
  "direct_response": "... (FACTS ONLY. Mark with Fact[index]. EXPLAIN results, do not just summarize.)"
}
`;
        
        const { content: decisionRaw, provider: modProvider, model: modModel } = await runWithFallback(moderatorDecisionPrompt, 'Athena')
        
        // Whisper Athena's initial acknowledgment
        if (currentTurn === 1) {
          addMessage(
            'athena-whisper' as any,
            `I've received your directive: "${userQuery.substring(0, 50)}${userQuery.length > 50 ? '...' : ''}". I am analyzing the state and looking at the roster to determine the best approach.`,
            undefined,
            undefined,
            modProvider,
            modModel
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
          latestDecision = decision;
        } catch (e: any) {
          // If parsing completely fails, the model likely ignored the system prompt and answered directly.
          // Log the parse error, but display the raw text to the user so the answer isn't lost.
          addThinking('System', `Neural parsing error: ${e.message}. Assuming rogue direct response.`, 'error');
          decision = { action: 'finalize', direct_response: decisionRaw, thought: `Parsing error fallback: ${e.message}` };
          latestDecision = decision;
        }

        addThinking("Athena", `TURN_${currentTurn}_THOUGHT: ` + decision.thought); 

        if (decision.action === 'finalize' || (decision.engage || []).length === 0) {
          isFinalized = true;
          if (decision.direct_response && currentTurn === 1) {
             const validationResult = await validateAndCorrectMermaid(decision.direct_response, 'Athena', moderatorDecisionPrompt, 90000);
             finalDirResponse = validationResult.response;
             const finalModProvider = validationResult.provider || modProvider;
             const finalModModel = validationResult.model || modModel;
             addMessage('athena', finalDirResponse, undefined, undefined, finalModProvider, finalModModel);
          }
          break;
        }

        const agentsToEngage = resolveEngagedAgents(decision.engage, agentRoster);
        setStatusText(`TURN_${currentTurn}: ${agentsToEngage.length} AGENTS`);
        addMessage(
          'athena-whisper' as any,
          `I've analyzed the intent and am now looking at the agent roster to engage the best specialists for your task. Turn ${currentTurn}: Engaging ${agentsToEngage.map(agent => `**${agent.name}** (${agent.persona})`).join(', ')}.`,
          undefined,
          undefined,
          modProvider,
          modModel
        );

        // ── SUPERVISED PARALLEL AGENT EXECUTION ──
        const agentPromises = agentsToEngage.map(async (agent) => {
          const queryData = decision.queries && (decision.queries[agent.id] || decision.queries[agent.name] || decision.queries[agent.persona]);
          const promptQuery = filesContext ? `${userQuery}${filesContext}` : userQuery;
          const query = typeof queryData === 'string' ? queryData : (queryData?.task || promptQuery);
          const strategy = typeof queryData === 'object' ? queryData.context_strategy : 'full';
          const allowDeepSearch = (typeof queryData === 'object' && queryData.allow_deep_search === true) || sessionMetadata.allowDeepSearch === true;
          const agentLabel = agent.name || agent.id;

          // Start Ability Resolution and Context Setup in parallel
          addThinking(agentLabel, `RESOLVING_ABILITIES: ${agent.persona}...`)
          
          const resolveAgentAbilities = async () => {
            const cacheKey = `${agent.persona}:${(agent.tags || []).join(',')}`;
            if (resolvedAbilitiesCache.current[cacheKey]) {
              addThinking(agentLabel, `ABILITIES_CACHED: Using resolved prompt for ${agent.persona}`)
              return { content: [{ text: resolvedAbilitiesCache.current[cacheKey] }] };
            }

            try {
              const text = await athenaServiceRef.current.resolveAbilities(agent);
              if (text) {
                resolvedAbilitiesCache.current[cacheKey] = text;
                addThinking(agentLabel, `ABILITIES_RESOLVED: ${agent.persona}`, 'mcp_response')
              }
              return { content: [{ text }] };
            } catch (e: any) {
              addThinking(agentLabel, `ABILITY_RESOLUTION_FAILED: ${e.message}`, 'error');
              return { content: [] };
            }
          };

          const mcpPromise = resolveAgentAbilities();
          const resolvedInstructions = (await mcpPromise).content?.[0]?.text || "";
          addThinking(agentLabel, `ANALYZING_QUERY (strategy: ${strategy}): ${query.substring(0, 30)}...`)
          
          const effectiveContext = (strategy === 'summary' 
            ? `\n\nCURRENT_SESSION_SUMMARY:\n${sessionSummary || "No previous summary."}\n\nCURRENT_TURN_INTEL:\n${JSON.stringify(accumulatedAgentContext)}`
            : `${historyContext}\n\n${turnContext}`) + filesContext;

          const agentTimeout = allowDeepSearch ? 300000 : 90000;

          const prompt = athenaServiceRef.current.buildDirectAgentPrompt({
            agent,
            query,
            historyContext: `${effectiveContext}${midRunContext}`,
            sessionSummary,
            fallbackWarning,
            allowDeepSearch,
            resolvedInstructions,
            filesContext,
          }) + `

Task from moderator: ${query}

ANTI-LOOP & PERFORMANCE POLICY:
- DO NOT engage in repetitive tool calls, lookup loops, or recursive file/code checks. If a search or tool command yields duplicate or minimal new data, stop immediately.
- Give a direct, rapid response. Avoid conversational filler or verbose explanations. Keep the execution clean and fast.
`;

          try {
            const { content: responseRaw, provider: agentProvider, model: agentModel } = await runWithFallback(prompt, agentLabel, agentTimeout);
            
            const validationResult = await validateAndCorrectMermaid(responseRaw, agentLabel, prompt, agentTimeout);
            const response = validationResult.response;
            const finalAgentProvider = validationResult.provider || agentProvider;
            const finalAgentModel = validationResult.model || agentModel;

            addMessage('agent-whisper' as any, response, agentLabel, undefined, finalAgentProvider, finalAgentModel)
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
              addMessage('athena-whisper' as any, `I am checking back on the agents. **${pending.join(', ')}** are still processing. Stand by.`);
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

        // ── SUPERVISED PARALLEL NEURAL CROSS-CHECK (GOVERNED BY ATHENA) ──
        const crossCheckRequests = decision.cross_checks || [];
        if (crossCheckRequests.length > 0 && !hasCrossChecked) {
          addThinking('Athena', `INITIATING_GOVERNED_NEURAL_CROSS_CHECK: Running ${crossCheckRequests.length} check(s)...`)
          setStatusText(`TURN_${currentTurn}: CROSS-CHECK`);
          hasCrossChecked = true;

          const allCrossCheckPromises = crossCheckRequests.map(async (req: any) => {
            const fromAgentRes = turnResults.find(r => (r.agentId === req.from || r.agentName.toLowerCase() === String(req.from).toLowerCase()) && r.status === 'complete');
            const toAgentRes = turnResults.find(r => (r.agentId === req.to || r.agentName.toLowerCase() === String(req.to).toLowerCase()) && r.status === 'complete');

            if (!fromAgentRes || !toAgentRes) {
              return { from: req.from, on: req.to, feedback: "Skipped (agent not active or failed)" };
            }

            const checkPrompt = `
              You are ${fromAgentRes.agentName}, performing a neural cross-check on ${toAgentRes.agentName}'s work.
              ${toAgentRes.agentName}'s Output: "${toAgentRes.content}"
              Original Task: "${userQuery}"
              Context/Reason for check: ${req.reason || "Review for consistency"}
              TASK: Review for accuracy/consistency with your persona (${fromAgentRes.persona}). Brief feedback ONLY.
            `;

            try {
              const { content: feedback, provider: checkProvider, model: checkModel } = await runWithFallback(checkPrompt, fromAgentRes.agentName, 45000);
              addMessage('agent-whisper' as any, `CROSS-CHECK feedback on ${toAgentRes.agentName}: ${feedback}`, fromAgentRes.agentName, undefined, checkProvider, checkModel);
              return { from: req.from, on: req.to, feedback };
            } catch (e: any) {
              return { from: req.from, on: req.to, feedback: `Cross-check failed: ${e.message}` };
            }
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

      if (accumulatedAgentContext.length > 0 || finalDirResponse) {
        setStatusText('SYNTHESIZING...'); 
        addThinking('Athena', 'PERFORMING_POST_RUN_NEURAL_SYNTHESIS...')

        const currentChain = settings["provider:chain"] || [];
        const activeProvIdx = preferredProviderIndexRef.current;
        const fallbackWarning = activeProvIdx > 0 && currentChain[activeProvIdx]
          ? `\n\nSYSTEM_STATUS: Operational on fallback provider (${currentChain[activeProvIdx].provider}:${currentChain[activeProvIdx].model}). Calibration adjusted for decreased capabilities.` 
          : "";

        const intentToUse = latestDecision?.intent || "General reasoning task";
        const engagedList = latestDecision?.engage || [];
        
        const summaryPrompt = athenaServiceRef.current.buildSummaryPrompt({
          sessionSummary,
          intent: intentToUse,
          userQuery,
          engagedAgents: engagedList,
          finalOutput: finalDirResponse || "Athena is generating a final synthesized report based on the agent responses",
          agentResponses: accumulatedAgentContext,
          fallbackWarning,
        }) + `

The summary of this latest turn MUST follow this exact format:

- User asked: "[Brief summary of what the user asked]"
- Athena: intent is "${intentToUse}" and engaged ${engagedList.length > 0 ? engagedList.join(', ') : 'Athena (direct/moderator)'}
${accumulatedAgentContext.map(r => `- ${r.agentName}: "[Extracted key findings/message from this agent]"`).join('\n')}
- Athena synthesized and told the user: "[Brief summary of the final response/report sent to the user]"

IMPORTANT RULES:
1. Do NOT lose key data, decisions, or facts from the agents' messages.
2. Keep the user's question, intent, and clean extracted messages in focus.
3. Keep the previous session summary intact (exactly as it is), and append this new turn summary at the end.
4. If there is no previous summary, start directly with the new turn summary.
5. Return ONLY the complete updated session summary (previous summary + appended new turn). Do not include any other conversational text or formatting.
`;

        if (accumulatedAgentContext.length > 0) {
          addThinking('Athena', 'PERFORMING_POST_RUN_NEURAL_SYNTHESIS: Generating summary and report in parallel...');

          const finalPrompt = `
            You are ATHENA, the MASTER_CONTROL_MODERATOR delivering the FINAL_COMPREHENSIVE_REPORT to the user.

            USER'S ORIGINAL REQUEST: "${userQuery}"
            PREVIOUS SESSION SUMMARY: "${sessionSummary || "No previous summary available."}"
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
            Present the facts verified in this response using a Markdown table formatted exactly like this:
            | Fact ID | Detail |
            | --- | --- |
            | [FACT:1] | [Fact detail] |

            ## 6. FACT_GLOSSARY
            List the verification sources for each fact in a table formatted exactly like this:
            | Fact ID | Detail & Verification Source |
            | --- | --- |
            | [FACT:1] | [Verification source details] |

            FORMATTING RULES:
            - Use rich Markdown throughout (headers, bold, tables, code blocks, bullet lists).
            - Write in clear, plain language. Avoid unnecessary jargon. When you must use technical terms, define them inline.
            - Be thorough. The user should NOT need to ask a follow-up question. If they read this report, they should fully understand the topic.
            - Do NOT include greetings, sign-offs, or filler text. Every sentence must carry information.
            - Do NOT summarize — EXPLAIN. The difference is critical.
          `;

          const [summaryResult, finalResult] = await Promise.all([
            runWithFallback(summaryPrompt, 'Athena'),
            runWithFallback(finalPrompt, 'Athena')
          ]);

          const updatedSummary = summaryResult.content.trim();
          setSessionSummary(updatedSummary);
          saveCurrentSession(undefined, undefined, updatedSummary);
          addThinking('Athena', 'NEURAL_SUMMARY_UPDATED');

          const finalResponseRaw = finalResult.content;
          let finalProvider = finalResult.provider;
          let finalModel = finalResult.model;

          const validationResult = await validateAndCorrectMermaid(finalResponseRaw, 'Athena', finalPrompt, 90000);
          const finalResponseCombined = validationResult.response;
          finalProvider = validationResult.provider || finalProvider;
          finalModel = validationResult.model || finalModel;

          addMessage('athena', finalResponseCombined, undefined, undefined, finalProvider, finalModel);
        } else {
          // If finalized on Turn 1 without agents, we just update the summary
          const summaryResult = await runWithFallback(summaryPrompt, 'Athena');
          const updatedSummary = summaryResult.content.trim();
          setSessionSummary(updatedSummary);
          saveCurrentSession(undefined, undefined, updatedSummary);
          addThinking('Athena', 'NEURAL_SUMMARY_UPDATED');
        }
      }
    } catch (error: any) {
      addMessage('error', `CRITICAL_EXCEPTION: ${error.message}`)
    } finally {
      setIsLoading(false); 
      setStatusText('IDLE');
      setRunningSessionId(null);
    }
  }

  const handleDeleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }

  const handleExport = () => {
    if (messages.length === 0) return;

    const normalizedTitle = (sessionTitle || 'Quorum_Export')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quorum - ${sessionTitle}</title>
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Share+Tech+Mono&display=swap" rel="stylesheet">
    <style>
        :root {
            --cp-bg: #080b12;
            --cp-cyan: #00e5ff;
            --cp-border: rgba(0, 229, 255, 0.2);
            --foreground: #e0e0e0;
            --cp-purple: #b624ff;
        }
        body {
            font-family: 'Rajdhani', sans-serif;
            background-color: var(--cp-bg);
            color: var(--foreground);
            line-height: 1.6;
            padding: 40px;
            max-width: 900px;
            margin: 0 auto;
        }
        .header {
            border-bottom: 1px solid var(--cp-border);
            margin-bottom: 30px;
            padding-bottom: 10px;
        }
        h1 { color: var(--cp-cyan); font-family: 'Share Tech Mono', monospace; margin: 0; font-size: 1.5rem; }
        .session-title { opacity: 0.6; font-size: 0.9rem; }
        .message { margin-bottom: 20px; padding: 15px; border: 1px solid var(--cp-border); background: rgba(255,255,255,0.02); }
        .message.user { border-left: 4px solid var(--cp-cyan); }
        .message.bot { border-left: 4px solid var(--cp-purple); }
        .message-header { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 0.8rem; font-family: 'Share Tech Mono', monospace; opacity: 0.7; }
        .role { color: var(--cp-cyan); font-weight: bold; }
        pre { background: #1a1a1a; padding: 15px; border-radius: 4px; overflow-x: auto; border: 1px solid #333; }
        code { font-family: 'Share Tech Mono', monospace; color: var(--cp-cyan); }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #333; padding: 10px; text-align: left; }
        th { background-color: #1a1a1a; color: var(--cp-cyan); }
        .mermaid { background: white !important; padding: 10px; border-radius: 4px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>// QUORUM_SESSION_EXPORT</h1>
        <div class="session-title">${sessionTitle}</div>
    </div>
    <div id="messages"></div>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>
        mermaid.initialize({ startOnLoad: true, theme: 'default' });
        const messages = [
            ${messages.filter(m => m.role !== 'system' && m.role !== 'internal' && m.role !== 'error').map(m => `
            {
                role: "${m.role}",
                content: \`${m.content.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`,
                timestamp: "${new Date(m.timestamp).toLocaleString()}"
            }`).join(',')}
        ];
        
        const container = document.getElementById('messages');
        messages.forEach(m => {
            const isUser = m.role === 'user';
            const div = document.createElement('div');
            div.className = 'message ' + (isUser ? 'user' : 'bot');
            div.innerHTML = \`
                <div class="message-header">
                    <span class="role">\${m.role.toUpperCase()}</span>
                    <span class="timestamp">\${m.timestamp}</span>
                </div>
                <div class="message-content">\${marked.parse(m.content)}</div>
            \`;
            container.appendChild(div);
        });
    </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${normalizedTitle}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        onExport={handleExport}
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

        <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
          {currentSessionId ? (
            <ChatArea 
              messages={messages} 
              sessionTitle={sessionTitle}
              onSend={handleSend} 
              onUploadFile={handleUploadFile}
              sessionFiles={sessionMetadata.files || []}
              onDeleteSessionFile={handleDeleteSessionFile}
              agents={getAgentRoster()}
              onDeleteMessage={handleDeleteMessage}
              isLoading={isLoading && currentSessionId === runningSessionId}
              statusText={statusText}
              thinking={thinking}
              onSummarize={handleSummarize}
              onClearSession={startNewSession}
              onEditMessage={(id: string, newContent: string) => {
                const msgIdx = messages.findIndex(m => m.id === id);
                if (msgIdx !== -1) {
                  // Roll back the conversation context to this message, and re-send the edited text
                  const updated = messages.slice(0, msgIdx);
                  setMessages(updated);
                  handleSend(newContent);
                }
              }}
              onUpdateMessage={(id: string, newContent: string) => {
                setMessages(prev => prev.map(m => m.id === id ? { ...m, content: newContent } : m));
              }}
              allowDeepSearch={sessionMetadata.allowDeepSearch || false}
              onToggleDeepSearch={(enabled: boolean) => {
                const updatedMeta = { ...sessionMetadataRef.current, allowDeepSearch: enabled };
                updateSessionMetadata(updatedMeta);
                saveCurrentSession(undefined, undefined, undefined, updatedMeta);
              }}
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
          settings={settings}
          sessionFiles={sessionMetadata.files || []}
          onUploadFile={handleUploadFile}
          onDeleteSessionFile={handleDeleteSessionFile}
        />
      </div>

      <BottomBar 
        sessionTitle={sessionTitle} 
        folders={folders}
        sessions={sessions}
        settings={settings}
      />
      <Toaster />
    </div>
  );
}
