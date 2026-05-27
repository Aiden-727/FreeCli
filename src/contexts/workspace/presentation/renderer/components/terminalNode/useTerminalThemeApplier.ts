import { useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'
import type { MutableRefObject } from 'react'
import { resolveTerminalTheme, resolveTerminalUiTheme, type TerminalThemeMode } from './theme'

function resolveTerminalRefreshRange(terminal: Pick<Terminal, 'rows' | 'buffer'>): {
  start: number
  end: number
} {
  const cursorY = terminal.buffer?.active?.cursorY ?? -1
  if (!Number.isFinite(cursorY) || cursorY < 0 || cursorY >= terminal.rows) {
    return {
      start: 0,
      end: Math.max(0, terminal.rows - 1),
    }
  }

  return {
    start: Math.max(0, cursorY - 1),
    end: Math.min(terminal.rows - 1, cursorY + 1),
  }
}

export function useTerminalThemeApplier({
  terminalRef,
  containerRef,
  terminalThemeMode = 'sync-with-ui',
}: {
  terminalRef: MutableRefObject<Terminal | null>
  containerRef: MutableRefObject<HTMLDivElement | null>
  terminalThemeMode?: TerminalThemeMode
}): () => void {
  return useCallback(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    const resolvedTerminalUiTheme = resolveTerminalUiTheme(terminalThemeMode)
    terminal.options.theme = { ...resolveTerminalTheme(terminalThemeMode) }
    containerRef.current?.setAttribute('data-cove-terminal-theme', resolvedTerminalUiTheme)
    const refreshRange = resolveTerminalRefreshRange(terminal)
    terminal.refresh(refreshRange.start, refreshRange.end)
  }, [containerRef, terminalRef, terminalThemeMode])
}
