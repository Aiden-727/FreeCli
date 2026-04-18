import { describe, expect, it, vi } from 'vitest'
import { syncTerminalNodeSize } from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/syncTerminalNodeSize'

function createContainer(width: number, height: number): HTMLElement {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', {
    configurable: true,
    value: width,
  })
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    value: height,
  })
  return container
}

describe('syncTerminalNodeSize', () => {
  it('uses a lightweight refresh on foreground restore when container size is unchanged', () => {
    const fit = vi.fn()
    const refresh = vi.fn()
    const resize = vi.fn(async () => undefined)
    const terminalElement = document.createElement('div')

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          resize,
        },
      },
    })

    syncTerminalNodeSize({
      terminalRef: {
        current: {
          cols: 100,
          rows: 30,
          element: terminalElement,
          refresh,
        },
      } as never,
      fitAddonRef: {
        current: {
          fit,
        },
      } as never,
      containerRef: {
        current: createContainer(800, 600),
      } as never,
      isPointerResizingRef: { current: false },
      lastSyncedContainerSizeRef: { current: { width: 800, height: 600 } },
      lastSyncedPtySizeRef: { current: { cols: 100, rows: 30 } },
      sessionId: 'session-1',
      mode: 'foreground',
    })

    expect(fit).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(resize).not.toHaveBeenCalled()
  })

  it('falls back to a full sync on foreground restore when container size changed', () => {
    const fit = vi.fn()
    const refresh = vi.fn()
    const resize = vi.fn(async () => undefined)
    const terminalElement = document.createElement('div')
    const lastSyncedContainerSizeRef = { current: { width: 700, height: 500 } }

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          resize,
        },
      },
    })

    syncTerminalNodeSize({
      terminalRef: {
        current: {
          cols: 120,
          rows: 40,
          element: terminalElement,
          refresh,
        },
      } as never,
      fitAddonRef: {
        current: {
          fit,
        },
      } as never,
      containerRef: {
        current: createContainer(800, 600),
      } as never,
      isPointerResizingRef: { current: false },
      lastSyncedContainerSizeRef,
      lastSyncedPtySizeRef: { current: null },
      sessionId: 'session-2',
      mode: 'foreground',
    })

    expect(fit).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(resize).toHaveBeenCalledWith({
      sessionId: 'session-2',
      cols: 120,
      rows: 40,
    })
    expect(lastSyncedContainerSizeRef.current).toEqual({ width: 800, height: 600 })
  })
})
