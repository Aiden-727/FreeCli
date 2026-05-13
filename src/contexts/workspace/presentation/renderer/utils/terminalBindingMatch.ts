import type { TerminalNodeData } from '../types'

function normalizeOptionalText(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') {
    return null
  }

  const trimmed = rawValue.trim()
  return trimmed.length > 0 ? trimmed : null
}

export interface TerminalBindingMatchInput {
  sessionId: string
  bindingId?: string | null
}

export function getTerminalNodeBindingId(nodeData: TerminalNodeData): string | null {
  if (nodeData.kind === 'agent') {
    return normalizeOptionalText(nodeData.agent?.bindingId)
  }

  if (nodeData.kind === 'terminal') {
    return normalizeOptionalText(nodeData.hostedAgent?.bindingId)
  }

  return null
}

export function matchesTerminalRuntimeEvent(
  nodeData: TerminalNodeData,
  event: TerminalBindingMatchInput,
): boolean {
  const eventBindingId = normalizeOptionalText(event.bindingId)
  const nodeBindingId = getTerminalNodeBindingId(nodeData)

  if (eventBindingId && nodeBindingId) {
    return eventBindingId === nodeBindingId
  }

  return nodeData.sessionId === event.sessionId
}
