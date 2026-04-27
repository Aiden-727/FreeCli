import type { Terminal } from '@xterm/xterm'
import { containsWideGlyphs } from './renderingHeuristics'

export interface TerminalOutputScheduler {
  handleChunk: (
    data: string,
    options?: {
      immediateScrollbackPublish?: boolean
    },
  ) => void
  onViewportInteractionActiveChange: (isActive: boolean) => void
  hasPendingWrites: () => boolean
  dispose: () => void
}

type ScrollbackBuffer = {
  append: (data: string) => void
}

const INLINE_ACTIVE_LINE_REFRESH_MAX_CHARS = 256
const BOTTOM_REFRESH_RISK_ROW_WINDOW = 2

function resolveLocalRefreshRange(terminal: Pick<Terminal, 'rows' | 'buffer'>): {
  start: number
  end: number
} {
  const cursorY = terminal.buffer.active.cursorY
  return {
    start: Math.max(0, cursorY - 1),
    end: Math.min(terminal.rows - 1, cursorY + 1),
  }
}

function shouldScheduleLocalRefresh(
  terminal: Pick<Terminal, 'rows' | 'buffer'>,
  data: string,
): boolean {
  if (data.length === 0) {
    return false
  }

  if (containsWideGlyphs(data)) {
    return true
  }

  if (data.length > INLINE_ACTIVE_LINE_REFRESH_MAX_CHARS || data.includes('\n')) {
    return false
  }

  const cursorY = terminal.buffer.active.cursorY
  if (!Number.isFinite(cursorY)) {
    return false
  }

  const firstRiskyRow = Math.max(0, terminal.rows - BOTTOM_REFRESH_RISK_ROW_WINDOW)
  return cursorY >= firstRiskyRow
}

export function createTerminalOutputScheduler({
  terminal,
  scrollbackBuffer,
  markScrollbackDirty,
  options,
}: {
  terminal: Terminal
  scrollbackBuffer: ScrollbackBuffer
  markScrollbackDirty: (immediate?: boolean) => void
  options?: Partial<{
    maxPendingChars: number
    normalWriteChunkChars: number
    viewportInteractionWriteChunkChars: number
    viewportInteractionFlushDelayMs: number
  }>
}): TerminalOutputScheduler {
  const maxPendingChars = options?.maxPendingChars ?? 1_000_000
  const normalWriteChunkChars = options?.normalWriteChunkChars ?? 64_000
  const viewportInteractionWriteChunkChars = options?.viewportInteractionWriteChunkChars ?? 8_000
  const viewportInteractionFlushDelayMs = options?.viewportInteractionFlushDelayMs ?? 300

  const pendingWrites: string[] = []
  let pendingWritesHead = 0
  let pendingWriteChars = 0
  let pendingWriteFrame: number | null = null
  let viewportFlushTimer: number | null = null
  let localRefreshFrame: number | null = null
  let pendingLocalRefreshRange: { start: number; end: number } | null = null

  let isDisposed = false
  let isDraining = false
  let isViewportInteractionActive = false

  const hasPending = (): boolean => {
    return pendingWritesHead < pendingWrites.length
  }

  const cleanupPendingWrites = (): void => {
    if (pendingWritesHead <= 64) {
      return
    }

    pendingWrites.splice(0, pendingWritesHead)
    pendingWritesHead = 0
  }

  const enqueue = (data: string): void => {
    pendingWrites.push(data)
    pendingWriteChars += data.length
  }

  const takeChunk = (maxChars: number): string => {
    let remaining = maxChars
    const parts: string[] = []

    while (remaining > 0 && pendingWritesHead < pendingWrites.length) {
      const next = pendingWrites[pendingWritesHead] ?? ''
      if (next.length <= remaining) {
        parts.push(next)
        pendingWriteChars -= next.length
        pendingWritesHead += 1
        remaining -= next.length
        continue
      }

      parts.push(next.slice(0, remaining))
      pendingWrites[pendingWritesHead] = next.slice(remaining)
      pendingWriteChars -= remaining
      remaining = 0
    }

    cleanupPendingWrites()
    return parts.length === 1 ? (parts[0] ?? '') : parts.join('')
  }

  const cancelViewportFlushTimer = (): void => {
    if (viewportFlushTimer === null) {
      return
    }

    window.clearTimeout(viewportFlushTimer)
    viewportFlushTimer = null
  }

  const scheduleLocalRefresh = (data: string): void => {
    if (isDisposed || !shouldScheduleLocalRefresh(terminal, data)) {
      return
    }

    const nextRange = resolveLocalRefreshRange(terminal)
    if (!pendingLocalRefreshRange) {
      pendingLocalRefreshRange = nextRange
    } else {
      pendingLocalRefreshRange = {
        start: Math.min(pendingLocalRefreshRange.start, nextRange.start),
        end: Math.max(pendingLocalRefreshRange.end, nextRange.end),
      }
    }

    if (localRefreshFrame !== null) {
      return
    }

    localRefreshFrame = window.requestAnimationFrame(() => {
      localRefreshFrame = null
      const range = pendingLocalRefreshRange
      pendingLocalRefreshRange = null
      if (isDisposed || !range) {
        return
      }

      // Some Chromium/xterm canvas paths leave stale pixels on the active prompt line
      // until a later repaint. Refreshing a tiny local range is cheaper than a full
      // terminal redraw and fixes "text exists but only appears after Enter".
      terminal.refresh(range.start, range.end)
    })
  }

  const scheduleViewportFlush = (): void => {
    if (isDisposed || viewportFlushTimer !== null) {
      return
    }

    viewportFlushTimer = window.setTimeout(() => {
      viewportFlushTimer = null
      flush({
        allowDuringViewportInteraction: true,
        budgetChars: viewportInteractionWriteChunkChars,
      })
    }, viewportInteractionFlushDelayMs)
  }

  const flush = ({
    allowDuringViewportInteraction = false,
    budgetChars,
    force = false,
  }: {
    allowDuringViewportInteraction?: boolean
    budgetChars?: number
    force?: boolean
  } = {}): void => {
    if (isDisposed || isDraining || !hasPending()) {
      return
    }

    const canDrainDuringViewportInteraction = allowDuringViewportInteraction || force
    const shouldBlock = isViewportInteractionActive && !canDrainDuringViewportInteraction
    if (shouldBlock) {
      return
    }

    isDraining = true
    let remainingBudget =
      typeof budgetChars === 'number' && Number.isFinite(budgetChars)
        ? Math.max(0, budgetChars)
        : Number.POSITIVE_INFINITY

    const drainStep = () => {
      if (isDisposed) {
        isDraining = false
        return
      }

      const isInteracting = isViewportInteractionActive
      if (isInteracting && !canDrainDuringViewportInteraction) {
        isDraining = false
        scheduleViewportFlush()
        return
      }

      if (!hasPending()) {
        isDraining = false
        return
      }

      if (remainingBudget <= 0) {
        isDraining = false

        if (isViewportInteractionActive && allowDuringViewportInteraction && hasPending()) {
          scheduleViewportFlush()
        } else if (!isViewportInteractionActive && hasPending()) {
          pendingWriteFrame = window.requestAnimationFrame(() => {
            pendingWriteFrame = null
            flush()
          })
        }

        return
      }

      const maxChunkSize = isInteracting
        ? viewportInteractionWriteChunkChars
        : normalWriteChunkChars
      const chunk = takeChunk(Math.min(maxChunkSize, remainingBudget))
      if (chunk.length === 0) {
        isDraining = false
        return
      }

      remainingBudget -= chunk.length
      terminal.write(chunk, () => {
        scheduleLocalRefresh(chunk)
        pendingWriteFrame = window.requestAnimationFrame(() => {
          pendingWriteFrame = null
          drainStep()
        })
      })
    }

    drainStep()
  }

  const handleChunk: TerminalOutputScheduler['handleChunk'] = (data, chunkOptions) => {
    if (data.length === 0 || isDisposed) {
      return
    }

    scrollbackBuffer.append(data)
    markScrollbackDirty(chunkOptions?.immediateScrollbackPublish === true)

    const shouldDeferWrite = isViewportInteractionActive || isDraining || hasPending()

    if (shouldDeferWrite) {
      enqueue(data)

      if (isViewportInteractionActive) {
        if (pendingWriteChars >= maxPendingChars) {
          flush({ force: true })
        } else {
          scheduleViewportFlush()
        }
        return
      }

      flush()
      return
    }

    terminal.write(data, () => {
      scheduleLocalRefresh(data)
    })
  }

  const onViewportInteractionActiveChange = (isActive: boolean) => {
    if (isDisposed) {
      return
    }

    isViewportInteractionActive = isActive
    if (!isActive) {
      cancelViewportFlushTimer()
      flush()
    }
  }

  return {
    handleChunk,
    onViewportInteractionActiveChange,
    hasPendingWrites: () => hasPending() || isDraining,
    dispose: () => {
      isDisposed = true
      cancelViewportFlushTimer()
      if (pendingWriteFrame !== null) {
        window.cancelAnimationFrame(pendingWriteFrame)
        pendingWriteFrame = null
      }
      if (localRefreshFrame !== null) {
        window.cancelAnimationFrame(localRefreshFrame)
        localRefreshFrame = null
      }
      pendingLocalRefreshRange = null
      pendingWrites.length = 0
      pendingWritesHead = 0
      pendingWriteChars = 0
      isDraining = false
    },
  }
}
