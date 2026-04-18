import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useWorkspaceStateHandlers } from '../../../src/app/renderer/shell/hooks/useWorkspaceStateHandlers'
import { useAppStore } from '../../../src/app/renderer/shell/store/useAppStore'
import type { WorkspaceState } from '../../../src/contexts/workspace/presentation/renderer/types'

function createWorkspaceState(): WorkspaceState {
  return {
    id: 'workspace-1',
    name: 'Workspace 1',
    path: '/tmp/workspace-1',
    worktreesRoot: '',
    pullRequestBaseBranchOptions: [],
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    isMinimapVisible: true,
    spaces: [
      {
        id: 'space-1',
        name: 'Space 1',
        directoryPath: '/tmp/workspace-1',
        labelColor: null,
        nodeIds: ['note-1'],
        rect: null,
      },
      {
        id: 'space-2',
        name: 'Space 2',
        directoryPath: '/tmp/workspace-1',
        labelColor: null,
        nodeIds: [],
        rect: null,
      },
    ],
    activeSpaceId: 'space-1',
    spaceArchiveRecords: [],
  }
}

describe('useWorkspaceStateHandlers', () => {
  it('requests persist flush for durable workspace updates', () => {
    useAppStore.setState({
      workspaces: [createWorkspaceState()],
      activeWorkspaceId: 'workspace-1',
    })

    const requestPersistFlush = vi.fn()
    const { result } = renderHook(() => useWorkspaceStateHandlers({ requestPersistFlush }), {
      wrapper: ({ children }) => <>{children}</>,
    })

    act(() => {
      result.current.handleWorkspaceNodesChange([
        {
          id: 'note-1',
          type: 'terminalNode',
          position: { x: 16, y: 24 },
          data: {
            kind: 'note',
            sessionId: 'note-session-1',
            title: 'Note',
            width: 320,
            height: 220,
            status: null,
            startedAt: null,
            endedAt: null,
            exitCode: null,
            lastError: null,
            scrollback: null,
            agent: null,
            hostedAgent: null,
            task: null,
            note: { text: 'hello' },
            image: null,
          },
        },
      ])
    })
    expect(requestPersistFlush).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.handleWorkspaceViewportChange({ x: 12, y: 18, zoom: 1.2 })
    })
    expect(requestPersistFlush).toHaveBeenCalledTimes(2)

    act(() => {
      result.current.handleWorkspaceMinimapVisibilityChange(false)
    })
    expect(requestPersistFlush).toHaveBeenCalledTimes(3)

    act(() => {
      result.current.handleWorkspaceSpacesChange([
        {
          id: 'space-1',
          name: 'Space 1 Updated',
          directoryPath: '/tmp/workspace-1',
          labelColor: null,
          nodeIds: ['note-1'],
          rect: null,
        },
        {
          id: 'space-2',
          name: 'Space 2',
          directoryPath: '/tmp/workspace-1',
          labelColor: null,
          nodeIds: ['note-1'],
          rect: null,
        },
      ])
    })
    expect(requestPersistFlush).toHaveBeenCalledTimes(4)

    act(() => {
      result.current.handleWorkspaceActiveSpaceChange('space-2')
    })

    expect(requestPersistFlush).toHaveBeenCalledTimes(5)
  })
})
