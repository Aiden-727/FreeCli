import type { WorkspaceState } from '@contexts/workspace/presentation/renderer/types'

export function reorderWorkspaces(
  workspaces: WorkspaceState[],
  activeWorkspaceId: string,
  overWorkspaceId: string,
): WorkspaceState[] {
  if (activeWorkspaceId === overWorkspaceId) {
    return workspaces
  }

  const activeIndex = workspaces.findIndex(workspace => workspace.id === activeWorkspaceId)
  const overIndex = workspaces.findIndex(workspace => workspace.id === overWorkspaceId)

  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return workspaces
  }

  const nextWorkspaces = [...workspaces]
  const [movedWorkspace] = nextWorkspaces.splice(activeIndex, 1)
  nextWorkspaces.splice(overIndex, 0, movedWorkspace)
  return nextWorkspaces
}
