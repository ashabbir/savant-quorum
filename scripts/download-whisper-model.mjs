import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelRoot = path.join(projectRoot, 'build', 'whisper-cache', 'Xenova', 'whisper-tiny.en')
const repoBaseUrl = 'https://huggingface.co/Xenova/whisper-tiny.en/resolve/main'

const modelFiles = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/decoder_model_merged_quantized.onnx',
  'onnx/encoder_model_quantized.onnx',
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
    console.log(`[whisper] cached ${relativePath}`)
    return
  }

  const url = `${repoBaseUrl}/${relativePath}`
  console.log(`[whisper] downloading ${relativePath}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, bytes)
}

console.log(`[whisper] Preparing local model in ${modelRoot}`)
for (const file of modelFiles) {
  await downloadFile(file)
}
console.log('[whisper] Local model ready')
