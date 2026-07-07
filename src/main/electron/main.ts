import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

// Persistence configuration
const SAVANT_DIR = path.join(os.homedir(), '.savant')
const QUORUM_DB_PATH = path.join(SAVANT_DIR, 'quorum.db')
const GATEWAY_URL = 'http://127.0.0.1:3100'

const LOG_FILE = path.join(SAVANT_DIR, 'quorum.log');
function writeLog(level: string, ...args: any[]) {
  const msg = `[${new Date().toISOString()}] [${level}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`;
  fs.appendFile(LOG_FILE, msg).catch(() => {}); // Fire and forget
}
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;
console.log = (...args) => { origLog(...args); writeLog('INFO', ...args); };
console.error = (...args) => { origError(...args); writeLog('ERROR', ...args); };
console.warn = (...args) => { origWarn(...args); writeLog('WARN', ...args); };

let db: any
let tray: Tray | null = null

async function initDb() {
  try {
    await fs.mkdir(SAVANT_DIR, { recursive: true })
    const Database = require('better-sqlite3')
    db = new Database(QUORUM_DB_PATH)
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER,
        updated_at INTEGER,
        metadata TEXT,
        summary TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        role TEXT,
        content TEXT,
        from_agent TEXT,
        to_agent TEXT,
        timestamp INTEGER,
        provider TEXT,
        model TEXT,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS thinking (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        agent TEXT,
        thought TEXT,
        type TEXT,
        timestamp INTEGER,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS athena_threads (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        title TEXT,
        status TEXT,
        metadata TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS athena_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT,
        role TEXT,
        content TEXT,
        provider TEXT,
        model TEXT,
        timestamp INTEGER,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS athena_runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT,
        provider TEXT,
        model TEXT,
        prompt TEXT,
        status TEXT,
        response TEXT,
        error TEXT,
        metadata TEXT,
        created_at INTEGER,
        updated_at INTEGER
      );
    `)

    // Migration block for existing messages table
    try {
      db.exec("ALTER TABLE messages ADD COLUMN provider TEXT");
    } catch (e) {
      // Column may already exist
    }
    try {
      db.exec("ALTER TABLE messages ADD COLUMN model TEXT");
    } catch (e) {
      // Column may already exist
    }
    try {
      db.exec("ALTER TABLE sessions ADD COLUMN summary TEXT");
    } catch (e) {
      // Column may already exist
    }

    console.log('[QUORUM] SQLite engine initialized.')
  } catch (e) {
    console.error('Failed to initialize Quorum database:', e)
  }
}

function normalizeGatewayProviders(payload: any) {
  const providerPayload = payload?.providerDetails ?? payload?.providers ?? payload?.data ?? payload
  const rawProviders = Array.isArray(providerPayload)
    ? providerPayload
    : providerPayload && typeof providerPayload === 'object'
      ? Object.entries(providerPayload).map(([id, value]) => (
        value && typeof value === 'object'
          ? { id, ...(value as Record<string, unknown>) }
          : { id, label: String(value) }
      ))
      : Array.isArray(payload)
    ? payload
    : []

  return rawProviders
    .map((provider: any) => {
      if (typeof provider === 'string') {
        const id = provider.trim()
        if (!id) return null
        return {
          id,
          label: id,
          models: [],
          source: 'gateway',
          installed: true,
        }
      }

      const id = String(provider.id || provider.name || provider.provider || '').trim()
      if (!id) return null
      const models = Array.isArray(provider.models)
        ? provider.models.map((model: any) => String(model.id || model.name || model)).filter(Boolean)
        : provider.models && typeof provider.models === 'object'
          ? Object.keys(provider.models)
        : provider.model
          ? [String(provider.model)]
          : []

      return {
        id,
        label: String(provider.label || provider.name || id),
        defaultModel: provider.defaultModel ? String(provider.defaultModel) : models[0],
        models,
        source: 'gateway',
        installed: true,
      }
    })
    .filter(Boolean)
}

async function getGatewayProviders(gatewayUrl: string) {
  const baseUrl = gatewayUrl.replace(/\/+$/, '')
  const endpoints = ['/models', '/health', '/providers', '/api/providers', '/v1/providers', '/models/providers']

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 2500)
      const response = await fetch(`${baseUrl}${endpoint}`, { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) continue

      const providers = normalizeGatewayProviders(await response.json())
      if (providers.length > 0) {
        return providers
      }
    } catch (_e) {
      // Try the next known gateway route
    }
  }

  return []
}

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../../renderer/public')

let win: BrowserWindow | null
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function resolveAsset(name: string): string {
  // In packaged builds, assets live under process.resourcesPath/public (extraResources).
  // In dev, they live alongside the renderer public dir.
  const packaged = path.join(process.resourcesPath || '', 'public', name)
  const devPath = path.join(process.env.VITE_PUBLIC || '', name)
  return app.isPackaged ? packaged : devPath
}

function createWindow() {
  win = new BrowserWindow({
    icon: resolveAsset('main.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: true,
      sandbox: false
    },
    width: 1200,
    height: 800,
    backgroundColor: '#0d0d0d',
  })

  // Add load failure logging
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[QUORUM] Failed to load URL: ${validatedURL}`)
    console.error(`[QUORUM] Error: ${errorDescription} (${errorCode})`)
  })

  if (VITE_DEV_SERVER_URL) {
    console.log(`[QUORUM] Loading Dev Server: ${VITE_DEV_SERVER_URL}`)
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    // In built app, index.html is in the dist folder
    // When running from root (dev/build), dist-electron and dist are siblings
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    
    console.log(`[QUORUM] Loading production file: ${indexPath}`)
    win.loadFile(indexPath).catch(err => {
      console.error('[QUORUM] win.loadFile failed:', err)
    })
  }
}

function createTray() {
  // Prefer the macOS Template PNG (auto-inverts for dark/light menu bar);
  // fall back to the SVG when the PNG is unavailable.
  const pngPath = resolveAsset('trayTemplate.png')
  const svgPath = resolveAsset('tray.svg')

  let icon = nativeImage.createFromPath(pngPath)
  if (icon.isEmpty()) {
    icon = nativeImage.createFromPath(svgPath).resize({ width: 16, height: 16 })
  }
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Quorum', click: () => { win?.show(); win?.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } }
  ])

  tray.setToolTip('Quorum')
  tray.setContextMenu(contextMenu)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.whenReady().then(async () => {
  await initDb()
  process.env.GEMINI_CLI_TRUST_WORKSPACE = "true"
  createWindow()
  createTray()
})

ipcMain.handle('run-agent', async (_event, { provider, model, prompt }) => {
  try {
    return await runAgentViaGateway({ provider, model, prompt })
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
})

async function runAgentViaGateway(payload: { provider: string; model: string; prompt: string; timeoutMs?: number }) {
  let gatewayUrl = GATEWAY_URL;
  let apiKey = '';
  if (db) {
    try {
      const gwRow = db.prepare("SELECT value FROM settings WHERE key = 'gateway:config'").get();
      if (gwRow) {
        const parsed = JSON.parse(gwRow.value);
        if (parsed?.url) gatewayUrl = parsed.url;
      }
      const akRow = db.prepare("SELECT value FROM settings WHERE key = 'user:apiKey'").get();
      if (akRow) apiKey = akRow.value;
    } catch (e) {}
  }

  const baseUrl = gatewayUrl.replace(/\/$/, '');
  const runRes = await fetch(`${baseUrl}/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      prompt: payload.prompt,
      chain: [{ provider: payload.provider, model: payload.model }]
    })
  });

  if (!runRes.ok) {
    const text = await runRes.text();
    throw new Error(`Gateway returned ${runRes.status} - ${text}`);
  }

  const { id } = await runRes.json();
  const timeoutMs = Math.max(1_000, payload.timeoutMs || 90_000);
  const deadline = Date.now() + timeoutMs;
  if (db) {
    db.prepare(`
      INSERT INTO athena_runs (id, thread_id, provider, model, prompt, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at
    `).run(id, null, payload.provider, payload.model, payload.prompt, 'running', Date.now(), Date.now());
  }

  let pollDelay = 25;
  while (true) {
    if (Date.now() >= deadline) {
      await fetch(`${baseUrl}/runs/${id}`, {
        method: 'DELETE',
        headers: { ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) }
      }).catch(() => undefined);
      if (db) {
        db.prepare(`UPDATE athena_runs SET status = ?, error = ?, updated_at = ? WHERE id = ?`).run('killed', `AGENT_TIMEOUT after ${timeoutMs}ms`, Date.now(), id);
      }
      throw new Error(`AGENT_TIMEOUT after ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, pollDelay));
    if (pollDelay < 100) pollDelay += 15;

    const pollRes = await fetch(`${baseUrl}/runs/${id}`, {
      headers: { ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) }
    });
    if (!pollRes.ok) continue;
    const run = await pollRes.json();

    if (run.status === 'complete') {
      const responseText = run.result?.response || '';
      if (db) {
        db.prepare(`UPDATE athena_runs SET status = ?, response = ?, updated_at = ? WHERE id = ?`).run('complete', responseText, Date.now(), id);
      }
      return responseText;
    }
    if (run.status === 'error' || run.status === 'killed') {
      if (db) {
        db.prepare(`UPDATE athena_runs SET status = ?, error = ?, updated_at = ? WHERE id = ?`).run(run.status, run.error || 'Unknown error', Date.now(), id);
      }
      throw new Error(`Gateway run failed with status ${run.status} - ${run.error || 'Unknown error'}`);
    }
  }
}

ipcMain.handle('list-sessions', async () => {
  if (!db) return []
  try {
    return db.prepare('SELECT id, title, updated_at as timestamp FROM sessions ORDER BY updated_at DESC').all()
  } catch (e) {
    return []
  }
})

ipcMain.handle('load-session', async (_event, sessionId) => {
  if (!db) return null
  try {
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId)
    if (!session) return null
    const messages = db.prepare('SELECT id, role, content, from_agent as \"from\", to_agent as \"to\", timestamp, provider, model FROM messages WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId)
    const thinking = db.prepare('SELECT id, agent, thought, type, timestamp FROM thinking WHERE session_id = ? ORDER BY timestamp ASC').all(sessionId)
    return { ...session, messages, thinking }
  } catch (e) {
    return null
  }
})

ipcMain.handle('save-session', async (_event, { id, title, messages, thinking, summary, metadata }) => {
  if (!db) return false
  try {
    const transaction = db.transaction((data: any) => {
      const now = Date.now()
      db.prepare(`
        INSERT INTO sessions (id, title, created_at, updated_at, metadata, summary) 
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at, metadata=excluded.metadata, summary=excluded.summary
      `).run(data.id, data.title, now, now, data.metadata || null, data.summary || null)
      db.prepare('DELETE FROM messages WHERE session_id = ?').run(data.id)
      db.prepare('DELETE FROM thinking WHERE session_id = ?').run(data.id)
      const insertMsg = db.prepare(`INSERT INTO messages (id, session_id, role, content, from_agent, to_agent, timestamp, provider, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      for (const m of data.messages) insertMsg.run(m.id, data.id, m.role, m.content, m.from || null, m.to || null, m.timestamp, m.provider || null, m.model || null)
      const insertThink = db.prepare(`INSERT INTO thinking (id, session_id, agent, thought, type, timestamp) VALUES (?, ?, ?, ?, ?, ?)`)
      for (const t of data.thinking) insertThink.run(t.id, data.id, t.agent, t.thought, t.type || 'thought', t.timestamp)
    })
    transaction({ id, title, messages, thinking, summary, metadata })
    return true
  } catch (e) {
    return false
  }
})

ipcMain.handle('delete-session', async (_event, sessionId) => {
  if (!db) return false
  try {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
    return true
  } catch (e) {
    return false
  }
})

ipcMain.handle('get-user', async () => {
  try {
    return os.userInfo().username
  } catch (e) {
    return 'operator'
  }
})

ipcMain.handle('get-settings', async () => {
  if (!db) return {}
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all()
    const settings: Record<string, any> = {}
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }
    return settings
  } catch (e) {
    return {}
  }
})

ipcMain.handle('save-setting', async (_event, { key, value }) => {
  if (!db) return false
  try {
    const val = typeof value === 'string' ? value : JSON.stringify(value)
    db.prepare(`
      INSERT INTO settings (key, value) 
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(key, val)
    return true
  } catch (e) {
    console.error('Failed to save setting:', key, e)
    return false
  }
})

ipcMain.handle('list-providers', async (_event, gatewayUrl?: string) => {
  const url = gatewayUrl || GATEWAY_URL
  const gatewayProviders = await getGatewayProviders(url)
  if (gatewayProviders.length > 0) {
    return {
      source: 'gateway',
      providers: gatewayProviders,
    }
  }

  return {
    source: 'gateway',
    providers: [],
  }
})

// ── MCP Tool → Savant REST API routing ──────────────────────────────────────
// MCP servers are thin bridges to the savant-server REST API. Rather than
// going through a gateway MCP proxy, we route tool calls directly to the
// Flask API endpoints. This is deterministic and avoids SSE session overhead.

const MCP_TOOL_ROUTES: Record<string, Record<string, { method: string; path: string | ((args: any) => string); bodyFrom?: (args: any) => any }>> = {
  'savant-abilities': {
    'resolve_abilities': {
      method: 'POST',
      path: '/api/abilities/resolve',
      bodyFrom: (args: any) => ({
        persona: args.persona,
        tags: args.tags || [],
        ...(args.repo_id ? { repo_id: args.repo_id } : {}),
        ...(args.trace ? { trace: true } : {}),
      }),
    },
    'validate_store': { method: 'GET', path: '/api/abilities/validate' },
    'list_personas':  { method: 'GET', path: '/api/abilities/assets' },
    'list_rules':     { method: 'GET', path: '/api/abilities/assets' },
    'list_policies':  { method: 'GET', path: '/api/abilities/assets' },
    'list_repos':     { method: 'GET', path: '/api/abilities/assets' },
    'read_asset': {
      method: 'GET',
      path: (args: any) => `/api/abilities/assets/${encodeURIComponent(args.asset_id)}`,
    },
    'learn': {
      method: 'POST',
      path: '/api/abilities/learn',
      bodyFrom: (args: any) => ({ asset_id: args.asset_id, content: args.content }),
    },
  },
  'savant-workspace': {
    'list_workspaces': { method: 'GET', path: '/api/workspace' },
    'create_workspace': {
      method: 'POST',
      path: '/api/workspace',
      bodyFrom: (args: any) => ({ name: args.name, description: args.description, priority: args.priority || 'medium' }),
    },
    'get_workspace': {
      method: 'GET',
      path: (args: any) => `/api/workspace/${encodeURIComponent(args.workspace_id || args.name)}`,
    },
    'list_tasks': {
      method: 'GET',
      path: (args: any) => `/api/workspace/${encodeURIComponent(args.workspace_id)}/tasks${args.status ? `?status=${args.status}` : ''}`,
    },
    'create_task': {
      method: 'POST',
      path: (args: any) => `/api/workspace/${encodeURIComponent(args.workspace_id)}/tasks`,
      bodyFrom: (args: any) => ({ title: args.title, description: args.description, priority: args.priority || 'medium', status: args.status || 'todo' }),
    },
    'create_jira_ticket': {
      method: 'POST',
      path: (args: any) => `/api/workspace/${encodeURIComponent(args.workspace_id)}/jira`,
      bodyFrom: (args: any) => ({ ticket_key: args.ticket_key, title: args.title, status: args.status || 'todo', assignee: args.assignee, priority: args.priority || 'medium' }),
    },
  },
}

ipcMain.handle('call-mcp-tool', async (_event, { serverName, toolName, args }) => {
  try {
    // Resolve savant-server URL from settings (default: http://127.0.0.1:8090)
    let serverUrl = 'http://127.0.0.1:8090';
    let apiKey = '';
    if (db) {
       try {
         const srvRow = db.prepare("SELECT value FROM settings WHERE key = 'server:config'").get() as any;
         if (srvRow) {
           const parsed = JSON.parse(srvRow.value);
           if (parsed?.url) serverUrl = parsed.url;
         }
         const akRow = db.prepare("SELECT value FROM settings WHERE key = 'user:apiKey'").get() as any;
         if (akRow) apiKey = akRow.value;
       } catch (e) {}
    }

    const baseUrl = serverUrl.replace(/\/$/, '');
    const routes = MCP_TOOL_ROUTES[serverName];
    const route = routes?.[toolName];

    if (!route) {
      throw new Error(`Unknown MCP tool: ${serverName}/${toolName}`);
    }

    const resolvedPath = typeof route.path === 'function' ? route.path(args) : route.path;
    const url = `${baseUrl}${resolvedPath}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-API-Key'] = apiKey;

    const fetchOpts: RequestInit = { method: route.method, headers };
    if (route.method === 'POST' && route.bodyFrom) {
      fetchOpts.body = JSON.stringify(route.bodyFrom(args));
    }

    console.log(`[MCP] ${serverName}/${toolName} → ${route.method} ${url}`);
    const res = await fetch(url, fetchOpts);

    if (!res.ok) {
       const text = await res.text();
       throw new Error(`Savant API returned ${res.status}: ${text}`);
    }

    const data = await res.json();

    // Wrap response in MCP-compatible format expected by the renderer
    // The renderer reads: res.content?.[0]?.text
    if (toolName === 'resolve_abilities' && data.prompt) {
      return { content: [{ text: data.prompt }], manifest: data.manifest };
    }

    return { content: [{ text: JSON.stringify(data) }] };
  } catch (error: any) {
    console.error(`MCP Tool Call Failed (${serverName}/${toolName}):`, error.message);
    throw error;
  }
})

ipcMain.handle('get-db-status', async () => {
  if (!db) return 'offline'
  try {
    db.prepare('SELECT 1').get()
    return 'connected'
  } catch (e) {
    return 'offline'
  }
})

ipcMain.handle('run-agent-via-gateway', async (_event, payload) => {
  return runAgentViaGateway(payload)
})

ipcMain.handle('save-athena-thread', async (_event, thread) => {
  if (!db || !thread?.id) return false
  const now = Date.now()
  try {
    db.prepare(`
      INSERT INTO athena_threads (id, session_id, title, status, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id, title=excluded.title, status=excluded.status, metadata=excluded.metadata, updated_at=excluded.updated_at
    `).run(thread.id, thread.sessionId || null, thread.title || 'Athena Thread', thread.status || 'active', thread.metadata ? JSON.stringify(thread.metadata) : null, thread.createdAt || now, now)
    return true
  } catch (e) {
    return false
  }
})

ipcMain.handle('get-athena-threads', async (_event, sessionId?: string) => {
  if (!db) return []
  const rows = sessionId
    ? db.prepare('SELECT * FROM athena_threads WHERE session_id = ? ORDER BY updated_at DESC').all(sessionId)
    : db.prepare('SELECT * FROM athena_threads ORDER BY updated_at DESC').all()
  return rows.map((row: any) => ({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) : undefined }))
})

ipcMain.handle('save-athena-message', async (_event, message) => {
  if (!db || !message?.id || !message?.threadId) return false
  try {
    db.prepare(`
      INSERT INTO athena_messages (id, thread_id, role, content, provider, model, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET thread_id=excluded.thread_id, role=excluded.role, content=excluded.content, provider=excluded.provider, model=excluded.model, timestamp=excluded.timestamp, metadata=excluded.metadata
    `).run(message.id, message.threadId, message.role, message.content, message.provider || null, message.model || null, message.timestamp || Date.now(), message.metadata ? JSON.stringify(message.metadata) : null)
    return true
  } catch (e) {
    return false
  }
})

ipcMain.handle('get-athena-messages', async (_event, threadId: string) => {
  if (!db) return []
  return db.prepare('SELECT * FROM athena_messages WHERE thread_id = ? ORDER BY timestamp ASC').all(threadId)
})

ipcMain.handle('save-athena-run', async (_event, run) => {
  if (!db || !run?.id) return false
  try {
    const now = Date.now()
    db.prepare(`
      INSERT INTO athena_runs (id, thread_id, provider, model, prompt, status, response, error, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET thread_id=excluded.thread_id, provider=excluded.provider, model=excluded.model, prompt=excluded.prompt, status=excluded.status, response=excluded.response, error=excluded.error, metadata=excluded.metadata, updated_at=excluded.updated_at
    `).run(run.id, run.threadId || null, run.provider || null, run.model || null, run.prompt || null, run.status || 'queued', run.response || null, run.error || null, run.metadata ? JSON.stringify(run.metadata) : null, run.createdAt || now, now)
    return true
  } catch (e) {
    return false
  }
})

ipcMain.handle('get-athena-runs', async (_event, threadId?: string) => {
  if (!db) return []
  const rows = threadId
    ? db.prepare('SELECT * FROM athena_runs WHERE thread_id = ? ORDER BY updated_at DESC').all(threadId)
    : db.prepare('SELECT * FROM athena_runs ORDER BY updated_at DESC').all()
  return rows.map((row: any) => ({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) : undefined }))
})
