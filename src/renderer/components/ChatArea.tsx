import { useState, useRef, useEffect, memo } from "react";
import { Send, Bot, User, Info, FileDown, Trash2, Copy, FileText, Shield, Code, Layout, Settings, AlertTriangle, Cpu, Terminal, ShieldAlert, Globe, Search, RefreshCw, X, Edit, Paperclip, Mic, MicOff } from "lucide-react";
import { ChatMarkdown } from './ChatMarkdown';
import {
  formatRunDuration,
  getRunTiming,
  type AgentRunDisplayState,
} from "../services/agentRunSupervision";

export interface Message {
  id: string;
  role: 'user' | 'moderator' | 'engineer' | 'architect' | 'security' | 'system' | 'error' | 'internal' | 'ai' | 'whisper' | 'moderator-whisper' | 'agent-whisper' | 'athena' | 'athena-whisper';
  content: string;
  from?: string;
  to?: string;
  agent?: string;
  provider?: string;
  model?: string;
  timestamp: Date | number;
  attachments?: { name: string; content: string; summary?: string; loading?: boolean }[];
}

interface ChatAreaProps {
  messages: Message[];
  sessionTitle: string;
  onSend: (text: string, attachments?: { name: string; content: string; summary?: string }[]) => void;
  onUploadFile: (name: string, content: string) => Promise<string>;
  onDeleteMessage?: (id: string) => void;
  isLoading?: boolean;
  statusText?: string;
  onSummarize?: () => void;
  onClearSession?: () => void;
  onEditMessage?: (id: string, newContent: string) => void;
  onUpdateMessage?: (id: string, newContent: string) => void;
  allowDeepSearch?: boolean;
  onToggleDeepSearch?: (enabled: boolean) => void;
  agents?: { id: string; name: string; persona?: string }[];
  sessionFiles?: { name: string; content: string; summary?: string; loading?: boolean }[];
  onDeleteSessionFile?: (name: string) => void;
  thinking?: any[];
  streamingAgents?: Record<string, AgentRunDisplayState>;
  onRecoverRun?: (runId: string) => Promise<void>;
  onRetryFailedRequest?: (messageId: string) => Promise<void>;
}

const getRoleIcon = (role: Message['role']) => {
  switch (role) {
    case 'user': return <User size={13} style={{ color: "rgba(120,180,255,0.8)" }} />;
    case 'moderator':
    case 'athena': return <Shield size={13} style={{ color: "var(--good)" }} />;
    case 'engineer': return <Code size={13} style={{ color: "var(--muted-foreground)" }} />;
    case 'architect': return <Layout size={13} style={{ color: "var(--muted-foreground)" }} />;
    case 'security': return <Shield size={13} style={{ color: "var(--muted-foreground)" }} />;
    case 'system': return <Settings size={13} style={{ color: "var(--chart-5)" }} />;
    case 'error': return <AlertTriangle size={13} style={{ color: "var(--accent)" }} />;
    case 'internal': return <Terminal size={13} style={{ color: "var(--primary)" }} />;
    default: return <Bot size={13} style={{ color: "var(--muted-foreground)" }} />;
  }
}

function MessageActions({ messageId, content, sessionTitle, onDelete, onStartEdit, isUser }: { messageId: string; content: string; sessionTitle: string; onDelete?: (id: string) => void; onStartEdit?: () => void; isUser: boolean }) {
  function handleCopy() {
    navigator.clipboard.writeText(content);
  }

  function handleDownloadMarkdown() {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `message-${messageId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadHTML() {
    const normalizedTitle = (sessionTitle || 'Quorum_Message')
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
        }
        body {
            font-family: 'Rajdhani', sans-serif;
            background-color: #080b12;
            color: #e0e0e0;
            line-height: 1.6;
            padding: 40px;
            max-width: 900px;
            margin: 0 auto;
        }
        .header {
            border-bottom: 1px solid var(--border);
            margin-bottom: 30px;
            padding-bottom: 10px;
        }
        h1 { color: #00e5ff; font-family: 'Share Tech Mono', monospace; margin: 0; font-size: 1.5rem; }
        .session-title { opacity: 0.6; font-size: 0.9rem; }
        #content { background: var(--background); border: 1px solid var(--border); padding: 20px; }
        pre { background: #1a1a1a; padding: 15px; border-radius: 4px; overflow-x: auto; border: 1px solid #333; }
        code { font-family: 'Share Tech Mono', monospace; color: #00e5ff; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #333; padding: 10px; text-align: left; }
        th { background-color: #1a1a1a; color: #00e5ff; }
        .mermaid { background: #080b12 !important; padding: 10px; border-radius: 4px; margin: 20px 0; }
        .fact-marker { color: #00e5ff; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>// QUORUM_REPORT</h1>
        <div class="session-title">${sessionTitle}</div>
    </div>
    <div id="content"></div>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>
        const renderer = new marked.Renderer();
        const originalCode = renderer.code.bind(renderer);
        renderer.code = function(code, lang, escaped) {
            let text = typeof code === 'object' ? code.text : code;
            let language = typeof code === 'object' ? code.lang : lang;
            if (language === 'mermaid') {
                return '<pre class="mermaid">' + text + '</pre>';
            }
            return originalCode.call(this, code, lang, escaped);
        };
        marked.use({ renderer });

        mermaid.initialize({ startOnLoad: false, theme: 'default' });
        const rawContent = \`${content.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`;
        document.getElementById('content').innerHTML = marked.parse(rawContent);

        if (typeof mermaid.run === 'function') {
            mermaid.run();
        } else if (typeof mermaid.init === 'function') {
            mermaid.init();
        } else if (typeof mermaid.contentLoaded === 'function') {
            mermaid.contentLoaded();
        }
    </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${normalizedTitle}-${messageId}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadPDF() {
    const normalizedTitle = (sessionTitle || 'Quorum_Report')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    document.body.appendChild(frame);
    
    const doc = frame.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <html>
          <head>
            <title>${normalizedTitle}_${messageId}</title>
            <style>
              body { font-family: 'Rajdhani', sans-serif; padding: 40px; background: #fff; color: #333; line-height: 1.6; }
              pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; }
              h1, h2, h3 { color: #000; border-bottom: 1px solid #eee; padding-bottom: 5px; }
              table { border-collapse: collapse; width: 100%; margin: 20px 0; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f2f2f2; }
              .fact-marker { color: #00e5ff; font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>Quorum - Fact Report</h1>
            <h2>${sessionTitle}</h2>
            <div id="content"></div>
            <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
            <script>
              window.onload = () => {
                document.getElementById('content').innerHTML = marked.parse(\`${content.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`);
                setTimeout(() => {
                  window.print();
                  window.close();
                }, 500);
              };
            </script>
          </body>
        </html>
      `);
      doc.close();
    }
    
    setTimeout(() => {
      document.body.removeChild(frame);
    }, 5000);
  }

  return (
    <div className="message-actions">
      {isUser && onStartEdit && (
        <button onClick={onStartEdit} title="Edit Message" className="message-action-btn">
          <Edit size={11} />
        </button>
      )}
      <button onClick={handleCopy} title="Copy" className="message-action-btn">
        <Copy size={11} />
      </button>
      <button onClick={handleDownloadMarkdown} title="Download as Markdown" className="message-action-btn">
        <FileText size={11} />
      </button>
      <button onClick={handleDownloadHTML} title="Download as HTML" className="message-action-btn">
        <Globe size={11} />
      </button>
      <button onClick={handleDownloadPDF} title="Download as PDF" className="message-action-btn">
        <FileDown size={11} />
      </button>
      <button onClick={() => onDelete?.(messageId)} title="Delete" className="message-action-btn delete">
        <Trash2 size={11} />
      </button>
    </div>
  );
}

const MemoizedWhisperBlock = memo(({ message, onUpdateMessage }: { message: Message, onUpdateMessage?: (id: string, newContent: string) => void }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isModerator = message.role === "moderator-whisper" || message.role === "athena-whisper";
  const isAgent = message.role === "agent-whisper";
  
  const label = isModerator ? message.to : isAgent ? message.from : "";
  const prefix = isModerator ? "→ " : isAgent ? "from " : "";

  let blockClass = "whisper-block";
  if (isModerator) blockClass += " moderator-whisper";
  else if (isAgent) blockClass += " agent-whisper";

  return (
    <div className="whisper-block-wrapper">
      <div className={blockClass} onClick={() => setIsExpanded(!isExpanded)}>
        <div className="whisper-header">
          <ShieldAlert size={12} className="shrink-0" />
          <span className="whisper-title">
            {message.role.replace('-', ' ')} {label && <span className="opacity-50 ml-1">{prefix}{label}</span>}
            {message.provider && message.model && (
              <span className="whisper-badge">
                &lt;{message.provider}:{message.model}&gt;
              </span>
            )}
          </span>
          <span className="whisper-toggle-hint">
            {isExpanded ? "collapse" : "expand"}
          </span>
        </div>
        
        {isExpanded && (
          <div className="whisper-content-box" onClick={(e) => e.stopPropagation()}>
            <ChatMarkdown 
              content={message.content} 
              variant="whisper" 
              onUpdateCode={(oldCode, newCode) => {
                const updatedContent = message.content.replace(oldCode, newCode);
                onUpdateMessage?.(message.id, updatedContent);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
});

const WhisperGroupBlock = ({ 
  messages, 
  onUpdateMessage 
}: { 
  messages: Message[], 
  onUpdateMessage?: (id: string, newContent: string) => void 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="whisper-group-container">
      <div 
        className={`whisper-group-header ${isExpanded ? 'expanded' : ''}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={12} className="text-[var(--cp-cyan)]" />
          <span className="whisper-group-title">
            // CHATTER ({messages.length} log lines)
          </span>
        </div>
        <span className="whisper-group-toggle-hint">
          {isExpanded ? "collapse logs" : "expand logs"}
        </span>
      </div>
      
      {isExpanded && (
        <div className="whisper-group-content">
          {messages.map(msg => (
            <MemoizedWhisperBlock 
              key={msg.id} 
              message={msg} 
              onUpdateMessage={onUpdateMessage} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

const MemoizedMessageItem = memo(({ msg, sessionTitle, onDeleteMessage, onEditMessage, onUpdateMessage, onRecoverRun, onRetryFailedRequest }: { msg: Message, sessionTitle: string, onDeleteMessage?: (id: string) => void, onEditMessage?: (id: string, newContent: string) => void, onUpdateMessage?: (id: string, newContent: string) => void, onRecoverRun?: (runId: string) => Promise<void>, onRetryFailedRequest?: (messageId: string) => Promise<void> }) => {
  const isUser = msg.role === 'user';
  const timestamp = typeof msg.timestamp === 'number' ? new Date(msg.timestamp) : msg.timestamp;
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(msg.content);
  const [isRecovering, setIsRecovering] = useState(false);
  const recoverableRunId = msg.role === 'error'
    ? msg.content.match(/RECOVERABLE_AGENT_(?:TIMEOUT|DISCONNECT) runId=([^\s]+)/)?.[1]
    : undefined;
  const isLegacyTimeout = msg.role === 'error'
    && !recoverableRunId
    && /AGENT_TIMEOUT|ALL_PROVIDERS_EXHAUSTED/i.test(msg.content);

  function handleSaveEdit() {
    if (editVal.trim() && editVal !== msg.content) {
      onEditMessage?.(msg.id, editVal.trim());
    }
    setIsEditing(false);
  }

  let bubbleClass = "message-bubble-body";
  if (isUser) bubbleClass += " user";
  else if (msg.role === 'moderator' || msg.role === 'athena') bubbleClass += " moderator";
  else if (['engineer', 'architect', 'security', 'ai'].includes(msg.role)) bubbleClass += " agent";
  else bubbleClass += " system-meta";

  return (
    <div className={`message-item-wrapper group ${isUser ? 'user' : 'agent'}`}>
      {!isUser && (
        <div className={`message-avatar-box ${msg.role === 'moderator' || msg.role === 'athena' ? 'moderator' : ''}`}>
          {getRoleIcon(msg.role)}
        </div>
      )}
      <div className="message-content-container">
        <div className={`message-meta-header ${isUser ? 'user' : 'agent'}`}>
          {!isUser && (
            <span className="flex items-center gap-2">
              {msg.role === 'moderator' || msg.role === 'athena' ? 'ATHENA' : msg.role.toUpperCase()}
              {msg.provider && msg.model && (
                <span className="message-meta-badge">
                  &lt;{msg.provider}:{msg.model}&gt;
                </span>
              )}
              <span className="message-timestamp">
                {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </span>
          )}
          {isUser && (
            <span className="message-timestamp mr-2">
              {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          {isUser && "YOU"}
          <MessageActions 
            messageId={msg.id} 
            content={msg.content} 
            sessionTitle={sessionTitle} 
            onDelete={onDeleteMessage} 
            onStartEdit={() => { setIsEditing(true); setEditVal(msg.content); }}
            isUser={isUser}
          />
        </div>
        <div className={bubbleClass}>
          {isEditing ? (
            <div className="inline-edit-box">
              <textarea 
                className="inline-edit-textarea" 
                value={editVal} 
                onChange={e => setEditVal(e.target.value)}
                rows={3}
              />
              <div className="inline-edit-actions">
                <button className="inline-edit-btn cancel" onClick={() => setIsEditing(false)}>Cancel</button>
                <button className="inline-edit-btn save" onClick={handleSaveEdit}>Save & Re-run</button>
              </div>
            </div>
          ) : (
            <>
              <ChatMarkdown 
                content={msg.content} 
                onUpdateCode={(oldCode, newCode) => {
                  const updatedContent = msg.content.replace(oldCode, newCode);
                  onUpdateMessage?.(msg.id, updatedContent);
                }}
              />
              {recoverableRunId && onRecoverRun && (
                <button
                  className="run-recovery-button"
                  disabled={isRecovering}
                  onClick={async () => {
                    setIsRecovering(true);
                    try {
                      await onRecoverRun(recoverableRunId);
                    } finally {
                      setIsRecovering(false);
                    }
                  }}
                >
                  <RefreshCw size={12} className={isRecovering ? 'run-recovery-spinner' : ''} />
                  {isRecovering ? 'RECONNECTING...' : 'RECOVER RUN'}
                </button>
              )}
              {isLegacyTimeout && onRetryFailedRequest && (
                <button
                  className="run-recovery-button"
                  disabled={isRecovering}
                  onClick={async () => {
                    setIsRecovering(true);
                    try {
                      await onRetryFailedRequest(msg.id);
                    } finally {
                      setIsRecovering(false);
                    }
                  }}
                >
                  <RefreshCw size={12} className={isRecovering ? 'run-recovery-spinner' : ''} />
                  {isRecovering ? 'RESTARTING...' : 'RETRY REQUEST'}
                </button>
              )}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="message-attachments-container">
                  {msg.attachments.map((att, idx) => (
                    <details key={idx} className="collapsible-summary-details">
                      <summary className="collapsible-summary-title">
                        <FileText size={10} />
                        <span>{att.name}</span>
                        <span className="summary-status-hint"> (click to view agent summary)</span>
                      </summary>
                      <div className="collapsible-summary-content">
                        {att.summary || "No summary available."}
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {isUser && (
        <div className="message-avatar-box user">
          <User size={13} style={{ color: "rgba(120,180,255,0.8)" }} />
        </div>
      )}
    </div>
  );
});

async function decodeRecordingForWhisper(recording: Blob) {
  const audioContext = new AudioContext();
  try {
    const decoded = await audioContext.decodeAudioData(await recording.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const channelData = decoded.getChannelData(channel);
      for (let index = 0; index < decoded.length; index += 1) {
        mono[index] += channelData[index] / decoded.numberOfChannels;
      }
    }

    if (decoded.sampleRate === 16_000) return mono;
    const outputLength = Math.max(1, Math.round(mono.length * 16_000 / decoded.sampleRate));
    const resampled = new Float32Array(outputLength);
    const ratio = decoded.sampleRate / 16_000;
    for (let index = 0; index < outputLength; index += 1) {
      const sourcePosition = index * ratio;
      const lowerIndex = Math.floor(sourcePosition);
      const upperIndex = Math.min(lowerIndex + 1, mono.length - 1);
      const weight = sourcePosition - lowerIndex;
      resampled[index] = mono[lowerIndex] * (1 - weight) + mono[upperIndex] * weight;
    }
    return resampled;
  } finally {
    await audioContext.close();
  }
}

function AgentActivityCard({
  agentName,
  agentData,
}: {
  agentName: string;
  agentData: AgentRunDisplayState;
}) {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const events = agentData.events || [];
  const timing = getRunTiming(agentData, now);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  const renderEvent = (ev: any, idx: number) => {
    if (ev.type === 'thinking') {
      return (
        <div key={idx} style={{ color: ev.status === 'error' ? 'var(--accent)' : 'rgba(100,180,255,0.85)', fontSize: '10px', fontFamily: 'monospace', padding: '1px 0' }}>
          &gt; [{ev.provider}:{ev.model}] {ev.status}{ev.reason ? ` — ${ev.reason}` : ''}
          {ev.status === 'pending' && <span style={{ marginLeft: 4, animation: 'pulse 1s infinite' }}>...</span>}
        </div>
      );
    }
    if (ev.type === 'chunk') {
      return (
        <div key={idx} style={{ color: 'rgba(220,220,220,0.9)', fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', padding: '1px 0' }}>
          {ev.content}
        </div>
      );
    }
    if (ev.type === 'complete') {
      return (
        <div key={idx} style={{ color: '#00ff88', fontSize: '10px', fontFamily: 'monospace', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4, marginTop: 4 }}>
          &gt; Run complete.
        </div>
      );
    }
    if (ev.type === 'error') {
      return (
        <div key={idx} style={{ color: 'var(--accent)', fontSize: '10px', fontFamily: 'monospace', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 4, marginTop: 4 }}>
          &gt; Error: {ev.message || ev.content || 'Run failed'}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ background: 'rgba(0,20,35,0.7)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.35rem 0.6rem', cursor: events.length > 0 ? 'pointer' : 'default' }}
        onClick={() => events.length > 0 && setExpanded(e => !e)}
      >
        <span style={{ color: 'var(--cp-cyan)', fontWeight: 700, fontSize: '11px', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
          {agentName.toUpperCase()}
        </span>
        <span style={{ opacity: 0.65, fontSize: '10px', flex: 1, fontFamily: 'monospace' }}>
          {agentData.status}
        </span>
        {agentData.startedAt && agentData.lastActivityAt && agentData.idleTimeoutMs && (
          <span
            title="Elapsed time · idle time remaining. Idle timer resets whenever Athena sees agent activity."
            style={{ fontSize: '9px', color: 'var(--good)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}
          >
            {formatRunDuration(timing.elapsedMs)} · idle {formatRunDuration(timing.idleRemainingMs)}
          </span>
        )}
        {events.length > 0 && (
          <span style={{ fontSize: '9px', color: 'rgba(0,229,255,0.5)', fontFamily: 'monospace' }}>
            {expanded ? '▲ collapse' : `▼ ${events.length} events`}
          </span>
        )}
        <div className="typing-dots" style={{ flexShrink: 0 }}>
          <span className="typing-dot"></span>
          <span className="typing-dot"></span>
          <span className="typing-dot"></span>
        </div>
      </div>
      {expanded && events.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(0,229,255,0.1)', background: 'rgba(0,0,0,0.5)', padding: '0.4rem 0.6rem', maxHeight: '180px', overflowY: 'auto' }}>
          {events.map((ev, i) => renderEvent(ev, i))}
        </div>
      )}
    </div>
  );
}

export function ChatArea({
  messages, 
  sessionTitle, 
  onSend, 
  onUploadFile, 
  onDeleteMessage, 
  isLoading, 
  statusText = "IDLE",
  onSummarize, 
  onClearSession, 
  onEditMessage, 
  onUpdateMessage, 
  allowDeepSearch, 
  onToggleDeepSearch, 
  agents = [],
  sessionFiles = [],
  onDeleteSessionFile,
  thinking = [],
  streamingAgents = {},
  onRecoverRun,
  onRetryFailedRequest,
}: ChatAreaProps) {
  const [input, setInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("ALL");
  const [slashSuggestions, setSlashSuggestions] = useState<{ name: string; desc: string }[]>([]);
  const [selectedSugIdx, setSelectedSugIdx] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const [isDragOver, setIsDragOver] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(messages.length);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const recordedAudioChunksRef = useRef<Blob[]>([]);
  const speechBaseInputRef = useRef("");

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      microphoneStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  async function toggleVoiceInput() {
    if (isListening) {
      mediaRecorderRef.current?.stop();
      return;
    }
    if (isTranscribing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = stream;
      recordedAudioChunksRef.current = [];
      speechBaseInputRef.current = input.trimEnd();

      const preferredMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordedAudioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setIsListening(false);
        window.dispatchEvent(new CustomEvent('toast', { detail: 'Microphone recording failed.' }));
      };
      recorder.onstop = async () => {
        setIsListening(false);
        setIsTranscribing(true);
        microphoneStreamRef.current?.getTracks().forEach(track => track.stop());
        microphoneStreamRef.current = null;
        mediaRecorderRef.current = null;

        try {
          const recording = new Blob(recordedAudioChunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const audio = await decodeRecordingForWhisper(recording);
          const transcript = await window.system.transcribeAudio(audio);
          const base = speechBaseInputRef.current;
          setInput(`${base}${base && transcript ? " " : ""}${transcript.trim()}`);
        } catch (error: any) {
          window.dispatchEvent(new CustomEvent('toast', {
            detail: `Voice transcription failed: ${error.message}`,
          }));
        } finally {
          recordedAudioChunksRef.current = [];
          setIsTranscribing(false);
          textareaRef.current?.focus();
        }
      };
      recorder.start();
      setIsListening(true);
    } catch (error: any) {
      const detail = error?.name === "NotAllowedError"
        ? "Microphone permission was denied."
        : `Unable to start microphone: ${error.message}`;
      window.dispatchEvent(new CustomEvent('toast', { detail }));
    }
  }

  function triggerFileInput() {
    fileInputRef.current?.click();
  }

  function handleFiles(fileList: FileList) {
    Array.from(fileList).forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        window.dispatchEvent(new CustomEvent('toast', { detail: `File ${file.name} is too large (max 5MB)` }));
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        const rawContent = event.target?.result;
        if (typeof rawContent === 'string') {
          const content = rawContent.replace(/\0/g, '');
          try {
            await onUploadFile(file.name, content);
          } catch (err: any) {
            window.dispatchEvent(new CustomEvent('toast', { detail: `Failed to upload ${file.name}: ${err.message}` }));
          }
        }
      };
      reader.onerror = () => {
        window.dispatchEvent(new CustomEvent('toast', { detail: `Failed to read file ${file.name}` }));
      };
      reader.readAsText(file);
    });
  }

  function handleDragOver(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }


  const SLASH_COMMANDS = [
    { name: "/summarize", desc: "Regenerate session summaries" },
    { name: "/clear", desc: "Reset active session state" },
    { name: "/jira", desc: "Create a Jira ticket from chat" }
  ];

  useEffect(() => {
    const viewport = viewportRef.current;
    const currentCount = messages.length;
    const previousCount = lastMessageCountRef.current;
    const isAppending = currentCount > previousCount;

    const nearBottom = viewport
      ? viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 120
      : true;

    if (isAppending && nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    lastMessageCountRef.current = currentCount;
  }, [messages]);

  // Handle Slash Command Trigger
  useEffect(() => {
    const lastWord = input.split(/\s+/).pop() || "";
    if (lastWord.startsWith("/")) {
      const match = SLASH_COMMANDS.filter(c => c.name.toLowerCase().startsWith(lastWord.toLowerCase()));
      setSlashSuggestions(match);
      setSelectedSugIdx(0);
    } else {
      setSlashSuggestions([]);
    }
  }, [input]);

  async function handleSendMsg() {
    if (isListening || isTranscribing) return;
    const text = input.trim();
    if (!text) return;

    // Intercept slash commands (case-insensitive and checked against original raw input before adding agent prefix)
    const lowerText = text.toLowerCase();
    if (lowerText.startsWith("/clear")) {
      if (onClearSession) onClearSession();
      setInput("");
      return;
    }

    if (lowerText.startsWith("/summarize")) {
      if (onSummarize) onSummarize();
      setInput("");
      return;
    }

    if (lowerText.startsWith("/jira")) {
      // Parse ticket parameters: /jira [title] --priority [high/medium/low]
      const cleanCmd = text.replace(/\/jira/i, "").trim();
      const priorityMatch = cleanCmd.match(/--priority\s+(\w+)/i);
      const priority = priorityMatch ? priorityMatch[1].toLowerCase() : "medium";
      const title = cleanCmd.replace(/--priority\s+\w+/i, "").trim() || "Manual Ticket from Swarm Workspace";

      setInput("");

      // Call MCP Tool via window.system
      try {
        if (window.system?.callMcpTool) {
          const wsId = '17807589009121862532574';
          const ticketKey = 'QRM-' + Math.floor(100 + Math.random() * 900);
          
          onSend(`[SYSTEM_ACTION] Initiating creation of JIRA ticket ${ticketKey}: "${title}" with priority: ${priority}...`);
          
          const response = await window.system.callMcpTool('savant-workspace', 'create_jira_ticket', {
            workspace_id: wsId,
            ticket_key: ticketKey,
            title: title,
            priority: priority,
            status: 'todo',
            assignee: 'ahmed'
          });

          // Insert response message
          onSend(`[SYSTEM_SUCCESS] Jira Ticket ${ticketKey} successfully registered in workspace database.`);
        } else {
          onSend(`[SYSTEM_ERROR] MCP call interface unavailable.`);
        }
      } catch (e: any) {
        onSend(`[SYSTEM_ERROR] Failed to create Jira ticket: ${e.message}`);
      }
      return;
    }

    // Direct route checks
    let finalizedText = text;
    if (selectedAgent !== "ALL" && !text.startsWith("@")) {
      finalizedText = `@${selectedAgent.toLowerCase()} ${text}`;
    }

    onSend(finalizedText);
    setInput("");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (slashSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSugIdx(prev => (prev + 1) % slashSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSugIdx(prev => (prev - 1 + slashSuggestions.length) % slashSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = slashSuggestions[selectedSugIdx];
        const words = input.split(/\s+/);
        words.pop(); // remove the partial slash
        setInput([...words, selected.name].join(" ") + " ");
        setSlashSuggestions([]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashSuggestions([]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMsg();
    }
  }

  // Filter messages based on search query
  const filteredMessages = messages.filter(m => {
    if (m.role === 'system' || m.role === 'internal') return false;
    if (searchQuery.trim() === "") return true;
    return m.content.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Group contiguous whispers (if more than 2) under a single collapsible header
  const groupedMessages: { type: 'single' | 'whisper-group'; messages: Message[]; id: string }[] = [];
  for (let i = 0; i < filteredMessages.length; i++) {
    const msg = filteredMessages[i];
    const isWhisper = msg.role === "whisper" || msg.role === "moderator-whisper" || msg.role === "agent-whisper" || msg.role === "athena-whisper";
    if (isWhisper) {
      const whispers: Message[] = [msg];
      let j = i + 1;
      while (j < filteredMessages.length) {
        const nextMsg = filteredMessages[j];
        const nextIsWhisper = nextMsg.role === "whisper" || nextMsg.role === "moderator-whisper" || nextMsg.role === "agent-whisper" || nextMsg.role === "athena-whisper";
        if (nextIsWhisper) {
          whispers.push(nextMsg);
          j++;
        } else {
          break;
        }
      }
      if (whispers.length > 2) {
        groupedMessages.push({
          type: 'whisper-group',
          messages: whispers,
          id: whispers[0].id + '-group'
        });
      } else {
        whispers.forEach(w => {
          groupedMessages.push({
            type: 'single',
            messages: [w],
            id: w.id
          });
        });
      }
      i = j - 1;
    } else {
      groupedMessages.push({
        type: 'single',
        messages: [msg],
        id: msg.id
      });
    }
  }

  return (
    <div className="chat-container">
      {/* Search Bar */}
      <div className="chat-history-search-bar">
        <Search size={11} className="chat-history-search-btn" onClick={() => setSearchOpen(!searchOpen)} />
        {searchOpen ? (
          <div className="flex items-center flex-1 gap-2">
            <input 
              type="text" 
              className="chat-history-search-input"
              placeholder="Search conversation history..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <X size={11} className="cursor-pointer opacity-60 hover:opacity-100" onClick={() => setSearchQuery("")} />
            )}
          </div>
        ) : (
          <span style={{ fontFamily: "'Share Tech Mono', monospace", fontSize: '10px', opacity: 0.3 }}>
            // COGNITIVE_LOGS_ACTIVE
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages-viewport" ref={viewportRef}>
        {groupedMessages.map(group => {
          if (group.type === 'whisper-group') {
            return (
              <WhisperGroupBlock
                key={group.id}
                messages={group.messages}
                onUpdateMessage={onUpdateMessage}
              />
            );
          }
          const msg = group.messages[0];
          if (msg.role === "whisper" || msg.role === "moderator-whisper" || msg.role === "agent-whisper" || msg.role === "athena-whisper") {
            return <MemoizedWhisperBlock key={msg.id} message={msg} onUpdateMessage={onUpdateMessage} />;
          }
          return (
            <MemoizedMessageItem 
              key={msg.id} 
              msg={msg} 
              sessionTitle={sessionTitle} 
              onDeleteMessage={onDeleteMessage} 
              onEditMessage={onEditMessage}
              onUpdateMessage={onUpdateMessage}
              onRecoverRun={onRecoverRun}
              onRetryFailedRequest={onRetryFailedRequest}
            />
          );
        })}
        {isLoading && (
          <div className="processing-indicator-container">
            {Object.keys(streamingAgents).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                {Object.entries(streamingAgents).map(([agentName, agentData]) => (
                  <AgentActivityCard
                    key={agentName}
                    agentName={agentName}
                    agentData={agentData}
                  />
                ))}
              </div>
            ) : (
              <div className="processing-bubble">
                <span className="processing-text">
                  // SWARM_PROCESSING: [{statusText}]
                </span>
                <div className="typing-dots">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input panel */}
      <div className="chat-input-panel">
        {/* Direct Routing Selectors */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="agent-selectors-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span className="agent-selector-label">Target Agent:</span>
            <span
              className={`agent-selector-pill ${selectedAgent === "ALL" ? 'active' : ''}`}
              onClick={() => setSelectedAgent("ALL")}
            >
              ⚛ SWARM
            </span>
            <span
              className={`agent-selector-pill ${selectedAgent === "ATHENA" ? 'active' : ''}`}
              onClick={() => setSelectedAgent("ATHENA")}
            >
              @athena
            </span>
            {agents.map(agent => {
              const agentNameNormalized = agent.name.toLowerCase().replace(/\s+/g, '-');
              const isActive = selectedAgent === agentNameNormalized.toUpperCase();
              return (
                <span
                  key={agent.id}
                  className={`agent-selector-pill ${isActive ? 'active' : ''}`}
                  onClick={() => setSelectedAgent(agentNameNormalized.toUpperCase())}
                >
                  @{agentNameNormalized}
                </span>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span className="agent-selector-label">Deep Search:</span>
            <button
              onClick={() => onToggleDeepSearch?.(!allowDeepSearch)}
              className={`agent-selector-pill ${allowDeepSearch ? 'active' : ''}`}
              title="Toggle session-wide Deep Search"
            >
              {allowDeepSearch ? "🔍 ON" : "🔍 OFF"}
            </button>
          </div>
        </div>

        {/* Quick Action Chips Bar */}
        <div className="quick-action-chips-row">
          <span className="text-[9px] font-mono opacity-50 uppercase tracking-wider self-center mr-1">⚡ Quick Actions:</span>
          <button type="button" onClick={() => onSend("@athena Answer concisely with direct facts.")} className="quick-chip">⚡ Direct Answer</button>
          <button type="button" onClick={() => onSend("Analyze this topic thoroughly across architecture, engineering, and security implications.")} className="quick-chip">🧠 Swarm Analysis</button>
          <button type="button" onClick={() => onSend("Provide a complete Mermaid diagram visualizing the system workflow.")} className="quick-chip">📊 Architecture Map</button>
          <button type="button" onClick={() => onSummarize ? onSummarize() : onSend("/summarize")} className="quick-chip">📝 Executive Debrief</button>
          <button type="button" onClick={() => onSend("@security Perform a comprehensive security and vulnerability audit.")} className="quick-chip">🛡️ Security Audit</button>
          <button type="button" onClick={() => onSend("@engineer Propose an optimized code refactoring plan.")} className="quick-chip">🛠️ Code Refactor</button>
        </div>

        {/* Attachment badges */}
        {sessionFiles.length > 0 && (
          <div className="attachment-badges-row">
            {sessionFiles.map((att, idx) => {
              const loading = att.loading;
              return (
                <div key={idx} className="draft-attachment-wrapper">
                  <div className="attachment-badge">
                    <FileText size={10} />
                    <span>{att.name}</span>
                    {loading ? (
                      <span className="draft-attachment-loading-hint"> (summarizing...)</span>
                    ) : att.summary && (
                      <details className="draft-attachment-details">
                        <summary className="draft-attachment-summary-btn">view summary</summary>
                        <div className="draft-attachment-summary-box">
                          {att.summary}
                        </div>
                      </details>
                    )}
                    <button
                      type="button"
                      className="attachment-remove-btn"
                      onClick={() => onDeleteSessionFile?.(att.name)}
                      title="Remove file"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="chat-input-control-box">
          {/* Hidden File Input */}
          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files) {
                handleFiles(e.target.files);
              }
              e.target.value = "";
            }}
            style={{ display: "none" }}
          />

          {/* Attach Button */}
          <button
            onClick={triggerFileInput}
            className="chat-attach-button"
            title="Attach documents"
            type="button"
          >
            <Paperclip size={13} />
          </button>

          {/* Slash Suggestion Overlay */}
          {slashSuggestions.length > 0 && (
            <div className="slash-suggestions-panel">
              {slashSuggestions.map((sug, idx) => (
                <div 
                  key={sug.name} 
                  className={`suggestion-item ${selectedSugIdx === idx ? 'selected' : ''}`}
                  onClick={() => {
                    const words = input.split(/\s+/);
                    words.pop();
                    setInput([...words, sug.name].join(" ") + " ");
                    setSlashSuggestions([]);
                    textareaRef.current?.focus();
                  }}
                >
                  <span className="cmd-name">{sug.name}</span>
                  <span className="cmd-desc">{sug.desc}</span>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            rows={3}
            placeholder={isLoading ? "transmit additional intel to swarm..." : "transmit message (press '/' for slash commands)..."}
            className={`chat-input-textarea ${isDragOver ? 'dragover' : ''}`}
          />
          <button
            onClick={toggleVoiceInput}
            className={`chat-voice-button ${isListening ? "listening" : ""} ${isTranscribing ? "transcribing" : ""}`}
            title={isTranscribing ? "Transcribing locally" : isListening ? "Stop and transcribe" : "Start voice input"}
            aria-label={isTranscribing ? "Transcribing voice input" : isListening ? "Stop voice input" : "Start voice input"}
            disabled={isTranscribing}
            type="button"
          >
            {isTranscribing ? <RefreshCw size={13} className="animate-spin" /> : isListening ? <MicOff size={13} /> : <Mic size={13} />}
          </button>
          <button
            onClick={handleSendMsg}
            disabled={!input.trim() || isListening || isTranscribing}
            className="chat-send-button"
          >
            <Send size={13} />
          </button>
        </div>
        <div className="chat-input-footer-row">
          <span>enter to send · shift+enter for newline</span>
          {isLoading && <span className="active-state">ACTIVE · {statusText} · new context joins this run</span>}
        </div>
      </div>
    </div>
  );
}
