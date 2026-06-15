# Savant Quorum Memory Bank

This directory documents the current Quorum architecture, feature flows, and operating contracts for both human users and AI agents.

## How to use

- Read [`architecture.md`](./architecture.md) first for the system map.
- Read the feature docs for the surface you are changing.
- Use the AI flow sections when wiring agent behavior, provider selection, or summaries.
- Use the human flow sections when changing UX, labels, or navigation.

## Document set

- [`architecture.md`](./architecture.md): end-to-end system layout and shared contracts
- [`startup-and-packaging.md`](./startup-and-packaging.md): dev launch, packaged launch, tray, and icon pipeline
- [`authentication-and-profile.md`](./authentication-and-profile.md): API key, login, profile, and settings persistence
- [`session-storage.md`](./session-storage.md): sessions, messages, thinking, metadata, and SQLite persistence
- [`chat-and-agents.md`](./chat-and-agents.md): message flow, direct agents, provider/model routing, and fallback behavior
- [`summaries-files-and-mermaid.md`](./summaries-files-and-mermaid.md): summarization, uploads, session files, and Mermaid validation
- [`sidebar-and-panels.md`](./sidebar-and-panels.md): left sidebar, right panel, and inspection flows
- [`chat-modes-and-debate.md`](./chat-modes-and-debate.md): collaborate/debate mode and debate orchestration
- [`release-history.md`](./release-history.md): v4 baseline to v5.0.3 change record

## Update rule

When the repo changes, update the relevant feature doc first and then update the architecture overview if the system contract changed.
