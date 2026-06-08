/**
 * Chat Mode Service
 * Manages chat mode state and metadata persistence
 */

export type ChatMode = 'collaborate' | 'debate'

export interface ChatModeConfig {
  mode: ChatMode
  timestamp: number
}

export interface ChatModeService {
  /**
   * Get the current chat mode or default to 'collaborate'
   */
  getCurrentMode(): ChatMode

  /**
   * Set the chat mode and persist to session metadata
   */
  setMode(mode: ChatMode): Promise<void>

  /**
   * Create chat mode config for session metadata
   */
  createConfig(mode: ChatMode): ChatModeConfig

  /**
   * Load chat mode from session metadata
   */
  loadFromMetadata(metadata: Record<string, any>): ChatMode | null
}

/**
 * Factory for creating ChatModeService
 * @param deps - Dependencies injected
 * @returns ChatModeService instance
 */
export function createChatModeService(deps: {
  storage?: Storage
} = {}): ChatModeService {
  const storage = deps.storage || (typeof window !== 'undefined' ? window.localStorage : null)

  return {
    getCurrentMode() {
      const stored = storage?.getItem('quorum:chatMode') as ChatMode | null
      return stored || 'collaborate'
    },

    async setMode(mode: ChatMode) {
      if (!storage) return
      storage.setItem('quorum:chatMode', mode)
    },

    createConfig(mode: ChatMode): ChatModeConfig {
      return {
        mode,
        timestamp: Date.now()
      }
    },

    loadFromMetadata(metadata: Record<string, any>): ChatMode | null {
      if (!metadata || !metadata.chatMode) return null
      const mode = metadata.chatMode as ChatMode
      if (mode === 'collaborate' || mode === 'debate') {
        return mode
      }
      return null
    }
  }
}
