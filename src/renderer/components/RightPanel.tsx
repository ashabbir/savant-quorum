import { useState, useRef } from "react";
import { Activity, GitBranch, FileText, Upload, Sparkles, Search, ListChecks, Terminal, RefreshCcw, Timer, Cpu, Zap } from "lucide-react";
import { AreaChart, Area, LineChart, Line, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, PieChart, Pie, Tooltip as RechartsTooltip } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Thinking } from "../App";
import { Message } from "./ChatArea";
import { ChatMarkdown } from "./ChatMarkdown";

const TABS = [
  { id: "pulse", icon: Activity, label: "pulse" },
  { id: "trace", icon: Cpu, label: "trace" },
  { id: "graph", icon: GitBranch, label: "graph" },
  { id: "summary", icon: FileText, label: "summary" },
  { id: "uploads", icon: Upload, label: "files" },
] as const;

type TabId = typeof TABS[number]["id"];

interface RightPanelProps {
  thinking: Thinking[];
  messages: Message[];
  statusText: string;
  sessionSummary: string;
  onSummarize: () => void;
}

const pulseData = Array.from({ length: 20 }, (_, i) => ({
  t: i,
  tokens: Math.floor(Math.random() * 800 + 200),
  latency: Math.floor(Math.random() * 300 + 80),
  requests: Math.floor(Math.random() * 50 + 10),
  memory: Math.floor(Math.random() * 40 + 50),
}));

function NavIcon({
  icon, label, onClick, isActive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  return (
    <Tooltip.Provider delayDuration={300}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            onClick={onClick}
            style={{
              color: "var(--cp-cyan)",
              opacity: isActive ? 1 : 0.45,
              borderRight: isActive ? "2px solid var(--cp-cyan)" : "2px solid transparent",
            }}
            className="w-10 h-10 flex items-center justify-center hover:opacity-100 transition-all"
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="left"
            style={{
              background: "var(--cp-bg-3)",
              border: "1px solid var(--cp-border)",
              color: "var(--cp-cyan)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
            className="px-2 py-1 text-xs z-50"
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function RightPanel({ thinking, messages, statusText, sessionSummary, onSummarize }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  // ── PULSE ANALYTICS DATA CALCULATION ──
  
  // 1. Messages by Role (Engagement)
  const getMessageEngagement = () => {
    const counts: Record<string, number> = {};
    messages.forEach(m => {
      let role = m.role;
      if (role === 'agent-whisper' && m.from) role = m.from;
      if (role === 'moderator-whisper') role = 'moderator';
      if (role === 'whisper') role = 'moderator';
      if (role === 'user') role = 'YOU';
      
      const label = role.toUpperCase();
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  };

  // 2. Whisper vs Message Ratio
  const getWhisperRatio = () => {
    const whispers = messages.filter(m => ['whisper', 'moderator-whisper', 'agent-whisper'].includes(m.role)).length;
    const publics = messages.filter(m => !['whisper', 'moderator-whisper', 'agent-whisper', 'system', 'internal'].includes(m.role)).length;
    return [
      { name: 'WHISPERS', value: whispers, color: '#b624ff' },
      { name: 'PUBLIC', value: publics, color: '#00e5ff' }
    ].filter(v => v.value > 0);
  };

  // 3. Mermaid Usage
  const getMermaidUsage = () => {
    const types = ['graph', 'sequenceDiagram', 'flowchart', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie'];
    const usage: Record<string, number> = {};
    messages.forEach(m => {
      types.forEach(type => {
        const regex = new RegExp(`\`\`\`mermaid\\s*${type}`, 'g');
        const matches = m.content.match(regex);
        if (matches) {
          usage[type] = (usage[type] || 0) + matches.length;
        }
      });
    });
    return Object.entries(usage)
      .map(([name, value]) => ({ name: name.replace('Diagram', '').toUpperCase(), value }))
      .sort((a, b) => b.value - a.value);
  };

  // 4. Fact Network (InfraNodus style)
  const getFactNetwork = () => {
    const factRegex = /fact\[\d+\]/i;
    const words: Record<string, number> = {};
    const cooccurrence: Record<string, Record<string, number>> = {};
    const stopWords = new Set(['the', 'and', 'for', 'this', 'that', 'with', 'from', 'your', 'was', 'has', 'been', 'which', 'their', 'they', 'have', 'using', 'will', 'through', 'about', 'would', 'could', 'should', 'each', 'into', 'also', 'some', 'more', 'than', 'when', 'where', 'there', 'what']);
    
    messages.forEach(m => {
      if (['moderator', 'ai', 'agent-whisper', 'moderator-whisper'].includes(m.role)) {
        const content = m.content.toLowerCase();
        const sentences = content.split(/[.!?\n]/);
        sentences.forEach(s => {
          if (factRegex.test(s)) {
            const clean = s.replace(/fact\[\d+\]/g, '').replace(/[^a-z\s]/g, ' ');
            const tokens = Array.from(new Set(clean.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w))));
            
            tokens.forEach((w, i) => {
              words[w] = (words[w] || 0) + 1;
              tokens.slice(i + 1).forEach(w2 => {
                const [a, b] = [w, w2].sort();
                if (!cooccurrence[a]) cooccurrence[a] = {};
                cooccurrence[a][b] = (cooccurrence[a][b] || 0) + 1;
              });
            });
          }
        });
      }
    });

    const nodes = Object.entries(words)
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);

    const activeWords = new Set(nodes.map(n => n.text));
    const edges: { source: string, target: string, weight: number }[] = [];
    
    Object.entries(cooccurrence).forEach(([a, targets]) => {
      if (!activeWords.has(a)) return;
      Object.entries(targets).forEach(([b, weight]) => {
        if (!activeWords.has(b)) return;
        edges.push({ source: a, target: b, weight });
      });
    });

    return { nodes, edges };
  };

  const engagementData = getMessageEngagement();
  const ratioData = getWhisperRatio();
  const mermaidData = getMermaidUsage();
  const factNetwork = getFactNetwork();

  function handleTabClick(tabId: TabId) {
    setActiveTab(prev => prev === tabId ? null : tabId);
  }

  const getThinkingIcon = (type: Thinking['type'], color: string) => {
    switch (type) {
      case 'mcp_call': return <Search size={10} style={{ color }} />;
      case 'mcp_response': return <ListChecks size={10} style={{ color }} />;
      case 'shell': return <Terminal size={10} style={{ color }} />;
      case 'redecision': return <RefreshCcw size={10} style={{ color }} />;
      case 'timeout': return <Timer size={10} style={{ color }} />;
      case 'loop_check': return <Activity size={10} style={{ color }} />;
      default: return <Cpu size={10} style={{ color }} className="opacity-60" />;
    }
  }

  const getAgentColor = (agent: string) => {
    const a = agent.toLowerCase();
    if (a === 'moderator') return 'var(--cp-green)';
    if (a === 'system') return 'var(--cp-purple)';
    return 'var(--muted-foreground)';
  }

  function addUploadedFiles(files: FileList | File[]) {
    const names = Array.from(files).map(file => file.name);
    setUploadedFiles(prev => [...prev, ...names]);
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    addUploadedFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addUploadedFiles(e.target.files);
    }
  }

  const drawerOpen = activeTab !== null;

  return (
    <>
      <AnimatePresence initial={false}>
        {drawerOpen && (
          <motion.div
            key="drawer-panel"
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{
              position: "absolute",
              left: 0,
              right: 40,
              top: 0,
              bottom: 0,
              overflow: "hidden",
              borderLeft: "1px solid var(--cp-border)",
              background: "var(--cp-bg-1)",
              zIndex: 10,
            }}
          >
            <div className="flex flex-col overflow-hidden h-full w-full">
              <div
                style={{
                  color: "var(--cp-cyan)",
                  fontFamily: "'Share Tech Mono', monospace",
                  borderBottom: "1px solid var(--cp-border)",
                }}
                className="px-3 py-1.5 text-xs opacity-40 uppercase tracking-widest shrink-0 flex justify-between items-center"
              >
                <span>// {TABS.find(t => t.id === activeTab)?.label}</span>
                {activeTab === 'trace' && <span className="text-[var(--cp-yellow)] animate-pulse">{statusText}</span>}
              </div>

              <div className="flex-1 overflow-hidden">
                {activeTab === "pulse" && (
                  <div className="p-3 h-full flex flex-col space-y-4">
                    {/* Row 1: First 3 Visualizations */}
                    <div className="grid grid-cols-3 gap-3 shrink-0">
                      {/* 1. Engagement */}
                      <section className="bg-black/20 border border-[var(--cp-border)] p-2">
                        <div style={{ color: "var(--cp-cyan)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[8px] uppercase tracking-widest mb-2 opacity-60">
                          // engagement
                        </div>
                        <ResponsiveContainer width="100%" height={80}>
                          <BarChart data={engagementData} layout="vertical">
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" hide />
                            <RechartsTooltip 
                              contentStyle={{ background: 'var(--cp-bg-3)', border: '1px solid var(--cp-border)', fontSize: '8px' }}
                              itemStyle={{ color: 'var(--cp-cyan)' }}
                            />
                            <Bar dataKey="value" fill="var(--cp-cyan)" radius={[0, 1, 1, 0]}>
                              {engagementData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.name === 'YOU' ? 'var(--cp-cyan)' : 'rgba(0,229,255,0.4)'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </section>

                      {/* 2. Research Depth */}
                      <section className="bg-black/20 border border-[var(--cp-border)] p-2 flex flex-col items-center justify-center">
                        <div style={{ color: "var(--cp-purple)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[8px] uppercase tracking-widest mb-1 opacity-60 w-full">
                          // depth
                        </div>
                        <ResponsiveContainer width="100%" height={80}>
                          <PieChart>
                            <Pie
                              data={ratioData}
                              cx="50%"
                              cy="50%"
                              innerRadius={15}
                              outerRadius={25}
                              paddingAngle={2}
                              dataKey="value"
                            >
                              {ratioData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </section>

                      {/* 3. Mermaid Usage */}
                      <section className="bg-black/20 border border-[var(--cp-border)] p-2">
                        <div style={{ color: "var(--cp-yellow)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[8px] uppercase tracking-widest mb-2 opacity-60">
                          // visuals
                        </div>
                        <ResponsiveContainer width="100%" height={80}>
                          <BarChart data={mermaidData}>
                            <XAxis dataKey="name" hide />
                            <Bar dataKey="value" fill="var(--cp-yellow)" radius={[1, 1, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </section>
                    </div>

                    {/* Row 2: Fact Network (Full remaining height) */}
                    <section className="flex-1 min-h-0 flex flex-col">
                      <div style={{ color: "var(--cp-green)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[10px] uppercase tracking-widest mb-2 opacity-60">
                        // neural_fact_index
                      </div>
                      <div className="flex-1 border border-[var(--cp-border)] bg-black/40 relative overflow-hidden">
                        <NeuralFactNetwork data={factNetwork} />
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === "trace" && (
                  <div className="p-2 space-y-2 h-full overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,229,255,0.1) transparent" }}>
                    {thinking.map(t => {
                      const agentColor = getAgentColor(t.agent);
                      return (
                        <div
                          key={t.id}
                          style={{
                            background: "var(--cp-bg-2)",
                            border: "1px solid var(--cp-border)",
                            borderLeft: `2px solid ${agentColor}`,
                            fontFamily: "'Share Tech Mono', monospace",
                          }}
                          className="p-2 group hover:border-[rgba(0,229,255,0.3)] transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span style={{ color: agentColor }} className="text-[9px] font-bold">
                              {t.agent.toUpperCase()}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {getThinkingIcon(t.type, agentColor)}
                              <span className="text-[8px] opacity-30">
                                {new Date(t.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <div
                            style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }}
                            className="text-[10px] leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity whitespace-pre-wrap break-words"
                          >
                            {t.thought}
                          </div>
                        </div>
                      );
                    })}
                    {thinking.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center opacity-10 mt-20">
                        <Zap size={32} />
                        <span className="text-[10px] mt-2 uppercase tracking-[0.2em]">idle_state</span>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "graph" && (
                  <div className="p-3 h-full flex flex-col">
                    <div
                      onDragOver={e => e.preventDefault()}
                      onDrop={handleFileDrop}
                      style={{
                        border: "1px solid var(--cp-border)",
                        background: "var(--cp-bg-2)",
                        color: "var(--cp-cyan)",
                        fontFamily: "'Share Tech Mono', monospace",
                      }}
                      className="p-3 text-[10px] opacity-50 text-center uppercase tracking-widest shrink-0"
                    >
                      neural_session_graph
                    </div>
                    <div className="flex-1 min-h-0 relative overflow-hidden bg-black/20 border border-[var(--cp-border)] border-t-0">
                       <AgentGraph messages={messages} thinking={thinking} />
                    </div>
                    <div className="flex justify-center gap-4 mt-2 opacity-40 hover:opacity-100 transition-opacity">
                      <span style={{ color: "var(--cp-cyan)", fontFamily: "'Share Tech Mono', monospace" }} className="text-[10px]">
                        SCROLL TO ZOOM · DRAG TO PAN
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === "summary" && (
                  <div className="p-3 space-y-3">
                    <button
                      onClick={onSummarize}
                      style={{
                        background: "var(--cp-cyan)",
                        color: "var(--cp-bg-0)",
                        fontFamily: "'Share Tech Mono', monospace",
                      }}
                      className="w-full px-3 py-2 text-xs font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    >
                      <Sparkles size={12} />
                      Neural Recalibration
                    </button>

                    <div
                      style={{
                        background: "var(--cp-bg-2)",
                        border: "1px solid var(--cp-border)",
                        fontFamily: "'Rajdhani', sans-serif",
                        color: "var(--foreground)",
                      }}
                      className="p-3 text-[10px] leading-relaxed opacity-70"
                    >
                      <p className="mb-2" style={{ color: "var(--cp-cyan)", fontFamily: "'Share Tech Mono', monospace" }}>
                        // session_summary
                      </p>
                      <div className="markdown-content text-xs">
                        <ChatMarkdown content={sessionSummary || "Neural state analysis complete. All agents verified and ready for deployment."} />
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "uploads" && (
                  <div className="p-3 space-y-3">
                    <div
                      style={{
                        border: "1px dashed rgba(0,229,255,0.25)",
                        background: "var(--cp-bg-2)",
                        color: "var(--cp-cyan)",
                        fontFamily: "'Share Tech Mono', monospace",
                      }}
                      className="p-4 text-center text-[10px] opacity-50 cursor-pointer"
                    >
                      <Upload size={16} className="mx-auto mb-1 opacity-40" />
                      drop files or{" "}
                      <label className="underline cursor-pointer">
                        browse
                        <input type="file" multiple className="hidden" onChange={handleFileInput} />
                      </label>
                    </div>
                    {uploadedFiles.length > 0 && (
                      <div className="space-y-1">
                        {uploadedFiles.map((fileName, index) => (
                          <div
                            key={`${fileName}-${index}`}
                            style={{
                              background: "var(--cp-bg-3)",
                              border: "1px solid var(--cp-border)",
                              color: "var(--foreground)",
                              fontFamily: "'Share Tech Mono', monospace",
                            }}
                            className="px-2 py-1 text-xs flex items-center gap-2"
                          >
                            <FileText size={10} style={{ color: "var(--cp-cyan)" }} />
                            <span className="truncate opacity-70">{fileName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <aside
        style={{
          background: "var(--cp-bg-1)",
          borderLeft: "1px solid var(--cp-border)",
          width: 40,
        }}
        className="h-full shrink-0 flex flex-col justify-start py-2 z-20"
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <NavIcon
              key={tab.id}
              icon={<Icon size={16} />}
              label={tab.label}
              onClick={() => handleTabClick(tab.id)}
              isActive={activeTab === tab.id}
            />
          );
        })}
      </aside>
    </>
  );
}

function NeuralFactNetwork({ data }: { data: { nodes: any[], edges: any[] } }) {
  // Simple deterministic circle layout + jitter for network feel
  const nodesWithPos = data.nodes.map((node, i) => {
    const angle = (i / data.nodes.length) * 2 * Math.PI;
    const radius = 40 + (i % 3) * 15; // Vary radius for depth
    return {
      ...node,
      x: 100 + radius * Math.cos(angle),
      y: 100 + radius * Math.sin(angle),
    };
  });

  const maxCount = Math.max(...data.nodes.map(n => n.count), 1);

  return (
    <svg 
      width="100%" height="100%" 
      viewBox="0 0 200 200"
      className="select-none"
    >
      <defs>
        <filter id="factGlow">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Edges */}
      {data.edges.map((edge, i) => {
        const s = nodesWithPos.find(n => n.text === edge.source);
        const t = nodesWithPos.find(n => n.text === edge.target);
        if (!s || !t) return null;
        return (
          <line
            key={i}
            x1={s.x} y1={s.y}
            x2={t.x} y2={t.y}
            stroke="var(--cp-green)"
            strokeWidth={0.3}
            strokeOpacity={0.15 + (edge.weight / 5) * 0.3}
          />
        );
      })}

      {/* Nodes */}
      {nodesWithPos.map((node, i) => {
        const sizeRatio = node.count / maxCount;
        const fontSize = 5 + sizeRatio * 6;
        const opacity = 0.4 + sizeRatio * 0.6;
        
        return (
          <g key={i}>
            <circle 
              cx={node.x} cy={node.y} 
              r={1.5 + sizeRatio * 2} 
              fill="var(--cp-green)" 
              fillOpacity={0.8}
              filter="url(#factGlow)"
            />
            <text
              x={node.x} y={node.y - (3 + sizeRatio * 2)}
              textAnchor="middle"
              fill="var(--cp-green)"
              fontSize={fontSize}
              fontWeight={sizeRatio > 0.5 ? 'bold' : 'normal'}
              fontFamily="'Share Tech Mono', monospace"
              style={{ opacity, textTransform: 'uppercase' }}
            >
              {node.text}
            </text>
          </g>
        );
      })}

      {data.nodes.length === 0 && (
        <text 
          x="100" y="100" 
          textAnchor="middle" 
          fill="var(--cp-green)" 
          opacity="0.2" 
          fontSize="8"
          fontFamily="'Share Tech Mono', monospace"
        >
          AWAITING_FACTUAL_INTEL...
        </text>
      )}
    </svg>
  );
}

function AgentGraph({ messages, thinking }: { messages: Message[], thinking: Thinking[] }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<SVGSVGElement>(null);

  // Extract participants and their relationships from messages and thinking
  const nodes: { id: string, label: string, x: number, y: number, color: string, type: 'entity' | 'mcp' }[] = [
    { id: "user", label: "USER", x: 100, y: 30, color: "var(--cp-cyan)", type: 'entity' },
    { id: "moderator", label: "MODERATOR", x: 100, y: 95, color: "var(--cp-green)", type: 'entity' },
  ];

  // Identify all active agents from messages (including whispers) and thinking
  const agentIdsFromMessages = messages
    .map(m => m.role === 'agent-whisper' ? m.from : (!['user', 'moderator', 'system', 'internal', 'error', 'ai', 'whisper', 'moderator-whisper'].includes(m.role) ? m.role : null))
    .filter((id): id is string => !!id);
  
  const agentIdsFromThinking = thinking
    .map(t => t.agent !== 'Moderator' && t.agent !== 'System' ? t.agent : null)
    .filter((id): id is string => !!id);

  const uniqueAgents = Array.from(new Set([...agentIdsFromMessages, ...agentIdsFromThinking]));

  // Layout agents in a semi-circle below the moderator
  uniqueAgents.forEach((agentId, index) => {
    const angle = (Math.PI / (uniqueAgents.length + 1)) * (index + 1);
    const radius = 65;
    const x = 100 + radius * Math.cos(angle + Math.PI);
    const y = 95 + radius * Math.sin(angle);

    nodes.push({
      id: agentId.toLowerCase(),
      label: agentId.toUpperCase(),
      x,
      y,
      color: "var(--cp-yellow)",
      type: 'entity'
    });
  });

  const edges: { from: string, to: string, dash?: string, color?: string }[] = [];

  if (messages.some(m => m.role === 'user')) {
    edges.push({ from: "user", to: "moderator" });
  }

  uniqueAgents.forEach(agentId => {
    const agentNodeId = agentId.toLowerCase();
    edges.push({ from: "moderator", to: agentNodeId, dash: "3,3" });
    edges.push({ from: agentNodeId, to: "moderator", dash: "3,3" });

    // Check if this agent has cross-checked others (messages that mention other agents)
    const agentMsg = messages.find(m => (m.role === agentId || (m.role === 'agent-whisper' && m.from === agentId)));
    if (agentMsg) {
      uniqueAgents.forEach(otherId => {
        if (otherId !== agentId && agentMsg.content.toLowerCase().includes(otherId.toLowerCase())) {
          edges.push({ from: agentNodeId, to: otherId.toLowerCase(), dash: "2,2", color: "var(--cp-magenta)" });
        }
      });
    }
  });

  if (messages.some(m => m.role === 'moderator')) {
    edges.push({ from: "moderator", to: "user" });
  }
  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 5));
  };

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  };

  return (
    <svg 
      ref={containerRef}
      width="100%" height="100%" 
      viewBox="0 0 200 250"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="4" 
        refX="15" refY="2" orient="auto">
          <polygon points="0 0, 6 2, 0 4" fill="var(--cp-border)" />
        </marker>
      </defs>
      
      <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: 'center' }}>
        {edges.map((edge, i) => {
          const fromNode = nodes.find(n => n.id === edge.from);
          const toNode = nodes.find(n => n.id === edge.to);
          if (!fromNode || !toNode) return null;
          
          return (
            <line
              key={i}
              x1={fromNode.x} y1={fromNode.y}
              x2={toNode.x} y2={toNode.y}
              stroke={edge.color || "var(--cp-border)"} 
              strokeWidth={0.8}
              strokeDasharray={edge.dash}
              markerEnd="url(#arrowhead)"
              style={{ opacity: 0.4 }}
            />
          );
        })}
        
        {nodes.map(node => (
          <g key={node.id}>
            <rect
              x={node.x - 30} 
              y={node.y - 10}
              width={60} 
              height={20}
              fill="var(--cp-bg-3)"
              stroke={node.color}
              strokeWidth={1}
              strokeOpacity={0.6}
              rx={2}
            />
            <text
              x={node.x} y={node.y + 3}
              textAnchor="middle"
              fill={node.color}
              fontSize={7}
              fontFamily="'Share Tech Mono', monospace"
              className="select-none"
            >
              {node.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
