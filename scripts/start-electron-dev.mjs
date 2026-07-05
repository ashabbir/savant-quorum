import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devServerUrl = 'http://127.0.0.1:5273/'

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: 'inherit',
      ...options,
    })

    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${signal || code}`))
      }
    })
  })
}
function isServerRunning(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(true)
    })

    req.on('error', () => {
      resolve(false)
    })

    req.setTimeout(500, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume()
        resolve()
      })

      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}`))
          return
        }
        setTimeout(check, 250)
      })

      req.setTimeout(1000, () => {
        req.destroy()
      })
    }

    check()
  })
}

await run(process.execPath, [
  path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'),
  'build',
  '--config',
  'vite.electron.config.mts',
  '--mode',
  'development',
])

const isConcurrent = process.argv.includes('--concurrent')
let rendererProcess = null

if (!isConcurrent) {
  const running = await isServerRunning(devServerUrl)
  if (!running) {
    console.log('[electron:dev] Renderer dev server not detected. Starting renderer dev server...')
    rendererProcess = spawn(process.execPath, [
      path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--force',
      '--host',
      '127.0.0.1',
      '--port',
      '5273',
      '--strictPort'
    ], {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        QUORUM_RENDERER_ONLY: '1'
      }
    })
  }
}

await waitForServer(devServerUrl)

const electronProcess = spawn(electron, ['.'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
})

const stopProcesses = () => {
  if (rendererProcess && !rendererProcess.killed) {
    try {
      rendererProcess.kill()
    } catch (e) {}
  }
  if (!electronProcess.killed) {
    try {
      electronProcess.kill()
    } catch (e) {}
  }
}

process.on('SIGINT', stopProcesses)
process.on('SIGTERM', stopProcesses)

electronProcess.on('exit', (code) => {
  stopProcesses()
  process.exit(code ?? 0)
})
