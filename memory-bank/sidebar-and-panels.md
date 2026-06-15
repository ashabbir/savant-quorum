# Sidebar and Panels

## Purpose

Document the left navigation rail, right analytics panel, and their user flows.

## Left sidebar

### Human flow

1. The user can toggle the sessions panel open or closed.
2. The user can create, rename, delete, and move chats into folders.
3. The user can open settings, profile, and logout actions from the icon rail.

### AI usage

- The sidebar is not AI-driven directly, but it defines the active session context that AI will consume.
- Folder and session selection determine which stored history becomes prompt input.

## Right panel

### Human flow

1. The user opens analytics tabs for pulse, trace, graph, summary, and files.
2. The panel visualizes session activity, message structure, and file state.
3. The user can summarize the session or inspect a file summary.

### AI usage

- The right panel reads the same message and thinking streams that the AI wrote.
- Analytics are derived from conversation structure, whisper activity, and Mermaid usage.
- Uploaded files can be inspected or removed from session context.

## Key surfaces

- `src/renderer/components/LeftSidebar.tsx`
- `src/renderer/components/RightPanel.tsx`
- `src/renderer/components/SettingsModal.tsx`
- `src/renderer/components/ProfileModal.tsx`

## Failure modes

- If sessions disappear from the sidebar, check session storage and folder mapping.
- If analytics are empty, verify the current session has messages and thinking events.
- If file summaries do not appear in the right panel, check the session metadata file list.
