import type { Node } from '@xyflow/react'
import type { TerminalNodeData } from '../../types'

type WorkspaceCanvasAgentSessionState = {
  nodeId: string
  sessionId: string
  resumeSessionId: string | null
}

type WorkspaceCanvasTestApi = {
  getAgentSessions: () => WorkspaceCanvasAgentSessionState[]
  getFirstAgentSessionId: () => string | null
  getResumeSessionIdByPtySessionId: (ptySessionId: string) => string | null
  getSessionIdByNodeId: (nodeId: string) => string | null
}

declare global {
  interface Window {
    __freecliWorkspaceCanvasTestApi?: WorkspaceCanvasTestApi
  }
}

let agentSessions: WorkspaceCanvasAgentSessionState[] = []
let nodeSessions: Array<{ nodeId: string; sessionId: string }> = []

function getWorkspaceCanvasTestApi(): WorkspaceCanvasTestApi | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const api = window.__freecliWorkspaceCanvasTestApi ?? ({} as WorkspaceCanvasTestApi)
  api.getAgentSessions = () => [...agentSessions]
  api.getFirstAgentSessionId = () => agentSessions[0]?.sessionId ?? null
  api.getSessionIdByNodeId = nodeId => {
    const normalizedNodeId = nodeId.trim()
    if (normalizedNodeId.length === 0) {
      return null
    }

    return nodeSessions.find(session => session.nodeId === normalizedNodeId)?.sessionId ?? null
  }
  api.getResumeSessionIdByPtySessionId = ptySessionId => {
    const normalizedSessionId = ptySessionId.trim()
    if (normalizedSessionId.length === 0) {
      return null
    }

    return (
      agentSessions.find(session => session.sessionId === normalizedSessionId)?.resumeSessionId ??
      null
    )
  }
  window.__freecliWorkspaceCanvasTestApi = api

  return window.__freecliWorkspaceCanvasTestApi
}

export function syncWorkspaceCanvasTestState(nodes: Node<TerminalNodeData>[]): void {
  if (typeof window === 'undefined') {
    return
  }

  getWorkspaceCanvasTestApi()
  nodeSessions = nodes.flatMap(node => {
    const sessionId = node.data.sessionId.trim()
    if (sessionId.length === 0) {
      return []
    }

    return [
      {
        nodeId: node.id,
        sessionId,
      },
    ]
  })
  agentSessions = nodes.flatMap(node => {
    if (node.data.kind !== 'agent') {
      return []
    }

    const sessionId = node.data.sessionId.trim()
    if (sessionId.length === 0) {
      return []
    }

    const resumeSessionId =
      typeof node.data.agent?.resumeSessionId === 'string' &&
      node.data.agent.resumeSessionId.trim().length > 0
        ? node.data.agent.resumeSessionId
        : null

    return [
      {
        nodeId: node.id,
        sessionId,
        resumeSessionId,
      },
    ]
  })
}
