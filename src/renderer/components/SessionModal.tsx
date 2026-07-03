import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { validateSessionName, sanitizeSessionName } from "../services/sessionService";

interface SessionModalProps {
  open: boolean;
  onClose: () => void;
  sessionName?: string;
  folders?: Array<{ id: string; name: string }>;
  availableChats?: Array<{ id: string; name: string }>;
}

export function SessionModal({
  open,
  onClose,
  sessionName = "New Session",
  folders = [],
  availableChats = [],
}: SessionModalProps) {
  const [name, setName] = useState(sessionName);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChats, setSelectedChats] = useState<Array<{ id: string; name: string }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredChats = availableChats.filter(
    chat =>
      chat.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !selectedChats.some(sc => sc.id === chat.id)
  );

  function addChat(chat: { id: string; name: string }) {
    setSelectedChats(prev => [...prev, chat]);
    setSearchQuery("");
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function removeChat(chatId: string) {
    setSelectedChats(prev => prev.filter(c => c.id !== chatId));
  }

  function handleSave() {
    if (validateSessionName(name)) {
      onClose();
    }
  }

  useEffect(() => {
    if (open) {
      setName(sessionName);
    }
  }, [open, sessionName]);

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{ background: "var(--background)", opacity: 0.9 }}
          className="fixed inset-0 z-[100]"
        />
        <Dialog.Content
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "none",
          }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-2xl max-h-[85vh] flex flex-col"
        >
          {/* header */}
          <div
            style={{ borderBottom: "1px solid var(--border)" }}
            className="flex items-center justify-between p-6 shrink-0"
          >
            <div>
              <Dialog.Title
                style={{
                  color: "var(--primary)",
                  fontFamily: "'Orbitron', sans-serif",
                }}
                className="text-lg font-medium"
              >
                Session Configuration
              </Dialog.Title>
              <Dialog.Description
                style={{
                  color: "var(--foreground)",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
                className="text-xs opacity-50 mt-1"
              >
                Configure session name, folder, and reference chats
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                style={{ color: "var(--primary)" }}
                className="opacity-60 hover:opacity-100 transition-opacity"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* content */}
          <div
            className="flex-1 overflow-y-auto p-6 space-y-5"
            style={{ scrollbarWidth: "thin", scrollbarColor: "var(--primary) transparent" }}
          >
            {/* session name */}
            <div>
              <label
                style={{
                  color: "var(--primary)",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
                className="block text-xs mb-2 opacity-70"
              >
                Session Name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                }}
                onBlur={() => {
                  if (validateSessionName(name)) {
                    setName(sanitizeSessionName(name));
                  }
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    handleSave();
                  }
                }}
                style={{
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
                className="w-full px-3 py-2 text-sm focus:outline-none focus:border-[var(--primary)]"
              />
            </div>

            {/* folder selection */}
            <div>
              <label
                style={{
                  color: "var(--primary)",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
                className="block text-xs mb-2 opacity-70"
              >
                Folder
              </label>
              <select
                value={selectedFolder || ""}
                onChange={e => {
                  setSelectedFolder(e.target.value || null);
                  handleSave();
                }}
                style={{
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
                className="w-full px-3 py-2 text-sm focus:outline-none focus:border-[var(--primary)]"
              >
                <option value="">No folder</option>
                {folders.map(folder => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>

            {/* reference chats */}
            <div>
              <label
                style={{
                  color: "var(--primary)",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
                className="block text-xs mb-2 opacity-70"
              >
                Reference Chats
              </label>

              {/* selected chat pills */}
              {selectedChats.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedChats.map(chat => (
                    <div
                      key={chat.id}
                      style={{
                        background: "var(--secondary)",
                        border: "1px solid var(--primary)",
                        color: "var(--primary)",
                        fontFamily: "'Share Tech Mono', monospace",
                      }}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs"
                    >
                      <span>{chat.name}</span>
                      <button
                        onClick={() => removeChat(chat.id)}
                        className="hover:opacity-70 transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* type-ahead input */}
              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Search previous sessions..."
                  style={{
                    background: "var(--secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="w-full px-3 py-2 text-xs focus:outline-none focus:border-[var(--primary)]"
                />

                {/* suggestions dropdown */}
                {showSuggestions && searchQuery && filteredChats.length > 0 && (
                  <div
                    style={{
                      background: "var(--secondary)",
                      border: "1px solid var(--border)",
                      boxShadow: "none",
                    }}
                    className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto z-10"
                  >
                    {filteredChats.slice(0, 8).map(chat => (
                      <button
                        key={chat.id}
                        onClick={() => addChat(chat)}
                        style={{
                          color: "var(--foreground)",
                          fontFamily: "'Share Tech Mono', monospace",
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--secondary)] transition-colors"
                      >
                        {chat.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p
                style={{
                  color: "var(--muted-foreground)",
                  fontFamily: "'Rajdhani', sans-serif",
                }}
                className="text-xs opacity-50 mt-2"
              >
                Link related sessions for context reference
              </p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
