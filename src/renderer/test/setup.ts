import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock mermaid
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock-mermaid</svg>' }),
    parse: vi.fn().mockResolvedValue(true),
    parseError: vi.fn()
  }
}))

// Mock Electron APIs exposed in preload.ts
const mockSessions = {
  list: vi.fn().mockResolvedValue([]),
  load: vi.fn().mockResolvedValue(null),
  save: vi.fn().mockResolvedValue(true),
  delete: vi.fn().mockResolvedValue(true),
}

const mockAgents = {
  run: vi.fn().mockResolvedValue('Mock agent response'),
}

const mockIpcRenderer = {
  on: vi.fn(),
  off: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(),
}

const mockSystem = {
  getUser: vi.fn().mockResolvedValue('test-user'),
  getSettings: vi.fn().mockResolvedValue({ 'user:apiKey': 'sk-test-key', 'user:name': 'test-user' }),
  saveSetting: vi.fn().mockResolvedValue(true),
  listProviders: vi.fn().mockResolvedValue({ source: 'gateway', providers: [] }),
  getDbStatus: vi.fn().mockResolvedValue('connected'),
}

const localStorageMock = (() => {
  const store = new Map<string, string>([['savant_api_key', 'sk-test-key']])
  return {
    getItem: vi.fn((key: string) => store.get(key) || null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value) }),
    removeItem: vi.fn((key: string) => { store.delete(key) }),
    clear: vi.fn(() => { store.clear() }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: vi.fn().mockResolvedValue({ valid: true, user_id: 'test-user', name: 'test-user', role: 'admin' }),
}))

Object.defineProperty(window, 'sessions', {
  value: mockSessions,
  writable: true,
})

Object.defineProperty(window, 'agents', {
  value: mockAgents,
  writable: true,
})

Object.defineProperty(window, 'system', {
  value: mockSystem,
  writable: true,
})

Object.defineProperty(window, 'ipcRenderer', {
  value: mockIpcRenderer,
  writable: true,
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
