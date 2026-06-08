import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devServerUrl = 'http://127.0.0.1:5173/'

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

await waitForServer(devServerUrl)

const electronProcess = spawn(electron, ['.'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl,
  },
})

const stopElectron = () => {
  if (!electronProcess.killed) {
    electronProcess.kill()
  }
}

process.on('SIGINT', stopElectron)
process.on('SIGTERM', stopElectron)

electronProcess.on('exit', (code) => {
  process.exit(code ?? 0)
})
