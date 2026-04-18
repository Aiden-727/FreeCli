import { TERMINAL_LAYOUT_SYNC_EVENT } from './constants'

const FOREGROUND_SYNC_BATCH_SIZE = 4

const pendingForegroundSyncCallbacks = new Set<() => void>()
const registeredForegroundSyncCallbacks = new Set<() => void>()

let foregroundSyncFrameId: number | null = null
let foregroundSyncListenersRefCount = 0
let disposeGlobalForegroundListeners: (() => void) | null = null

function flushForegroundSyncBatch(): void {
  foregroundSyncFrameId = null

  if (pendingForegroundSyncCallbacks.size === 0) {
    return
  }

  const batch = Array.from(pendingForegroundSyncCallbacks).slice(0, FOREGROUND_SYNC_BATCH_SIZE)
  for (const callback of batch) {
    pendingForegroundSyncCallbacks.delete(callback)
    callback()
  }

  if (pendingForegroundSyncCallbacks.size > 0) {
    foregroundSyncFrameId = window.requestAnimationFrame(() => {
      flushForegroundSyncBatch()
    })
  }
}

function schedulePendingForegroundSyncs(): void {
  if (pendingForegroundSyncCallbacks.size === 0 || foregroundSyncFrameId !== null) {
    return
  }

  foregroundSyncFrameId = window.requestAnimationFrame(() => {
    flushForegroundSyncBatch()
  })
}

function ensureGlobalForegroundListeners(): void {
  if (disposeGlobalForegroundListeners) {
    return
  }

  const handleForegroundRestore = () => {
    registeredForegroundSyncCallbacks.forEach(callback => {
      pendingForegroundSyncCallbacks.add(callback)
    })
    schedulePendingForegroundSyncs()
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      handleForegroundRestore()
    }
  }

  window.addEventListener('focus', handleForegroundRestore)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  disposeGlobalForegroundListeners = () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('focus', handleForegroundRestore)
    disposeGlobalForegroundListeners = null
  }
}

function retainGlobalForegroundListeners(): void {
  foregroundSyncListenersRefCount += 1
  ensureGlobalForegroundListeners()
}

function releaseGlobalForegroundListeners(): void {
  foregroundSyncListenersRefCount = Math.max(0, foregroundSyncListenersRefCount - 1)
  if (foregroundSyncListenersRefCount > 0) {
    return
  }

  disposeGlobalForegroundListeners?.()
}

export function createTerminalForegroundSyncScheduler(onForegroundSync: () => void): {
  schedule: () => void
  dispose: () => void
} {
  return {
    schedule: () => {
      pendingForegroundSyncCallbacks.add(onForegroundSync)
      schedulePendingForegroundSyncs()
    },
    dispose: () => {
      pendingForegroundSyncCallbacks.delete(onForegroundSync)
      registeredForegroundSyncCallbacks.delete(onForegroundSync)

      if (pendingForegroundSyncCallbacks.size === 0 && foregroundSyncFrameId !== null) {
        window.cancelAnimationFrame(foregroundSyncFrameId)
        foregroundSyncFrameId = null
      }
    },
  }
}

export function registerTerminalLayoutSync({
  onForegroundSync,
  onLayoutSync,
}: {
  onForegroundSync: () => void
  onLayoutSync: () => void
}): () => void {
  retainGlobalForegroundListeners()
  registeredForegroundSyncCallbacks.add(onForegroundSync)
  window.addEventListener(TERMINAL_LAYOUT_SYNC_EVENT, onLayoutSync)

  return () => {
    registeredForegroundSyncCallbacks.delete(onForegroundSync)
    window.removeEventListener(TERMINAL_LAYOUT_SYNC_EVENT, onLayoutSync)
    releaseGlobalForegroundListeners()
  }
}
