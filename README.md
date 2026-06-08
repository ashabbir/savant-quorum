# Savant Quorum

A high-security multi-agent collaborative environment built with Electron, React (Vite), and TypeScript.

## Features
- **Multi-Agent Interaction:** Engaging with Moderator, Engineer, Architect, and Security agents.
- **Thinking Process Log:** Real-time visibility into agent reasoning.
- **Cyberpunk Aesthetic:** High-contrast dark theme with interactive UI elements.
- **IPC Communication:** Secure communication between Electron main and renderer processes.

## Tech Stack
- **Frontend:** React, TypeScript, Vanilla CSS, Lucide React (Icons).
- **Backend:** Electron (Main process handles agent execution via shell).
- **Build Tool:** Vite.
- **Agent Integration:** `gemini` CLI (assumed to be in PATH).

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- `gemini` CLI installed and configured.

### Installation
```bash
npm install
```

### Development
```bash
npm run electron:dev
```

### Build
```bash
npm run build
```

## Architecture
The application uses Electron's `ipcMain` and `ipcRenderer` to bridge the React frontend with the system shell. When a user sends a message, the `Moderator` agent (powered by `gemini`) analyzes the input and decides which specialist agents to engage. Each agent is invoked via a dedicated shell command.

## License
MIT
