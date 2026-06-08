import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (!window.ipcRenderer) {
  window.ipcRenderer = {
    on: () => {},
    off: () => {},
    send: () => {},
    invoke: async () => undefined,
  }
}

if (!window.sessions) {
  const storageKey = 'savant-quorum:sessions'
  const readSessions = () => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '{}')
    } catch {
      return {}
    }
  }
  const writeSessions = (sessions: Record<string, any>) => {
    localStorage.setItem(storageKey, JSON.stringify(sessions))
  }

  window.sessions = {
    list: async () => Object.values(readSessions())
      .map((session: any) => ({ id: session.id, title: session.title, timestamp: session.updated_at }))
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)),
    load: async (id: string) => readSessions()[id] || null,
    save: async (data) => {
      const sessions = readSessions()
      sessions[data.id] = { ...data, updated_at: Date.now() }
      writeSessions(sessions)
      return true
    },
    delete: async (id: string) => {
      const sessions = readSessions()
      delete sessions[id]
      writeSessions(sessions)
      return true
    },
  }
}

if (!window.agents) {
  window.agents = {
    run: async (provider: string, model: string, prompt: string) => `Local browser preview mode. Electron agent bridge is unavailable.\n\n${prompt.slice(0, 500)}`,
  }
}

if (!window.system) {
  window.system = {
    getUser: async () => 'operator',
    getSettings: async () => ({}),
    saveSetting: async (_key: string, _value: any) => true,
    listProviders: async () => ({
      source: 'terminal',
      providers: [
        { id: 'codex', label: 'Codex', defaultModel: 'o4-mini', models: ['o4-mini', 'gpt-5-mini', 'gpt-5', 'gpt-5-codex', 'o3'] },
        { id: 'gemini', label: 'Gemini', defaultModel: 'gemini-2.5-flash', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-exp'] },
        { id: 'claude', label: 'Claude', defaultModel: 'haiku', models: ['haiku', 'sonnet', 'opus', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-7'] },
        { id: 'copilot', label: 'Copilot', defaultModel: 'claude-haiku-4.5', models: ['claude-haiku-4.5', 'claude-sonnet-4.6', 'claude-opus-4.7', 'gpt-4.1', 'gpt-5-mini'] },
      ].map(provider => ({
        ...provider,
        source: 'terminal' as const,
        installed: true,
      })),
    }),
    getDbStatus: async () => 'connected',
    callMcpTool: async () => ({ content: [] }),
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
