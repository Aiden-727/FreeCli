import { cleanupNodeRuntimeArtifacts } from '@contexts/workspace/presentation/renderer/utils/nodeRuntimeCleanup'
import type {
  WorkspaceLifecycleState,
  WorkspaceState,
} from '@contexts/workspace/presentation/renderer/types'

export function isWorkspaceArchived(workspace: Pick<WorkspaceState, 'lifecycleState'>): boolean {
  return workspace.lifecycleState === 'archived'
}

export function findNextActiveWorkspaceId(
  workspaces: WorkspaceState[],
  excludedWorkspaceId: string,
): string | null {
  for (const workspace of workspaces) {
    if (workspace.id === excludedWorkspaceId || isWorkspaceArchived(workspace)) {
      continue
    }

    return workspace.id
  }

  return null
}

export async function shutdownWorkspaceRuntime(workspace: WorkspaceState): Promise<void> {
  const liveSessionIds = new Set<string>()

  for (const node of workspace.nodes) {
    const sessionId = node.data.sessionId.trim()
    if (sessionId.length === 0) {
      continue
    }

    cleanupNodeRuntimeArtifacts(node.id, sessionId)
    liveSessionIds.add(sessionId)
  }

  if (liveSessionIds.size === 0) {
    return
  }

  await Promise.allSettled(
    [...liveSessionIds].map(sessionId =>
      Promise.resolve(window.freecliApi.pty.kill({ sessionId })),
    ),
  )
}

export function buildArchivedWorkspaceSnapshot(workspace: WorkspaceState): WorkspaceState {
  return {
    ...workspace,
    lifecycleState: 'archived',
    archivedAt: new Date().toISOString(),
    nodes: workspace.nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        sessionId: '',
        status: null,
        startedAt: null,
        endedAt: null,
        exitCode: null,
        lastError: null,
        hostedAgent: node.data.hostedAgent
          ? {
              ...node.data.hostedAgent,
              state: 'inactive',
              restoreIntent: false,
            }
          : null,
      },
    })),
  }
}

export function buildEnabledWorkspaceSnapshot(workspace: WorkspaceState): WorkspaceState {
  return {
    ...workspace,
    lifecycleState: 'active',
    archivedAt: null,
  }
}

export function moveWorkspaceIntoLifecycleGroup(options: {
  workspaces: WorkspaceState[]
  workspaceId: string
  targetLifecycleState: WorkspaceLifecycleState
  anchorWorkspaceId: string | null
  placement?: 'before' | 'after'
  transformWorkspace?: (workspace: WorkspaceState) => WorkspaceState
}): WorkspaceState[] {
  const {
    workspaces,
    workspaceId,
    targetLifecycleState,
    anchorWorkspaceId,
    placement = 'before',
    transformWorkspace,
  } = options
  const currentWorkspace = workspaces.find(workspace => workspace.id === workspaceId)
  if (!currentWorkspace) {
    return workspaces
  }

  const nextWorkspace = transformWorkspace ? transformWorkspace(currentWorkspace) : currentWorkspace
  const nextWorkspaceById = new Map<string, WorkspaceState>()

  for (const workspace of workspaces) {
    nextWorkspaceById.set(workspace.id, workspace.id === workspaceId ? nextWorkspace : workspace)
  }

  const activeWorkspaceIds: string[] = []
  const archivedWorkspaceIds: string[] = []

  for (const workspace of workspaces) {
    if (workspace.id === workspaceId) {
      continue
    }

    if (isWorkspaceArchived(workspace)) {
      archivedWorkspaceIds.push(workspace.id)
      continue
    }

    activeWorkspaceIds.push(workspace.id)
  }

  const targetIds = targetLifecycleState === 'archived' ? archivedWorkspaceIds : activeWorkspaceIds
  const nextTargetIds = [...targetIds]

  if (anchorWorkspaceId && nextTargetIds.includes(anchorWorkspaceId)) {
    const anchorIndex = nextTargetIds.indexOf(anchorWorkspaceId)
    const insertIndex = placement === 'after' ? anchorIndex + 1 : anchorIndex
    nextTargetIds.splice(insertIndex, 0, workspaceId)
  } else {
    nextTargetIds.push(workspaceId)
  }

  const nextActiveIds =
    targetLifecycleState === 'active' ? nextTargetIds : [...activeWorkspaceIds]
  const nextArchivedIds =
    targetLifecycleState === 'archived' ? nextTargetIds : [...archivedWorkspaceIds]
  const nextWorkspaceIds = [...nextActiveIds, ...nextArchivedIds]

  if (
    nextWorkspaceIds.length === workspaces.length &&
    nextWorkspaceIds.every((id, index) => id === workspaces[index]?.id) &&
    nextWorkspace === currentWorkspace
  ) {
    return workspaces
  }

  return nextWorkspaceIds
    .map(id => nextWorkspaceById.get(id) ?? null)
    .filter((workspace): workspace is WorkspaceState => workspace !== null)
}
