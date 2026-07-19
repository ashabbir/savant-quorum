/// <reference types="vite/client" />

declare const APP_VERSION: string;

interface Window {
  ipcRenderer: {
    on: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    off: (channel: string, listener: (event: any, ...args: any[]) => void) => void
    send: (channel: string, ...args: any[]) => void
    invoke: (channel: string, ...args: any[]) => Promise<any>
  }
  agents: {
    run: (provider: string, model: string, prompt: string) => Promise<string>
  }
  sessions: {
    list: () => Promise<any[]>
    load: (id: string) => Promise<any>
    save: (data: { id: string, title: string, messages: any[], thinking: any[], summary?: string, metadata?: string }) => Promise<boolean>
    delete: (id: string) => Promise<boolean>
  }
  system: {
    getUser: () => Promise<string>
    getSettings: () => Promise<Record<string, any>>
    saveSetting: (key: string, value: any) => Promise<boolean>
    listProviders: (gatewayUrl?: string) => Promise<{
      source: 'gateway' | 'terminal'
      providers: Array<{
        id: string
        label: string
        defaultModel?: string
        models: string[]
        source: 'gateway' | 'terminal'
        installed: boolean
      }>
    }>
    getDbStatus: () => Promise<string>
    transcribeAudio: (audio: Float32Array) => Promise<string>
    getEmbeddings: (text: string) => Promise<number[]>
    callMcpTool: (serverName: string, toolName: string, args: any) => Promise<any>
    saveAthenaThread: (thread: any) => Promise<boolean>
    getAthenaThreads: (sessionId?: string) => Promise<any[]>
    saveAthenaMessage: (message: any) => Promise<boolean>
    getAthenaMessages: (threadId: string) => Promise<any[]>
    saveAthenaRun: (run: any) => Promise<boolean>
    getAthenaRuns: (threadId?: string) => Promise<any[]>
    runAgentViaGateway: (payload: { provider: string; model: string; prompt: string; timeoutMs?: number; agentLabel?: string }) => Promise<string>
    resumeAgentRun: (payload: { runId: string; timeoutMs?: number; agentLabel?: string }) => Promise<string>
    extendAgentRun: (payload: { runId: string; timeoutMs?: number; agentLabel?: string }) => Promise<boolean>
    killAgentRun: (payload: { runId: string }) => Promise<boolean>
    steerAgentRun: (payload: { runId: string; feedback: string }) => Promise<boolean>
    onAgentRunStarted: (cb: (data: { runId: string; agentLabel: string; provider: string; model: string; startedAt: number; lastActivityAt: number; idleTimeoutMs: number }) => void) => void
    offAgentRunStarted: () => void
    onAgentRunConnectionState: (cb: (data: { runId: string; agentLabel: string; state: 'disconnected' | 'reconnected'; detail?: string }) => void) => void
    offAgentRunConnectionState: () => void
    onAgentRunActivity: (cb: (data: { runId: string; agentLabel: string; startedAt: number; lastActivityAt: number; idleTimeoutMs: number; reason: string }) => void) => void
    offAgentRunActivity: () => void
  }
}
