import { useState } from "react";
import {
  MessageSquare, Settings, User, ChevronRight, ChevronDown,
  Folder, FolderOpen, Plus, Trash2, GripVertical, PanelLeftClose, LogOut, UserCog, X,
  Search, Sparkles, FolderSearch, FolderInput, ListChecks,
} from "lucide-react";
import type { SessionGroupingSuggestion } from "../services/sessionService";
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
  hint?: string;
}

interface LeftSidebarProps {
  chats: ChatItem[];
  folders: FolderItem[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onReorderChat: (chatId: string, targetChatId: string, placement: "before" | "after") => void;
  onMoveToFolder: (chatId: string, folderId: string | null) => void;
  onMoveChatsToFolder: (chatIds: string[], folderId: string | null) => void;
  onCreateFolderAndMove: (chatIds: string[], folderName: string) => void;
  onDeleteChat: (id: string) => void;
  onAddFolder: () => void;
  onDeleteFolder: (id: string) => void;
  onRenameFolder: (id: string, newName: string) => void;
  onUpdateFolderHint: (id: string, hint: string) => void;
  onClassifyChat: (id: string) => void;
  onSuggestGrouping: () => Promise<SessionGroupingSuggestion[]>;
  onApplyGrouping: (suggestions: SessionGroupingSuggestion[]) => void;
  onSettingsChanged?: () => void;
  onLogout?: () => void;
  unreadChatIds?: ReadonlySet<string>;
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
              color: "var(--primary)",
              opacity: isActive ? 1 : 0.45,
              borderLeft: isActive ? "2px solid var(--primary)" : "2px solid transparent",
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
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "var(--primary)",
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
  onReorderChat,
  onMoveToFolder,
  onMoveChatsToFolder,
  onCreateFolderAndMove,
  onDeleteChat,
  onAddFolder,
  onDeleteFolder,
  onRenameFolder,
  onUpdateFolderHint,
  onClassifyChat,
  onSuggestGrouping,
  onApplyGrouping,
  onSettingsChanged,
  onLogout,
  unreadChatIds = new Set(),
}: LeftSidebarProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [draggedChat, setDraggedChat] = useState<string | null>(null);
  const [dragOverChat, setDragOverChat] = useState<{ id: string; placement: "before" | "after" } | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [sessionPanelOpen, setSessionPanelOpen] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [hintFolderId, setHintFolderId] = useState<string | null>(null);
  const [folderHint, setFolderHint] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [groupingOpen, setGroupingOpen] = useState(false);
  const [groupingLoading, setGroupingLoading] = useState(false);
  const [groupingSuggestions, setGroupingSuggestions] = useState<SessionGroupingSuggestion[]>([]);
  const [selectedGroupingKeys, setSelectedGroupingKeys] = useState<Set<string>>(new Set());
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [newMoveFolderOpen, setNewMoveFolderOpen] = useState(false);
  const [newMoveFolderName, setNewMoveFolderName] = useState("");

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

  async function openGroupingReview() {
    setGroupingOpen(true);
    setGroupingLoading(true);
    try {
      const suggestions = await onSuggestGrouping();
      setGroupingSuggestions(suggestions);
      setSelectedGroupingKeys(new Set(suggestions.map(suggestion => suggestion.key)));
    } finally {
      setGroupingLoading(false);
    }
  }

  function toggleChatSelection(chatId: string) {
    setSelectedChatIds(previous => {
      const updated = new Set(previous);
      updated.has(chatId) ? updated.delete(chatId) : updated.add(chatId);
      return updated;
    });
  }

  function moveSelectedChats(folderId: string | null) {
    const chatIds = [...selectedChatIds];
    if (chatIds.length === 0) return;
    onMoveChatsToFolder(chatIds, folderId);
    setSelectedChatIds(new Set());
    setSelectionMode(false);
  }

  function createFolderAndMoveSelected() {
    const folderName = newMoveFolderName.trim();
    const chatIds = [...selectedChatIds];
    if (!folderName || chatIds.length === 0) return;
    onCreateFolderAndMove(chatIds, folderName);
    setNewMoveFolderName("");
    setNewMoveFolderOpen(false);
    setSelectedChatIds(new Set());
    setSelectionMode(false);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = (chat: ChatItem) => (
    !normalizedSearch || chat.name.toLowerCase().includes(normalizedSearch)
  );
  const rootChats = chats.filter(c => c.folderId === null && matchesSearch(c));
  const matchingChatCount = chats.filter(matchesSearch).length;

  return (
    <aside
      style={{
        background: "var(--background)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "row",
      }}
      className="h-full shrink-0"
    >
      {/* icon rail */}
      <div
        style={{ borderRight: "1px solid var(--border)", width: 40 }}
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
                  color: "var(--primary)",
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
                  background: "var(--secondary)",
                  border: "1px solid var(--border)",
                }}
                className="min-w-[140px] z-50"
              >
                <DropdownMenu.Item
                  onClick={() => setProfileModalOpen(true)}
                  style={{
                    color: "var(--foreground)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="px-3 py-2 text-xs cursor-pointer hover:bg-[var(--secondary)] outline-none flex items-center gap-2"
                >
                  <UserCog size={12} style={{ color: "var(--primary)" }} />
                  Edit Profile
                </DropdownMenu.Item>
                <DropdownMenu.Separator
                  style={{ background: "var(--border)" }}
                  className="h-[1px] my-1"
                />
                <DropdownMenu.Item
                  onClick={onLogout}
                  style={{
                    color: "var(--foreground)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="px-3 py-2 text-xs cursor-pointer hover:bg-[var(--secondary)] outline-none flex items-center gap-2"
                >
                  <LogOut size={12} style={{ color: "var(--accent)" }} />
                  Logout
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      {/* chat tree — animated collapse */}
      <AnimatePresence initial={false}>
        {sessionPanelOpen ? (
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
            borderBottom: "1px solid var(--border)",
            color: "var(--primary)",
            fontFamily: "'Share Tech Mono', monospace",
          }}
          className="flex items-center justify-between px-2 py-1.5"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => setSessionPanelOpen(false)}
              style={{ color: "var(--primary)" }}
              className="opacity-45 hover:opacity-100 transition-opacity shrink-0"
              title="Collapse sessions panel"
              aria-label="Collapse sessions panel"
            >
              <PanelLeftClose size={12} />
            </button>
            <span className="text-base opacity-70 uppercase tracking-widest truncate">sessions</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectionMode(previous => !previous);
                setSelectedChatIds(new Set());
              }}
              style={{ color: "var(--primary)" }}
              className={selectionMode ? "opacity-100" : "opacity-40 hover:opacity-100 transition-opacity"}
              title={selectionMode ? "Exit multi-select mode" : "Enter multi-select mode"}
              aria-label={selectionMode ? "Exit multi-select mode" : "Enter multi-select mode"}
            >
              <ListChecks size={11} />
            </button>
            <button
              onClick={openGroupingReview}
              style={{ color: "var(--primary)" }}
              className="opacity-40 hover:opacity-100 transition-opacity"
              title="Organize unfiled sessions"
              aria-label="Organize unfiled sessions"
            >
              <FolderSearch size={11} />
            </button>
            <button
              onClick={onAddFolder}
              style={{ color: "var(--primary)" }}
              className="opacity-40 hover:opacity-100 transition-opacity"
              title="New folder"
              aria-label="New folder"
            >
              <Plus size={11} />
            </button>
          </div>
        </div>

        {selectionMode && (
          <div
            style={{ borderBottom: "1px solid var(--border)", background: "var(--secondary)" }}
            className="flex items-center gap-2 px-2 py-1.5"
          >
            <span
              style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }}
              className="min-w-0 flex-1 text-[11px]"
            >
              {selectedChatIds.size > 0 ? `${selectedChatIds.size} selected` : "select sessions"}
            </span>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  disabled={selectedChatIds.size === 0}
                  title="Move selected sessions"
                  aria-label="Move selected sessions"
                  style={{ color: "var(--primary)", border: "1px solid var(--border)" }}
                  className="flex items-center gap-1 px-1.5 py-1 text-[10px] disabled:opacity-30"
                >
                  <FolderInput size={10} />
                  move
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="right"
                  align="start"
                  style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                  className="z-[120] min-w-44 p-1"
                >
                  <DropdownMenu.Item
                    onSelect={() => moveSelectedChats(null)}
                    style={{ color: "var(--foreground)", fontFamily: "'Share Tech Mono', monospace" }}
                    className="cursor-pointer px-3 py-2 text-xs outline-none hover:bg-[var(--secondary)]"
                  >
                    Ungrouped
                  </DropdownMenu.Item>
                  {folders.map(folder => (
                    <DropdownMenu.Item
                      key={folder.id}
                      onSelect={() => moveSelectedChats(folder.id)}
                      style={{ color: "var(--foreground)", fontFamily: "'Share Tech Mono', monospace" }}
                      className="cursor-pointer px-3 py-2 text-xs outline-none hover:bg-[var(--secondary)]"
                    >
                      {folder.name}
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Separator style={{ background: "var(--border)" }} className="my-1 h-px" />
                  <DropdownMenu.Item
                    onSelect={() => setNewMoveFolderOpen(true)}
                    style={{ color: "var(--primary)", fontFamily: "'Share Tech Mono', monospace" }}
                    className="cursor-pointer px-3 py-2 text-xs outline-none hover:bg-[var(--secondary)]"
                  >
                    + New folder...
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button
              type="button"
              onClick={() => {
                setSelectedChatIds(new Set());
                setSelectionMode(false);
              }}
              title="Exit multi-select mode"
              aria-label="Exit multi-select mode"
              className="opacity-45 hover:opacity-100"
            >
              <X size={10} />
            </button>
          </div>
        )}

        <div
          style={{ borderBottom: "1px solid var(--border)" }}
          className="px-2 py-1.5"
        >
          <div
            style={{
              background: "var(--secondary)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
            className="flex items-center gap-1.5 px-2"
          >
            <Search size={10} className="opacity-50 shrink-0" />
            <input
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="search sessions..."
              aria-label="Search sessions"
              style={{
                background: "transparent",
                color: "var(--foreground)",
                fontFamily: "'Share Tech Mono', monospace",
              }}
              className="min-w-0 flex-1 py-1 text-[12px] outline-none placeholder:opacity-40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear session search"
                className="opacity-40 hover:opacity-100"
              >
                <X size={9} />
              </button>
            )}
          </div>
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
              isSelected={selectedChatIds.has(chat.id)}
              isUnread={unreadChatIds.has(chat.id)}
              dropPlacement={dragOverChat?.id === chat.id ? dragOverChat.placement : null}
              selectionMode={selectionMode}
              onSelect={() => onSelectChat(chat.id)}
              onToggleSelected={() => toggleChatSelection(chat.id)}
              onDelete={() => onDeleteChat(chat.id)}
              onClassify={() => onClassifyChat(chat.id)}
              onDragStart={(e) => setDraggedChat(chat.id)}
              onDragOver={(placement) => setDragOverChat({ id: chat.id, placement })}
              onDrop={(placement) => {
                if (draggedChat) onReorderChat(draggedChat, chat.id, placement);
                setDragOverChat(null);
              }}
              onDragEnd={(e) => { setDraggedChat(null); setDragOverChat(null); setDragOverFolder(null); }}
            />
          ))}

          {/* folders */}
          {folders.map(folder => {
            const folderChats = chats.filter(c => c.folderId === folder.id && matchesSearch(c));
            if (normalizedSearch && folderChats.length === 0) return null;
            const isExpanded = normalizedSearch ? true : expandedFolders.has(folder.id);
            const isDragTarget = dragOverFolder === folder.id;
            const totalFolderChats = chats.filter(c => c.folderId === folder.id).length;
            const isEmpty = totalFolderChats === 0;
            const hasUnreadChats = chats.some(chat => (
              chat.folderId === folder.id && unreadChatIds.has(chat.id)
            ));
            const showFolderUnread = hasUnreadChats && !isExpanded;

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
                    background: isDragTarget
                      ? "var(--secondary)"
                      : showFolderUnread
                        ? "rgba(0, 255, 136, 0.07)"
                        : undefined,
                    border: isDragTarget
                      ? "1px solid var(--primary)"
                      : showFolderUnread
                        ? "1px solid rgba(0, 255, 136, 0.25)"
                        : "1px solid transparent",
                    boxShadow: showFolderUnread ? "inset 2px 0 0 var(--good)" : undefined,
                    color: "var(--primary)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-[var(--secondary)] transition-colors"
                  onClick={() => toggleFolder(folder.id)}
                >
                  <span className="opacity-60 text-[12px]">
                    {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                  </span>
                  <span className="opacity-60">
                    {isExpanded ? <FolderOpen size={11} /> : <Folder size={11} />}
                  </span>
                  <span
                    className="text-[15px] opacity-90 truncate flex-1"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setRenameFolderId(folder.id);
                      setRenameFolderName(folder.name);
                    }}
                  >
                    {folder.name}
                  </span>
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      setHintFolderId(folder.id);
                      setFolderHint(folder.hint || "");
                    }}
                    className="opacity-25 hover:opacity-100 transition-opacity shrink-0"
                    style={{ color: folder.hint ? "var(--primary)" : "var(--foreground)" }}
                    title={folder.hint ? `Classification hint: ${folder.hint}` : "Add classification hint"}
                    aria-label={`Edit classification hint for ${folder.name}`}
                  >
                    <Sparkles size={9} />
                  </button>
                  <span className="text-[12px] opacity-55">
                    {normalizedSearch ? `${folderChats.length}/${totalFolderChats}` : totalFolderChats}
                  </span>
                  {showFolderUnread && (
                    <span
                      aria-label={`Unread response in ${folder.name}`}
                      title="Unread response"
                      className="h-2 w-2 shrink-0 rounded-full bg-[var(--good)] shadow-[0_0_8px_rgba(0,255,136,0.75)]"
                    />
                  )}
                  {isEmpty && (
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteFolder(folder.id); }}
                      className="opacity-0 group-hover/folder:opacity-30 hover:!opacity-80 transition-opacity shrink-0"
                      style={{ color: "var(--accent)" }}
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
                    isSelected={selectedChatIds.has(chat.id)}
                    isUnread={unreadChatIds.has(chat.id)}
                    dropPlacement={dragOverChat?.id === chat.id ? dragOverChat.placement : null}
                    selectionMode={selectionMode}
                    indent
                    onSelect={() => onSelectChat(chat.id)}
                    onToggleSelected={() => toggleChatSelection(chat.id)}
                    onDelete={() => onDeleteChat(chat.id)}
                    onClassify={() => onClassifyChat(chat.id)}
                    onDragStart={(e) => setDraggedChat(chat.id)}
                    onDragOver={(placement) => setDragOverChat({ id: chat.id, placement })}
                    onDrop={(placement) => {
                      if (draggedChat) onReorderChat(draggedChat, chat.id, placement);
                      setDragOverChat(null);
                    }}
                    onDragEnd={(e) => { setDraggedChat(null); setDragOverChat(null); setDragOverFolder(null); }}
                  />
                ))}
              </div>
            );
          })}

          {normalizedSearch && matchingChatCount === 0 && (
            <div
              style={{ color: "var(--muted-foreground)", fontFamily: "'Share Tech Mono', monospace" }}
              className="px-3 py-4 text-[12px] text-center opacity-60"
            >
              no matching sessions
            </div>
          )}

          {/* drop zone to remove from folder */}
          {draggedChat && chats.find(c => c.id === draggedChat)?.folderId && (
            <div
              style={{
                border: dragOverFolder === "__root__" ? "1px dashed var(--accent)" : "1px dashed var(--border)",
                color: "var(--accent)",
                fontFamily: "'Share Tech Mono', monospace",
                background: dragOverFolder === "__root__" ? "var(--secondary)" : undefined,
                boxShadow: dragOverFolder === "__root__" ? "none" : undefined,
                opacity: dragOverFolder === "__root__" ? 1 : 0.5,
              }}
              className="mx-2 my-1 px-2 py-1.5 text-[12px] text-center transition-all"
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
        ) : (
          <motion.div
            key="session-panel-collapsed"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 44, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="workspace-pane-collapsed-bar"
          >
            <button
              type="button"
              onClick={() => setSessionPanelOpen(true)}
              className="w-full h-full flex items-center justify-center hover:bg-[var(--secondary)] transition-colors"
              aria-label="Expand sessions panel"
              title="Expand sessions panel"
            >
              <span className="workspace-pane-collapsed-label">Sessions</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ProfileModal open={profileModalOpen} onClose={() => setProfileModalOpen(false)} onProfileChanged={onSettingsChanged} />
      <SettingsModal open={settingsModalOpen} onClose={() => setSettingsModalOpen(false)} onSettingsChanged={onSettingsChanged} />
      
      <Dialog.Root open={renameFolderId !== null} onOpenChange={(open) => !open && setRenameFolderId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{ background: "var(--background)", opacity: 0.9 }}
            className="fixed inset-0 z-[100]"
          />
          <Dialog.Content
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-sm p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <Dialog.Title
                style={{
                  color: "var(--primary)",
                  fontFamily: "'Orbitron', sans-serif",
                }}
                className="text-md font-medium"
              >
                Rename Folder
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                style={{ color: "var(--primary)" }}
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
                    color: "var(--primary)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                  className="block text-[15px] mb-2 opacity-70"
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
                    background: "var(--secondary)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    fontFamily: "'Rajdhani', sans-serif",
                  }}
                  className="w-full px-3 py-2 text-[15px] focus:outline-none focus:border-[var(--primary)]"
                  autoFocus
                />
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={hintFolderId !== null} onOpenChange={(open) => !open && setHintFolderId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{ background: "var(--background)", opacity: 0.9 }}
            className="fixed inset-0 z-[100]"
          />
          <Dialog.Content
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[90vw] max-w-md p-6"
          >
            <Dialog.Title
              style={{ color: "var(--primary)", fontFamily: "'Orbitron', sans-serif" }}
              className="text-md font-medium"
            >
              Folder Classification Hint
            </Dialog.Title>
            <Dialog.Description
              style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }}
              className="mt-2 mb-4 text-sm opacity-60"
            >
              Describe the chats that belong here. Unfiled sessions will be classified against this hint.
            </Dialog.Description>
            <textarea
              value={folderHint}
              onChange={event => setFolderHint(event.target.value)}
              placeholder="Example: React UI work, component bugs, styling, and frontend tests"
              style={{
                background: "var(--secondary)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                fontFamily: "'Rajdhani', sans-serif",
              }}
              className="w-full min-h-28 resize-y px-3 py-2 text-sm focus:outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                  className="px-3 py-1 text-xs"
                >
                  cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={() => {
                  if (hintFolderId) onUpdateFolderHint(hintFolderId, folderHint.trim());
                  setHintFolderId(null);
                }}
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                className="px-3 py-1 text-xs font-bold"
              >
                save hint
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={groupingOpen} onOpenChange={setGroupingOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{ background: "var(--background)", opacity: 0.9 }}
            className="fixed inset-0 z-[100]"
          />
          <Dialog.Content
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-[92vw] max-w-lg p-6"
          >
            <Dialog.Title
              style={{ color: "var(--primary)", fontFamily: "'Orbitron', sans-serif" }}
              className="text-md font-medium"
            >
              Organize Sessions
            </Dialog.Title>
            <Dialog.Description
              style={{ color: "var(--foreground)", fontFamily: "'Rajdhani', sans-serif" }}
              className="mt-2 mb-4 text-sm opacity-60"
            >
              Keyword similarity only. Review the proposed moves before applying them.
            </Dialog.Description>

            <div className="max-h-[55vh] overflow-y-auto space-y-2">
              {groupingLoading && (
                <div className="py-6 text-center text-sm opacity-60">analyzing session similarity...</div>
              )}
              {!groupingLoading && groupingSuggestions.length === 0 && (
                <div className="py-6 text-center text-sm opacity-60">no strong session groups found</div>
              )}
              {!groupingLoading && groupingSuggestions.map(suggestion => {
                const selected = selectedGroupingKeys.has(suggestion.key);
                return (
                  <label
                    key={suggestion.key}
                    style={{ border: "1px solid var(--border)", background: "var(--secondary)" }}
                    className="flex cursor-pointer items-start gap-3 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        setSelectedGroupingKeys(previous => {
                          const updated = new Set(previous);
                          updated.has(suggestion.key)
                            ? updated.delete(suggestion.key)
                            : updated.add(suggestion.key);
                          return updated;
                        });
                      }}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div style={{ color: "var(--primary)" }} className="text-sm font-semibold">
                        {suggestion.isNewFolder ? "Suggested new folder" : "Suggested existing folder"}: {suggestion.folderName}
                      </div>
                      <div className="mt-1 text-xs opacity-60">
                        Move {suggestion.sessionIds.length} chat{suggestion.sessionIds.length === 1 ? "" : "s"}
                      </div>
                      {suggestion.keywords.length > 0 && (
                        <div className="mt-1 text-xs opacity-60">
                          Shared words: {suggestion.keywords.join(", ")}
                        </div>
                      )}
                      <div className="mt-2 space-y-1">
                        {suggestion.sessionIds.map(sessionId => (
                          <div
                            key={sessionId}
                            style={{ color: "var(--foreground)", fontFamily: "'Share Tech Mono', monospace" }}
                            className="truncate text-[11px] opacity-75"
                          >
                            → {chats.find(chat => chat.id === sessionId)?.name || sessionId}
                          </div>
                        ))}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                  className="px-3 py-1 text-xs"
                >
                  cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                disabled={groupingLoading || selectedGroupingKeys.size === 0}
                onClick={() => {
                  onApplyGrouping(
                    groupingSuggestions.filter(suggestion => selectedGroupingKeys.has(suggestion.key)),
                  );
                  setGroupingOpen(false);
                }}
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                className="px-3 py-1 text-xs font-bold disabled:opacity-40"
              >
                apply selected
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={newMoveFolderOpen} onOpenChange={setNewMoveFolderOpen}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{ background: "var(--background)", opacity: 0.9 }}
            className="fixed inset-0 z-[130]"
          />
          <Dialog.Content
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[131] w-[90vw] max-w-sm p-5"
          >
            <Dialog.Title
              style={{ color: "var(--primary)", fontFamily: "'Orbitron', sans-serif" }}
              className="text-sm font-medium"
            >
              Create Folder and Move
            </Dialog.Title>
            <Dialog.Description className="mt-2 mb-4 text-xs opacity-60">
              Create a folder for the {selectedChatIds.size} selected sessions.
            </Dialog.Description>
            <input
              value={newMoveFolderName}
              onChange={event => setNewMoveFolderName(event.target.value)}
              onKeyDown={event => event.key === "Enter" && createFolderAndMoveSelected()}
              placeholder="folder name..."
              style={{
                background: "var(--secondary)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                fontFamily: "'Share Tech Mono', monospace",
              }}
              className="w-full px-3 py-2 text-xs outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                  className="px-3 py-1 text-xs"
                >
                  cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={createFolderAndMoveSelected}
                disabled={!newMoveFolderName.trim()}
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
                className="px-3 py-1 text-xs font-bold disabled:opacity-40"
              >
                create and move
              </button>
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
  isSelected,
  isUnread,
  dropPlacement,
  selectionMode,
  indent,
  onSelect,
  onToggleSelected,
  onDelete,
  onClassify,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  chat: ChatItem;
  isActive: boolean;
  isDragging: boolean;
  isSelected: boolean;
  isUnread: boolean;
  dropPlacement: "before" | "after" | null;
  selectionMode: boolean;
  indent?: boolean;
  onSelect: () => void;
  onToggleSelected: () => void;
  onDelete: () => void;
  onClassify: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (placement: "before" | "after") => void;
  onDrop: (placement: "before" | "after") => void;
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
      onDragOver={event => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onDragOver(event.clientY < rect.top + rect.height / 2 ? "before" : "after");
      }}
      onDrop={event => {
        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        onDrop(event.clientY < rect.top + rect.height / 2 ? "before" : "after");
      }}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      aria-label={chat.name}
      style={{
        paddingLeft: indent ? 28 : 12,
        background: isActive
          ? "var(--secondary)"
          : isUnread
            ? "rgba(0, 255, 136, 0.06)"
            : undefined,
        borderLeft: isActive
          ? "2px solid var(--primary)"
          : isUnread
            ? "2px solid var(--good)"
            : "2px solid transparent",
        borderTop: dropPlacement === "before" ? "2px solid var(--primary)" : undefined,
        borderBottom: dropPlacement === "after" ? "2px solid var(--primary)" : undefined,
        opacity: isDragging ? 0.4 : 1,
        fontFamily: "'Share Tech Mono', monospace",
        color: isActive ? "var(--primary)" : "var(--foreground)",
      }}
      className="flex items-center gap-1.5 pr-2 py-1 cursor-grab active:cursor-grabbing hover:bg-[var(--secondary)] group transition-colors"
    >
      <GripVertical size={9} className="opacity-30 group-hover:opacity-85 transition-opacity shrink-0" />
      {selectionMode && (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelected}
          onClick={event => event.stopPropagation()}
          aria-label={`Select ${chat.name}`}
          className="h-3 w-3 shrink-0 accent-[var(--primary)]"
        />
      )}
      <MessageSquare size={10} className="shrink-0 opacity-50" />
      <span className="text-[15px] truncate flex-1 opacity-95">{chat.name}</span>
      {isUnread && !isActive && (
        <span
          aria-label={`Unread response in ${chat.name}`}
          title="Unread response"
          className="h-2 w-2 shrink-0 rounded-full bg-[var(--good)] shadow-[0_0_8px_rgba(0,255,136,0.75)]"
        />
      )}
      {chat.folderId === null && (
        <button
          onClick={e => { e.stopPropagation(); onClassify(); }}
          className="opacity-0 group-hover:opacity-35 hover:!opacity-100 transition-opacity shrink-0"
          style={{ color: "var(--primary)" }}
          title="Auto-file using folder hints"
          aria-label={`Auto-file ${chat.name}`}
        >
          <Sparkles size={9} />
        </button>
      )}
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-30 hover:!opacity-80 transition-opacity shrink-0"
        style={{ color: "var(--accent)" }}
      >
        <Trash2 size={9} />
      </button>
    </div>
  );
}
