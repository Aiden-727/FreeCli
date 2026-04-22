import { useEffect } from 'react'
import { getPtyEventHub } from '@app/renderer/shell/utils/ptyEventHub'
import {
  isFinalTerminalRuntimeStatus,
  resolveRuntimeStatusFromSessionState,
} from '@app/renderer/shell/utils/terminalRuntimeStatus'
import type { Node } from '@xyflow/react'
import { buildHostedTerminalDisplayModelLabel } from '@contexts/terminal/domain/hostedAgent'
import type { TerminalNodeData } from '../../../types'

export function applyAgentExitToNodes(
  prevNodes: Node<TerminalNodeData>[],
  event: { sessionId: string; exitCode: number },
): { nextNodes: Node<TerminalNodeData>[]; didChange: boolean } {
  let didChange = false

  const nextNodes = prevNodes.map(node => {
    if (node.data.sessionId !== event.sessionId || node.data.kind !== 'agent') {
      return node
    }

    if (node.data.status === 'stopped') {
      return node
    }

    didChange = true

    return {
      ...node,
      data: {
        ...node.data,
        status: event.exitCode === 0 ? ('exited' as const) : ('failed' as const),
        endedAt: new Date().toISOString(),
        exitCode: event.exitCode,
      },
    }
  })

  return {
    nextNodes: didChange ? nextNodes : prevNodes,
    didChange,
  }
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

function applyHostedTerminalStateToNodes(
  prevNodes: Node<TerminalNodeData>[],
  event: { sessionId: string; state: 'working' | 'standby' },
): { nextNodes: Node<TerminalNodeData>[]; didChange: boolean } {
  let didChange = false

  const nextNodes = prevNodes.map(node => {
    if (
      node.data.kind !== 'terminal' ||
      node.data.sessionId !== event.sessionId ||
      !node.data.hostedAgent
    ) {
      return node
    }

    if (isFinalTerminalRuntimeStatus(node.data.status)) {
      return node
    }

    const nextStatus = resolveRuntimeStatusFromSessionState(event.state)
    if (
      node.data.status === nextStatus &&
      node.data.hostedAgent.state === 'active'
    ) {
      return node
    }

    didChange = true
    return {
      ...node,
      data: {
        ...node.data,
        status: nextStatus,
        hostedAgent: {
          ...node.data.hostedAgent,
          state: 'active' as const,
          restoreIntent: true,
        },
      },
    }
  })

  return {
    nextNodes: didChange ? nextNodes : prevNodes,
    didChange,
  }
}

export function applyHostedTerminalMetadataToNodes(
  prevNodes: Node<TerminalNodeData>[],
  event: {
    sessionId: string
    resumeSessionId: string | null
    effectiveModel?: string | null
    reasoningEffort?: string | null
    displayModelLabel?: string | null
  },
): { nextNodes: Node<TerminalNodeData>[]; didChange: boolean } {
  const nextResumeSessionId = normalizeResumeSessionId(event.resumeSessionId)
  const nextEffectiveModel = normalizeOptionalText(event.effectiveModel)
  const nextReasoningEffort = normalizeOptionalText(event.reasoningEffort)
  // Active canvas nodes and background workspaces must derive the same badge fields
  // from PTY runtime metadata; otherwise the visible terminal regresses to the
  // command/default label while the archived workspace snapshot shows the real model.
  const nextDisplayModelLabel =
    normalizeOptionalText(event.displayModelLabel) ??
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
    return { nextNodes: prevNodes, didChange: false }
  }

  let didChange = false

  const nextNodes = prevNodes.map(node => {
    if (
      node.data.kind !== 'terminal' ||
      node.data.sessionId !== event.sessionId ||
      !node.data.hostedAgent
    ) {
      return node
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
      return node
    }

    didChange = true
    return {
      ...node,
      data: {
        ...node.data,
        hostedAgent: nextHostedAgent,
      },
    }
  })

  return {
    nextNodes: didChange ? nextNodes : prevNodes,
    didChange,
  }
}

function applyHostedTerminalExitToNodes(
  prevNodes: Node<TerminalNodeData>[],
  event: { sessionId: string; exitCode: number },
): { nextNodes: Node<TerminalNodeData>[]; didChange: boolean } {
  let didChange = false

  const nextNodes = prevNodes.map(node => {
    if (
      node.data.kind !== 'terminal' ||
      node.data.sessionId !== event.sessionId ||
      !node.data.hostedAgent
    ) {
      return node
    }

    didChange = true
    return {
      ...node,
      data: {
        ...node.data,
        status: event.exitCode === 0 ? ('exited' as const) : ('failed' as const),
        endedAt: new Date().toISOString(),
        exitCode: event.exitCode,
        hostedAgent: {
          ...node.data.hostedAgent,
          state: 'inactive' as const,
          restoreIntent: false,
        },
      },
    }
  })

  return {
    nextNodes: didChange ? nextNodes : prevNodes,
    didChange,
  }
}

export function useWorkspaceCanvasPtyTaskCompletion({
  setNodes,
  onRequestPersistFlush,
}: {
  setNodes: (
    updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
    options?: { syncLayout?: boolean },
  ) => void
  onRequestPersistFlush?: () => void
}): void {
  useEffect(() => {
    const ptyEventHub = getPtyEventHub()

    const unsubscribeState = ptyEventHub.onState(event => {
      setNodes(prevNodes => {
        const nextAgentNodes = prevNodes.map(node => {
          if (node.data.kind !== 'agent' || node.data.sessionId !== event.sessionId) {
            return node
          }

          if (isFinalTerminalRuntimeStatus(node.data.status)) {
            return node
          }

          const nextStatus = resolveRuntimeStatusFromSessionState(event.state)
          if (node.data.status === nextStatus) {
            return node
          }

          return {
            ...node,
            data: {
              ...node.data,
              status: nextStatus,
            },
          }
        })

        const hostedResult = applyHostedTerminalStateToNodes(nextAgentNodes, event)
        return hostedResult.nextNodes
      })
    })

    const unsubscribeMetadata = ptyEventHub.onMetadata(event => {
      let didChange = false

      setNodes(prevNodes => {
        const nextAgentNodes = prevNodes.map(node => {
          if (
            node.data.kind !== 'agent' ||
            node.data.sessionId !== event.sessionId ||
            !node.data.agent
          ) {
            return node
          }

          const nextResumeSessionId =
            typeof event.resumeSessionId === 'string' && event.resumeSessionId.trim().length > 0
              ? event.resumeSessionId
              : null
          const nextResumeSessionIdVerified = nextResumeSessionId !== null

          if (
            node.data.agent.resumeSessionId === nextResumeSessionId &&
            node.data.agent.resumeSessionIdVerified === nextResumeSessionIdVerified
          ) {
            return node
          }

          if (nextResumeSessionId === null) {
            return node
          }

          didChange = true
          return {
            ...node,
            data: {
              ...node.data,
              agent: {
                ...node.data.agent,
                resumeSessionId: nextResumeSessionId,
                resumeSessionIdVerified: true,
              },
            },
          }
        })

        const hostedResult = applyHostedTerminalMetadataToNodes(nextAgentNodes, event)
        didChange = didChange || hostedResult.didChange
        return didChange ? hostedResult.nextNodes : prevNodes
      })

      if (didChange) {
        onRequestPersistFlush?.()
      }
    })

    const unsubscribeExit = ptyEventHub.onExit(event => {
      let didChange = false

      setNodes(prevNodes => {
        const agentResult = applyAgentExitToNodes(prevNodes, event)
        const hostedResult = applyHostedTerminalExitToNodes(agentResult.nextNodes, event)
        didChange = agentResult.didChange || hostedResult.didChange
        return didChange ? hostedResult.nextNodes : prevNodes
      })

      if (didChange) {
        onRequestPersistFlush?.()
      }
    })

    return () => {
      unsubscribeState()
      unsubscribeMetadata()
      unsubscribeExit()
    }
  }, [onRequestPersistFlush, setNodes])
}
