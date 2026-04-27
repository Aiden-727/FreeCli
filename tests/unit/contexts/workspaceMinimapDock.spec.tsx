import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { TerminalNodeData } from '../../../src/contexts/workspace/presentation/renderer/types'

vi.mock('@xyflow/react', () => {
  return {
    MiniMap: ({ ariaLabel }: { ariaLabel?: string }) => (
      <div data-testid="workspace-minimap-mock" aria-label={ariaLabel}>
        minimap
      </div>
    ),
    useReactFlow: () => ({
      setCenter: vi.fn(),
    }),
    useStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        transform: [0, 0, 1],
        nodes: [
          {
            id: 'node-1',
            position: { x: 100, y: 120 },
            data: {
              sessionId: 'session-1',
              title: 'Terminal',
              width: 420,
              height: 280,
              kind: 'terminal',
              status: 'running',
              startedAt: null,
              endedAt: null,
              exitCode: null,
              lastError: null,
              scrollback: null,
              agent: null,
              task: null,
              note: null,
              image: null,
            },
          },
        ] satisfies Node<TerminalNodeData>[],
        nodeLookup: new Map([
          [
            'node-1',
            {
              hidden: false,
              measured: { width: 420, height: 280 },
              internals: {
                positionAbsolute: { x: 100, y: 120 },
                userNode: { width: 420, height: 280 },
              },
            },
          ],
        ]),
        width: 1280,
        height: 720,
      }),
  }
})

class ResizeObserverMock {
  observe(): void {}
  disconnect(): void {}
}

class MutationObserverMock {
  constructor(private readonly callback: MutationCallback) {}

  observe(): void {
    this.callback([], this as unknown as MutationObserver)
  }

  disconnect(): void {}
}

describe('WorkspaceMinimapDock', () => {
  const originalResizeObserver = window.ResizeObserver
  const originalMutationObserver = window.MutationObserver

  beforeEach(() => {
    window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
    window.MutationObserver = MutationObserverMock as unknown as typeof MutationObserver
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    window.ResizeObserver = originalResizeObserver
    window.MutationObserver = originalMutationObserver
    vi.restoreAllMocks()
  })

  it('mounts the visible minimap dock without throwing runtime reference errors', async () => {
    const { WorkspaceMinimapDock } = await import(
      '../../../src/contexts/workspace/presentation/renderer/components/workspaceCanvas/view/WorkspaceMinimapDock'
    )

    render(
      <WorkspaceMinimapDock
        isMinimapVisible
        minimapNodeColor={() => '#000'}
        minimapNodeStrokeColor={() => '#111'}
        minimapNodeClassName={() => 'workspace-canvas__minimap-node'}
        setIsMinimapVisible={() => undefined}
        onMinimapVisibilityChange={() => undefined}
        focusNodeTargetZoom={1}
      />,
    )

    expect(screen.getByTestId('workspace-minimap-mock')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-minimap-toggle')).toBeInTheDocument()
  })
})
