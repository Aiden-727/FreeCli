import type {
  AgentProviderId,
  TerminalSessionAttentionReason,
  TerminalSessionState,
} from '@shared/contracts/dto'
import { buildHostedTerminalDisplayModelLabel } from '../../../terminal/domain/hostedAgent'

export interface SessionRuntimeMetadata {
  effectiveModel: string | null
  reasoningEffort: string | null
  displayModelLabel: string | null
}

export interface SessionLineInspection {
  state: TerminalSessionState | null
  runtimeMetadata: SessionRuntimeMetadata | null
  attentionReason: TerminalSessionAttentionReason | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function isWhitespaceCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
}

function normalizeSessionLineCandidate(line: string): string | null {
  let start = 0
  let end = line.length

  while (start < end && isWhitespaceCode(line.charCodeAt(start))) {
    start += 1
  }

  while (end > start && isWhitespaceCode(line.charCodeAt(end - 1))) {
    end -= 1
  }

  if (start === end || line.charCodeAt(start) !== 0x7b) {
    return null
  }

  return start === 0 && end === line.length ? line : line.slice(start, end)
}

function mayContainTurnState(provider: AgentProviderId, line: string): boolean {
  if (!line.includes('"type"')) {
    return false
  }

  if (provider === 'claude-code') {
    return line.includes('"assistant"') || line.includes('"user"')
  }

  return line.includes('"response_item"') || line.includes('"event_msg"')
}

function mayContainRuntimeMetadata(provider: AgentProviderId, line: string): boolean {
  if (provider === 'codex') {
    return line.includes('"turn_context"')
  }

  return false
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function hasContentBlockType(message: Record<string, unknown>, blockType: string): boolean {
  if (!Array.isArray(message.content)) {
    return false
  }

  return message.content.some(block => {
    return isRecord(block) && block.type === blockType
  })
}

function getMessageTextContent(message: Record<string, unknown>): string {
  if (!Array.isArray(message.content)) {
    return ''
  }

  return message.content
    .flatMap(block => {
      if (!isRecord(block)) {
        return []
      }

      if (typeof block.text === 'string') {
        return [block.text]
      }

      if (typeof block.content === 'string') {
        return [block.content]
      }

      return []
    })
    .join(' ')
    .trim()
}

function looksLikeQuestion(text: string): boolean {
  const normalized = text.trim()
  if (normalized.length === 0) {
    return false
  }

  return /[?？]\s*$/.test(normalized)
}

function detectCodexAssistantMessageState(
  payload: Record<string, unknown>,
  options: { fallbackToStandbyWithoutPhase: boolean },
): TerminalSessionState | null {
  if (payload.phase === 'commentary') {
    return 'working'
  }

  if (payload.phase === 'final_answer') {
    return 'standby'
  }

  return options.fallbackToStandbyWithoutPhase ? 'standby' : null
}

function detectClaudeTurnState(parsed: unknown): TerminalSessionState | null {
  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null
  }

  if (parsed.type === 'assistant') {
    const message = parsed.message
    if (!isRecord(message)) {
      return null
    }

    if (hasContentBlockType(message, 'tool_use') || hasContentBlockType(message, 'thinking')) {
      return 'working'
    }

    if (hasContentBlockType(message, 'text')) {
      return 'standby'
    }

    if (message.stop_reason === null) {
      return 'working'
    }

    if (typeof message.stop_reason === 'string') {
      return 'standby'
    }

    return null
  }

  if (parsed.type === 'user') {
    return 'working'
  }

  return null
}

function detectClaudeAttentionReason(parsed: unknown): TerminalSessionAttentionReason | null {
  if (!isRecord(parsed) || parsed.type !== 'assistant') {
    return null
  }

  const message = parsed.message
  if (!isRecord(message)) {
    return null
  }

  if (typeof message.stop_reason === 'string' && message.stop_reason.trim() === 'tool_use') {
    return 'approval'
  }

  if (hasContentBlockType(message, 'tool_use')) {
    return 'approval'
  }

  if (hasContentBlockType(message, 'text') && looksLikeQuestion(getMessageTextContent(message))) {
    return 'input'
  }

  return null
}

// Codex's authoritative working indicator lives in the TUI's in-memory
// turn lifecycle (`task_running`), not in any single rollout message. This
// detector therefore uses a file-level fallback: keep `commentary` in
// `working`, only downgrade assistant messages to `standby` at `final_answer`
// (or legacy no-phase compatibility), and ignore legacy `user_message` /
// `agent_message` boundaries because they are not reliable turn-state owners.
function detectCodexTurnState(parsed: unknown): TerminalSessionState | null {
  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null
  }

  if (parsed.type === 'event_msg') {
    const payload = parsed.payload
    if (!isRecord(payload) || typeof payload.type !== 'string') {
      return null
    }

    if (payload.type === 'task_started') {
      return 'working'
    }

    if (payload.type === 'task_complete') {
      return 'standby'
    }

    if (payload.type === 'agent_reasoning') {
      return 'working'
    }

    if (payload.type === 'agent_message') {
      return detectCodexAssistantMessageState(payload, {
        fallbackToStandbyWithoutPhase: false,
      })
    }

    if (payload.type === 'turn_aborted') {
      return 'standby'
    }

    return null
  }

  if (parsed.type === 'response_item') {
    const payload = parsed.payload
    if (!isRecord(payload) || typeof payload.type !== 'string') {
      return null
    }

    if (payload.type === 'message') {
      if (payload.role !== 'assistant') {
        return null
      }

      return detectCodexAssistantMessageState(payload, {
        fallbackToStandbyWithoutPhase: true,
      })
    }

    if (
      payload.type === 'reasoning' ||
      payload.type === 'function_call' ||
      payload.type === 'function_call_output'
    ) {
      return 'working'
    }
  }

  return null
}

function detectCodexAttentionReason(parsed: unknown): TerminalSessionAttentionReason | null {
  if (!isRecord(parsed) || typeof parsed.type !== 'string') {
    return null
  }

  if (parsed.type === 'event_msg') {
    const payload = parsed.payload
    if (!isRecord(payload) || typeof payload.type !== 'string') {
      return null
    }

    if (payload.type === 'turn_aborted') {
      return 'recovery'
    }

    if (payload.type === 'agent_message') {
      const text =
        typeof payload.message === 'string'
          ? payload.message
          : typeof payload.text === 'string'
            ? payload.text
            : ''

      if (looksLikeQuestion(text)) {
        return 'input'
      }
    }

    return null
  }

  if (parsed.type === 'response_item') {
    const payload = parsed.payload
    if (!isRecord(payload) || typeof payload.type !== 'string') {
      return null
    }

    if (payload.type === 'function_call') {
      const name = normalizeOptionalText(payload.name)
      if (name === 'request_user_input') {
        return 'input'
      }

      return 'approval'
    }

    if (payload.type === 'message' && payload.role === 'assistant') {
      const contentText = Array.isArray(payload.content)
        ? payload.content
            .flatMap(item => {
              if (!isRecord(item)) {
                return []
              }

              if (typeof item.text === 'string') {
                return [item.text]
              }

              return []
            })
            .join(' ')
        : ''

      if (looksLikeQuestion(contentText)) {
        return 'input'
      }
    }
  }

  return null
}

function detectCodexRuntimeMetadata(parsed: unknown): SessionRuntimeMetadata | null {
  if (!isRecord(parsed) || parsed.type !== 'turn_context') {
    return null
  }

  const payload = parsed.payload
  if (!isRecord(payload)) {
    return null
  }

  const effectiveModel = normalizeOptionalText(payload.model)
  const reasoningEffort = normalizeOptionalText(payload.effort)
  const displayModelLabel = buildHostedTerminalDisplayModelLabel({
    effectiveModel,
    reasoningEffort,
  })

  if (!effectiveModel && !reasoningEffort && !displayModelLabel) {
    return null
  }

  return {
    effectiveModel,
    reasoningEffort,
    displayModelLabel,
  }
}

export function detectTurnStateFromSessionRecord(
  provider: AgentProviderId,
  parsed: unknown,
): TerminalSessionState | null {
  if (provider === 'claude-code') {
    return detectClaudeTurnState(parsed)
  }

  return detectCodexTurnState(parsed)
}

export function detectAttentionReasonFromSessionRecord(
  provider: AgentProviderId,
  parsed: unknown,
): TerminalSessionAttentionReason | null {
  if (provider === 'claude-code') {
    return detectClaudeAttentionReason(parsed)
  }

  return detectCodexAttentionReason(parsed)
}

export function detectRuntimeMetadataFromSessionRecord(
  provider: AgentProviderId,
  parsed: unknown,
): SessionRuntimeMetadata | null {
  if (provider === 'codex') {
    return detectCodexRuntimeMetadata(parsed)
  }

  return null
}

export function inspectSessionLine(provider: AgentProviderId, line: string): SessionLineInspection {
  const candidate = normalizeSessionLineCandidate(line)
  if (!candidate) {
    return { state: null, runtimeMetadata: null, attentionReason: null }
  }

  if (
    !mayContainTurnState(provider, candidate) &&
    !mayContainRuntimeMetadata(provider, candidate)
  ) {
    return { state: null, runtimeMetadata: null, attentionReason: null }
  }

  try {
    const parsed = JSON.parse(candidate)
    return {
      state: detectTurnStateFromSessionRecord(provider, parsed),
      runtimeMetadata: detectRuntimeMetadataFromSessionRecord(provider, parsed),
      attentionReason: detectAttentionReasonFromSessionRecord(provider, parsed),
    }
  } catch {
    return { state: null, runtimeMetadata: null, attentionReason: null }
  }
}

export function detectTurnStateFromSessionLine(
  provider: AgentProviderId,
  line: string,
): TerminalSessionState | null {
  return inspectSessionLine(provider, line).state
}

export function detectRuntimeMetadataFromSessionLine(
  provider: AgentProviderId,
  line: string,
): SessionRuntimeMetadata | null {
  return inspectSessionLine(provider, line).runtimeMetadata
}

export function detectAttentionReasonFromSessionLine(
  provider: AgentProviderId,
  line: string,
): TerminalSessionAttentionReason | null {
  return inspectSessionLine(provider, line).attentionReason
}
