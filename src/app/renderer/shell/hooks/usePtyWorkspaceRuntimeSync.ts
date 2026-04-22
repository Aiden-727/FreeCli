import { useEffect } from 'react'
import type { Node } from '@xyflow/react'
import { buildHostedTerminalDisplayModelLabel } from '@contexts/terminal/domain/hostedAgent'
import type {
  TerminalNodeData,
  WorkspaceState,
} from '@contexts/workspace/presentation/renderer/types'
import { getPtyEventHub } from '../utils/ptyEventHub'
import { useAppStore } from '../store/useAppStore'
import {
  isFinalTerminalRuntimeStatus,
  resolveRuntimeStatusFromSessionState,
} from '../utils/terminalRuntimeStatus'

function shouldIgnoreAgentStatusUpdate(status: TerminalNodeData['status']): boolean {
  return isFinalTerminalRuntimeStatus(status)
}

function normalizeResumeSessionId(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') {
    return null
  }

  const trimmed = rawValue.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeOptionalText(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') {
    return null
  }

  const trimmed = rawValue.trim()
  return trimmed.length > 0 ? trimmed : null
}

function updateWorkspacesWithSessionNodes(
  workspaces: WorkspaceState[],
  {
    sessionId,
    excludeWorkspaceId,
    updateNode,
  }: {
    sessionId: string
    excludeWorkspaceId: string | null
    updateNode: (node: Node<TerminalNodeData>) => Node<TerminalNodeData> | null
  },
): { nextWorkspaces: WorkspaceState[]; didChange: boolean } {
  let didChange = false

  const nextWorkspaces = workspaces.map(workspace => {
    if (excludeWorkspaceId && workspace.id === excludeWorkspaceId) {
      return workspace
    }

    let workspaceDidChange = false

    const nextNodes = workspace.nodes.map(node => {
      if (node.data.sessionId !== sessionId) {
        return node
      }

      const updated = updateNode(node)
      if (!updated) {
        return node
      }

      workspaceDidChange = true
      return updated
    })

    if (!workspaceDidChange) {
      return workspace
    }

    didChange = true
    return { ...workspace, nodes: nextNodes }
  })

  return { nextWorkspaces, didChange }
}

export function updateWorkspacesWithAgentExit({
  workspaces,
  sessionId,
  excludeWorkspaceId,
  exitCode,
  now,
}: {
  workspaces: WorkspaceState[]
  sessionId: string
  excludeWorkspaceId: string | null
  exitCode: number
  now: string
}): { nextWorkspaces: WorkspaceState[]; didChange: boolean } {
  let didChange = false

  const nextWorkspaces = workspaces.map(workspace => {
    if (excludeWorkspaceId && workspace.id === excludeWorkspaceId) {
      return workspace
    }

    let workspaceDidChange = false

    const nextNodes = workspace.nodes.map(node => {
      if (node.data.kind !== 'agent' || node.data.sessionId !== sessionId) {
        return node
      }

      if (node.data.status === 'stopped') {
        return node
      }

      workspaceDidChange = true

      return {
        ...node,
        data: {
          ...node.data,
          status: exitCode === 0 ? ('exited' as const) : ('failed' as const),
          endedAt: now,
          exitCode,
        },
      }
    })

    if (!workspaceDidChange) {
      return workspace
    }

    didChange = true
    return { ...workspace, nodes: nextNodes }
  })

  return { nextWorkspaces, didChange }
}

export function updateWorkspacesWithHostedTerminalMetadata({
  workspaces,
  sessionId,
  excludeWorkspaceId,
  resumeSessionId,
  effectiveModel,
  reasoningEffort,
  displayModelLabel,
}: {
  workspaces: WorkspaceState[]
  sessionId: string
  excludeWorkspaceId: string | null
  resumeSessionId: string | null
  effectiveModel: string | null
  reasoningEffort: string | null
  displayModelLabel: string | null
}): { nextWorkspaces: WorkspaceState[]; didChange: boolean } {
  const nextResumeSessionId = normalizeResumeSessionId(resumeSessionId)
  const nextEffectiveModel = normalizeOptionalText(effectiveModel)
  const nextReasoningEffort = normalizeOptionalText(reasoningEffort)
  const nextDisplayModelLabel =
    normalizeOptionalText(displayModelLabel) ??
    buildHostedTerminalDisplayModelLabel({
      effectiveModel: nextEffectiveModel,
      reasoningEffort: nextReasoningEffort,
    })

  if (
    !nextResumeSessionId &&
    !nextEffectiveModel &&
    !nextReasoningEffort &&
    !nextDisplayModelLabel
  ) {
    return { nextWorkspaces: workspaces, didChange: false }
  }

  return updateWorkspacesWithSessionNodes(workspaces, {
    sessionId,
    excludeWorkspaceId,
    updateNode: node => {
      if (node.data.kind !== 'terminal' || !node.data.hostedAgent) {
        return null
      }

      const nextHostedAgent = {
        ...node.data.hostedAgent,
        ...(nextResumeSessionId
          ? {
              resumeSessionId: nextResumeSessionId,
              resumeSessionIdVerified: true,
            }
          : {}),
        ...(nextEffectiveModel ? { effectiveModel: nextEffectiveModel } : {}),
        ...(nextReasoningEffort ? { reasoningEffort: nextReasoningEffort } : {}),
        ...(nextDisplayModelLabel ? { displayModelLabel: nextDisplayModelLabel } : {}),
      }

      if (
        nextHostedAgent.resumeSessionId === node.data.hostedAgent.resumeSessionId &&
        nextHostedAgent.resumeSessionIdVerified === node.data.hostedAgent.resumeSessionIdVerified &&
        nextHostedAgent.effectiveModel === node.data.hostedAgent.effectiveModel &&
        nextHostedAgent.reasoningEffort === node.data.hostedAgent.reasoningEffort &&
        nextHostedAgent.displayModelLabel === node.data.hostedAgent.displayModelLabel
      ) {
        return null
      }

      return {
        ...node,
        data: {
          ...node.data,
          hostedAgent: nextHostedAgent,
        },
      }
    },
  })
}

export function usePtyWorkspaceRuntimeSync({
  requestPersistFlush,
}: {
  requestPersistFlush: () => void
}): void {
  const setWorkspaces = useAppStore(state => state.setWorkspaces)

  useEffect(() => {
    const ptyEventHub = getPtyEventHub()

    const unsubscribeState = ptyEventHub.onState(event => {
      const excludeWorkspaceId = useAppStore.getState().activeWorkspaceId
      let didChange = false

      setWorkspaces(previous => {
        const nextStatus = resolveRuntimeStatusFromSessionState(event.state)
        const result = updateWorkspacesWithSessionNodes(previous, {
          sessionId: event.sessionId,
          excludeWorkspaceId,
          updateNode: node => {
            if (shouldIgnoreAgentStatusUpdate(node.data.status)) {
              return null
            }

            if (node.data.kind === 'agent') {
              if (node.data.status === nextStatus) {
                return null
              }

              return { ...node, data: { ...node.data, status: nextStatus } }
            }

            if (node.data.kind !== 'terminal') {
              return null
            }

            if (!node.data.hostedAgent) {
              if (node.data.status === nextStatus) {
                return null
              }

              return {
                ...node,
                data: {
                  ...node.data,
                  status: nextStatus,
                },
              }
            }

            if (
              node.data.status === nextStatus &&
              node.data.hostedAgent.state === 'active'
            ) {
              return null
            }

            return {
              ...node,
              data: {
                ...node.data,
                status: nextStatus,
                hostedAgent: {
                  ...node.data.hostedAgent,
                  state: 'active',
                  restoreIntent: true,
                },
              },
            }
          },
        })

        didChange = result.didChange
        return didChange ? result.nextWorkspaces : previous
      })
    })

    const unsubscribeMetadata = ptyEventHub.onMetadata(event => {
      const nextResumeSessionId = normalizeResumeSessionId(event.resumeSessionId)
      const nextEffectiveModel = normalizeOptionalText(event.effectiveModel)
      const nextReasoningEffort = normalizeOptionalText(event.reasoningEffort)
      const nextDisplayModelLabel = normalizeOptionalText(event.displayModelLabel)
      const resolvedHostedDisplayModelLabel =
        nextDisplayModelLabel ??
        buildHostedTerminalDisplayModelLabel({
          effectiveModel: nextEffectiveModel,
          reasoningEffort: nextReasoningEffort,
        })

      if (
        !nextResumeSessionId &&
        !nextEffectiveModel &&
        !nextReasoningEffort &&
        !nextDisplayModelLabel
      ) {
        return
      }

      const excludeWorkspaceId = useAppStore.getState().activeWorkspaceId
      let didChange = false

      setWorkspaces(previous => {
        const result = updateWorkspacesWithSessionNodes(previous, {
          sessionId: event.sessionId,
          excludeWorkspaceId,
          updateNode: node => {
            if (node.data.kind === 'agent') {
              if (!node.data.agent || !nextResumeSessionId) {
                return null
              }

              const nextVerified = true
              if (
                node.data.agent.resumeSessionId === nextResumeSessionId &&
                node.data.agent.resumeSessionIdVerified === nextVerified
              ) {
                return null
              }

              return {
                ...node,
                data: {
                  ...node.data,
                  agent: {
                    ...node.data.agent,
                    resumeSessionId: nextResumeSessionId,
                    resumeSessionIdVerified: nextVerified,
                  },
                },
              }
            }

            if (node.data.kind !== 'terminal' || !node.data.hostedAgent) {
              return null
            }

            const nextHostedAgent = {
              ...node.data.hostedAgent,
              ...(nextResumeSessionId
                ? {
                    resumeSessionId: nextResumeSessionId,
                    resumeSessionIdVerified: true,
                  }
                : {}),
              ...(nextEffectiveModel ? { effectiveModel: nextEffectiveModel } : {}),
              ...(nextReasoningEffort ? { reasoningEffort: nextReasoningEffort } : {}),
              ...(resolvedHostedDisplayModelLabel
                ? { displayModelLabel: resolvedHostedDisplayModelLabel }
                : {}),
            }

            if (
              nextHostedAgent.resumeSessionId === node.data.hostedAgent.resumeSessionId &&
              nextHostedAgent.resumeSessionIdVerified ===
                node.data.hostedAgent.resumeSessionIdVerified &&
              nextHostedAgent.effectiveModel === node.data.hostedAgent.effectiveModel &&
              nextHostedAgent.reasoningEffort === node.data.hostedAgent.reasoningEffort &&
              nextHostedAgent.displayModelLabel === node.data.hostedAgent.displayModelLabel
            ) {
              return null
            }

            return {
              ...node,
              data: {
                ...node.data,
                hostedAgent: nextHostedAgent,
              },
            }
          },
        })

        didChange = result.didChange
        return didChange ? result.nextWorkspaces : previous
      })

      if (didChange) {
        requestPersistFlush()
      }
    })

    const unsubscribeExit = ptyEventHub.onExit(event => {
      let didChange = false
      const now = new Date().toISOString()
      const excludeWorkspaceId = useAppStore.getState().activeWorkspaceId

      setWorkspaces(previous => {
        const nextStatus = event.exitCode === 0 ? ('exited' as const) : ('failed' as const)
        const result = updateWorkspacesWithSessionNodes(previous, {
          sessionId: event.sessionId,
          excludeWorkspaceId,
          updateNode: node => {
            if (node.data.kind === 'agent') {
              if (node.data.status === 'stopped') {
                return null
              }

              return {
                ...node,
                data: {
                  ...node.data,
                  status: nextStatus,
                  endedAt: now,
                  exitCode: event.exitCode,
                },
              }
            }

            if (node.data.kind !== 'terminal') {
              return null
            }

            return {
              ...node,
              data: {
                ...node.data,
                status: nextStatus,
                endedAt: now,
                exitCode: event.exitCode,
                hostedAgent: node.data.hostedAgent
                  ? {
                      ...node.data.hostedAgent,
                      state: 'inactive',
                      restoreIntent: false,
                    }
                  : null,
              },
            }
          },
        })

        didChange = result.didChange
        return didChange ? result.nextWorkspaces : previous
      })

      if (didChange) {
        requestPersistFlush()
      }
    })

    return () => {
      unsubscribeState()
      unsubscribeMetadata()
      unsubscribeExit()
    }
  }, [requestPersistFlush, setWorkspaces])
}
