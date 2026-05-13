import type { TerminalNodeData } from '@contexts/workspace/presentation/renderer/types'

export function isFinalTerminalRuntimeStatus(status: TerminalNodeData['status']): boolean {
  return status === 'failed' || status === 'stopped' || status === 'exited'
}

export function hasLiveTerminalSession(data: Pick<TerminalNodeData, 'sessionId'>): boolean {
  return data.sessionId.trim().length > 0
}

export function resolveRuntimeStatusFromSessionState(
  state: 'working' | 'standby',
): TerminalNodeData['status'] {
  return state === 'standby' ? 'standby' : 'running'
}

export function resolveTerminalRuntimeStatus(data: TerminalNodeData): TerminalNodeData['status'] {
  if (data.status !== null) {
    return data.status
  }

  if (data.hostedAgent?.state === 'active') {
    return 'running'
  }

  if (data.hostedAgent?.state === 'inactive') {
    return 'standby'
  }

  if (data.hostedAgent?.state === 'unavailable') {
    return 'failed'
  }

  return null
}

export function resolveSidebarTerminalRuntimeStatus(
  data: TerminalNodeData,
): TerminalNodeData['status'] {
  const runtimeStatus = resolveTerminalRuntimeStatus(data)
  if (hasLiveTerminalSession(data)) {
    return runtimeStatus
  }

  if (runtimeStatus === 'running' || runtimeStatus === 'restoring' || runtimeStatus === 'standby') {
    return 'stopped'
  }

  return runtimeStatus
}

export function resolveSidebarAgentRuntimeStatus(
  data: Pick<TerminalNodeData, 'sessionId' | 'status'>,
): TerminalNodeData['status'] {
  if (!hasLiveTerminalSession(data)) {
    if (data.status === 'running' || data.status === 'restoring' || data.status === 'standby') {
      return 'stopped'
    }
  }

  return data.status
}
