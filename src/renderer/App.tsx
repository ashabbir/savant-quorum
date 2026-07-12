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
import {
  buildMandatoryCrossChecks,
  getRecoverableAgentRunId,
  getChatExecutionPolicy,
  MODERATOR_DECISION_TIMEOUT_MS,
  REGULAR_AGENT_TIMEOUT_MS,
  requiresIndependentReview,
  selectValueAddingAgents,
  shouldDecomposeRequest,
} from "./services/chatExecutionPolicy";
import { CITATION_CONTRACT_PROMPT } from "./services/citationContract";
import type { AgentRunDisplayState } from "./services/agentRunSupervision";
import mermaid from "mermaid";
import { sanitizeMermaidCode } from "./utils/mermaidSanitizer";
import {
  parseFolderClassification,
  suggestSessionGrouping,
  type SessionGroupingSuggestion,
} from "./services/sessionService";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { AgentStallDialog } from "./components/AgentStallDialog";

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
  const [streamingAgents, setStreamingAgents] = useState<Record<string, AgentRunDisplayState>>({})
  const agentRunEventsIntervalRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [sessionSummary, setSessionSummary] = useState<string>("");
  const midRunBuffer = useRef<string[]>([]);
  const resolvedAbilitiesCache = useRef<Record<string, string>>({});
  const athenaServiceRef = useRef(createAthenaService());
  
  const [sessions, setSessions] = useState<any[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState('New Session')

  const [folders, setFolders] = useState<FolderItem[]>([
    { id: "f1", name: "research", hint: "Research, investigation, discovery, and source analysis" },
    { id: "f2", name: "code sessions", hint: "Software implementation, debugging, tests, and code review" },
  ]);

  const [sessionFolders, setSessionFolders] = useState<Record<string, string | null>>({});
  const [unreadSessionIds, setUnreadSessionIds] = useState<Set<string>>(new Set());
  const [sessionMetadata, setSessionMetadata] = useState<Record<string, any>>({ allowDeepSearch: false, files: [] });

  const messagesRef = useRef<Message[]>([]);
  const thinkingRef = useRef<Thinking[]>([]);
  const sessionMetadataRef = useRef<Record<string, any>>({ allowDeepSearch: false, files: [] });
  const currentSessionIdRef = useRef<string | null>(null);
  const foldersRef = useRef<FolderItem[]>(folders);
  const sessionFoldersRef = useRef<Record<string, string | null>>({});
  const unreadSessionIdsRef = useRef<Set<string>>(new Set());
  const sessionOrderRef = useRef<string[]>([]);
  const classificationRequestsRef = useRef<Set<string>>(new Set());

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { thinkingRef.current = thinking; }, [thinking]);
  useEffect(() => { sessionMetadataRef.current = sessionMetadata; }, [sessionMetadata]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { foldersRef.current = folders; }, [folders]);
  useEffect(() => { sessionFoldersRef.current = sessionFolders; }, [sessionFolders]);

  const updateUnreadSession = (sessionId: string, unread: boolean) => {
    const updated = new Set(unreadSessionIdsRef.current);
    if (unread) {
      updated.add(sessionId);
    } else {
      updated.delete(sessionId);
    }
    if (updated.size === unreadSessionIdsRef.current.size
      && [...updated].every(id => unreadSessionIdsRef.current.has(id))) {
      return;
    }
    unreadSessionIdsRef.current = updated;
    setUnreadSessionIds(updated);
    void window.system.saveSetting("system:unreadSessionIds", [...updated]);
  };

  // Listen for agent run IDs from main process and poll gateway events per agent
  useEffect(() => {
    if (typeof window.system?.onAgentRunStarted !== 'function') return;

    window.system.onAgentRunStarted(({
      runId,
      agentLabel,
      startedAt,
      lastActivityAt,
      idleTimeoutMs,
    }) => {
      if (!agentLabel || !runId) return;

      setStreamingAgents(prev => ({
        ...prev,
        [agentLabel]: {
          ...(prev[agentLabel] || { status: 'Running via gateway...' }),
          runId,
          events: [],
          startedAt,
          lastActivityAt,
          idleTimeoutMs,
        }
      }));

      let lastEventFingerprint = '';
      const fetchEvents = async () => {
        try {
          const settingsData: Record<string, any> = await window.system.getSettings().catch(() => ({}));
          const gwCfg = settingsData?.['gateway:config'];
          const gatewayUrl = (gwCfg?.url || 'http://127.0.0.1:3100').replace(/\/$/, '');
          const res = await fetch(`${gatewayUrl}/runs/${runId}/events`);
          if (res.ok) {
            const data = await res.json();
            const events = data?.events || [];
            const latest = events.at(-1);
            const eventFingerprint = JSON.stringify([
              events.length,
              latest?.id,
              latest?.type,
              latest?.timestamp,
              latest?.status,
            ]);
            setStreamingAgents(prev => {
              if (!prev[agentLabel]) return prev;
              const hasNewActivity = events.length > 0 && eventFingerprint !== lastEventFingerprint;
              if (hasNewActivity) lastEventFingerprint = eventFingerprint;
              return {
                ...prev,
                [agentLabel]: {
                  ...prev[agentLabel],
                  events,
                  lastActivityAt: hasNewActivity ? Date.now() : prev[agentLabel].lastActivityAt,
                },
              };
            });
            if (events.some((event: any) => event?.type === 'complete' || event?.type === 'error')) {
              clearInterval(agentRunEventsIntervalRef.current[agentLabel]);
              delete agentRunEventsIntervalRef.current[agentLabel];
            }
          }
        } catch {}
      };

      fetchEvents();
      const existingInterval = agentRunEventsIntervalRef.current[agentLabel];
      if (existingInterval) clearInterval(existingInterval);
      const interval = setInterval(fetchEvents, 2000);
      agentRunEventsIntervalRef.current[agentLabel] = interval;
    });

    window.system.onAgentRunConnectionState?.(({ runId, agentLabel, state, detail }) => {
      if (!agentLabel || !runId) return;
      setStreamingAgents(prev => ({
        ...prev,
        [agentLabel]: {
          ...(prev[agentLabel] || {}),
          runId,
          status: state === 'disconnected'
            ? `Gateway disconnected. Reconnecting to the same run...${detail ? ` (${detail})` : ''}`
            : 'Gateway reconnected. Continuing the same run...',
        },
      }));
    });

    window.system.onAgentRunActivity?.((activity) => {
      setStreamingAgents(prev => {
        const key = activity.agentLabel && prev[activity.agentLabel]
          ? activity.agentLabel
          : Object.keys(prev).find(agentName => prev[agentName]?.runId === activity.runId);
        if (!key) return prev;
        return {
          ...prev,
          [key]: {
            ...prev[key],
            runId: activity.runId,
            startedAt: activity.startedAt,
            lastActivityAt: activity.lastActivityAt,
            idleTimeoutMs: activity.idleTimeoutMs,
            status: activity.reason === 'operator_wait'
              ? 'Athena extended the idle timer. Waiting for more activity...'
              : prev[key].status,
          },
        };
      });
    });

    return () => {
      window.system?.offAgentRunStarted?.();
      window.system?.offAgentRunConnectionState?.();
      window.system?.offAgentRunActivity?.();
      Object.values(agentRunEventsIntervalRef.current).forEach(clearInterval);
      agentRunEventsIntervalRef.current = {};
    };
  }, []);

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
    const order = new Map(sessionOrderRef.current.map((id, index) => [id, index]));
    const orderedList = [...list].sort((left, right) => {
      const leftIndex = order.get(left.id);
      const rightIndex = order.get(right.id);
      if (leftIndex !== undefined && rightIndex !== undefined) return leftIndex - rightIndex;
      if (leftIndex !== undefined) return 1;
      if (rightIndex !== undefined) return -1;
      return (right.created_at || right.timestamp || 0) - (left.created_at || left.timestamp || 0);
    });
    sessionOrderRef.current = orderedList.map(session => session.id);
    setSessions(orderedList)
    return orderedList;
  }

  const persistSessionFolder = (sessionId: string, folderId: string | null) => {
    setSessionFolders(prev => {
      const updated = { ...prev, [sessionId]: folderId };
      sessionFoldersRef.current = updated;
      window.system.saveSetting("system:sessionFolders", updated);
      return updated;
    });
  }

  const startNewSession = (title?: string) => {
    const newId = `quorum-${Date.now()}`
    const newTitle = title || "New Quorum";
    sessionOrderRef.current = [newId, ...sessionOrderRef.current.filter(id => id !== newId)];
    setSessions(previous => [
      { id: newId, title: newTitle, created_at: Date.now(), timestamp: Date.now() },
      ...previous.filter(session => session.id !== newId),
    ]);
    window.system.saveSetting("system:sessionOrder", sessionOrderRef.current);
    currentSessionIdRef.current = newId;
    setCurrentSessionId(newId)
    setMessages([])
    setThinking([])
    messagesRef.current = []
    thinkingRef.current = []
    setSessionSummary("")
    updateSessionMetadata({ allowDeepSearch: false, files: [] })
    setSessionTitle(newTitle)
    addThinking('System', 'INITIALIZING_QUORUM_HEURISTICS...'); 
    addThinking('System', '----------------------------'); 
    addThinking('System', 'QUORUM_ONLINE')
  }

  const loadSession = async (id: string) => {
    currentSessionIdRef.current = id;
    updateUnreadSession(id, false);
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
    const messagesToSave = updatedMessages || messagesRef.current;
    const summaryToSave = updatedSummary !== undefined ? updatedSummary : sessionSummary;
    await window.sessions.save({
      id: currentSessionId,
      title: newTitle,
      messages: messagesToSave,
      thinking: updatedThinking || thinkingRef.current,
      summary: summaryToSave,
      metadata: JSON.stringify(metaToSave)
    })
    loadSessionList()
    void classifySession(currentSessionId, newTitle, messagesToSave, summaryToSave)
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
    void classifySession(sessionId, title, msgs, existingSummary);
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
      updateUnreadSession(id, false);
        sessionOrderRef.current = sessionOrderRef.current.filter(sessionId => sessionId !== id);
        window.system.saveSetting("system:sessionOrder", sessionOrderRef.current);
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
    if (Array.isArray(loadedSettings["system:unreadSessionIds"])) {
      const restoredUnread = new Set<string>(loadedSettings["system:unreadSessionIds"]);
      unreadSessionIdsRef.current = restoredUnread;
      setUnreadSessionIds(restoredUnread);
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
    sessionOrderRef.current = Array.isArray(loadedSettings["system:sessionOrder"])
      ? loadedSettings["system:sessionOrder"]
      : [];
    const list = await loadSessionList()
    const knownSessionIds = new Set(list.map(session => session.id));
    const restoredUnread = new Set<string>(
      (Array.isArray(loadedSettings["system:unreadSessionIds"])
        ? loadedSettings["system:unreadSessionIds"]
        : []
      ).filter((sessionId: unknown): sessionId is string => (
        typeof sessionId === "string" && knownSessionIds.has(sessionId)
      )),
    );
    unreadSessionIdsRef.current = restoredUnread;
    setUnreadSessionIds(restoredUnread);
    
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
    unreadSessionIdsRef.current = new Set();
    setUnreadSessionIds(new Set());
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
  const [activeProviderIndex, setActiveProviderIndex] = useState(0);

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

  const runWithFallback = async (prompt: string, agentName: string, timeoutMs: number = REGULAR_AGENT_TIMEOUT_MS) => {
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
        const responseRaw = await window.system.runAgentViaGateway({
          provider: adapterName,
          model,
          prompt,
          timeoutMs,
          agentLabel: agentName,
        });

        // Basic quota/error checks (ensure it's actually an error message and not user-facing text containing these words)
        const responseLower = responseRaw.toLowerCase().trim();
        const isLikelyErrorResponse = responseLower.startsWith('error:') || responseLower.startsWith('warning:') || responseRaw.length < 300;
        if (isLikelyErrorResponse && (
          /429|quota_exhausted|rate_limit|rate limit/i.test(responseRaw) || 
          /usage limit|upgrade to pro/i.test(responseRaw)
        )) {
          lastError = new Error(`Quota exhausted on ${adapterName}: ${responseRaw}`);
          attempt++;
          continue;
        }
        if (responseLower.startsWith('error:') || /ModelNotFoundError|An unexpected critical error occurred|Error when talking to.*API/i.test(responseRaw) || responseLower.startsWith('warning:')) {
          lastError = new Error(responseRaw);
          attempt++;
          continue;
        }
        
        const nextIdx = chain.findIndex((p: any) => 
          (item.id !== undefined && p.id === item.id) || 
          (p.provider === item.provider && p.model === item.model)
        );
        preferredProviderIndexRef.current = nextIdx;
        setActiveProviderIndex(nextIdx);
        return { content: responseRaw, provider: adapterName, model };
      } catch (e: any) {
        const recoverableRunId = getRecoverableAgentRunId(e);
        if (recoverableRunId && typeof window.system?.resumeAgentRun === 'function') {
          const recoveryTimeoutMs = Math.max(timeoutMs, 300_000);
          addThinking(agentName, `RUN_TIMEOUT_RECOVERY_STARTED (${adapterName}): reconnecting to ${recoverableRunId}`, 'thought');
          setStreamingAgents(prev => ({
            ...prev,
            [agentName]: {
              ...(prev[agentName] || {}),
              runId: recoverableRunId,
              status: 'Original run exceeded the time limit. Recovering it without restarting...',
            },
          }));
          try {
            const recoveredResponse = await window.system.resumeAgentRun({
              runId: recoverableRunId,
              timeoutMs: recoveryTimeoutMs,
              agentLabel: agentName,
            });
            const nextIdx = chain.findIndex((provider: any) =>
              (item.id !== undefined && provider.id === item.id) ||
              (provider.provider === item.provider && provider.model === item.model)
            );
            preferredProviderIndexRef.current = nextIdx;
            setActiveProviderIndex(nextIdx);
            addThinking(agentName, `RUN_TIMEOUT_RECOVERED (${adapterName}): ${recoverableRunId}`, 'worker_end');
            return { content: recoveredResponse, provider: adapterName, model };
          } catch (recoveryError: any) {
            lastError = recoveryError;
            addThinking(agentName, `RUN_TIMEOUT_RECOVERY_FAILED (${adapterName}): ${recoveryError.message}`, 'error');
            attempt++;
            continue;
          }
        }

        lastError = e;
        addThinking(agentName, `PROVIDER_FAILED (${adapterName}): ${e.message}`, 'error');
        attempt++;
        continue;
      }
    }
    
    throw new Error(`ALL_PROVIDERS_EXHAUSTED: ${lastError?.message || 'Unknown'}`);
  }

  const classifySession = async (
    sessionId: string,
    title: string,
    sessionMessages: Message[],
    summary = "",
    force = false,
  ) => {
    const hintedFolders = foldersRef.current.filter(folder => folder.hint?.trim());
    if (hintedFolders.length === 0) return;
    if (!force && Object.prototype.hasOwnProperty.call(sessionFoldersRef.current, sessionId)) return;

    const userMessages = sessionMessages.filter(message => message.role === "user");
    if (userMessages.length === 0) return;
    const latestUserContent = userMessages.at(-1)?.content || "";
    const hintSignature = hintedFolders.map(folder => `${folder.id}:${folder.hint}`).join("|");
    const requestKey = `${sessionId}:${latestUserContent}:${hintSignature}`;
    if (classificationRequestsRef.current.has(requestKey)) return;
    classificationRequestsRef.current.add(requestKey);

    const folderOptions = hintedFolders.map(folder => ({
      folderId: folder.id,
      name: folder.name,
      hint: folder.hint,
    }));
    const transcript = userMessages
      .slice(-4)
      .map(message => message.content)
      .join("\n\n")
      .slice(0, 6000);

    try {
      const result = await runWithFallback(
        `Classify this chat into exactly one folder only when it clearly matches a folder hint.
Return JSON only: {"folderId":"<id>"} or {"folderId":null}.

FOLDERS:
${JSON.stringify(folderOptions)}

CHAT TITLE:
${title}

CHAT SUMMARY:
${summary || "None"}

RECENT USER MESSAGES:
${transcript}`,
        "Session Classifier",
        30_000,
      );
      const folderId = parseFolderClassification(
        result.content,
        hintedFolders.map(folder => folder.id),
      );
      const wasManuallyFiled = Object.prototype.hasOwnProperty.call(
        sessionFoldersRef.current,
        sessionId,
      );
      if (folderId && (force || !wasManuallyFiled)) {
        persistSessionFolder(sessionId, folderId);
      }
    } catch (error) {
      console.warn("Session classification failed:", error);
    }
  }

  const classifyChatById = async (sessionId: string) => {
    const data = await window.sessions.load(sessionId);
    if (!data) return;
    await classifySession(
      sessionId,
      data.title || sessions.find(session => session.id === sessionId)?.title || "Untitled Quorum",
      data.messages || [],
      data.summary || "",
      true,
    );
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
        You are an AI assistant operating as the orchestration moderator (ATHENA) for a multi-agent reasoning system. The user has requested a manual neural recalibration of the session state.
        
        CURRENT_SESSION_SUMMARY:
        "${sessionSummary || "No previous summary available."}"
        
        FULL_CHAT_HISTORY:
        ${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}
        
        TASK: Produce polished Markdown that helps the user quickly understand the session.

        REQUIRED STRUCTURE:
        # Session Summary

        ## Overview
        A concise paragraph describing the session's purpose and current conclusion.

        ## Conversation Timeline
        ### Turn 1 — [short topic]
        **Question:** [concise user question]
        **Agents:** [engaged agents]
        **Outcome:**
        - [direct conclusion]
        - [material fact or decision]
        - [remaining gap, only if one exists]

        Repeat the Turn section for each user request.

        ## Key Facts and Decisions
        - Preserve important technical facts, decisions, identifiers, and relationships.

        ## Open Questions
        - Include only unresolved items. Write "None" when everything is resolved.

        IMPORTANT RULES:
        1. Do NOT lose key data, decisions, or facts from the agents' messages or the history.
        2. Summarize outcomes; do not paste full answers or citation tables.
        3. Use real Markdown headings, bullets, bold labels, and whitespace.
        4. Never wrap whole questions or answers in quotation marks.
        5. Return only the Markdown summary.
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
      const latestThinking = currentSessionIdRef.current === sessionForThisRun
        ? thinkingRef.current
        : runThinking;
      runThinking = [newThink, ...latestThinking];
      
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
      const latestMessages = currentSessionIdRef.current === sessionForThisRun
        ? messagesRef.current
        : runMessages;
      runMessages = [...latestMessages, newMsg];
      
      if (currentSessionIdRef.current === sessionForThisRun) {
        messagesRef.current = [...messagesRef.current, newMsg];
        setMessages(messagesRef.current);
      }
      
      saveSessionDirectly(sessionForThisRun, runMessages, runThinking);
      if (
        currentSessionIdRef.current !== sessionForThisRun
        && ['athena', 'moderator', 'engineer', 'architect', 'security', 'ai', 'error'].includes(role)
      ) {
        updateUnreadSession(sessionForThisRun, true);
      }
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
              You are an AI assistant operating as the orchestration moderator (ATHENA) for a multi-agent reasoning system. The operator has referenced the session "${referencedSession.title}".
              
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
        `Added context captured: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}". Active agent calls cannot be rewritten, so Athena will apply it at the next moderation checkpoint before finalizing.`
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
            You are an AI assistant operating as the orchestration moderator (ATHENA) for a multi-agent reasoning system. An agent direct run has just completed.
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
            You are an AI assistant operating as the orchestration moderator (ATHENA) for a multi-agent reasoning system. An agent direct run has just completed.
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
    setStatusText('TRIAGING REQUEST')
    addMessage(
      'athena-whisper' as any,
      `Request received. Athena is deciding whether to answer directly or engage the smallest specialist roster that adds distinct value.`
    );

    let rankedIntents: { rank: number, topic: string, intent: string, reason: string }[] = [];
    if (shouldDecomposeRequest(userQuery)) try {
      setStatusText('DECOMPOSING REQUEST');
      const intentAnalysisPrompt = `
        You are an AI assistant operating as the orchestration moderator (ATHENA) for a multi-agent reasoning system.
        The user has sent a request. You need to analyze this request and determine if there are multiple topics, tasks, or intents.
        
        User Request: "${userQuery}"
        
        Task:
        1. Identify all distinct topics, tasks, or intents in the request.
        2. Rank them in a logical processing order (e.g. dependency-first or importance-first).
        3. Output a clean JSON object containing:
           - "hasMultiple": true or false
           - "rankedIntents": an array of objects, each containing:
             - "rank": number (starting from 1)
             - "topic": brief description of this specific topic/task
             - "intent": the specific intent/sub-query for this topic/task
             - "reason": why this topic is ranked here
             
        Example JSON Output:
        {
          "hasMultiple": true,
          "rankedIntents": [
            { "rank": 1, "topic": "Check database connection status", "intent": "Analyze if the db is reachable", "reason": "Pre-requisite for querying data" },
            { "rank": 2, "topic": "Retrieve agent configuration", "intent": "List agent specs", "reason": "Requires database verification first" }
          ]
        }
        
        Output ONLY the valid JSON block inside markdown code ticks.
      `;
      const { content: analysisRaw } = await runWithFallback(intentAnalysisPrompt, 'Athena');
      const jsonBlockMatch = analysisRaw.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
      const jsonStr = jsonBlockMatch ? jsonBlockMatch[1] : analysisRaw;
      const parsed = JSON.parse(jsonStr);
      if (parsed && Array.isArray(parsed.rankedIntents) && parsed.rankedIntents.length > 0) {
        rankedIntents = parsed.rankedIntents.slice(0, 3);
      }
    } catch (e: any) {
      console.error("Intent analysis failed, falling back to single intent:", e);
    }

    if (rankedIntents.length === 0) {
      rankedIntents = [{ rank: 1, topic: "General request", intent: userQuery, reason: "Fallback single topic" }];
    }

    let accumulatedAgentContext: { agentId: string, agentName: string, persona: string, content: string }[] = [];
    let allAddedInfo = "";
    const agentRosterPrompt = athenaServiceRef.current.buildAgentRosterPrompt(agentRoster);

    try {
      for (const intentObj of rankedIntents) {
        addThinking('Athena', `PROCESSING_INTENT_${intentObj.rank}_OF_${rankedIntents.length}: ${intentObj.topic}`);
        addMessage(
          'athena-whisper' as any,
          `Processing sub-task ${intentObj.rank}/${rankedIntents.length}: **${intentObj.topic}** (Reason: ${intentObj.reason})`
        );

        const subQuery = intentObj.intent;
        let currentTurn = 1;
        const maxTurns = 2;
        let isFinalized = false;
        let latestDecision: any = null;

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

          addThinking('Athena', `QUORUM_LOOP_TURN_${currentTurn}: Evaluating state...`);
          addThinking('Athena', 'CALL_GATEWAY: POST /runs', 'mcp_call');
          
          const turnContext = accumulatedAgentContext.length > 0 
            ? `\n\nCURRENT_TURN_INTEL:\n${JSON.stringify(accumulatedAgentContext)}`
            : "";
          
          const midRunContext = allAddedInfo ? `\n\nADDED_USER_INTEL_DURING_RUN:\n${allAddedInfo}` : "";

          const moderatorDecisionPrompt = athenaServiceRef.current.buildModeratorDecisionPrompt({
            userQuery: subQuery,
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
- Default to one specialist. Select a second only when it contributes a distinct discipline or materially reduces decision risk. Never select more than two.
- Every selected agent must have a specific, non-overlapping contribution. Do not engage an agent merely because it is available.
- Cross-checking: specify at most one targeted cross_check. Use it to search for disconfirming evidence on a material claim, not to manufacture agreement.
- Minimize cost: prefer finalizing over another turn when the evidence is already sufficient.

AMBIGUITY & UNCERTAINTY:
- If the user's request or agent responses are AMBIGUOUS, you MUST ask the agents (or user) for more questions/clarification.
- Actively identify the strongest plausible counterargument and unresolved evidence gap. Do not reward consensus by itself.

VISUALIZATION: Include a diagram only when it materially improves the answer.

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
      "task": "specific task for that agent. Require inline [CITE:n] citations and the mandatory citation table",
      "context_strategy": "full" | "summary",
      "allow_deep_search": true | false
    }
  },
  "cross_checks": [
    { "from": "agent_id", "to": "agent_id", "reason": "why they are validating this output" }
  ],
  "direct_response": "... (FACTS ONLY. Use inline [CITE:n] markers and end with the required Citations table. EXPLAIN results, do not just summarize.)"
}
`;
          
          let decisionRaw: string;
          let modProvider: string | undefined;
          let modModel: string | undefined;
          try {
            const moderatorResult = await runWithFallback(
              moderatorDecisionPrompt,
              'Athena',
              MODERATOR_DECISION_TIMEOUT_MS,
            );
            decisionRaw = moderatorResult.content;
            modProvider = moderatorResult.provider;
            modModel = moderatorResult.model;
          } catch (moderatorError: any) {
            const fallbackAgents = selectValueAddingAgents([], agentRoster, subQuery);
            if (fallbackAgents.length === 0) throw moderatorError;

            setStatusText('MODERATOR SLOW · USING SAFE FALLBACK');
            addThinking('Athena', `MODERATOR_FALLBACK: ${moderatorError.message}`, 'timeout');
            addMessage(
              'athena-whisper' as any,
              `Athena's planning call exceeded 30 seconds. Continuing with a bounded fallback instead of ending the chat: ${fallbackAgents.map(agent => `**${agent.name}**`).join(', ')}.`
            );
            decisionRaw = JSON.stringify({
              thought: `Moderator timed out; using deterministic value-based agent selection.`,
              intent: subQuery,
              goal: `Return the best supported answer without another planning delay.`,
              action: "engage",
              engage: fallbackAgents.map(agent => agent.id),
              queries: Object.fromEntries(fallbackAgents.map(agent => [
                agent.id,
                {
                  task: subQuery,
                  context_strategy: "summary",
                  allow_deep_search: sessionMetadata.allowDeepSearch === true,
                },
              ])),
              cross_checks: [],
              direct_response: "",
            });
          }
          
          // Whisper Athena's initial acknowledgment
          if (currentTurn === 1) {
            addMessage(
              'athena-whisper' as any,
              `I've received your directive: "${subQuery.substring(0, 50)}${subQuery.length > 50 ? '...' : ''}". I am analyzing the state and looking at the roster to determine the best approach.`,
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
            if (decision.direct_response) {
               const validationResult = await validateAndCorrectMermaid(decision.direct_response, 'Athena', moderatorDecisionPrompt, 90000);
               const subDirResponse = validationResult.response;
               accumulatedAgentContext.push({
                 agentId: 'athena',
                 agentName: 'Athena',
                 persona: 'moderator',
                 content: `Direct response for topic "${intentObj.topic}": ${subDirResponse}`
               });
            }
            break;
          }

          const requestedAgents = resolveEngagedAgents(decision.engage, agentRoster);
          const agentsToEngage = selectValueAddingAgents(
            requestedAgents.map(agent => agent.id),
            agentRoster,
            subQuery,
          );
          latestDecision.engage = agentsToEngage.map(agent => agent.id);
          setStatusText(`RUNNING ${agentsToEngage.length} SPECIALIST${agentsToEngage.length === 1 ? '' : 'S'}`);
          addMessage(
            'athena-whisper' as any,
            `Roster decision: ${agentsToEngage.map(agent => `**${agent.name}** (${agent.persona})`).join(', ')}. ${agentsToEngage.length === 1 ? 'One specialist is sufficient for this focused task.' : 'A second specialist is included for distinct, risk-reducing review.'}`,
            undefined,
            undefined,
            modProvider,
            modModel
          );

          // ── SUPERVISED PARALLEL AGENT EXECUTION ──
          const agentPromises = agentsToEngage.map(async (agent) => {
            const queryData = decision.queries && (decision.queries[agent.id] || decision.queries[agent.name] || decision.queries[agent.persona]);
            const promptQuery = filesContext ? `${subQuery}${filesContext}` : subQuery;
            const query = typeof queryData === 'string' ? queryData : (queryData?.task || promptQuery);
            const strategy = typeof queryData === 'object' ? queryData.context_strategy : 'full';
            const allowDeepSearch = (typeof queryData === 'object' && queryData.allow_deep_search === true) || sessionMetadata.allowDeepSearch === true;
            const agentLabel = agent.name || agent.id;

            setStreamingAgents(prev => ({ ...prev, [agentLabel]: { status: 'Resolving abilities...' } }));
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
            setStreamingAgents(prev => ({ ...prev, [agentLabel]: { ...(prev[agentLabel] || {}), status: "Analyzing query..." } }));
            addThinking(agentLabel, `ANALYZING_QUERY (strategy: ${strategy}): ${query.substring(0, 30)}...`)
            
            const effectiveContext = (strategy === 'summary' 
              ? `\n\nCURRENT_SESSION_SUMMARY:\n${sessionSummary || "No previous summary."}\n\nCURRENT_TURN_INTEL:\n${JSON.stringify(accumulatedAgentContext)}`
              : `${historyContext}\n\n${turnContext}`) + filesContext;

            const agentTimeout = getChatExecutionPolicy(allowDeepSearch).timeoutMs;

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
              setStreamingAgents(prev => ({ ...prev, [agentLabel]: { ...(prev[agentLabel] || {}), status: "Running via gateway..." } }));
              const { content: responseRaw, provider: agentProvider, model: agentModel } = await runWithFallback(prompt, agentLabel, agentTimeout);

              setStreamingAgents(prev => ({ ...prev, [agentLabel]: { ...(prev[agentLabel] || {}), status: "Validating output..." } }));
              const validationResult = await validateAndCorrectMermaid(responseRaw, agentLabel, prompt, agentTimeout);
              const response = validationResult.response;
              const finalAgentProvider = validationResult.provider || agentProvider;
              const finalAgentModel = validationResult.model || agentModel;

              clearInterval(agentRunEventsIntervalRef.current[agentLabel]);
              delete agentRunEventsIntervalRef.current[agentLabel];
              setStreamingAgents(prev => { const n = { ...prev }; delete n[agentLabel]; return n; });
              addMessage('agent-whisper' as any, response, agentLabel, undefined, finalAgentProvider, finalAgentModel)
              return { agentId: agent.id, agentName: agentLabel, persona: agent.persona, content: response, status: 'complete' as const };
            } catch (e: any) {
              clearInterval(agentRunEventsIntervalRef.current[agentLabel]);
              delete agentRunEventsIntervalRef.current[agentLabel];
              setStreamingAgents(prev => { const n = { ...prev }; delete n[agentLabel]; return n; });
              addThinking(agentLabel, `FAILURE_SIGNAL: ${e.message}`, 'error');
              return { agentId: agent.id, agentName: agentLabel, persona: agent.persona, content: `CRITICAL_ERROR: ${e.message}`, status: 'error' as const };
            }
          });

          // Supervisor loop for monitoring
          const watchSwarm = async (tasks: Promise<any>[], labels: string[]) => {
            let results: any[] = [];
            const taskStatuses = labels.map(label => ({ label, done: false }));

            const monitor = setInterval(() => {
              const pending = taskStatuses.filter(t => !t.done).map(t => t.label);
              if (pending.length > 0) {
                addThinking('Athena', `SUPERVISING: waiting on ${pending.join(', ')}`);
              }
            }, 30000);

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

          if (midRunBuffer.current.length > 0) {
            const newInfo = midRunBuffer.current.join('\n');
            allAddedInfo += (allAddedInfo ? '\n' : '') + newInfo;
            midRunBuffer.current = [];
            addMessage(
              'athena-whisper' as any,
              `New context arrived while specialists were running. Athena is re-evaluating their output against it before finalizing.`
            );
            if (currentTurn < maxTurns) {
              accumulatedAgentContext = [...accumulatedAgentContext, ...turnResults];
              currentTurn++;
              continue;
            }
          }

          // ── SUPERVISED PARALLEL NEURAL CROSS-CHECK (GOVERNED BY ATHENA) ──
          const crossCheckRequests = buildMandatoryCrossChecks(
            turnResults,
            decision.cross_checks,
            requiresIndependentReview(subQuery) || (Array.isArray(decision.cross_checks) && decision.cross_checks.length > 0),
          );
          if (crossCheckRequests.length > 0) {
            addThinking('Athena', `INITIATING_TARGETED_ADVERSARIAL_REVIEW`)
            setStatusText('CHALLENGING MATERIAL CLAIM');
            const allCrossCheckPromises = crossCheckRequests.map(async (req: any) => {
              const fromAgentRes = turnResults.find(r => (r.agentId === req.from || r.agentName.toLowerCase() === String(req.from).toLowerCase()) && r.status === 'complete');
              const toAgentRes = turnResults.find(r => (r.agentId === req.to || r.agentName.toLowerCase() === String(req.to).toLowerCase()) && r.status === 'complete');

              if (!fromAgentRes || !toAgentRes) {
                return { from: req.from, on: req.to, feedback: "Skipped (agent not active or failed)" };
              }

              const xLabel = `${fromAgentRes.agentName} cross-check`;
              setStreamingAgents(prev => ({ ...prev, [xLabel]: { status: `checking ${toAgentRes.agentName}...` } }));

              // Truncate agent content to keep cross-check prompts lean and fast
              const myEvidence = fromAgentRes.content.substring(0, 800);
              const theirOutput = toAgentRes.content.substring(0, 800);

              const checkPrompt = `You are an AI assistant acting as a skeptical ${fromAgentRes.agentName} specialist. Independently challenge another agent's most material claim.

Your evidence summary: "${myEvidence}"
${toAgentRes.agentName}'s output summary: "${theirOutput}"
Task: "${subQuery.substring(0, 300)}"
Review reason: ${req.reason || "adversarial evidence check"}

Respond in 3 lines ONLY:
CONFIDENCE: [0-100]%
VERDICT: supported | contradicted | unverified
NOTES: [strongest disconfirming evidence, missing evidence, or material discrepancy; never endorse a claim merely because agents agree]`;

              try {
                const { content: feedback, provider: checkProvider, model: checkModel } = await runWithFallback(checkPrompt, fromAgentRes.agentName, 25000);
                setStreamingAgents(prev => { const n = { ...prev }; delete n[xLabel]; return n; });
                clearInterval(agentRunEventsIntervalRef.current[fromAgentRes.agentName]);
                delete agentRunEventsIntervalRef.current[fromAgentRes.agentName];
                addMessage('agent-whisper' as any, `CROSS-CHECK [${fromAgentRes.agentName} → ${toAgentRes.agentName}]:\n\n${feedback}`, fromAgentRes.agentName, undefined, checkProvider, checkModel);
                return { from: req.from, on: req.to, reviewerName: fromAgentRes.agentName, checkedName: toAgentRes.agentName, checkedAgent: toAgentRes, feedback, skipped: false };
              } catch (e: any) {
                setStreamingAgents(prev => { const n = { ...prev }; delete n[xLabel]; return n; });
                clearInterval(agentRunEventsIntervalRef.current[fromAgentRes.agentName]);
                delete agentRunEventsIntervalRef.current[fromAgentRes.agentName];
                return { from: req.from, on: req.to, reviewerName: fromAgentRes.agentName, checkedName: toAgentRes.agentName, checkedAgent: toAgentRes, feedback: `Cross-check failed: ${e.message}`, skipped: true };
              }
            });

            const crossCheckResults = await Promise.all(allCrossCheckPromises);

            accumulatedAgentContext = [
              ...accumulatedAgentContext,
              ...turnResults,
              ...crossCheckResults.map((r: any) => ({
                agentId: 'system',
                agentName: 'CrossCheck',
                persona: 'internal',
                content: `${r.reviewerName} reviewed ${r.checkedName}: ${r.feedback}`
              }))
            ];
          } else {
            const successfulAgentCount = turnResults.filter(result => result.status === 'complete').length;
            if (agentsToEngage.length >= 2 && successfulAgentCount < 2) {
              addThinking('Athena', `MANDATORY_CROSS_CHECK_UNAVAILABLE: Only ${successfulAgentCount} agent(s) completed successfully.`, 'error');
            }
            accumulatedAgentContext = [...accumulatedAgentContext, ...turnResults];
          }

          currentTurn++;
        }
      }

      if (accumulatedAgentContext.length > 0) {
        if (midRunBuffer.current.length > 0) {
          const newInfo = midRunBuffer.current.join('\n');
          allAddedInfo += (allAddedInfo ? '\n' : '') + newInfo;
          midRunBuffer.current = [];
        }

        setStatusText('SYNTHESIZING ANSWER');
        addThinking('Athena', 'PERFORMING_POST_RUN_NEURAL_SYNTHESIS...');

        const currentChain = settings["provider:chain"] || [];
        const activeProvIdx = preferredProviderIndexRef.current;
        const fallbackWarning = activeProvIdx > 0 && currentChain[activeProvIdx]
          ? `\n\nSYSTEM_STATUS: Operational on fallback provider (${currentChain[activeProvIdx].provider}:${currentChain[activeProvIdx].model}). Calibration adjusted for decreased capabilities.`
          : "";

        const intentToUse = rankedIntents.map(i => i.topic).join(', ');
        const engagedList = Array.from(new Set(accumulatedAgentContext.map(r => r.agentId).filter(id => id !== 'system' && id !== 'athena')));
        
        addThinking('Athena', 'PERFORMING_POST_RUN_NEURAL_SYNTHESIS: Generating final answer...');

        const finalPrompt = `
          You are an AI assistant operating as the orchestration moderator (ATHENA) for a multi-agent reasoning system. You are delivering the FINAL_COMPREHENSIVE_REPORT to the user.

          USER'S ORIGINAL REQUEST: "${userQuery}"
          USER CONTEXT ADDED DURING THE RUN: "${allAddedInfo || "None"}"
          PREVIOUS SESSION SUMMARY: "${sessionSummary || "No previous summary available."}"
          LATEST AGENT INTEL: ${JSON.stringify(accumulatedAgentContext)}
          ${fallbackWarning}

          RESILIENCE AND EVIDENCE RULES:
          - Synthesize every successful agent result even if another agent, provider, search, or cross-check failed.
          - Clearly separate verified findings from failed checks and remaining evidence gaps.
          - Never replace the best available evidence-backed answer with a generic failure message when usable evidence exists.
          - Treat cross-check criticism as validation input; resolve material conflicts explicitly in the answer.
          - Consensus is not evidence. State the strongest counterargument or disconfirming evidence considered.
          - Use calibrated confidence and preserve uncertainty where evidence is incomplete.

          YOUR RESPONSE MUST FOLLOW THIS STRUCTURE:

          ## Answer
          Lead with the direct result or recommendation.

          ## Evidence and reasoning
          Include only the material evidence and how it supports the answer.

          ## Uncertainty and counterevidence
          State unresolved gaps, disagreements, and the strongest plausible challenge. Omit this section only when there are genuinely none.

          ${CITATION_CONTRACT_PROMPT}

          FORMATTING RULES:
          - Be concise and information-dense.
          - Include a diagram only when it materially improves comprehension.
          - Do not include greetings, sign-offs, process theater, or filler.
        `;

        const finalResult = await runWithFallback(finalPrompt, 'Athena');
        let finalResponseRaw = finalResult.content;
        let finalProvider = finalResult.provider;
        let finalModel = finalResult.model;

        if (midRunBuffer.current.length > 0) {
         const lateInfo = midRunBuffer.current.join('\n');
         midRunBuffer.current = [];
         allAddedInfo += (allAddedInfo ? '\n' : '') + lateInfo;
         setStatusText('APPLYING LATE CONTEXT');
         const revisionPrompt = `
You are Athena revising a draft answer because the user added context while synthesis was running.

ORIGINAL REQUEST: "${userQuery}"
NEW USER CONTEXT: "${lateInfo}"
DRAFT ANSWER: "${finalResponseRaw}"

Revise the answer so the new context is materially incorporated. Preserve supported findings, correct conflicts, and keep the response concise. Do not mention internal timing.
${CITATION_CONTRACT_PROMPT}
`;
         const revisionResult = await runWithFallback(revisionPrompt, 'Athena');
         finalResponseRaw = revisionResult.content;
         finalProvider = revisionResult.provider;
         finalModel = revisionResult.model;
        }

        const validationResult = await validateAndCorrectMermaid(finalResponseRaw, 'Athena', finalPrompt, 90000);
        const finalResponseCombined = validationResult.response;
        finalProvider = validationResult.provider || finalProvider;
        finalModel = validationResult.model || finalModel;

        addMessage('athena', finalResponseCombined, undefined, undefined, finalProvider, finalModel);
        const answerSection = finalResponseCombined
          .split(/\n##\s+(?:Evidence and reasoning|Uncertainty and counterevidence|Citations)/i)[0]
          .replace(/^##\s+Answer\s*/i, "")
          .trim();
        const compactAnswer = answerSection.length > 900
          ? `${answerSection.slice(0, 897).trimEnd()}...`
          : answerSection;
        const boundedPreviousSummary = sessionSummary.slice(-5_000);
        const turnNumber = messagesRef.current.filter(message => message.role === "user").length;
        const turnTopic = userQuery.replace(/\s+/g, " ").trim().slice(0, 72);
        const summaryBase = boundedPreviousSummary.trim() || "# Session Summary";
        const updatedSummary = [
          summaryBase,
          "",
          `## Turn ${turnNumber} — ${turnTopic}`,
          "",
          "### Question",
          "",
          `> ${userQuery.replace(/\s+/g, " ").trim().slice(0, 320)}`,
          "",
          `**Agents:** ${engagedList.length > 0 ? engagedList.join(', ') : 'Athena'}`,
          "",
          "### Outcome",
          "",
          compactAnswer || "No final outcome was recorded.",
        ].join('\n');
        setSessionSummary(updatedSummary);
        saveCurrentSession(undefined, undefined, updatedSummary);
        addThinking('Athena', 'SESSION_SUMMARY_UPDATED_WITHOUT_EXTRA_MODEL_CALL');
      }
    } catch (error: any) {
      addMessage('error', `CRITICAL_EXCEPTION: ${error.message}`)
    } finally {
      setIsLoading(false);
      setStreamingAgents({});
      Object.values(agentRunEventsIntervalRef.current).forEach(clearInterval);
      agentRunEventsIntervalRef.current = {};
      setStatusText('IDLE');
      setRunningSessionId(null);
    }
  }

  const handleDeleteMessage = (id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }

  const handleRecoverRun = async (runId: string) => {
    setIsLoading(true);
    setStatusText('RECONNECTING TO RUN');
    try {
      const recoveredResponse = await window.system.resumeAgentRun({
        runId,
        timeoutMs: 300_000,
        agentLabel: 'Recovery',
      });
      addMessage('athena', cleanResponse(recoveredResponse));
      setMessages(prev => {
        const updated = prev.filter(message => !(
          message.role === 'error' &&
          getRecoverableAgentRunId(message.content) === runId
        ));
        messagesRef.current = updated;
        saveCurrentSession(updated);
        return updated;
      });
    } catch (error: any) {
      addMessage('error', `RUN_RECOVERY_FAILED: ${error.message}`);
    } finally {
      setIsLoading(false);
      setStatusText('IDLE');
    }
  };

  const handleAgentRunDecision = async (runId: string, decision: 'kill' | 'wait') => {
    const entry = Object.entries(streamingAgents).find(([, data]) => data.runId === runId);
    const agentLabel = entry?.[0] || 'Athena';
    try {
      if (decision === 'kill') {
        await window.system.killAgentRun({ runId });
        setStreamingAgents(prev => ({
          ...prev,
          [agentLabel]: {
            ...(prev[agentLabel] || {}),
            runId,
            status: 'Athena requested termination of the stalled run.',
          },
        }));
        return;
      }

      const idleTimeoutMs = entry?.[1].idleTimeoutMs || REGULAR_AGENT_TIMEOUT_MS;
      const extended = await window.system.extendAgentRun({ runId, timeoutMs: idleTimeoutMs, agentLabel });
      if (!extended) throw new Error('The run is no longer active in the supervisor.');
      setStreamingAgents(prev => ({
        ...prev,
        [agentLabel]: {
          ...(prev[agentLabel] || {}),
          runId,
          lastActivityAt: Date.now(),
          idleTimeoutMs,
          status: 'Operator chose to keep waiting. Idle timer reset.',
        },
      }));
    } catch (error: any) {
      setStreamingAgents(prev => ({
        ...prev,
        [agentLabel]: {
          ...(prev[agentLabel] || {}),
          runId,
          status: `Run control failed: ${error.message}`,
        },
      }));
      toast.error(`Unable to ${decision === 'kill' ? 'kill' : 'extend'} run: ${error.message}`);
    }
  };

  const handleRetryFailedRequest = async (messageId: string) => {
    const errorIndex = messagesRef.current.findIndex(message => message.id === messageId);
    const precedingMessages = errorIndex >= 0
      ? messagesRef.current.slice(0, errorIndex)
      : messagesRef.current;
    const userIndex = precedingMessages.findLastIndex(message => message.role === 'user');
    if (userIndex < 0) return;

    const request = precedingMessages[userIndex].content;
    const restoredMessages = precedingMessages.slice(0, userIndex);
    messagesRef.current = restoredMessages;
    setMessages(restoredMessages);
    saveCurrentSession(restoredMessages);
    await handleSend(request);
  };

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
      const updated = [...prev, { id: `f-${Date.now()}`, name: `folder_${prev.length + 1}`, hint: "" }];
      foldersRef.current = updated;
      window.system.saveSetting("system:folders", updated);
      return updated;
    });
  }

  const handleDeleteFolder = (id: string) => {
    const hasSessions = chatItems.some(chat => chat.folderId === id)
    if (!hasSessions) {
      setFolders(prev => {
        const updated = prev.filter(folder => folder.id !== id);
        foldersRef.current = updated;
        window.system.saveSetting("system:folders", updated);
        return updated;
      });
    }
  }

  const handleRenameFolder = (id: string, newName: string) => {
    setFolders(prev => {
      const updated = prev.map(folder => folder.id === id ? { ...folder, name: newName } : folder);
      foldersRef.current = updated;
      window.system.saveSetting("system:folders", updated);
      return updated;
    });
  }

  const handleUpdateFolderHint = async (id: string, hint: string) => {
    const updated = foldersRef.current.map(folder => folder.id === id ? { ...folder, hint } : folder);
    foldersRef.current = updated;
    setFolders(updated);
    await window.system.saveSetting("system:folders", updated);

    if (!hint) return;
    const unfiledSessions = sessions.filter(session => (
      !Object.prototype.hasOwnProperty.call(sessionFoldersRef.current, session.id)
    ));
    for (const session of unfiledSessions) {
      await classifyChatById(session.id);
    }
  }

  const handleMoveToFolder = (chatId: string, folderId: string | null) => {
    persistSessionFolder(chatId, folderId);
  }

  const handleReorderChat = (chatId: string, targetChatId: string, placement: "before" | "after") => {
    if (chatId === targetChatId) return;
    setSessions(previous => {
      const reordered = [...previous];
      const sourceIndex = reordered.findIndex(session => session.id === chatId);
      const targetIndex = reordered.findIndex(session => session.id === targetChatId);
      if (sourceIndex < 0 || targetIndex < 0) return previous;

      const [moved] = reordered.splice(sourceIndex, 1);
      const adjustedTargetIndex = reordered.findIndex(session => session.id === targetChatId);
      reordered.splice(adjustedTargetIndex + (placement === "after" ? 1 : 0), 0, moved);
      sessionOrderRef.current = reordered.map(session => session.id);
      window.system.saveSetting("system:sessionOrder", sessionOrderRef.current);
      return reordered;
    });
  };

  const handleMoveChatsToFolder = (chatIds: string[], folderId: string | null) => {
    const updatedAssignments = { ...sessionFoldersRef.current };
    chatIds.forEach(chatId => {
      updatedAssignments[chatId] = folderId;
    });
    sessionFoldersRef.current = updatedAssignments;
    setSessionFolders(updatedAssignments);
    window.system.saveSetting("system:sessionFolders", updatedAssignments);
  }

  const handleCreateFolderAndMove = (chatIds: string[], folderName: string) => {
    const folderId = `f-${Date.now()}`;
    const updatedFolders = [...foldersRef.current, { id: folderId, name: folderName, hint: "" }];
    const updatedAssignments = { ...sessionFoldersRef.current };
    chatIds.forEach(chatId => {
      updatedAssignments[chatId] = folderId;
    });

    foldersRef.current = updatedFolders;
    sessionFoldersRef.current = updatedAssignments;
    setFolders(updatedFolders);
    setSessionFolders(updatedAssignments);
    window.system.saveSetting("system:folders", updatedFolders);
    window.system.saveSetting("system:sessionFolders", updatedAssignments);
  }

  const handleSuggestGrouping = async (): Promise<SessionGroupingSuggestion[]> => {
    const unfiledSessions = sessions.filter(session => (
      !sessionFoldersRef.current[session.id]
    ));
    const groupingInputs = await Promise.all(unfiledSessions.map(async session => {
      const data = await window.sessions.load(session.id);
      const userText = (data?.messages || [])
        .filter((message: Message) => message.role === "user")
        .map((message: Message) => message.content)
        .join(" ");
      return {
        id: session.id,
        title: session.title || "Untitled Quorum",
        text: userText.slice(0, 10_000),
      };
    }));
    return suggestSessionGrouping(groupingInputs, foldersRef.current);
  }

  const handleApplyGrouping = (suggestions: SessionGroupingSuggestion[]) => {
    const updatedFolders = [...foldersRef.current];
    const updatedAssignments = { ...sessionFoldersRef.current };

    suggestions.forEach(suggestion => {
      let folderId = suggestion.folderId;
      if (suggestion.isNewFolder) {
        folderId = `f-${Date.now()}-${updatedFolders.length}`;
        updatedFolders.push({ id: folderId, name: suggestion.folderName, hint: "" });
      }
      if (!folderId) return;
      suggestion.sessionIds.forEach(sessionId => {
        updatedAssignments[sessionId] = folderId;
      });
    });

    foldersRef.current = updatedFolders;
    sessionFoldersRef.current = updatedAssignments;
    setFolders(updatedFolders);
    setSessionFolders(updatedAssignments);
    window.system.saveSetting("system:folders", updatedFolders);
    window.system.saveSetting("system:sessionFolders", updatedAssignments);
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
          onReorderChat={handleReorderChat}
          onMoveToFolder={handleMoveToFolder}
          onMoveChatsToFolder={handleMoveChatsToFolder}
          onCreateFolderAndMove={handleCreateFolderAndMove}
          onDeleteChat={deleteSession}
          onAddFolder={handleAddFolder}
          onDeleteFolder={handleDeleteFolder}
          onRenameFolder={handleRenameFolder}
          onUpdateFolderHint={handleUpdateFolderHint}
          onClassifyChat={classifyChatById}
          onSuggestGrouping={handleSuggestGrouping}
          onApplyGrouping={handleApplyGrouping}
          onSettingsChanged={handleSettingsChanged}
          onLogout={handleLogout}
          unreadChatIds={unreadSessionIds}
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
              streamingAgents={streamingAgents}
              onRecoverRun={handleRecoverRun}
              onRetryFailedRequest={handleRetryFailedRequest}
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
        activeProviderIndex={activeProviderIndex}
      />
      <AgentStallDialog agents={streamingAgents} onDecision={handleAgentRunDecision} />
      <Toaster />
    </div>
  );
}
