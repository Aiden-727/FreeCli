import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTerminalOutputScheduler } from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/outputScheduler'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('terminal output scheduler', () => {
  it('refreshes a tiny local range after wide-glyph writes', () => {
    const refresh = vi.fn()
    const write = vi.fn((_: string, callback?: () => void) => {
      callback?.()
    })
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(16)
        return 1
      })

    const scheduler = createTerminalOutputScheduler({
      terminal: {
        write,
        refresh,
        rows: 24,
        buffer: {
          active: {
            cursorY: 5,
          },
        },
      } as never,
      scrollbackBuffer: {
        append: vi.fn(),
      },
      markScrollbackDirty: vi.fn(),
    })

    scheduler.handleChunk('中文输入')

    expect(write).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledWith(4, 6)
    expect(requestAnimationFrameSpy).toHaveBeenCalled()
  })

  it('refreshes the active bottom prompt line for short ascii writes', () => {
    const refresh = vi.fn()
    const write = vi.fn((_: string, callback?: () => void) => {
      callback?.()
    })
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        callback(16)
        return 1
      })

    const scheduler = createTerminalOutputScheduler({
      terminal: {
        write,
        refresh,
        rows: 24,
        buffer: {
          active: {
            cursorY: 23,
          },
        },
      } as never,
      scrollbackBuffer: {
        append: vi.fn(),
      },
      markScrollbackDirty: vi.fn(),
    })

    scheduler.handleChunk('plain ascii')

    expect(write).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledWith(22, 23)
    expect(requestAnimationFrameSpy).toHaveBeenCalled()
  })

  it('does not force an extra refresh for plain ascii writes away from the bottom prompt line', () => {
    const refresh = vi.fn()
    const write = vi.fn((_: string, callback?: () => void) => {
      callback?.()
    })

    const scheduler = createTerminalOutputScheduler({
      terminal: {
        write,
        refresh,
        rows: 24,
        buffer: {
          active: {
            cursorY: 5,
          },
        },
      } as never,
      scrollbackBuffer: {
        append: vi.fn(),
      },
      markScrollbackDirty: vi.fn(),
    })

    scheduler.handleChunk('plain ascii')

    expect(write).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('terminal rendering heuristics', () => {
  it('enables Windows-friendly glyph settings for Windows and WSL runtimes', async () => {
    const heuristics =
      await import('../../../src/contexts/workspace/presentation/renderer/components/terminalNode/renderingHeuristics')

    expect(heuristics.shouldEnableOverlappingGlyphRescale('win32', 'windows')).toBe(true)
    expect(heuristics.shouldEnableOverlappingGlyphRescale('linux', 'wsl')).toBe(true)
    expect(heuristics.shouldEnableOverlappingGlyphRescale('darwin', 'posix')).toBe(false)
    expect(heuristics.resolveTerminalFontFamily('win32', 'windows')).toContain('Sarasa Mono SC')
    expect(heuristics.containsWideGlyphs('中文 mixed')).toBe(true)
    expect(heuristics.containsWideGlyphs('plain ascii')).toBe(false)
  })
})
