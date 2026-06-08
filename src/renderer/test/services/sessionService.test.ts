import { describe, it, expect } from 'vitest'
import { validateSessionName, sanitizeSessionName } from '../../services/sessionService'

describe('SessionService', () => {
  describe('validateSessionName', () => {
    it('should return true for valid names', () => {
      expect(validateSessionName('New Research')).toBe(true)
    })

    it('should return false for empty strings', () => {
      expect(validateSessionName('')).toBe(false)
    })

    it('should return false for strings with only whitespace', () => {
      expect(validateSessionName('   ')).toBe(false)
    })

    it('should return false for extremely long names (over 50 chars)', () => {
      const longName = 'a'.repeat(51)
      expect(validateSessionName(longName)).toBe(false)
    })
  })

  describe('sanitizeSessionName', () => {
    it('should trim whitespace', () => {
      expect(sanitizeSessionName('  Research  ')).toBe('Research')
    })

    it('should truncate names longer than 50 characters', () => {
      const longName = 'a'.repeat(60)
      expect(sanitizeSessionName(longName).length).toBe(50)
    })

    it('should replace invalid characters with underscores', () => {
      // Assuming we want to avoid filesystem-unfriendly characters just in case
      expect(sanitizeSessionName('Research / Data')).toBe('Research _ Data')
    })
  })
})
