import { useState, useRef, useEffect, memo } from "react";
import { Send, Bot, User, Info, FileDown, Trash2, Copy, FileText, Shield, Code, Layout, Settings, AlertTriangle, Cpu, Terminal, ShieldAlert } from "lucide-react";
import { ChatMarkdown } from './ChatMarkdown'

export interface Message {
  id: string;
  role: 'user' | 'moderator' | 'engineer' | 'architect' | 'security' | 'system' | 'error' | 'internal' | 'ai' | 'whisper' | 'moderator-whisper' | 'agent-whisper';
  content: string;
  from?: string;
  to?: string;
  agent?: string;
  provider?: string;
  model?: string;
  timestamp: Date | number;
}

interface ChatAreaProps {
  messages: Message[];
  sessionTitle: string;
  onSend: (text: string) => void;
  onDeleteMessage?: (id: string) => void;
  isLoading?: boolean;
}

const getRoleIcon = (role: Message['role']) => {
  switch (role) {
    case 'user': return <User size={13} style={{ color: "rgba(120,180,255,0.8)" }} />;
    case 'moderator': return <Shield size={13} style={{ color: "var(--cp-green)" }} />;
    case 'engineer': return <Code size={13} style={{ color: "var(--muted-foreground)" }} />;
    case 'architect': return <Layout size={13} style={{ color: "var(--muted-foreground)" }} />;
    case 'security': return <Shield size={13} style={{ color: "var(--muted-foreground)" }} />;
    case 'system': return <Settings size={13} style={{ color: "var(--cp-purple)" }} />;
    case 'error': return <AlertTriangle size={13} style={{ color: "var(--cp-magenta)" }} />;
    case 'internal': return <Terminal size={13} style={{ color: "var(--cp-cyan)" }} />;
    default: return <Bot size={13} style={{ color: "var(--muted-foreground)" }} />;
  }
}

const getRoleColor = (role: Message['role']) => {
  switch (role) {
    case 'user': return "rgba(60,120,255,0.6)";
    case 'moderator': return "var(--cp-green)";
    case 'engineer': 
    case 'architect': 
    case 'security': 
    case 'ai':
      return "var(--muted-foreground)";
    case 'internal': return "var(--cp-cyan)";
    default: return "rgba(0,229,255,0.6)";
  }
}

const getBgColor = (role: Message['role']) => {
  switch (role) {
    case 'user': return "rgba(60,120,255,0.12)";
    case 'moderator': return "rgba(0,255,136,0.05)";
    case 'engineer':
    case 'architect':
    case 'security':
    case 'ai':
      return "rgba(255,255,255,0.03)";
    default: return "var(--cp-bg-2)";
  }
}

const getBorderColor = (role: Message['role']) => {
  switch (role) {
    case 'user': return "rgba(60,120,255,0.25)";
    case 'moderator': return "rgba(0,255,136,0.2)";
    case 'engineer':
    case 'architect':
    case 'security':
    case 'ai':
      return "rgba(255,255,255,0.1)";
    default: return "rgba(0,229,255,0.12)";
  }
}

function MessageActions({ messageId, content, sessionTitle, onDelete }: { messageId: string; content: string; sessionTitle: string; onDelete?: (id: string) => void }) {
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

  function handleDownloadPDF() {
    const normalizedTitle = (sessionTitle || 'Quorum_Report')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Basic implementation using window.print() on a temporary frame for PDF generation
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
            <h1>Savant Quorum - Fact Report</h1>
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
    <div
      style={{
        background: "var(--cp-bg-3)",
        border: "1px solid var(--cp-border)",
      }}
      className="flex items-center gap-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <button
        onClick={handleCopy}
        title="Copy"
        style={{ color: "var(--cp-cyan)" }}
        className="p-1 hover:bg-[rgba(0,229,255,0.1)] transition-colors"
      >
        <Copy size={11} />
      </button>
      <button
        onClick={handleDownloadMarkdown}
        title="Download as Markdown"
        style={{ color: "var(--cp-cyan)" }}
        className="p-1 hover:bg-[rgba(0,229,255,0.1)] transition-colors"
      >
        <FileText size={11} />
      </button>
      <button
        onClick={handleDownloadPDF}
        title="Download as PDF"
        style={{ color: "var(--cp-cyan)" }}
        className="p-1 hover:bg-[rgba(0,229,255,0.1)] transition-colors"
      >
        <FileDown size={11} />
      </button>
      <button
        onClick={() => onDelete?.(messageId)}
        title="Delete"
        style={{ color: "var(--cp-magenta)" }}
        className="p-1 hover:bg-[rgba(255,0,170,0.1)] transition-colors"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

const MemoizedWhisperBlock = memo(({ message }: { message: Message }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isModerator = message.role === "moderator-whisper";
  const isAgent = message.role === "agent-whisper";
  
  const accentColor = isModerator ? "rgba(180,100,255" : isAgent ? "rgba(0,229,255" : "rgba(255,230,0";
  const label = isModerator ? message.to : isAgent ? message.from : "";
  const prefix = isModerator ? "→ " : isAgent ? "from " : "";

  return (
    <div className="flex items-center justify-center gap-2 my-1">
      <div
        style={{
          border: `1px dashed ${accentColor},0.35)`,
          background: `${accentColor},0.05)`,
          maxWidth: "75%",
          minWidth: "40%",
        }}
        className="flex flex-col gap-1 px-3 py-2 cursor-pointer transition-all hover:bg-opacity-10"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert size={12} style={{ color: `${accentColor},0.8)` }} className="shrink-0" />
          <span style={{ color: `${accentColor},0.6)`, fontFamily: "'Share Tech Mono', monospace" }} className="text-xs uppercase tracking-wider flex-1">
            {message.role.replace('-', ' ')} {label && <span className="opacity-50 ml-1">{prefix}{label}</span>}
            {message.provider && message.model && (
              <span style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(255,255,255,0.1)', 
                borderRadius: '4px',
                padding: '1px 4px',
                marginLeft: '6px',
                fontSize: '0.85em',
                opacity: 0.8,
                textTransform: 'none'
              }}>
                &lt;{message.provider}:{message.model}&gt;
              </span>
            )}
          </span>
          <span style={{ color: `${accentColor},0.4)`, fontFamily: "'Share Tech Mono', monospace" }} className="text-[10px]">
            {isExpanded ? "collapse" : "expand"}
          </span>
        </div>
        
        {isExpanded && (
          <div
            style={{
              color: `${accentColor},0.7)`,
              fontFamily: "'Rajdhani', sans-serif",
              borderTop: `1px dashed ${accentColor},0.15)`,
              marginTop: "4px",
              paddingTop: "8px"
            }}
            className="text-sm leading-relaxed markdown-content whisper-markdown"
            onClick={(e) => e.stopPropagation()}
          >
            <ChatMarkdown content={message.content} variant="whisper" />
          </div>
        )}
      </div>
    </div>
  );
});

const MemoizedMessageItem = memo(({ msg, sessionTitle, onDeleteMessage }: { msg: Message, sessionTitle: string, onDeleteMessage?: (id: string) => void }) => {
  const isUser = msg.role === 'user';
  const timestamp = typeof msg.timestamp === 'number' ? new Date(msg.timestamp) : msg.timestamp;

  return (
    <div className={`flex items-start gap-2 group ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div
          style={{
            background: msg.role === 'moderator' ? "rgba(0,255,136,0.08)" : "rgba(255,255,255,0.05)",
            border: msg.role === 'moderator' ? "1px solid rgba(0,255,136,0.15)" : "1px solid rgba(255,255,255,0.1)",
            boxShadow: "inset 0 0 12px rgba(255,255,255,0.02)",
            width: 26,
            height: 26,
            flexShrink: 0,
          }}
          className="flex items-center justify-center mt-0.5"
        >
          {getRoleIcon(msg.role)}
        </div>
      )}
      <div style={{ maxWidth: "85%" }}>
        <div
          style={{
            color: getRoleColor(msg.role),
            fontFamily: "'Share Tech Mono', monospace",
          }}
          className={`text-xs mb-1 opacity-50 flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-between'}`}
        >
          {!isUser && (
            <span className="flex items-center gap-2">
              {msg.role.toUpperCase()}
              {msg.provider && msg.model && (
                <span style={{ 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: '4px',
                  padding: '1px 4px',
                  fontSize: '0.85em',
                  opacity: 0.8,
                  textTransform: 'none'
                }}>
                  &lt;{msg.provider}:{msg.model}&gt;
                </span>
              )}
              <span className="opacity-40">
                {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </span>
          )}
          {isUser && (
            <span className="opacity-40 mr-2">
              {timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          {isUser && "YOU"}
          <MessageActions messageId={msg.id} content={msg.content} sessionTitle={sessionTitle} onDelete={onDeleteMessage} />
        </div>
        <div
          style={{
            background: getBgColor(msg.role),
            border: `1px solid ${getBorderColor(msg.role)}`,
            color: isUser ? "rgba(180,210,255,0.9)" : "var(--foreground)",
            fontFamily: "'Rajdhani', sans-serif",
            lineHeight: 1.6,
          }}
          className="px-3 py-2 text-sm markdown-content"
        >
          <ChatMarkdown content={msg.content} />
        </div>
      </div>
      {isUser && (
        <div
          style={{
            background: "rgba(60,120,255,0.15)",
            border: "1px solid rgba(60,120,255,0.3)",
            width: 26,
            height: 26,
            flexShrink: 0,
          }}
          className="flex items-center justify-center mt-0.5"
        >
          <User size={13} style={{ color: "rgba(120,180,255,0.8)" }} />
        </div>
      )}
    </div>
  );
});

export function ChatArea({ messages, sessionTitle, onSend, onDeleteMessage, isLoading }: ChatAreaProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput("");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* messages */}
      <div
        className="flex-1 overflow-y-auto py-4 px-4 space-y-4"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(0,229,255,0.1) transparent" }}
      >
        {messages.filter(m => m.role !== 'system' && m.role !== 'internal').map(msg => {
          if (msg.role === "whisper" || msg.role === "moderator-whisper" || msg.role === "agent-whisper") {
            return <MemoizedWhisperBlock key={msg.id} message={msg} />;
          }
          return <MemoizedMessageItem key={msg.id} msg={msg} sessionTitle={sessionTitle} onDeleteMessage={onDeleteMessage} />;
        })}
        <div ref={bottomRef} />
      </div>


      {/* input bar */}
      <div
        style={{
          background: "var(--cp-bg-2)",
          borderTop: "1px solid var(--cp-border)",
        }}
        className="shrink-0 p-3"
      >
        <div
          style={{
            background: "var(--cp-bg-3)",
            border: "1px solid rgba(0,229,255,0.2)",
          }}
          className="flex items-end gap-2 p-2"
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={3}
            placeholder={isLoading ? "transmit additional intel to swarm..." : "transmit message..."}
            style={{
              background: "transparent",
              color: "var(--foreground)",
              fontFamily: "'Share Tech Mono', monospace",
              resize: "none",
              outline: "none",
              border: "none",
              minHeight: "4.5rem",
              maxHeight: "12rem",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(0,229,255,0.1) transparent"
            }}
            className="flex-1 text-xs placeholder:opacity-30 overflow-y-auto"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            style={{
              background: input.trim() ? "var(--cp-cyan)" : "var(--cp-bg-3)",
              color: input.trim() ? "#080b12" : "rgba(0,229,255,0.3)",
              border: "1px solid rgba(0,229,255,0.2)",
              transition: "all 0.15s",
            }}
            className="p-1.5 shrink-0"
          >
            <Send size={13} />
          </button>
        </div>
        <div
          style={{ color: "var(--cp-cyan)", fontFamily: "'Share Tech Mono', monospace" }}
          className="text-xs opacity-20 mt-1 px-1 flex justify-between"
        >
          <span>enter to send · shift+enter for newline</span>
          {isLoading && <span className="animate-pulse">SYSTEM_BUSY</span>}
        </div>
      </div>
    </div>
  );
}
