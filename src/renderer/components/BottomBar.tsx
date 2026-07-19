import { useState, useEffect, useRef, useMemo } from "react";
import { Circle, Activity, X, Terminal, StopCircle, RefreshCcw } from "lucide-react";

declare const APP_VERSION: string;

interface StatusDot {
  label: string;
  status: "online" | "offline" | "warning";
  detail?: string;
}

const STATUS_COLORS = {
  online: "#00ff88",
  offline: "#ff2244",
  warning: "#ffe600",
};
const APP_HEADERS = { "X-App-Name": "savant-quorum" };

export function BottomBar({
  sessionTitle,
  folders = [],
  sessions = [],
  settings,
  activeProviderIndex = 0,
}: {
  sessionTitle?: string;
  folders?: Array<{ id: string }>;
  sessions?: Array<{ id: string }>;
  settings?: Record<string, any>;
  activeProviderIndex?: number;
}) {
  const [userName, setUserName] = useState("operator");
  const [gatewayStatus, setGatewayStatus] = useState<"online" | "offline">("offline");
  const [savantStatus, setSavantStatus] = useState<"online" | "offline">("offline");
  const [defaultDir, setDefaultDir] = useState("~/code");
  const [dbStatus, setDbStatus] = useState<"connected" | "offline">("offline");

  // Gateway Runs Monitor States
  const [gatewayUrl, setGatewayUrl] = useState("http://127.0.0.1:3100");
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunEvents, setSelectedRunEvents] = useState<any>(null);
  const [isPollingEvents, setIsPollingEvents] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);

  // Filter runs to only those within the scope of the app (matching a folder/workspace or session ID)
  const allowedIds = useMemo(() => {
    return new Set([
      ...folders.map((w) => w.id),
      ...sessions.map((s) => s.id),
    ]);
  }, [folders, sessions]);

  const filteredRuns = useMemo(() => {
    return runs;
  }, [runs]);

  const activeRunsCount = useMemo(() => {
    return filteredRuns.filter((r) => r.status === "running").length;
  }, [filteredRuns]);

  // Auto-scroll the log console to the bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [selectedRunEvents]);

  // Periodic check of system statuses & gateway runs
  useEffect(() => {
    const checkStatuses = async () => {
      let name = "operator";
      let dir = "~/code";
      let gUrl = "http://127.0.0.1:3100";
      let gEnabled = true;
      let sUrl = "http://127.0.0.1:8090";

      try {
        const settings = window.system?.getSettings ? await window.system.getSettings() : {};
        const osUser = window.system?.getUser ? await window.system.getUser().catch(() => "operator") : "operator";
        name = settings["user:name"] || osUser || "operator";
        
        if (settings["system:defaultDirectory"]) {
          dir = settings["system:defaultDirectory"];
        }
        
        if (settings["gateway:config"]) {
          gUrl = settings["gateway:config"].url || gUrl;
          gEnabled = settings["gateway:config"].enabled !== false;
        }

        if (settings["server:config"]) {
          sUrl = settings["server:config"].url || sUrl;
        }
      } catch (e) {
        console.error("Failed to load settings in BottomBar:", e);
      }
      setUserName(name);
      setDefaultDir(dir);
      setGatewayUrl(gUrl);

      if (gEnabled) {
        // Health check
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 1500);
          const res = await fetch(`${gUrl.replace(/\/$/, "")}/health`, { signal: controller.signal, headers: APP_HEADERS });
          clearTimeout(id);
          setGatewayStatus(res.ok ? "online" : "offline");
        } catch (e) {
          setGatewayStatus("offline");
        }

        // Fetch recent runs
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 1500);
          const res = await fetch(`${gUrl.replace(/\/$/, "")}/runs`, { signal: controller.signal, headers: APP_HEADERS });
          clearTimeout(id);
          if (res.ok) {
            const data = await res.json();
            const validData = Array.isArray(data) ? data : [];
            setRuns(validData);
          } else {
            setRuns([]);
          }
        } catch (e) {
          console.error("Failed to fetch runs in BottomBar:", e);
          setRuns([]);
        }
      } else {
        setGatewayStatus("offline");
        setRuns([]);
      }

      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${sUrl.replace(/\/+$/, "")}/health/ready`, { signal: controller.signal, headers: APP_HEADERS });
        clearTimeout(id);
        setSavantStatus(res.ok ? "online" : "offline");
      } catch (e) {
        setSavantStatus("offline");
      }

      try {
        const status = window.system?.getDbStatus ? await window.system.getDbStatus().catch(() => "offline") : "offline";
        setDbStatus(status === "connected" ? "connected" : "offline");
      } catch (e) {
        setDbStatus("offline");
      }
    };

    checkStatuses();
    const interval = setInterval(checkStatuses, 4000);
    return () => clearInterval(interval);
  }, []);

  // Poll selected run events
  useEffect(() => {
    if (!isMonitorOpen || !selectedRunId) {
      setSelectedRunEvents(null);
      return;
    }

    const fetchEvents = async () => {
      setIsPollingEvents(true);
      try {
        const cleanUrl = gatewayUrl.replace(/\/$/, "");
        const res = await fetch(`${cleanUrl}/runs/${selectedRunId}/events`, { headers: APP_HEADERS });
        if (res.ok) {
          const data = await res.json();
          setSelectedRunEvents(data);
        }
      } catch (e) {
        console.error("Failed to fetch run events:", e);
      } finally {
        setIsPollingEvents(false);
      }
    };

    fetchEvents();
    const interval = setInterval(fetchEvents, 2000);
    return () => clearInterval(interval);
  }, [isMonitorOpen, selectedRunId, gatewayUrl]);

  // Handle killing/cancelling a run
  const handleKillRun = async (runId: string) => {
    if (!window.confirm("Are you sure you want to terminate this prompt run?")) return;
    try {
      const cleanUrl = gatewayUrl.replace(/\/$/, "");
      const res = await fetch(`${cleanUrl}/runs/${runId}`, {
        method: "DELETE",
        headers: APP_HEADERS,
      });
      if (res.ok) {
        // Refresh run list and events
        const runsRes = await fetch(`${cleanUrl}/runs`, { headers: APP_HEADERS });
        if (runsRes.ok) {
          const data = await runsRes.json();
          const validData = Array.isArray(data) ? data : [];
          setRuns(validData);
        }
        const eventsRes = await fetch(`${cleanUrl}/runs/${runId}/events`, { headers: APP_HEADERS });
        if (eventsRes.ok) {
          setSelectedRunEvents(await eventsRes.json());
        }
      }
    } catch (e) {
      alert("Failed to terminate run: " + e);
    }
  };

  const STATUS_ITEMS: StatusDot[] = [
    { label: "user", status: "online", detail: userName },
    { label: "session", status: "online", detail: sessionTitle || "New Session" },
    { label: "gateway", status: gatewayStatus === "online" ? "online" : "offline", detail: gatewayStatus },
    { label: "server", status: savantStatus === "online" ? "online" : "offline", detail: savantStatus },
    { label: "dir", status: "online", detail: defaultDir },
    { label: "db", status: dbStatus === "connected" ? "online" : "offline", detail: dbStatus },
  ];

  const selectedRunObj = Array.isArray(filteredRuns) ? filteredRuns.find(r => r.id === selectedRunId) : undefined;

  return (
    <>
      <footer
        style={{
          background: "var(--background)",
          borderTop: "1px solid var(--border)",
          fontFamily: "'Share Tech Mono', monospace",
        }}
        className="flex items-center gap-0 h-7 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden text-[10px] relative z-30"
      >
        {STATUS_ITEMS.map((item) => (
          <div
            key={item.label}
            style={{
              borderRight: "1px solid var(--border)",
            }}
            className="flex items-center gap-1 px-2.5 h-full"
          >
            <Circle
              size={5}
              style={{
                color: STATUS_COLORS[item.status],
                fill: STATUS_COLORS[item.status],
                filter: "none",
              }}
            />
            <span style={{ color: "var(--muted-foreground)" }} className="opacity-50 whitespace-nowrap uppercase tracking-wider">
              {item.label}:
            </span>
            <span
              style={{
                color: item.status === "warning" ? "var(--accent)" : "var(--foreground)",
              }}
              className="opacity-85 whitespace-nowrap"
            >
              {item.detail}
            </span>
          </div>
        ))}

        {/* center/right: runs monitor button */}
        <div className="ml-auto px-3 flex items-center gap-3">
          {(() => {
            const providerChain = settings?.["provider:chain"] || [
              { provider: 'gemini', model: 'gemini-2.0-flash' }
            ];
            return (
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 border border-[var(--border)] text-[9px] font-bold font-mono tracking-wider text-muted-foreground rounded-sm bg-[rgba(255,255,255,0.02)]">
                <span style={{ color: "var(--primary)" }} className="opacity-80">ACTIVE CHAIN:</span>
                {providerChain.map((p: any, idx: number) => {
                  const isActive = idx === activeProviderIndex;
                  return (
                    <span key={idx} className="flex items-center gap-1">
                      {idx > 0 && <span className="opacity-40">→</span>}
                      <span className={`px-1 rounded-sm ${isActive ? 'bg-[var(--primary)] text-black font-extrabold' : 'opacity-60'}`}>
                        {p.provider.toUpperCase()} ({p.model.toUpperCase()})
                      </span>
                    </span>
                  );
                })}
              </div>
            );
          })()}

          <button
            onClick={() => {
              setIsMonitorOpen(!isMonitorOpen);
              if (!isMonitorOpen && Array.isArray(filteredRuns) && filteredRuns.length > 0 && !selectedRunId) {
                setSelectedRunId(filteredRuns[0].id);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 border text-[9px] font-bold font-mono tracking-wider transition-all cursor-pointer rounded-sm ${
              activeRunsCount > 0
                ? "border-[var(--accent)] text-[var(--accent)] bg-[rgba(255,0,0,0.1)] hover:bg-[rgba(255,0,0,0.25)] animate-pulse"
                : isMonitorOpen
                ? "border-[var(--cp-cyan)] text-[var(--cp-cyan)] bg-[rgba(0,229,255,0.1)]"
                : "border-[var(--border)] text-muted-foreground hover:text-foreground hover:border-[var(--cp-cyan)]"
            }`}
          >
            <Activity size={10} className={activeRunsCount > 0 ? "animate-spin" : ""} />
            <span>PROMPT TRACKER: {activeRunsCount > 0 ? `${activeRunsCount} ACTIVE` : "IDLE"}</span>
          </button>

          <span style={{ color: "var(--primary)" }} className="opacity-45 font-bold whitespace-nowrap uppercase tracking-wider">
            v{APP_VERSION}
          </span>
          <span style={{ color: "var(--primary)" }} className="opacity-45 whitespace-nowrap">
            {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        </div>
      </footer>

      {/* Floating Prompt Tracker Modal Overlay */}
      {isMonitorOpen && (
        <div
          className="fixed bottom-7 right-4 w-[650px] h-[380px] border border-[var(--border)] flex flex-col z-[40]"
          style={{
            background: "rgba(10, 16, 26, 0.96)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 4px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(0, 229, 255, 0.15)",
            fontFamily: "'Rajdhani', sans-serif"
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 bg-[rgba(8,11,18,0.9)]">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-[var(--cp-cyan)]" />
              <span className="text-xs font-bold font-mono tracking-wider text-[var(--cp-cyan)]">
                // GATEWAY PROMPT TRACKER
              </span>
            </div>
            <button
              onClick={() => setIsMonitorOpen(false)}
              className="text-muted-foreground hover:text-[var(--accent)] transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Grid Layout */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left side: Runs list */}
            <div className="w-[220px] border-r border-[var(--border)] flex flex-col bg-black/10 overflow-hidden">
              <div className="p-2 border-b border-[var(--border)] text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Run Registry
              </div>
              <div className="flex-1 overflow-y-auto p-1 space-y-1">
                {!Array.isArray(filteredRuns) || filteredRuns.length === 0 ? (
                  <div className="text-center text-[10px] text-muted-foreground font-mono opacity-50 py-10">
                    No runs captured
                  </div>
                ) : (
                  filteredRuns.map((r) => {
                    const isActive = selectedRunId === r.id;
                    const dateText = new Date(r.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRunId(r.id)}
                        className={`p-2 border cursor-pointer transition-all ${
                          isActive
                            ? "border-[var(--cp-cyan)] bg-[rgba(0,229,255,0.06)]"
                            : "border-transparent bg-transparent hover:bg-white/5"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold font-mono text-[var(--cp-cyan)] uppercase truncate w-[100px]">
                            {r.provider && r.model ? `${r.provider}:${r.model}` : "Agent Run"}
                          </span>
                          <span
                            className="text-[9px] font-mono font-bold uppercase"
                            style={{
                              color:
                                r.status === "running"
                                  ? "var(--cp-cyan)"
                                  : r.status === "complete"
                                  ? "#00ff88"
                                  : "var(--accent)",
                            }}
                          >
                            {r.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground mt-1 font-mono">
                          <span>{dateText}</span>
                          <span>{r.elapsedMs ? `${Math.ceil(r.elapsedMs / 1000)}s` : ""}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right side: Event Trace / Logs */}
            <div className="flex-1 flex flex-col overflow-hidden bg-black/20">
              {selectedRunId ? (
                <div className="flex-1 flex flex-col overflow-hidden p-3 space-y-2">
                  {/* Selected Run Details Header */}
                  <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
                    <div>
                      <div className="text-xs font-bold text-foreground font-mono truncate max-w-[240px]">
                        ID: {selectedRunId}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 flex items-center gap-1.5">
                        Status:{" "}
                        <span
                          className={`font-bold uppercase flex items-center gap-1 ${
                            selectedRunObj?.status === "running" ? "text-[var(--cp-cyan)] animate-pulse" : ""
                          }`}
                          style={{
                            color:
                              selectedRunObj?.status === "complete"
                                ? "#00ff88"
                                : selectedRunObj?.status === "error" || selectedRunObj?.status === "killed"
                                ? "var(--accent)"
                                : undefined,
                          }}
                        >
                          {selectedRunObj?.status === "running" ? (
                            <>
                              <RefreshCcw size={10} className="animate-spin text-[var(--cp-cyan)]" />
                              THINKING & DELIBERATING...
                            </>
                          ) : (
                            selectedRunObj?.status || "unknown"
                          )}
                        </span>
                      </div>
                    </div>

                    {selectedRunObj?.status === "running" && (
                      <button
                        onClick={() => handleKillRun(selectedRunId)}
                        className="px-2 py-1 bg-[rgba(255,0,0,0.15)] border border-[var(--accent)] text-[var(--accent)] hover:bg-[rgba(255,0,0,0.25)] text-[10px] font-bold font-mono tracking-wider flex items-center gap-1 cursor-pointer transition-all rounded-sm"
                      >
                        <StopCircle size={11} />
                        <span>TERMINATE</span>
                      </button>
                    )}
                  </div>

                  {/* Terminal Logs */}
                  <div className="flex-1 border border-[var(--border)] bg-black/60 rounded p-2.5 font-mono text-[11px] overflow-y-auto space-y-1.5 scrollbar-thin">
                    <div className="text-[9px] text-muted-foreground border-b border-white/5 pb-1 uppercase tracking-widest flex justify-between items-center">
                      <span>// execution event log</span>
                      {isPollingEvents && <span className="animate-pulse text-[var(--cp-cyan)] text-[8px]">polling...</span>}
                    </div>

                    {selectedRunEvents?.events?.map((ev: any, idx: number) => {
                      if (ev.type === "thinking") {
                        return (
                          <div key={idx} className={ev.status === "error" ? "text-[var(--accent)]" : "text-blue-400"}>
                            &gt; Thinking [{ev.provider}:{ev.model}] ({ev.status}){ev.reason ? ` - ${ev.reason}` : ""}
                            {ev.status === "pending" && (
                              <span className="inline-block ml-2 animate-pulse">...</span>
                            )}
                          </div>
                        );
                      }
                      if (ev.type === "chunk") {
                        return (
                          <div key={idx} className="text-foreground/90 whitespace-pre-wrap">
                            {ev.content}
                          </div>
                        );
                      }
                      if (ev.type === "complete") {
                        return (
                          <div key={idx} className="text-[#00ff88] border-t border-white/5 pt-1 mt-1 font-bold">
                            &gt; Run completed successfully.
                          </div>
                        );
                      }
                      if (ev.type === "error") {
                        return (
                          <div key={idx} className="text-[var(--accent)] border-t border-white/5 pt-1 mt-1 font-bold">
                            &gt; Error: {ev.message || ev.content || "Run failed"}
                          </div>
                        );
                      }
                      return (
                        <div key={idx} className="text-muted-foreground">
                          {JSON.stringify(ev)}
                        </div>
                      );
                    })}

                    {selectedRunObj?.status === "running" && (
                      <div className="text-[var(--cp-cyan)] animate-pulse mt-2 flex items-center gap-1.5 font-mono text-[10px] border-t border-white/5 pt-1.5">
                        <RefreshCcw size={10} className="animate-spin" />
                        <span>[AGENT DELIBERATION IN PROGRESS] Awaiting next tool execution or response chunk...</span>
                      </div>
                    )}

                    {(!selectedRunEvents?.events || selectedRunEvents.events.length === 0) && (
                      <div className="text-center text-muted-foreground opacity-35 py-16">
                        Initializing run and awaiting execution stream...
                      </div>
                    )}
                    <div ref={logEndRef} />
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center items-center text-center p-4">
                  <Terminal className="text-muted-foreground opacity-20 mb-2" size={32} />
                  <span className="text-xs text-muted-foreground opacity-50 font-mono">
                    Select a run from the registry list to inspect execution events
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
