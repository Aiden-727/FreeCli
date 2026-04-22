import type { TerminalNodeData } from '@contexts/workspace/presentation/renderer/types'

export function isFinalTerminalRuntimeStatus(status: TerminalNodeData['status']): boolean {
  return status === 'failed' || status === 'stopped' || status === 'exited'
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
