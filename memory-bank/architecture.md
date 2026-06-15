# Architecture

## System shape

Savant Quorum is an Electron app with a React renderer and a SQLite-backed main process.

- Main process:
  - creates the app window and tray
  - owns the SQLite database at `~/.savant/quorum.db`
  - exposes IPC handlers for sessions, agents, settings, and system state
- Preload bridge:
  - exposes `window.ipcRenderer`, `window.sessions`, `window.agents`, and `window.system`
  - provides the renderer with the minimal contract needed to run in Electron and in browser fallback mode
- Renderer:
  - owns the chat UI, sidebars, settings, panels, and session lifecycle
  - persists session state through the `window.sessions` bridge
  - delegates provider execution to `window.agents.run`

## Core persistence model

- `sessions`
  - `id`, `title`, `created_at`, `updated_at`, `metadata`
- `messages`
  - `id`, `session_id`, `role`, `content`, `from_agent`, `to_agent`, `timestamp`, `provider`, `model`
- `thinking`
  - `id`, `session_id`, `agent`, `thought`, `type`, `timestamp`
- `settings`
  - generic key/value store for app and provider config

## Shared runtime contracts

- Provider discovery comes from the main-process bridge and gateway metadata first.
- Session metadata is serialized JSON and may contain:
  - `allowDeepSearch`
  - `files`
  - `chatMode`
  - other per-session controls
- Renderer fallback mode is browser-safe and uses in-memory/localStorage shims when Electron APIs are absent.

## Human usage

- Open the app, choose a session, and work in the center chat surface.
- Use the left rail for sessions, settings, profile, and logout.
- Use the right rail for analytics, trace, graph, summary, and files.

## AI usage

- AI behavior should treat session metadata and message history as the source of context.
- AI outputs can be enhanced by summaries, uploaded file summaries, and recent context compression.
- Provider/model selection should respect the discovered provider chain rather than hardcoded options.

## Failure boundaries

- Blank-window startup issues belong to main-process launch and packaged path handling.
- Missing provider models belong to gateway discovery or fallback provider enumeration.
- Session loss belongs to the SQLite persistence layer or metadata serialization.
