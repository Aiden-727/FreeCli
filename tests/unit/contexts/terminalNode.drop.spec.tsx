import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

declare global {
  interface Window {
    ResizeObserver: typeof ResizeObserver
  }
}

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    public static lastInstance: MockTerminal | null = null

    public cols = 80
    public rows = 24
    public options: { fontSize: number; theme?: unknown } = { fontSize: 13 }
    public pasteCalls: string[] = []

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

    public paste(data: string): void {
      this.pasteCalls.push(data)
    }

    public refresh(): void {}

    public dispose(): void {}

    public attachCustomKeyEventHandler(): void {}

    public onData() {
      return { dispose: () => undefined }
    }

    public onBinary() {
      return { dispose: () => undefined }
    }

    public write(_data: string, callback?: () => void): void {
      callback?.()
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
      selector({ coveDragSurfaceSelectionMode: false }),
  }
})

function installResizeObserverMock() {
  if (typeof window.ResizeObserver !== 'undefined') {
    return
  }

  window.ResizeObserver = class ResizeObserver {
    public observe(): void {}
    public disconnect(): void {}
    public unobserve(): void {}
  }
}

function installFreeCliApiMock({
  resolveDroppedPaths,
  materializeImageTempFile,
}: {
  resolveDroppedPaths: (files: readonly File[]) => string[]
  materializeImageTempFile?: () => Promise<{ path: string } | null>
}) {
  const ptyWrite = vi.fn(async () => undefined)

  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    writable: true,
    value: {
      meta: {
        isTest: true,
      },
      clipboard: {
        materializeImageTempFile: materializeImageTempFile ?? vi.fn(async () => null),
      },
      workspace: {
        resolveDroppedPaths,
      },
      pty: {
        attach: vi.fn(async () => undefined),
        detach: vi.fn(async () => undefined),
        snapshot: vi.fn(async () => ({ data: '' })),
        onData: vi.fn(() => () => undefined),
        onExit: vi.fn(() => () => undefined),
        write: ptyWrite,
        resize: vi.fn(async () => undefined),
      },
    },
  })

  return {
    ptyWrite,
  }
}

describe('TerminalNode file drop', () => {
  beforeEach(() => {
    installResizeObserverMock()
  })

  it('pastes quoted paths into the terminal and stops canvas bubbling', async () => {
    const { ptyWrite } = installFreeCliApiMock({
      resolveDroppedPaths: () => ['C:\\Demo Path\\dropped-image.png'],
    })
    const parentDrop = vi.fn()
    const onShowMessage = vi.fn()

    const { TerminalNode } =
      await import('../../../src/contexts/workspace/presentation/renderer/components/TerminalNode')

    const { container } = render(
      <div onDrop={parentDrop}>
        <TerminalNode
          nodeId="node-drop"
          sessionId="session-drop"
          title="drop"
          kind="terminal"
          profileId="powershell"
          runtimeKind="windows"
          status={null}
          lastError={null}
          position={{ x: 0, y: 0 }}
          width={520}
          height={360}
          terminalFontSize={13}
          scrollback={null}
          onClose={() => undefined}
          onResize={() => undefined}
          onShowMessage={onShowMessage}
        />
      </div>,
    )

    const terminalBody = container.querySelector('.terminal-node__terminal')
    if (!(terminalBody instanceof HTMLDivElement)) {
      throw new Error('terminal body missing')
    }

    const file = new File(['x'], 'dropped-image.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.drop(terminalBody, {
        dataTransfer: {
          files: [file],
          items: [{ kind: 'file', type: 'image/png' }],
          types: ['Files'],
        },
      })
    })

    await waitFor(() => {
      expect(ptyWrite).toHaveBeenCalledWith({
        sessionId: 'session-drop',
        data: `'C:\\Demo Path\\dropped-image.png'`,
      })
    })

    expect(parentDrop).not.toHaveBeenCalled()
    expect(onShowMessage).not.toHaveBeenCalled()
  })

  it('turns pasted clipboard images into temporary file paths and stops canvas paste bubbling', async () => {
    const { ptyWrite } = installFreeCliApiMock({
      resolveDroppedPaths: () => [],
      materializeImageTempFile: vi.fn(async () => ({
        path: 'C:\\Temp\\clipboard-image.png',
      })),
    })
    const parentPaste = vi.fn()
    const onShowMessage = vi.fn()

    const { TerminalNode } =
      await import('../../../src/contexts/workspace/presentation/renderer/components/TerminalNode')

    const { container } = render(
      <div onPaste={parentPaste}>
        <TerminalNode
          nodeId="node-paste-image"
          sessionId="session-paste-image"
          title="paste-image"
          kind="terminal"
          profileId="powershell"
          runtimeKind="windows"
          status={null}
          lastError={null}
          position={{ x: 0, y: 0 }}
          width={520}
          height={360}
          terminalFontSize={13}
          scrollback={null}
          onClose={() => undefined}
          onResize={() => undefined}
          onShowMessage={onShowMessage}
        />
      </div>,
    )

    const terminalBody = container.querySelector('.terminal-node__terminal')
    if (!(terminalBody instanceof HTMLDivElement)) {
      throw new Error('terminal body missing')
    }

    const file = new File(['x'], 'clipboard-image.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.paste(terminalBody, {
        clipboardData: {
          files: [file],
          items: [{ kind: 'file', type: 'image/png' }],
          types: ['Files'],
        },
      })
    })

    await waitFor(() => {
      expect(ptyWrite).toHaveBeenCalledWith({
        sessionId: 'session-paste-image',
        data: `'C:\\Temp\\clipboard-image.png'`,
      })
    })

    expect(parentPaste).not.toHaveBeenCalled()
    expect(onShowMessage).not.toHaveBeenCalled()
  })
})
