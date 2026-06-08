import { useState } from "react";
import {
  MessageSquare, Settings, User, ChevronRight, ChevronDown,
  Folder, FolderOpen, Plus, Trash2, GripVertical, PanelLeftClose, LogOut, UserCog, X,
} from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "motion/react";
import { ProfileModal } from "./ProfileModal";
import { SettingsModal } from "./SettingsModal";

export interface ChatItem {
  id: string;
  name: string;
  folderId: string | null;
}

export interface FolderItem {
  id: string;
  name: string;
}

interface LeftSidebarProps {
  chats: ChatItem[];
  folders: FolderItem[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onMoveToFolder: (chatId: string, folderId: string | null) => void;
  onDeleteChat: (id: string) => void;
  onAddFolder: () => void;
  onDeleteFolder: (id: string) => void;
  onRenameFolder: (id: string, newName: string) => void;
  onSettingsChanged?: () => void;
  onLogout?: () => void;
}

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
              borderLeft: isActive ? "2px solid var(--cp-cyan)" : "2px solid transparent",
            }}
            className="w-10 h-10 flex items-center justify-center hover:opacity-100 transition-all"
          >
            {icon}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
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

export function LeftSidebar({
  chats,
  folders,
  activeChatId,
  onSelectChat,
  onMoveToFolder,
  onDeleteChat,
  onAddFolder,
  onDeleteFolder,
  onRenameFolder,
  onSettingsChanged,
  onLogout,
}: LeftSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [draggedChat, setDraggedChat] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [sessionPanelOpen, setSessionPanelOpen] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");

  function handleRenameSubmit() {
    if (renameFolderId && renameFolderName.trim()) {
      onRenameFolder(renameFolderId, renameFolderName.trim());
      setRenameFolderId(null);
    }
  }

  function toggleFolder(id: string) {
    setExpandedFolders(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  const rootChats = chats.filter(c => c.folderId === null);

  return (
    <aside
      style={{
        background: "var(--cp-bg-1)",
        borderRight: "1px solid var(--cp-border)",
        display: "flex",
        flexDirection: "row",
      }}
      className="h-full shrink-0"
    >
      {/* icon rail */}
      <div
        style={{ borderRight: "1px solid var(--cp-border)", width: 40 }}
        className="flex flex-col justify-between py-2"
      >
        <div className="flex flex-col items-center">
          <NavIcon
            icon={<MessageSquare size={16} />}
            label={sessionPanelOpen ? "collapse sessions" : "expand sessions"}
            onClick={() => setSessionPanelOpen(v => !v)}
            isActive={sessionPanelOpen}
          />
        </div>
        <div className="flex flex-col items-center">
          <NavIcon
            icon={<Settings size={16} />}
            label="settings"
            onClick={() => setSettingsModalOpen(true)}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                style={{
                  color: "var(--cp-cyan)",
                  opacity: 0.45,
                }}
                className="w-10 h-10 flex items-center justify-center hover:opacity-100 transition-all"
              >
                <User size={16} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="right"
                align="end"
                style={{
                  background: "var(--cp-bg-3)",
                  border: "1px solid var(--cp-border)",
                  boxShadow: "0 0 10px rgba(0,229,255,0.15)",
                }}
                className="min-w-[140px] z-50"
              >
                <DropdownMenu.Item
                  onClick={() => setProfileModalOpen(true)}
                  style={{
                    color: "var(--foreground)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="px-3 py-2 text-xs cursor-pointer hover:bg-[rgba(0,229,255,0.08)] outline-none flex items-center gap-2"
                >
                  <UserCog size={12} style={{ color: "var(--cp-cyan)" }} />
                  Edit Profile
                </DropdownMenu.Item>
                <DropdownMenu.Separator
                  style={{ background: "var(--cp-border)" }}
                  className="h-[1px] my-1"
                />
                <DropdownMenu.Item
                  onClick={onLogout}
                  style={{
                    color: "var(--foreground)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="px-3 py-2 text-xs cursor-pointer hover:bg-[rgba(255,0,170,0.08)] outline-none flex items-center gap-2"
                >
                  <LogOut size={12} style={{ color: "var(--cp-magenta)" }} />
                  Logout
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* chat tree — animated collapse */}
      <AnimatePresence initial={false}>
        {sessionPanelOpen && (
          <motion.div
            key="session-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 200, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            style={{ overflow: "hidden", flexShrink: 0 }}
          >
      <div style={{ width: 200 }} className="flex flex-col overflow-hidden h-full">
        {/* tree header */}
        <div
          style={{
            borderBottom: "1px solid var(--cp-border)",
            color: "var(--cp-cyan)",
            fontFamily: "'Share Tech Mono', monospace",
          }}
          className="flex items-center justify-between px-2 py-1.5"
        >
          <span className="text-xs opacity-50 uppercase tracking-widest">sessions</span>
          <button
            onClick={onAddFolder}
            style={{ color: "var(--cp-cyan)" }}
            className="opacity-40 hover:opacity-100 transition-opacity"
          >
            <Plus size={11} />
          </button>
        </div>

        {/* tree content */}
        <div className="flex-1 overflow-y-auto py-1">
          {/* loose chats (no folder) */}
          {rootChats.map(chat => (
            <ChatRow
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeChatId}
              isDragging={draggedChat === chat.id}
              onSelect={() => onSelectChat(chat.id)}
              onDelete={() => onDeleteChat(chat.id)}
              onDragStart={(e) => setDraggedChat(chat.id)}
              onDragEnd={(e) => { setDraggedChat(null); setDragOverFolder(null); }}
            />
          ))}

          {/* folders */}
          {folders.map(folder => {
            const folderChats = chats.filter(c => c.folderId === folder.id);
            const isExpanded = expandedFolders.has(folder.id);
            const isDragTarget = dragOverFolder === folder.id;
            const isEmpty = folderChats.length === 0;

            return (
              <div
                key={folder.id}
                className="group/folder"
                onDragOver={e => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverFolder !== folder.id) {
                    setDragOverFolder(folder.id);
                  }
                }}
                onDragLeave={e => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (
                    e.clientX < rect.left ||
                    e.clientX >= rect.right ||
                    e.clientY < rect.top ||
                    e.clientY >= rect.bottom
                  ) {
                    setDragOverFolder(null);
                  }
                }}
                onDrop={e => {
                  e.preventDefault();
                  if (draggedChat) onMoveToFolder(draggedChat, folder.id);
                  setDragOverFolder(null);
                }}
              >
                <div
                  style={{
                    background: isDragTarget ? "rgba(0,229,255,0.12)" : undefined,
                    border: isDragTarget ? "1px solid var(--cp-cyan)" : "1px solid transparent",
                    boxShadow: isDragTarget ? "0 0 8px rgba(0,229,255,0.2)" : undefined,
                    color: "var(--cp-cyan)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-[rgba(0,229,255,0.04)] transition-colors"
                  onClick={() => toggleFolder(folder.id)}
                >
                  <span className="opacity-40 text-xs">
                    {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </span>
                  <span className="opacity-60">
                    {isExpanded ? <FolderOpen size={11} /> : <Folder size={11} />}
                  </span>
                  <span
                    className="text-xs opacity-70 truncate flex-1"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenameFolderId(folder.id);
                      setRenameFolderName(folder.name);
                    }}
                  >
                    {folder.name}
                  </span>
                  <span className="text-xs opacity-30">{folderChats.length}</span>
                  {isEmpty && (
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteFolder(folder.id); }}
                      className="opacity-0 group-hover/folder:opacity-30 hover:!opacity-80 transition-opacity shrink-0"
                      style={{ color: "var(--cp-magenta)" }}
                    >
                      <Trash2 size={9} />
                    </button>
                  )}
                </div>

                {isExpanded && folderChats.map(chat => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === activeChatId}
                    isDragging={draggedChat === chat.id}
                    indent
                    onSelect={() => onSelectChat(chat.id)}
                    onDelete={() => onDeleteChat(chat.id)}
                    onDragStart={(e) => setDraggedChat(chat.id)}
                    onDragEnd={(e) => { setDraggedChat(null); setDragOverFolder(null); }}
                  />
                ))}
              </div>
            );
          })}

          {/* drop zone to remove from folder */}
          {draggedChat && chats.find(c => c.id === draggedChat)?.folderId && (
            <div
              style={{
                border: dragOverFolder === "__root__" ? "1px dashed var(--cp-magenta)" : "1px dashed rgba(255,0,170,0.3)",
                color: "var(--cp-magenta)",
                fontFamily: "'Share Tech Mono', monospace",
                background: dragOverFolder === "__root__" ? "rgba(255,0,170,0.15)" : undefined,
                boxShadow: dragOverFolder === "__root__" ? "0 0 8px rgba(255,0,170,0.2)" : undefined,
                opacity: dragOverFolder === "__root__" ? 1 : 0.5,
              }}
              className="mx-2 my-1 px-2 py-1 text-xs text-center transition-all"
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverFolder("__root__");
              }}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={e => {
                e.preventDefault();
                if (draggedChat) onMoveToFolder(draggedChat, null);
                setDragOverFolder(null);
              }}
            >
              drop here to ungroup
            </div>
          )}
        </div>
      </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ProfileModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} onProfileChanged={onSettingsChanged} />
      <SettingsModal open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} onSettingsChanged={onSettingsChanged} />
      
      <Dialog.Root open={renameFolderId !== null} onOpenChange={(open) => !open && setRenameFolderId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{ background: "rgba(0, 0, 0, 0.7)" }}
            className="fixed inset-0 z-[100]"
          />
          <Dialog.Content
            style={{
              background: "var(--cp-bg-2)",
              border: "1px solid var(--cp-border)",
              boxShadow: "0 0 20px rgba(0, 229, 255, 0.2)",
            }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-sm p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title
                style={{
                  color: "var(--cp-cyan)",
                  fontFamily: "'Orbitron', sans-serif",
                }}
                className="text-md font-medium"
              >
                Rename Folder
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  style={{ color: "var(--cp-cyan)" }}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <div className="space-y-4">
              <div>
                <label
                  style={{
                    color: "var(--cp-cyan)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="block text-xs mb-2 opacity-70"
                >
                  New Folder Name
                </label>
                <input
                  type="text"
                  value={renameFolderName}
                  onChange={e => setRenameFolderName(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      handleRenameSubmit();
                    }
                  }}
                  style={{
                    background: "var(--cp-bg-3)",
                    border: "1px solid var(--cp-border)",
                    color: "var(--foreground)",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                  className="w-full px-3 py-2 text-sm focus:outline-none focus:border-[var(--cp-cyan)]"
                  autoFocus
                />
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
}

function ChatRow({
  chat,
  isActive,
  isDragging,
  indent,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  chat: ChatItem;
  isActive: boolean;
  isDragging: boolean;
  indent?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", chat.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(e);
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      style={{
        paddingLeft: indent ? 28 : 12,
        background: isActive
          ? "rgba(0,229,255,0.1)"
          : undefined,
        borderLeft: isActive ? "2px solid var(--cp-cyan)" : "2px solid transparent",
        opacity: isDragging ? 0.4 : 1,
        fontFamily: "'Share Tech Mono', monospace",
        color: isActive ? "var(--cp-cyan)" : "var(--foreground)",
      }}
      className="flex items-center gap-1.5 pr-2 py-1 cursor-grab active:cursor-grabbing hover:bg-[rgba(0,229,255,0.05)] group transition-colors"
    >
      <GripVertical size={9} className="opacity-30 group-hover:opacity-85 transition-opacity shrink-0" />
      <MessageSquare size={10} className="shrink-0 opacity-50" />
      <span className="text-xs truncate flex-1 opacity-80">{chat.name}</span>
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-30 hover:!opacity-80 transition-opacity shrink-0"
        style={{ color: "var(--cp-magenta)" }}
      >
        <Trash2 size={9} />
      </button>
    </div>
  );
}
