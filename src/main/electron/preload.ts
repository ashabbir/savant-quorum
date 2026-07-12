import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other apts you need here.
  // ...
})

contextBridge.exposeInMainWorld('agents', {
  run: (provider: string, model: string, prompt: string) => ipcRenderer.invoke('run-agent', { provider, model, prompt })
})

contextBridge.exposeInMainWorld('sessions', {
  list: () => ipcRenderer.invoke('list-sessions'),
  load: (id: string) => ipcRenderer.invoke('load-session', id),
  save: (data: any) => ipcRenderer.invoke('save-session', data),
  delete: (id: string) => ipcRenderer.invoke('delete-session', id)
})

contextBridge.exposeInMainWorld('system', {
  getUser: () => ipcRenderer.invoke('get-user'),
  listProviders: (gatewayUrl?: string) => ipcRenderer.invoke('list-providers', gatewayUrl),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSetting: (key: string, value: any) => ipcRenderer.invoke('save-setting', { key, value }),
  getDbStatus: () => ipcRenderer.invoke('get-db-status'),
  transcribeAudio: (audio: Float32Array) => ipcRenderer.invoke('transcribe-audio', audio),
  getEmbeddings: (text: string) => ipcRenderer.invoke('get-embeddings', text),
  callMcpTool: (serverName: string, toolName: string, args: any) => ipcRenderer.invoke('call-mcp-tool', { serverName, toolName, args }),
  saveAthenaThread: (thread: any) => ipcRenderer.invoke('save-athena-thread', thread),
  getAthenaThreads: (sessionId?: string) => ipcRenderer.invoke('get-athena-threads', sessionId),
  saveAthenaMessage: (message: any) => ipcRenderer.invoke('save-athena-message', message),
  getAthenaMessages: (threadId: string) => ipcRenderer.invoke('get-athena-messages', threadId),
  saveAthenaRun: (run: any) => ipcRenderer.invoke('save-athena-run', run),
  getAthenaRuns: (threadId?: string) => ipcRenderer.invoke('get-athena-runs', threadId),
  runAgentViaGateway: (payload: any) => ipcRenderer.invoke('run-agent-via-gateway', payload),
  resumeAgentRun: (payload: { runId: string; timeoutMs?: number; agentLabel?: string }) => ipcRenderer.invoke('resume-agent-run', payload),
  extendAgentRun: (payload: { runId: string; timeoutMs?: number; agentLabel?: string }) => ipcRenderer.invoke('extend-agent-run', payload),
  killAgentRun: (payload: { runId: string }) => ipcRenderer.invoke('kill-agent-run', payload),
  onAgentRunStarted: (cb: (data: { runId: string; agentLabel: string; provider: string; model: string; startedAt: number; lastActivityAt: number; idleTimeoutMs: number }) => void) => {
    ipcRenderer.on('agent-run-started', (_event, data) => cb(data));
  },
  offAgentRunStarted: () => {
    ipcRenderer.removeAllListeners('agent-run-started');
  },
  onAgentRunConnectionState: (cb: (data: { runId: string; agentLabel: string; state: 'disconnected' | 'reconnected'; detail?: string }) => void) => {
    ipcRenderer.on('agent-run-connection-state', (_event, data) => cb(data));
  },
  offAgentRunConnectionState: () => {
    ipcRenderer.removeAllListeners('agent-run-connection-state');
  },
  onAgentRunActivity: (cb: (data: { runId: string; agentLabel: string; startedAt: number; lastActivityAt: number; idleTimeoutMs: number; reason: string }) => void) => {
    ipcRenderer.on('agent-run-activity', (_event, data) => cb(data));
  },
  offAgentRunActivity: () => {
    ipcRenderer.removeAllListeners('agent-run-activity');
  },
})
