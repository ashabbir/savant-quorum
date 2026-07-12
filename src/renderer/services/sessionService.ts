const MAX_NAME_LENGTH = 50

export function validateSessionName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  if (trimmed.length > MAX_NAME_LENGTH) return false
  return true
}

export function sanitizeSessionName(name: string): string {
  let sanitized = name.trim()
  if (sanitized.length > MAX_NAME_LENGTH) {
    sanitized = sanitized.substring(0, MAX_NAME_LENGTH)
  }
  // Replace slashes and other potentially problematic chars with underscores
  return sanitized.replace(/[\/\\?%*:|"<>]/g, '_')
}

export function parseFolderClassification(
  response: string,
  allowedFolderIds: string[],
): string | null {
  const trimmed = response
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  let folderId: unknown
  try {
    const parsed = JSON.parse(trimmed)
    folderId = typeof parsed === 'string' ? parsed : parsed?.folderId
  } catch {
    folderId = trimmed
  }

  if (typeof folderId !== 'string') return null
  const normalized = folderId.trim()
  return allowedFolderIds.includes(normalized) ? normalized : null
}

export interface SessionGroupingInput {
  id: string;
  title: string;
  text: string;
}

export interface GroupingFolderInput {
  id: string;
  name: string;
  hint?: string;
}

export interface SessionGroupingSuggestion {
  key: string;
  folderId: string | null;
  folderName: string;
  sessionIds: string[];
  isNewFolder: boolean;
  keywords: string[];
}

const GROUPING_STOP_WORDS = new Set([
  'about', 'after', 'again', 'all', 'also', 'and', 'any', 'are', 'can', 'case', 'chat',
  'could', 'from', 'get', 'have', 'into', 'just', 'like', 'make', 'need', 'new', 'not',
  'please', 'query', 'same', 'session', 'should', 'some', 'that', 'the', 'their', 'then', 'there', 'these',
  'this', 'use', 'used', 'user', 'using', 'want', 'what', 'when', 'where', 'which', 'with',
  'tool', 'work', 'would', 'your',
])

function groupingTokens(value: string): Set<string> {
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3 && !GROUPING_STOP_WORDS.has(token))
    .map(token => token !== 'rails' && token.endsWith('s') && token.length > 4 ? token.slice(0, -1) : token)
  return new Set(tokens)
}

function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0
  let intersection = 0
  left.forEach(token => {
    if (right.has(token)) intersection += 1
  })
  return intersection / (left.size + right.size - intersection)
}

function hasSharedToken(left: Set<string>, right: Set<string>): boolean {
  return [...left].some(token => right.has(token))
}

function hasDistinctiveSharedToken(left: Set<string>, right: Set<string>): boolean {
  return [...left].some(token => token.length >= 6 && right.has(token))
}

function sharedKeywords(sessions: SessionGroupingInput[]): string[] {
  const scores = new Map<string, { documents: number; score: number }>()
  sessions.forEach(session => {
    const textTokens = groupingTokens(session.text)
    const titleTokens = groupingTokens(session.title)
    const documentTokens = new Set([...textTokens, ...titleTokens])
    documentTokens.forEach(token => {
      const current = scores.get(token) || { documents: 0, score: 0 }
      current.documents += 1
      current.score += (textTokens.has(token) ? 1 : 0) + (titleTokens.has(token) ? 2 : 0)
      scores.set(token, current)
    })
  })
  return [...scores.entries()]
    .filter(([, value]) => value.documents >= Math.min(2, sessions.length))
    .sort((left, right) => (
      right[1].documents - left[1].documents
      || right[1].score - left[1].score
      || left[0].localeCompare(right[0])
    ))
    .slice(0, 3)
    .map(([token]) => token)
}

function suggestionFolderName(keywords: string[]): string {
  return keywords
    .slice(0, 2)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' & ') || 'Related Sessions'
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function suggestSessionGrouping(
  sessions: SessionGroupingInput[],
  folders: GroupingFolderInput[],
): Promise<SessionGroupingSuggestion[]> {
  const remaining = new Map(sessions.map(session => [session.id, session]))
  const suggestions: SessionGroupingSuggestion[] = []

  // Pre-calculate and cache embeddings for sessions and folders using DistilBERT model
  const sessionEmbeddings = new Map<string, number[]>()
  for (const session of sessions) {
    try {
      const textToEmbed = `${session.title}. ${session.text}`
      const embed = await window.system.getEmbeddings(textToEmbed)
      if (embed && embed.length > 0) {
        sessionEmbeddings.set(session.id, embed)
      }
    } catch (e) {
      console.warn("Failed to get session embedding:", session.id, e)
    }
  }

  const folderEmbeddings = new Map<string, number[]>()
  for (const folder of folders) {
    try {
      const textToEmbed = `${folder.name}. ${folder.hint || ""}`
      const embed = await window.system.getEmbeddings(textToEmbed)
      if (embed && embed.length > 0) {
        folderEmbeddings.set(folder.id, embed)
      }
    } catch (e) {
      console.warn("Failed to get folder embedding:", folder.id, e)
    }
  }

  folders.forEach(folder => {
    const folderTokens = groupingTokens(`${folder.name} ${folder.hint || ''}`)
    const folderEmbed = folderEmbeddings.get(folder.id)

    const matches = [...remaining.values()].filter(session => {
      // 1. Semantic comparison using DistilBERT embeddings
      const sessionEmbed = sessionEmbeddings.get(session.id)
      if (sessionEmbed && folderEmbed) {
        const sim = cosineSimilarity(sessionEmbed, folderEmbed)
        if (sim >= 0.45) return true
      }

      // 2. Lexical fallback
      const titleTokens = groupingTokens(session.title)
      return hasSharedToken(titleTokens, folderTokens)
        || hasDistinctiveSharedToken(groupingTokens(`${session.title} ${session.text}`), folderTokens)
        || jaccardSimilarity(groupingTokens(`${session.title} ${session.text}`), folderTokens) >= 0.2
    })
    if (matches.length === 0) return
    matches.forEach(session => remaining.delete(session.id))
    suggestions.push({
      key: `existing:${folder.id}`,
      folderId: folder.id,
      folderName: folder.name,
      sessionIds: matches.map(session => session.id),
      isNewFolder: false,
      keywords: [...new Set(matches.flatMap(session => (
        [...groupingTokens(`${session.title} ${session.text}`)]
          .filter(token => folderTokens.has(token))
      )))].slice(0, 3),
    })
  })

  const unassigned = [...remaining.values()]
  const visited = new Set<string>()
  unassigned.forEach(session => {
    if (visited.has(session.id)) return
    const cluster: SessionGroupingInput[] = []
    const queue = [session]
    visited.add(session.id)

    while (queue.length > 0) {
      const current = queue.shift()!
      cluster.push(current)
      const currentTokens = groupingTokens(`${current.title} ${current.text}`)
      const currentTitleTokens = groupingTokens(current.title)
      const currentEmbed = sessionEmbeddings.get(current.id)

      unassigned.forEach(candidate => {
        if (visited.has(candidate.id)) return
        
        let isMatch = false
        const candidateEmbed = sessionEmbeddings.get(candidate.id)
        
        // 1. Semantic match using DistilBERT cosine similarity
        if (currentEmbed && candidateEmbed) {
          const sim = cosineSimilarity(currentEmbed, candidateEmbed)
          if (sim >= 0.5) {
            isMatch = true
          }
        }

        // 2. Lexical fallback
        if (!isMatch) {
          const candidateTitleTokens = groupingTokens(candidate.title)
          const similarity = jaccardSimilarity(
            currentTokens,
            groupingTokens(`${candidate.title} ${candidate.text}`),
          )
          const titleSimilarity = jaccardSimilarity(currentTitleTokens, candidateTitleTokens)
          if (
            similarity >= 0.2
            || titleSimilarity >= 0.2
            || hasSharedToken(currentTitleTokens, candidateTitleTokens)
            || hasDistinctiveSharedToken(
              currentTokens,
              groupingTokens(`${candidate.title} ${candidate.text}`),
            )
          ) {
            isMatch = true
          }
        }

        if (isMatch) {
          visited.add(candidate.id)
          queue.push(candidate)
        }
      })
    }

    if (cluster.length < 2) return
    const keywords = sharedKeywords(cluster)
    const folderName = suggestionFolderName(keywords)
    suggestions.push({
      key: `new:${cluster.map(item => item.id).sort().join(':')}`,
      folderId: null,
      folderName,
      sessionIds: cluster.map(item => item.id),
      isNewFolder: true,
      keywords,
    })
  })

  return suggestions
}
