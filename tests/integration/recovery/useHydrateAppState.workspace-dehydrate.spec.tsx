import React, { useCallback, useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'
import type { WorkspaceState } from '../../../src/contexts/workspace/presentation/renderer/types'
import { installMockStorage } from '../../support/persistenceTestStorage'

describe('useHydrateAppState workspace runtime dehydrate', () => {
  it('dehydrates inactive plain terminals and rehydrates them with a fresh session when revisited', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify({
        activeWorkspaceId: 'workspace-1',
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Workspace 1',
            path: '/tmp/workspace-1',
            viewport: { x: 0, y: 0, zoom: 1 },
            isMinimapVisible: false,
            spaces: [],
            activeSpaceId: null,
            nodes: [
              {
                id: 'terminal-node-1',
                title: 'terminal-1',
                position: { x: 0, y: 0 },
                width: 520,
                height: 360,
                kind: 'terminal',
                status: null,
                startedAt: null,
                endedAt: null,
                exitCode: null,
                lastError: null,
                scrollback: null,
                executionDirectory: '/tmp/workspace-1',
                expectedDirectory: '/tmp/workspace-1',
                agent: null,
                task: null,
              },
            ],
          },
          {
            id: 'workspace-2',
            name: 'Workspace 2',
            path: '/tmp/workspace-2',
            viewport: { x: 0, y: 0, zoom: 1 },
            isMinimapVisible: false,
            spaces: [],
            activeSpaceId: null,
            nodes: [
              {
                id: 'terminal-node-2',
                title: 'terminal-2',
                position: { x: 0, y: 0 },
                width: 520,
                height: 360,
                kind: 'terminal',
                status: null,
                startedAt: null,
                endedAt: null,
                exitCode: null,
                lastError: null,
                scrollback: null,
                executionDirectory: '/tmp/workspace-2',
                expectedDirectory: '/tmp/workspace-2',
                agent: null,
                task: null,
              },
            ],
          },
        ],
        settings: {},
      }),
    )

    const spawn = vi
      .fn()
      .mockResolvedValueOnce({ sessionId: 'workspace-1-session-a' })
      .mockResolvedValueOnce({ sessionId: 'workspace-2-session-a' })
      .mockResolvedValueOnce({ sessionId: 'workspace-1-session-b' })
    const kill = vi.fn(async () => undefined)

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          spawn,
          kill,
          onData: vi.fn(() => () => undefined),
          onExit: vi.fn(() => () => undefined),
        },
        agent: {
          launch: vi.fn(async () => {
            throw new Error('not used')
          }),
        },
      },
    })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    function Harness() {
      const [_agentSettings, setAgentSettings] = useState(DEFAULT_AGENT_SETTINGS)
      const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
      const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

      const { isHydrated } = useHydrateAppState({
        workspaces,
        activeWorkspaceId,
        setAgentSettings,
        setWorkspaces,
        setActiveWorkspaceId,
      })

      const workspace1SessionId =
        workspaces.find(workspace => workspace.id === 'workspace-1')?.nodes[0]?.data.sessionId ?? ''
      const workspace2SessionId =
        workspaces.find(workspace => workspace.id === 'workspace-2')?.nodes[0]?.data.sessionId ?? ''

      const selectWorkspace1 = useCallback(() => {
        setActiveWorkspaceId('workspace-1')
      }, [])
      const selectWorkspace2 = useCallback(() => {
        setActiveWorkspaceId('workspace-2')
      }, [])
      const markAllTerminalsEphemeral = useCallback(() => {
        setWorkspaces(previous =>
          previous.map(workspace => ({
            ...workspace,
            nodes: workspace.nodes.map(node => ({
              ...node,
              data:
                node.data.kind === 'terminal'
                  ? {
                      ...node.data,
                      persistenceMode: 'ephemeral',
                    }
                  : node.data,
            })),
          })),
        )
      }, [])

      return (
        <div>
          <div data-testid="hydrated">{String(isHydrated)}</div>
          <div data-testid="active-workspace">{activeWorkspaceId ?? 'none'}</div>
          <div data-testid="workspace-1-session">{workspace1SessionId || 'none'}</div>
          <div data-testid="workspace-2-session">{workspace2SessionId || 'none'}</div>
          <button type="button" onClick={selectWorkspace1}>
            Select workspace 1
          </button>
          <button type="button" onClick={selectWorkspace2}>
            Select workspace 2
          </button>
          <button type="button" onClick={markAllTerminalsEphemeral}>
            Mark terminals ephemeral
          </button>
        </div>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-1')
    expect(screen.getByTestId('workspace-1-session')).toHaveTextContent('workspace-1-session-a')
    expect(screen.getByTestId('workspace-2-session')).toHaveTextContent('none')

    fireEvent.click(screen.getByRole('button', { name: 'Mark terminals ephemeral' }))

    fireEvent.click(screen.getByRole('button', { name: 'Select workspace 2' }))

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-2')
    })
    await waitFor(() => {
      expect(screen.getByTestId('workspace-2-session')).toHaveTextContent('workspace-2-session-a')
    })
    await waitFor(() => {
      expect(screen.getByTestId('workspace-1-session')).toHaveTextContent('none')
    })

    expect(kill).toHaveBeenCalledWith({ sessionId: 'workspace-1-session-a' })

    fireEvent.click(screen.getByRole('button', { name: 'Select workspace 1' }))

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-1')
    })
    await waitFor(() => {
      expect(screen.getByTestId('workspace-1-session')).toHaveTextContent('workspace-1-session-b')
    })
    await waitFor(() => {
      expect(screen.getByTestId('workspace-2-session')).toHaveTextContent('none')
    })

    expect(kill).toHaveBeenCalledWith({ sessionId: 'workspace-2-session-a' })
    expect(spawn).toHaveBeenCalledTimes(3)
  })

  it('keeps persistent terminal sessions alive across workspace switches', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify({
        activeWorkspaceId: 'workspace-1',
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Workspace 1',
            path: '/tmp/workspace-1',
            viewport: { x: 0, y: 0, zoom: 1 },
            isMinimapVisible: false,
            spaces: [],
            activeSpaceId: null,
            nodes: [
              {
                id: 'terminal-node-1',
                title: 'terminal-1',
                position: { x: 0, y: 0 },
                width: 520,
                height: 360,
                kind: 'terminal',
                status: null,
                startedAt: null,
                endedAt: null,
                exitCode: null,
                lastError: null,
                scrollback: null,
                persistenceMode: 'persistent',
                executionDirectory: '/tmp/workspace-1',
                expectedDirectory: '/tmp/workspace-1',
                agent: null,
                task: null,
              },
            ],
          },
          {
            id: 'workspace-2',
            name: 'Workspace 2',
            path: '/tmp/workspace-2',
            viewport: { x: 0, y: 0, zoom: 1 },
            isMinimapVisible: false,
            spaces: [],
            activeSpaceId: null,
            nodes: [
              {
                id: 'terminal-node-2',
                title: 'terminal-2',
                position: { x: 0, y: 0 },
                width: 520,
                height: 360,
                kind: 'terminal',
                status: null,
                startedAt: null,
                endedAt: null,
                exitCode: null,
                lastError: null,
                scrollback: null,
                persistenceMode: 'persistent',
                executionDirectory: '/tmp/workspace-2',
                expectedDirectory: '/tmp/workspace-2',
                agent: null,
                task: null,
              },
            ],
          },
        ],
        settings: {},
      }),
    )

    const spawn = vi
      .fn()
      .mockResolvedValueOnce({ sessionId: 'workspace-1-session-a' })
      .mockResolvedValueOnce({ sessionId: 'workspace-2-session-a' })
    const kill = vi.fn(async () => undefined)

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          spawn,
          kill,
          onData: vi.fn(() => () => undefined),
          onExit: vi.fn(() => () => undefined),
        },
        agent: {
          launch: vi.fn(async () => {
            throw new Error('not used')
          }),
        },
      },
    })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    function Harness() {
      const [_agentSettings, setAgentSettings] = useState(DEFAULT_AGENT_SETTINGS)
      const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
      const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

      const { isHydrated } = useHydrateAppState({
        workspaces,
        activeWorkspaceId,
        setAgentSettings,
        setWorkspaces,
        setActiveWorkspaceId,
      })

      const workspace1SessionId =
        workspaces.find(workspace => workspace.id === 'workspace-1')?.nodes[0]?.data.sessionId ?? ''
      const workspace2SessionId =
        workspaces.find(workspace => workspace.id === 'workspace-2')?.nodes[0]?.data.sessionId ?? ''

      return (
        <div>
          <div data-testid="hydrated">{String(isHydrated)}</div>
          <div data-testid="active-workspace">{activeWorkspaceId ?? 'none'}</div>
          <div data-testid="workspace-1-session">{workspace1SessionId || 'none'}</div>
          <div data-testid="workspace-2-session">{workspace2SessionId || 'none'}</div>
          <button type="button" onClick={() => setActiveWorkspaceId('workspace-1')}>
            Select workspace 1
          </button>
          <button type="button" onClick={() => setActiveWorkspaceId('workspace-2')}>
            Select workspace 2
          </button>
        </div>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('workspace-1-session')).toHaveTextContent('workspace-1-session-a')
    expect(screen.getByTestId('workspace-2-session')).toHaveTextContent('none')

    fireEvent.click(screen.getByRole('button', { name: 'Select workspace 2' }))

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-2')
    })
    await waitFor(() => {
      expect(screen.getByTestId('workspace-2-session')).toHaveTextContent('workspace-2-session-a')
    })
    expect(screen.getByTestId('workspace-1-session')).toHaveTextContent('workspace-1-session-a')

    fireEvent.click(screen.getByRole('button', { name: 'Select workspace 1' }))

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-1')
    })
    expect(screen.getByTestId('workspace-1-session')).toHaveTextContent('workspace-1-session-a')
    expect(screen.getByTestId('workspace-2-session')).toHaveTextContent('workspace-2-session-a')
    expect(kill).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledTimes(2)
  })
})
