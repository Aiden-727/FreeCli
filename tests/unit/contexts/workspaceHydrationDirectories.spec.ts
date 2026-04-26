import type { Node } from '@xyflow/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hydrateRuntimeNode,
  resolveTerminalHydrationCwd,
} from '../../../src/app/renderer/shell/hooks/useHydrateAppState'
import type {
  PersistedWorkspaceState,
  TerminalNodeData,
} from '../../../src/contexts/workspace/presentation/renderer/types'
import { toRuntimeNodes } from '../../../src/contexts/workspace/presentation/renderer/utils/nodeTransform'

function createTerminalNode(overrides?: Partial<TerminalNodeData>): Node<TerminalNodeData> {
  return {
    id: 'terminal-1',
    type: 'terminalNode',
    position: { x: 120, y: 80 },
    data: {
      sessionId: '',
      title: 'terminal-1',
      width: 460,
      height: 300,
      kind: 'terminal',
      status: null,
      startedAt: null,
      endedAt: null,
      exitCode: null,
      lastError: null,
      scrollback: null,
      executionDirectory: null,
      expectedDirectory: null,
      agent: null,
      task: null,
      note: null,
      ...overrides,
    },
    draggable: true,
    selectable: true,
  }
}

describe('workspace hydration directories', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('preserves terminal directory bindings when converting persisted nodes to runtime nodes', () => {
    const workspace: PersistedWorkspaceState = {
      id: 'workspace-1',
      name: 'repo',
      path: '/repo',
      worktreesRoot: '.freecli/worktrees',
      viewport: { x: 0, y: 0, zoom: 1 },
      isMinimapVisible: true,
      spaces: [],
      activeSpaceId: null,
      nodes: [
        {
          id: 'terminal-1',
          title: 'terminal-1',
          position: { x: 120, y: 80 },
          width: 460,
          height: 300,
          kind: 'terminal',
          status: null,
          startedAt: null,
          endedAt: null,
          exitCode: null,
          lastError: null,
          scrollback: null,
          executionDirectory: '/repo/.freecli/worktrees/space-1',
          expectedDirectory: '/repo/.freecli/worktrees/space-1',
          agent: null,
          task: null,
        },
      ],
    }

    const [node] = toRuntimeNodes(workspace)

    expect(node?.data.executionDirectory).toBe('/repo/.freecli/worktrees/space-1')
    expect(node?.data.expectedDirectory).toBe('/repo/.freecli/worktrees/space-1')
  })

  it('restores terminal sessions in their bound execution directory', async () => {
    const spawn = vi.fn(async () => ({ sessionId: 'restored-session-1' }))

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          spawn,
        },
      },
    })

    const node = createTerminalNode({
      executionDirectory: '/repo/.freecli/worktrees/space-1',
      expectedDirectory: '/repo/.freecli/worktrees/space-1',
    })

    const hydrated = await hydrateRuntimeNode({
      node,
      workspacePath: '/repo',
      agentSettings: {
        agentFullAccess: false,
        defaultTerminalProfileId: null,
        terminalCredentials: [],
      },
    })

    expect(spawn).toHaveBeenCalledWith({
      cwd: '/repo/.freecli/worktrees/space-1',
      cols: 80,
      rows: 24,
    })
    expect(hydrated.data.sessionId).toBe('restored-session-1')
  })

  it('falls back to workspace path only when terminal has no bound directory', () => {
    const node = createTerminalNode()

    expect(resolveTerminalHydrationCwd(node, '/repo')).toBe('/repo')
  })
})
