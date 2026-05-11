export function normalizeSessionBindingId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function generateSessionBindingId(): string {
  return crypto.randomUUID()
}

export function deriveAgentNodeBindingId(nodeId: string): string {
  return `agent-node:${nodeId}`
}

export function deriveHostedTerminalBindingId(nodeId: string): string {
  return `hosted-terminal:${nodeId}`
}

export function deriveTaskAgentSessionRecordBindingId(recordId: string): string {
  return `task-agent-session:${recordId}`
}
