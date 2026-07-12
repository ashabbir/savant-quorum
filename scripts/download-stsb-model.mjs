import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelRoot = path.join(projectRoot, 'build', 'stsb-cache', 'v1')
const repoBaseUrl = 'https://huggingface.co/sentence-transformers/stsb-distilbert-base/resolve/main'

const modelFiles = [
  'config.json',
  'config_sentence_transformers.json',
  'modules.json',
  'sentence_bert_config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.txt',
  'onnx/model.onnx',
]

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function downloadFile(relativePath) {
  const targetPath = path.join(modelRoot, relativePath)
  if (await fileExists(targetPath)) {
    console.log(`[stsb] cached ${relativePath}`)
    return
  }

  const url = `${repoBaseUrl}/${relativePath}`
  console.log(`[stsb] downloading ${relativePath}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, bytes)
}

async function main() {
  try {
    console.log(`[stsb] Preparing local model in ${modelRoot}`)
    for (const file of modelFiles) {
      await downloadFile(file)
    }
    console.log('[stsb] Local model ready')
  } catch (err) {
    console.error('[stsb] Failed to prepare model:', err.message)
    process.exit(1)
  }
}

main()
