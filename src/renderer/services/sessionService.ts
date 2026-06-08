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
