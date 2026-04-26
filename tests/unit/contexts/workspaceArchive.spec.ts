import { describe, expect, it } from 'vitest'
import type { WorkspaceState } from '../../../src/contexts/workspace/presentation/renderer/types'
import {
  buildArchivedWorkspaceSnapshot,
  buildEnabledWorkspaceSnapshot,
  moveWorkspaceIntoLifecycleGroup,
} from '../../../src/app/renderer/shell/utils/workspaceArchive'

function createWorkspace(
  id: string,
  lifecycleState: WorkspaceState['lifecycleState'] = 'active',
): WorkspaceState {
  return {
    id,
    name: id,
    path: `D:/workspace/${id}`,
    worktreesRoot: '',
    lifecycleState,
    archivedAt: lifecycleState === 'archived' ? '2026-04-24T08:00:00.000Z' : null,
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    isMinimapVisible: true,
    spaces: [],
    activeSpaceId: null,
    spaceArchiveRecords: [],
  }
}

describe('moveWorkspaceIntoLifecycleGroup', () => {
  it('moves an active workspace into the archived group before the anchor', () => {
    const workspaces = [
      createWorkspace('workspace-a'),
      createWorkspace('workspace-b'),
      createWorkspace('workspace-x', 'archived'),
      createWorkspace('workspace-y', 'archived'),
    ]

    const next = moveWorkspaceIntoLifecycleGroup({
      workspaces,
      workspaceId: 'workspace-b',
      targetLifecycleState: 'archived',
      anchorWorkspaceId: 'workspace-y',
      placement: 'before',
      transformWorkspace: buildArchivedWorkspaceSnapshot,
    })

    expect(next.map(workspace => workspace.id)).toEqual([
      'workspace-a',
      'workspace-x',
      'workspace-b',
      'workspace-y',
    ])
    expect(next.find(workspace => workspace.id === 'workspace-b')?.lifecycleState).toBe('archived')
  })

  it('restores an archived workspace into the active group after the anchor', () => {
    const workspaces = [
      createWorkspace('workspace-a'),
      createWorkspace('workspace-b'),
      createWorkspace('workspace-x', 'archived'),
      createWorkspace('workspace-y', 'archived'),
    ]

    const next = moveWorkspaceIntoLifecycleGroup({
      workspaces,
      workspaceId: 'workspace-x',
      targetLifecycleState: 'active',
      anchorWorkspaceId: 'workspace-a',
      placement: 'after',
      transformWorkspace: buildEnabledWorkspaceSnapshot,
    })

    expect(next.map(workspace => workspace.id)).toEqual([
      'workspace-a',
      'workspace-x',
      'workspace-b',
      'workspace-y',
    ])
    expect(next.find(workspace => workspace.id === 'workspace-x')?.lifecycleState).toBe('active')
    expect(next.find(workspace => workspace.id === 'workspace-x')?.archivedAt).toBeNull()
  })
})
