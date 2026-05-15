import React from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

declare global {
  interface Window {
    ResizeObserver: typeof ResizeObserver
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    public static lastInstance: MockTerminal | null = null

    public cols = 80
    public rows = 24
    public options: { fontSize: number; theme?: unknown } = { fontSize: 13 }
    public pasteCalls: string[] = []
    private customKeyHandler: ((event: KeyboardEvent) => boolean) | null = null
    private dataListener: ((data: string) => void) | null = null
    private binaryListener: ((data: string) => void) | null = null

    public constructor(options?: { cols?: number; rows?: number; theme?: unknown }) {
      MockTerminal.lastInstance = this
      this.cols = options?.cols ?? 80
      this.rows = options?.rows ?? 24
      this.options = {
        ...this.options,
        ...(options?.theme ? { theme: options.theme } : {}),
      }
    }

    public loadAddon(addon: { activate?: (terminal: MockTerminal) => void }): void {
      addon.activate?.(this)
    }

    public open(): void {}

    public focus(): void {}

    public refresh(): void {}

    public dispose(): void {}

    public attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
      this.customKeyHandler = handler
    }

    public onData(listener: (data: string) => void) {
      this.dataListener = listener
      return {
        dispose: () => {
          this.dataListener = null
        },
      }
    }

    public onBinary(listener: (data: string) => void) {
      this.binaryListener = listener
      return {
        dispose: () => {
          this.binaryListener = null
        },
      }
    }

    public paste(data: string): void {
      this.pasteCalls.push(data)
      this.dataListener?.(data)
    }

    public write(_data: string, callback?: () => void): void {
      callback?.()
    }

    public dispatchCustomKey(event: KeyboardEvent): boolean {
      return this.customKeyHandler?.(event) ?? true
    }
  }

  return {
    Terminal: MockTerminal,
    __getLastTerminal: () => MockTerminal.lastInstance,
  }
})

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    public fit(): void {}
  }

  return { FitAddon: MockFitAddon }
})

vi.mock('@xterm/addon-serialize', () => {
  class MockSerializeAddon {
    public activate(): void {}

    public serialize(): string {
      return '[mock-serialized]'
    }

    public dispose(): void {}
  }

  return { SerializeAddon: MockSerializeAddon }
})

vi.mock('@xyflow/react', () => {
  return {
    Handle: () => null,
    Position: {
      Left: 'left',
      Right: 'right',
    },
    useStore: (selector: (state: unknown) => unknown) =>
      selector({
        coveDragSurfaceSelectionMode: false,
        coveViewportInteractionActive: false,
      }),
  }
})

describe('TerminalNode paste indicator', () => {
  beforeEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'Win32',
    })
    if (typeof window.ResizeObserver === 'undefined') {
      window.ResizeObserver = class ResizeObserver {
        public observe(): void {}
        public disconnect(): void {}
        public unobserve(): void {}
      }
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows indicator while clipboard paste is still flushing and hides it after completion', async () => {
    const clipboardDeferred = createDeferred<string>()
    const writeDeferred = createDeferred<void>()
    const writeCalls: Array<{ sessionId: string; data: string }> = []

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        meta: {
          isTest: true,
          platform: 'win32',
        },
        clipboard: {
          readText: vi.fn(() => clipboardDeferred.promise),
        },
        pty: {
          attach: vi.fn(async () => undefined),
          detach: vi.fn(async () => undefined),
          snapshot: vi.fn(async () => ({ data: '' })),
          onData: vi.fn(() => () => undefined),
          onExit: vi.fn(() => () => undefined),
          write: vi.fn((payload: { sessionId: string; data: string }) => {
            writeCalls.push(payload)
            return writeDeferred.promise
          }),
          resize: vi.fn(async () => undefined),
        },
        workspace: {},
      },
    })

    const { TerminalNode } =
      await import('../../../src/contexts/workspace/presentation/renderer/components/TerminalNode')

    const { container, queryByText } = render(
      <TerminalNode
        nodeId="node-paste-indicator"
        sessionId="session-paste-indicator"
        title="paste"
        kind="terminal"
        status={null}
        lastError={null}
        position={{ x: 0, y: 0 }}
        width={520}
        height={360}
        terminalFontSize={13}
        scrollback={null}
        persistenceMode="persistent"
        onClose={() => undefined}
        onResize={() => undefined}
      />,
    )

    await waitFor(() => {
      expect(window.freecliApi.pty.snapshot).toHaveBeenCalledTimes(1)
    })

    const { __getLastTerminal } = await import('@xterm/xterm')
    const terminal = __getLastTerminal()
    if (!terminal) {
      throw new Error('terminal instance missing')
    }

    const keyEvent = {
      type: 'keydown',
      key: 'v',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent

    terminal.dispatchCustomKey(keyEvent)

    clipboardDeferred.resolve('long clipboard payload')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(writeCalls[0]).toEqual({
        sessionId: 'session-paste-indicator',
        data: 'l',
      })
    })
    expect(queryByText('正在粘贴中')).toBeNull()

    await act(async () => {
      await new Promise(resolve => {
        window.setTimeout(resolve, 220)
      })
    })

    expect(container.querySelector('.terminal-node__paste-indicator')).not.toBeNull()
    expect(queryByText('正在粘贴中')).not.toBeNull()

    writeDeferred.resolve()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(writeCalls.map(call => call.data).join('')).toBe('long clipboard payload')
      expect(container.querySelector('.terminal-node__paste-indicator')).toBeNull()
    })
  })

  it('defers Enter until an async clipboard paste has finished resolving', async () => {
    const clipboardDeferred = createDeferred<string>()
    const writeDeferred = createDeferred<void>()
    const writeCalls: Array<{ sessionId: string; data: string }> = []

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        meta: {
          isTest: true,
          platform: 'win32',
        },
        clipboard: {
          readText: vi.fn(() => clipboardDeferred.promise),
        },
        pty: {
          attach: vi.fn(async () => undefined),
          detach: vi.fn(async () => undefined),
          snapshot: vi.fn(async () => ({ data: '' })),
          onData: vi.fn(() => () => undefined),
          onExit: vi.fn(() => () => undefined),
          write: vi.fn((payload: { sessionId: string; data: string }) => {
            writeCalls.push(payload)
            return writeDeferred.promise
          }),
          resize: vi.fn(async () => undefined),
        },
        workspace: {},
      },
    })

    const { TerminalNode } =
      await import('../../../src/contexts/workspace/presentation/renderer/components/TerminalNode')

    render(
      <TerminalNode
        nodeId="node-paste-enter-order"
        sessionId="session-paste-enter-order"
        title="paste-enter-order"
        kind="terminal"
        status={null}
        lastError={null}
        position={{ x: 0, y: 0 }}
        width={520}
        height={360}
        terminalFontSize={13}
        scrollback={null}
        persistenceMode="persistent"
        onClose={() => undefined}
        onResize={() => undefined}
      />,
    )

    await waitFor(() => {
      expect(window.freecliApi.pty.snapshot).toHaveBeenCalledTimes(1)
    })

    const { __getLastTerminal } = await import('@xterm/xterm')
    const terminal = __getLastTerminal()
    if (!terminal) {
      throw new Error('terminal instance missing')
    }

    const pasteEvent = {
      type: 'keydown',
      key: 'v',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent

    terminal.dispatchCustomKey(pasteEvent)

    const enterEvent = {
      type: 'keydown',
      key: 'Enter',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent

    terminal.dispatchCustomKey(enterEvent)
    await act(async () => {
      await Promise.resolve()
    })

    expect(writeCalls).toEqual([])

    clipboardDeferred.resolve('clipboard-image-path')
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(writeCalls[0]).toEqual({
        sessionId: 'session-paste-enter-order',
        data: 'c',
      })
    })

    writeDeferred.resolve()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(writeCalls.map(call => call.data).join('')).toBe('clipboard-image-path\r')
    })
  })
})
