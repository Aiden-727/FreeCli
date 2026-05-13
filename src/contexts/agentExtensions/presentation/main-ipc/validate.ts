import type {
  AddAgentMcpServerInput,
  AgentExtensionProviderId,
  AgentExtensionScope,
  CreateAgentSkillInput,
  GetAgentExtensionsInput,
  RemoveAgentMcpServerInput,
} from '@shared/contracts/dto'
import { createAppError } from '../../../../shared/errors/appError'

function normalizeProvider(value: unknown): AgentExtensionProviderId {
  if (value === 'codex' || value === 'claude-code') {
    return value
  }

  throw createAppError('common.invalid_input', {
    debugMessage: 'agent-extensions provider must be codex or claude-code',
  })
}

function normalizeScope(value: unknown): AgentExtensionScope {
  if (value === 'global') {
    return value
  }

  throw createAppError('common.invalid_input', {
    debugMessage: 'agent-extensions scope must be global',
  })
}

function normalizeName(value: unknown, debugMessage: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized.length === 0) {
    throw createAppError('common.invalid_input', { debugMessage })
  }

  return normalized
}

export function normalizeGetAgentExtensionsPayload(payload: unknown): GetAgentExtensionsInput {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for agent-extensions:get-state',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    provider: normalizeProvider(record.provider),
    scope: normalizeScope(record.scope),
  }
}

export function normalizeAddAgentMcpServerPayload(payload: unknown): AddAgentMcpServerInput {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for agent-extensions:add-mcp-server',
    })
  }

  const record = payload as Record<string, unknown>
  const transport =
    record.transport === 'http' || record.transport === 'stdio' ? record.transport : null

  if (!transport) {
    throw createAppError('common.invalid_input', {
      debugMessage: 'agent-extensions transport must be http or stdio',
    })
  }

  const envSource =
    record.env && typeof record.env === 'object' ? (record.env as Record<string, unknown>) : {}

  return {
    provider: normalizeProvider(record.provider),
    scope: normalizeScope(record.scope),
    name: normalizeName(record.name, 'agent-extensions mcp server name is required'),
    transport,
    command: typeof record.command === 'string' ? record.command.trim() : null,
    args: Array.isArray(record.args)
      ? record.args
          .filter((item): item is string => typeof item === 'string')
          .map(item => item.trim())
      : [],
    url: typeof record.url === 'string' ? record.url.trim() : null,
    env: Object.fromEntries(
      Object.entries(envSource).flatMap(([key, value]) =>
        typeof value === 'string' ? [[key, value]] : [],
      ),
    ),
  }
}

export function normalizeRemoveAgentMcpServerPayload(payload: unknown): RemoveAgentMcpServerInput {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for agent-extensions:remove-mcp-server',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    provider: normalizeProvider(record.provider),
    scope: normalizeScope(record.scope),
    name: normalizeName(record.name, 'agent-extensions mcp remove name is required'),
  }
}

export function normalizeCreateAgentSkillPayload(payload: unknown): CreateAgentSkillInput {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for agent-extensions:create-skill',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    provider: normalizeProvider(record.provider),
    scope: normalizeScope(record.scope),
    name: normalizeName(record.name, 'agent-extensions skill name is required'),
  }
}
