export function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage ?? null
  } catch {
    return null
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) {
    return false
  }

  if (error instanceof DOMException) {
    return error.name === 'QuotaExceededError'
  }

  const record = error as { name?: unknown; code?: unknown; message?: unknown }

  if (record.name === 'QuotaExceededError' || record.code === 22) {
    return true
  }

  return typeof record.message === 'string' && record.message.toLowerCase().includes('quota')
}
