import type {
  AgentLaunchMode,
  AgentProviderId,
  AttachTerminalInput,
  DetachTerminalInput,
  KillTerminalInput,
  ResizeTerminalInput,
  SpawnTerminalInput,
  SnapshotTerminalInput,
  TrackHostedTerminalAgentInput,
  TerminalWriteEncoding,
  WriteTerminalInput,
} from '../../../../shared/contracts/dto'
import { isAbsolute } from 'node:path'
import { createAppError } from '../../../../shared/errors/appError'
import { normalizeProvider } from '../../../../app/main/ipc/normalize'

export function normalizeSpawnTerminalPayload(payload: unknown): SpawnTerminalInput {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for pty:spawn',
    })
  }

  const record = payload as Record<string, unknown>
  const cwd = typeof record.cwd === 'string' ? record.cwd.trim() : ''
  const profileId = typeof record.profileId === 'string' ? record.profileId.trim() : ''
  const shell = typeof record.shell === 'string' ? record.shell.trim() : ''
  const credentialInput =
    record.credential && typeof record.credential === 'object'
      ? (record.credential as Record<string, unknown>)
      : null
  const credentialProvider =
    credentialInput?.provider === 'codex' || credentialInput?.provider === 'claude-code'
      ? credentialInput.provider
      : null
  const credentialApiKey =
    typeof credentialInput?.apiKey === 'string' ? credentialInput.apiKey.trim() : ''
  const credentialBaseUrl =
    typeof credentialInput?.baseUrl === 'string' ? credentialInput.baseUrl.trim() : ''

  const cols =
    typeof record.cols === 'number' && Number.isFinite(record.cols) && record.cols > 0
      ? Math.floor(record.cols)
      : 80
  const rows =
    typeof record.rows === 'number' && Number.isFinite(record.rows) && record.rows > 0
      ? Math.floor(record.rows)
      : 24

  if (cwd.length === 0) {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid cwd for pty:spawn',
    })
  }

  if (!isAbsolute(cwd)) {
    throw createAppError('common.invalid_input', {
      debugMessage: 'pty:spawn requires an absolute cwd',
    })
  }

  return {
    cwd,
    profileId: profileId.length > 0 ? profileId : undefined,
    shell: shell.length > 0 ? shell : undefined,
    credential:
      credentialProvider && (credentialApiKey.length > 0 || credentialBaseUrl.length > 0)
        ? {
            provider: credentialProvider,
            ...(credentialApiKey.length > 0 ? { apiKey: credentialApiKey } : {}),
            ...(credentialBaseUrl.length > 0 ? { baseUrl: credentialBaseUrl } : {}),
          }
        : undefined,
    cols,
    rows,
  }
}

function normalizeSessionId(payload: unknown, channel: string): string {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: `Invalid payload for ${channel}`,
    })
  }

  const record = payload as Record<string, unknown>
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
  if (sessionId.length === 0) {
    throw createAppError('common.invalid_input', {
      debugMessage: `Invalid sessionId for ${channel}`,
    })
  }

  return sessionId
}

export function normalizeWriteTerminalPayload(payload: unknown): WriteTerminalInput {
  const sessionId = normalizeSessionId(payload, 'pty:write')
  const record = payload as Record<string, unknown>
  const data = typeof record.data === 'string' ? record.data : ''
  const rawEncoding = record.encoding

  if (rawEncoding !== undefined && rawEncoding !== 'utf8' && rawEncoding !== 'binary') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid encoding for pty:write',
    })
  }

  const encoding: TerminalWriteEncoding = rawEncoding === 'binary' ? 'binary' : 'utf8'
  return { sessionId, data, encoding }
}

export function normalizeResizeTerminalPayload(payload: unknown): ResizeTerminalInput {
  const sessionId = normalizeSessionId(payload, 'pty:resize')
  const record = payload as Record<string, unknown>
  const cols =
    typeof record.cols === 'number' && Number.isFinite(record.cols) && record.cols > 0
      ? Math.floor(record.cols)
      : 80
  const rows =
    typeof record.rows === 'number' && Number.isFinite(record.rows) && record.rows > 0
      ? Math.floor(record.rows)
      : 24
  return { sessionId, cols, rows }
}

export function normalizeKillTerminalPayload(payload: unknown): KillTerminalInput {
  return { sessionId: normalizeSessionId(payload, 'pty:kill') }
}

export function normalizeAttachTerminalPayload(payload: unknown): AttachTerminalInput {
  return { sessionId: normalizeSessionId(payload, 'pty:attach') }
}

export function normalizeDetachTerminalPayload(payload: unknown): DetachTerminalInput {
  return { sessionId: normalizeSessionId(payload, 'pty:detach') }
}

export function normalizeSnapshotPayload(payload: unknown): SnapshotTerminalInput {
  return { sessionId: normalizeSessionId(payload, 'pty:snapshot') }
}

function normalizeHostedProvider(
  value: unknown,
): Extract<AgentProviderId, 'claude-code' | 'codex'> {
  const provider = normalizeProvider(value)
  if (provider !== 'claude-code' && provider !== 'codex') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'pty:track-hosted-agent supports only claude-code and codex',
    })
  }

  return provider
}

function normalizeHostedLaunchMode(value: unknown): AgentLaunchMode {
  return value === 'resume' ? 'resume' : 'new'
}

export function normalizeTrackHostedAgentPayload(payload: unknown): TrackHostedTerminalAgentInput {
  const sessionId = normalizeSessionId(payload, 'pty:track-hosted-agent')
  const record = payload as Record<string, unknown>
  const provider = normalizeHostedProvider(record.provider)
  const cwd = typeof record.cwd === 'string' ? record.cwd.trim() : ''
  const startedAt = typeof record.startedAt === 'string' ? record.startedAt.trim() : ''
  const resumeSessionId =
    typeof record.resumeSessionId === 'string' ? record.resumeSessionId.trim() : ''

  if (cwd.length === 0 || !isAbsolute(cwd)) {
    throw createAppError('common.invalid_input', {
      debugMessage: 'pty:track-hosted-agent requires an absolute cwd',
    })
  }

  if (!Number.isFinite(Date.parse(startedAt))) {
    throw createAppError('common.invalid_input', {
      debugMessage: 'pty:track-hosted-agent requires a valid startedAt',
    })
  }

  return {
    sessionId,
    provider,
    cwd,
    launchMode: normalizeHostedLaunchMode(record.launchMode),
    resumeSessionId: resumeSessionId.length > 0 ? resumeSessionId : null,
    startedAt,
  }
}
