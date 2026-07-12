import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(projectRoot, 'build', 'whisper-cache')
const destDir = path.join(os.homedir(), '.savant', 'models', 'whisper')

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

async function main() {
  try {
    console.log(`[setup-whisper] Checking local model files in ${sourceDir}...`)
    // Check if source exists
    try {
      await fs.access(sourceDir)
    } catch {
      console.log('[setup-whisper] Local model source cache not found. Please download using: npm run prepare:whisper')
      return
    }

    console.log(`[setup-whisper] Copying model files to user destination: ${destDir}...`)
    await copyDir(sourceDir, destDir)
    console.log('[setup-whisper] Local model setup successfully!')
  } catch (error) {
    console.error('[setup-whisper] Error setting up model in ~/.savant/models/whisper:', error)
    process.exit(1)
  }
}

main()
