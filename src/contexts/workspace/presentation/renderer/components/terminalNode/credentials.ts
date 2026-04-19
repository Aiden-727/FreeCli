import type { SpawnTerminalInput } from '@shared/contracts/dto'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import {
  resolveTerminalCredentialEnv,
  resolveTerminalCredentialProfileById,
  type TerminalCredentialProvider,
} from '@contexts/settings/domain/terminalCredentials'

export function resolveTerminalCredentialSpawnInput({
  settings,
  credentialProfileId,
}: {
  settings: Pick<AgentSettings, 'terminalCredentials'>
  credentialProfileId?: string | null
}): SpawnTerminalInput['credential'] | undefined {
  const profile = resolveTerminalCredentialProfileById(
    settings.terminalCredentials,
    credentialProfileId,
  )
  const env = resolveTerminalCredentialEnv(profile)

  if (!profile || !env) {
    return undefined
  }

  return {
    provider: profile.provider,
    ...(profile.apiKey.trim().length > 0 ? { apiKey: profile.apiKey.trim() } : {}),
    ...(profile.baseUrl.trim().length > 0 ? { baseUrl: profile.baseUrl.trim() } : {}),
  }
}

export function resolveCredentialProviderLabel(
  provider: TerminalCredentialProvider,
): 'Codex' | 'Claude Code' {
  return provider === 'codex' ? 'Codex' : 'Claude Code'
}
