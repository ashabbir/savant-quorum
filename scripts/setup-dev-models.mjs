import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stsbSourceDir = path.join(projectRoot, 'build', 'stsb-cache')
const stsbDestDir = path.join(os.homedir(), '.savant', 'models', 'stsb-distilbert-base')
const whisperSourceDir = path.join(projectRoot, 'build', 'whisper-cache')
const whisperDestDir = path.join(os.homedir(), '.savant', 'models', 'whisper')

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}

async function syncModel(name, source, dest) {
  console.log(`[setup-models] Checking local ${name} model files in ${source}...`)
  try {
    await fs.access(source)
  } catch {
    console.log(`[setup-models] ${name} source cache not found.`)
    return
  }

  console.log(`[setup-models] Copying ${name} model files to user destination: ${dest}...`)
  await copyDir(source, dest)
  console.log(`[setup-models] ${name} model setup successfully!`)
}

async function main() {
  try {
    await syncModel('stsb-distilbert-base', stsbSourceDir, stsbDestDir)
    await syncModel('whisper', whisperSourceDir, whisperDestDir)
    console.log('[setup-models] All local models setup completed!')
  } catch (error) {
    console.error('[setup-models] Error setting up models:', error)
    process.exit(1)
  }
}

main()
