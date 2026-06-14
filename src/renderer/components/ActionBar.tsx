import { useState } from "react";
import { Plus, Edit2, Settings2, Download } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { SessionModal } from "./SessionModal";
import { validateSessionName, sanitizeSessionName } from "../services/sessionService";

interface ActionBarProps {
  currentChatName: string;
  onCreateChat: (name: string) => void;
  onRenameChat: (name: string) => void;
  onExport?: () => void;
  folders?: Array<{ id: string; name: string }>;
  chats?: Array<{ id: string; name: string }>;
}

export function ActionBar({ currentChatName, onCreateChat, onRenameChat, onExport, folders = [], chats = [] }: ActionBarProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [newChatName, setNewChatName] = useState("");
  const [renameValue, setRenameValue] = useState("");

  function handleCreate() {
    if (validateSessionName(newChatName)) {
      onCreateChat(sanitizeSessionName(newChatName));
      setNewChatName("");
      setCreateOpen(false);
    }
  }

  function handleRename() {
    if (validateSessionName(renameValue)) {
      onRenameChat(sanitizeSessionName(renameValue));
      setRenameValue("");
      setRenameOpen(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--cp-bg-2)",
        borderBottom: "1px solid var(--cp-border)",
      }}
      className="flex items-center gap-2 px-3 h-9 shrink-0"
    >
      {/* create chat */}
      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Trigger asChild>
          <button
            style={{
              background: "var(--cp-bg-3)",
              border: "1px solid var(--cp-cyan)",
              color: "var(--cp-cyan)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
            className="flex items-center gap-1 px-2 py-0.5 text-xs hover:brightness-125 transition-all"
          >
          <Plus size={11} />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{ background: "rgba(8,11,18,0.8)", backdropFilter: "blur(4px)" }}
            className="fixed inset-0 z-50"
          />
          <Dialog.Content
            style={{
              background: "var(--cp-bg-2)",
              border: "1px solid var(--cp-cyan)",
              boxShadow: "var(--cp-glow-cyan), 0 20px 60px rgba(0,0,0,0.8)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 p-5"
          >
            <Dialog.Title
              style={{ color: "var(--cp-cyan)", fontFamily: "'Orbitron', monospace" }}
              className="text-xs font-bold uppercase tracking-widest mb-2"
            >
              // initialize chat session
            </Dialog.Title>
            <Dialog.Description
              style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }}
              className="text-xs opacity-50 mb-4"
            >
              Create a new chat session
            </Dialog.Description>
            <label style={{ color: "var(--cp-cyan)", opacity: 0.6 }} className="text-xs block mb-1">
              session_name:
            </label>
            <input
              autoFocus
              value={newChatName}
              onChange={e => setNewChatName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="enter session name..."
              style={{
                background: "var(--cp-bg-3)",
                border: "1px solid rgba(0,229,255,0.3)",
                color: "var(--cp-cyan)",
                fontFamily: "'Share Tech Mono', monospace",
                outline: "none",
              }}
              className="w-full px-3 py-2 text-xs mb-4 focus:border-[var(--cp-cyan)]"
            />
            <div className="flex gap-2 justify-end">
              <Dialog.Close asChild>
                <button
                  style={{
                    border: "1px solid rgba(0,229,255,0.2)",
                    color: "var(--cp-muted-foreground)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="px-3 py-1 text-xs text-[var(--muted-foreground)] hover:opacity-70 transition-opacity"
                >
                  abort
                </button>
              </Dialog.Close>
              <button
                onClick={handleCreate}
                style={{
                  background: "var(--cp-cyan)",
                  color: "#080b12",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
                className="px-3 py-1 text-xs font-bold hover:brightness-110 transition-all"
              >
                execute
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* session config button */}
      <button
        onClick={() => setSessionModalOpen(true)}
        style={{
          background: "var(--cp-bg-3)",
          border: "1px solid rgba(0,229,255,0.3)",
          color: "var(--cp-cyan)",
        }}
        className="flex items-center gap-1 px-2 py-0.5 text-xs hover:border-[var(--cp-cyan)] transition-all"
        title="Session Configuration"
      >
        <Settings2 size={11} />
      </button>

      {/* export button */}
      <button
        onClick={onExport}
        style={{
          background: "var(--cp-bg-3)",
          border: "1px solid rgba(0,229,255,0.3)",
          color: "var(--cp-cyan)",
        }}
        className="flex items-center gap-1 px-2 py-0.5 text-xs hover:border-[var(--cp-cyan)] transition-all"
        title="Export Session as HTML"
      >
        <Download size={11} />
      </button>

      {/* divider */}
      <div style={{ width: 1, background: "var(--cp-border)", height: 16 }} />

      {/* current chat name — click to rename */}
      <Dialog.Root open={renameOpen} onOpenChange={open => { setRenameOpen(open); if (open) setRenameValue(currentChatName); }}>
        <Dialog.Trigger asChild>
          <button
            style={{
              color: "var(--foreground)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
            className="flex items-center gap-1.5 text-xs opacity-80 hover:opacity-100 transition-opacity group"
          >
            <span>{currentChatName}</span>
            <Edit2 size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{ background: "rgba(8,11,18,0.8)", backdropFilter: "blur(4px)" }}
            className="fixed inset-0 z-50"
          />
          <Dialog.Content
            style={{
              background: "var(--cp-bg-2)",
              border: "1px solid var(--cp-magenta)",
              boxShadow: "var(--cp-glow-magenta), 0 20px 60px rgba(0,0,0,0.8)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 p-5"
          >
            <Dialog.Title
              style={{ color: "var(--cp-magenta)", fontFamily: "'Orbitron', monospace" }}
              className="text-xs font-bold uppercase tracking-widest mb-2"
            >
              // rename session
            </Dialog.Title>
            <Dialog.Description
              style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }}
              className="text-xs opacity-50 mb-4"
            >
              Change the current session name
            </Dialog.Description>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => e.key === "Enter" && handleRename()}
              style={{
                background: "var(--cp-bg-3)",
                border: "1px solid rgba(255,0,170,0.3)",
                color: "var(--cp-magenta)",
                fontFamily: "'Share Tech Mono', monospace",
                outline: "none",
              }}
              className="w-full px-3 py-2 text-xs mb-4"
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <SessionModal
        open={sessionModalOpen}
        onClose={() => setSessionModalOpen(false)}
        sessionName={currentChatName}
        folders={folders}
        availableChats={chats}
      />
    </div>
  );
}
