# Savant Quorum: Official System Documentation

## 1. Vision & Identity
**Savant Quorum** is the definitive multi-agent collaborative environment for high-stakes intelligence and engineering. It is designed to empower operators through a high-performance "Swarm" of specialized AI agents working in parallel to solve complex problems with visual clarity and transactional reliability.

### The Birth of Quorum
Evolved from early agent prototypes, Quorum represents the transition from ephemeral chat to a persistent, relational intelligence asset. It is built to be the "Nerve Center" of your workspace.

## 2. Core Architectural Pillars
### 2.1 Parallel Orchestration (The Swarm)
Unlike sequential agents, Quorum engages its specialists (**Engineer**, **Architect**, **Security**) simultaneously. This multi-threaded approach reduces latency by up to 70% for complex queries.

### 2.2 Relational Persistence (SQLite Engine)
All intelligence is stored in a structured **SQLite database** (`~/.savant/quorum.db`).
- **Messages Table:** Stores every turn of the conversation.
- **Thinking Table:** Stores every granular "Cognitive Trace," including raw agent thoughts and handshakes.
- **Sessions Table:** Manages historical Quorum session metadata.

### 2.3 Visual-First Intelligence
Integrated **Mermaid.js** allows agents to generate live architecture maps, sequence diagrams, and flowcharts. Coupled with **Prism syntax highlighting**, Quorum provides industry-standard technical readability.

### 2.4 Secure IPC Bridge
Quorum utilizes a hardened communication layer. By using `spawn`-based process execution instead of standard shell `exec`, it is immune to shell injection and syntax errors from complex prompts.

## 3. Operational Guide
### 3.1 Workspace Authorization
Quorum is a self-authorizing system. On launch, it globally trusts its home directory (`GEMINI_CLI_TRUST_WORKSPACE=true`), granting the orchestrator full power to research and execute within the workspace.

### 3.2 Session Lifecycle
1. **Initiation (⚛️):** Click the Atom icon in the sidebar to trigger a new collective reasoning session.
2. **Engagement:** Send a command to the swarm. The Moderator analyzes intent, delegates tasks, and synthesizes reports.
3. **Traceability:** Monitor the right-hand panel for real-time "Cognitive Traces" of every movement the agents make.
4. **Restoration:** Historical sessions are listed in the sidebar and can be hot-swapped instantly.

## 4. Technical Specifications
- **Stack:** Electron (Main Process) + React (Renderer) + Vite (Build System).
- **Styles:** Vanilla CSS with a **Tokyo Night** professional dashboard palette.
- **Iconography:** Custom emoji-based identity system aligned with the Savant geometric theme.
- **Persistence Path:** `~/.savant/quorum.db` (SQLite).

## 5. Development & Deployment
- **Rebuild:** `npm run build`
- **Dev Mode:** `npm run electron:dev`
- **Versioning:** Automated patch bumps with every technical modification.

---
*SAVANT QUORUM v1.2.1 | PROCEED WITH INTELLIGENCE*
