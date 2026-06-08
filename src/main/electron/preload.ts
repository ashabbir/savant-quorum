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
  callMcpTool: (serverName: string, toolName: string, args: any) => ipcRenderer.invoke('call-mcp-tool', { serverName, toolName, args }),
})
