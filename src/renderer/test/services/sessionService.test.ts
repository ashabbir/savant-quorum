import { describe, it, expect } from 'vitest'
import {
  parseFolderClassification,
  sanitizeSessionName,
  suggestSessionGrouping,
  validateSessionName,
} from '../../services/sessionService'

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

  describe('parseFolderClassification', () => {
    it('returns an allowed folder ID from JSON', () => {
      expect(parseFolderClassification('{"folderId":"f-code"}', ['f-code'])).toBe('f-code')
    })

    it('handles fenced JSON responses', () => {
      expect(parseFolderClassification('```json\n{"folderId":"f-research"}\n```', ['f-research'])).toBe('f-research')
    })

    it('rejects unknown folder IDs and null classifications', () => {
      expect(parseFolderClassification('{"folderId":"unknown"}', ['f-code'])).toBeNull()
      expect(parseFolderClassification('{"folderId":null}', ['f-code'])).toBeNull()
    })

    describe('suggestSessionGrouping', () => {
      it('groups similar unfiled sessions into a proposed new folder', () => {
        const suggestions = suggestSessionGrouping([
          { id: '1', title: 'React rendering issue', text: 'component state and frontend rendering' },
          { id: '2', title: 'React component tests', text: 'frontend component testing' },
          { id: '3', title: 'Database migration', text: 'postgres schema change' },
        ], [])

        expect(suggestions).toHaveLength(1)
        expect(suggestions[0].isNewFolder).toBe(true)
        expect(suggestions[0].sessionIds.sort()).toEqual(['1', '2'])
        expect(suggestions[0].keywords).toContain('react')
      })

      it('suggests an existing folder when its name or hint matches', () => {
        const suggestions = suggestSessionGrouping([
          { id: '1', title: 'Rails query tuning', text: 'database query performance' },
        ], [
          { id: 'backend', name: 'Backend', hint: 'Rails database query performance' },
        ])

        expect(suggestions).toEqual([expect.objectContaining({
          folderId: 'backend',
          sessionIds: ['1'],
          isNewFolder: false,
          keywords: expect.arrayContaining(['rails', 'database']),
        })])
      })

      it('groups sessions with the same acronym in their titles', () => {
        const suggestions = suggestSessionGrouping([
          { id: '1', title: 'MFA registration issue', text: 'authentication enrollment behavior for organizations' },
          { id: '2', title: 'MFA login failure', text: 'sign in challenge diagnostics and recovery' },
        ], [])

        expect(suggestions).toHaveLength(1)
        expect(suggestions[0].sessionIds.sort()).toEqual(['1', '2'])
        expect(suggestions[0].keywords).toContain('mfa')
      })

      it('groups chats sharing a distinctive domain term despite different surrounding words', () => {
        const suggestions = suggestSessionGrouping([
          {
            id: '1',
            title: 'Cookie issue',
            text: 'splunk cookie ap 7sbc7l5bz8ml splunkweb mfa return to 8443',
          },
          {
            id: '2',
            title: 'Support investigation',
            text: 'support query splunk tool',
          },
        ], [])

        expect(suggestions).toHaveLength(1)
        expect(suggestions[0].sessionIds.sort()).toEqual(['1', '2'])
        expect(suggestions[0].keywords).toContain('splunk')
      })
    })
  })
})
