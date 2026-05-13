import { useEffect, useRef } from 'react'
import type {
  TerminalSessionAttentionEvent,
  TerminalSessionAttentionReason,
  TerminalSessionState,
  TerminalSessionStateEvent,
} from '@shared/contracts/dto'
import type { AgentRuntimeStatus } from '@contexts/agent/domain/types'
import { useAppStore } from '../store/useAppStore'
import { getPtyEventHub } from '../utils/ptyEventHub'
import { matchesTerminalRuntimeEvent } from '@contexts/workspace/presentation/renderer/utils/terminalBindingMatch'

function normalizeSessionId(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') {
    return null
  }

  const trimmed = rawValue.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeBindingId(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') {
    return null
  }

  const trimmed = rawValue.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveAgentNodeForRuntimeEvent(event: { sessionId: string; bindingId?: string | null }): {
  workspaceId: string
  workspaceName: string
  workspacePath: string
  nodeId: string
  title: string
  runtimeStatus: AgentRuntimeStatus | null
  executionDirectory: string
  taskId: string | null
} | null {
  const state = useAppStore.getState()

  for (const workspace of state.workspaces) {
    for (const node of workspace.nodes) {
      if (node.data.kind !== 'agent' || !matchesTerminalRuntimeEvent(node.data, event)) {
        continue
      }

      const taskId = node.data.agent?.taskId ?? null
      const resolvedExecutionDirectory =
        node.data.executionDirectory ?? node.data.agent?.executionDirectory ?? workspace.path

      return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspacePath: workspace.path,
        nodeId: node.id,
        title: node.data.title,
        runtimeStatus: node.data.status,
        executionDirectory: resolvedExecutionDirectory,
        taskId,
      }
    }
  }

  return null
}

export type AgentStandbyNotificationPayload = {
  attentionReason: TerminalSessionAttentionReason
  sessionId: string
  bindingId: string | null
  workspaceId: string
  workspaceName: string
  workspacePath: string
  nodeId: string
  title: string
  executionDirectory: string
  taskId: string | null
}

export function useAgentStandbyNotificationWatcher({
  enabled = true,
  onAgentNeedsAttention,
  onAgentEnteredWorking,
}: {
  enabled?: boolean
  onAgentNeedsAttention: (payload: AgentStandbyNotificationPayload) => void
  onAgentEnteredWorking: (identity: { sessionId: string; bindingId: string | null }) => void
}): void {
  const lastStateBySessionIdRef = useRef<Map<string, TerminalSessionState>>(new Map())
  const lastAttentionReasonBySessionIdRef = useRef<Map<string, TerminalSessionAttentionReason>>(
    new Map(),
  )
  const attentionHandlerRef = useRef(onAgentNeedsAttention)
  const workingHandlerRef = useRef(onAgentEnteredWorking)

  useEffect(() => {
    attentionHandlerRef.current = onAgentNeedsAttention
  }, [onAgentNeedsAttention])

  useEffect(() => {
    workingHandlerRef.current = onAgentEnteredWorking
  }, [onAgentEnteredWorking])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const ptyEventHub = getPtyEventHub()
    const unsubscribeState = ptyEventHub.onState((event: TerminalSessionStateEvent) => {
      const sessionId = normalizeSessionId(event.sessionId)
      if (!sessionId) {
        return
      }

      const previous = lastStateBySessionIdRef.current.get(sessionId) ?? null
      lastStateBySessionIdRef.current.set(sessionId, event.state)

      if (event.state === 'working') {
        lastAttentionReasonBySessionIdRef.current.delete(sessionId)
        workingHandlerRef.current({
          sessionId,
          bindingId: normalizeBindingId(event.bindingId),
        })
        return
      }

      const resolved = resolveAgentNodeForRuntimeEvent({
        sessionId,
        bindingId: normalizeBindingId(event.bindingId),
      })
      if (!resolved) {
        return
      }

      const inferredPrevious: TerminalSessionState | null =
        previous ??
        (resolved.runtimeStatus === 'running' || resolved.runtimeStatus === 'restoring'
          ? 'working'
          : resolved.runtimeStatus === 'standby'
            ? 'standby'
            : null)

      if (inferredPrevious !== 'working') {
        return
      }

      const attentionReason = lastAttentionReasonBySessionIdRef.current.get(sessionId) ?? 'input'

      attentionHandlerRef.current({
        attentionReason,
        sessionId,
        bindingId: normalizeBindingId(event.bindingId),
        workspaceId: resolved.workspaceId,
        workspaceName: resolved.workspaceName,
        workspacePath: resolved.workspacePath,
        nodeId: resolved.nodeId,
        title: resolved.title,
        executionDirectory: resolved.executionDirectory,
        taskId: resolved.taskId,
      })
    })

    const unsubscribeAttention = ptyEventHub.onAttention((event: TerminalSessionAttentionEvent) => {
      const sessionId = normalizeSessionId(event.sessionId)
      if (!sessionId) {
        return
      }

      lastAttentionReasonBySessionIdRef.current.set(sessionId, event.reason)
    })

    return () => {
      unsubscribeState()
      unsubscribeAttention()
    }
  }, [enabled])
}
