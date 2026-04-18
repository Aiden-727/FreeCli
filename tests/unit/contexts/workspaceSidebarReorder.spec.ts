import { describe, expect, it } from 'vitest'
import type { WorkspaceState } from '../../../src/contexts/workspace/presentation/renderer/types'
import { reorderWorkspaces } from '../../../src/app/renderer/shell/utils/reorderWorkspaces'

function createWorkspace(id: string): WorkspaceState {
  return {
    id,
    name: id,
    path: `D:/workspace/${id}`,
    worktreesRoot: '',
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    isMinimapVisible: true,
    spaces: [],
    activeSpaceId: null,
    spaceArchiveRecords: [],
  }
}

describe('reorderWorkspaces', () => {
  it('moves the dragged workspace to the hovered workspace position', () => {
    const workspaces = [
      createWorkspace('workspace-a'),
      createWorkspace('workspace-b'),
      createWorkspace('workspace-c'),
    ]

    const reordered = reorderWorkspaces(workspaces, 'workspace-c', 'workspace-a')

    expect(reordered.map(workspace => workspace.id)).toEqual([
      'workspace-c',
      'workspace-a',
      'workspace-b',
    ])
    expect(workspaces.map(workspace => workspace.id)).toEqual([
      'workspace-a',
      'workspace-b',
      'workspace-c',
    ])
  })

  it('returns the original array when either workspace id is missing', () => {
    const workspaces = [createWorkspace('workspace-a'), createWorkspace('workspace-b')]

    expect(reorderWorkspaces(workspaces, 'workspace-missing', 'workspace-a')).toBe(workspaces)
    expect(reorderWorkspaces(workspaces, 'workspace-a', 'workspace-missing')).toBe(workspaces)
  })
})
