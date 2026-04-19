import {
  isRecord,
  normalizeBoolean,
  normalizeTextValue,
} from './settingsNormalization'

export const TERMINAL_CREDENTIAL_PROFILE_PROVIDERS = ['codex', 'claude-code'] as const

export type TerminalCredentialProvider = (typeof TERMINAL_CREDENTIAL_PROFILE_PROVIDERS)[number]

export interface TerminalCredentialProfile {
  id: string
  label: string
  provider: TerminalCredentialProvider
  apiKey: string
  baseUrl: string
  enabled: boolean
}

export interface TerminalCredentialsSettings {
  profiles: TerminalCredentialProfile[]
  defaultProfileIdByProvider: Partial<Record<TerminalCredentialProvider, string | null>>
}

export const EMPTY_TERMINAL_CREDENTIAL_DEFAULTS: TerminalCredentialsSettings = {
  profiles: [],
  defaultProfileIdByProvider: {
    codex: null,
    'claude-code': null,
  },
}

export interface ResolvedTerminalCredentialEnv {
  apiKeyEnvName: 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY'
  baseUrlEnvName: 'OPENAI_BASE_URL' | 'ANTHROPIC_BASE_URL'
  values: Record<string, string>
}

function isTerminalCredentialProvider(value: unknown): value is TerminalCredentialProvider {
  return (
    typeof value === 'string' &&
    TERMINAL_CREDENTIAL_PROFILE_PROVIDERS.includes(value as TerminalCredentialProvider)
  )
}

function normalizeTerminalCredentialProfile(
  value: unknown,
  usedIds: Set<string>,
): TerminalCredentialProfile | null {
  if (!isRecord(value)) {
    return null
  }

  const id = normalizeTextValue(value.id)
  const label = normalizeTextValue(value.label)
  const provider = isTerminalCredentialProvider(value.provider) ? value.provider : null
  const apiKey = normalizeTextValue(value.apiKey)
  const baseUrl = normalizeTextValue(value.baseUrl)
  const enabled = normalizeBoolean(value.enabled) ?? true

  if (!provider || id.length === 0 || usedIds.has(id)) {
    return null
  }

  usedIds.add(id)

  return {
    id,
    // 用 label 回退到 id，避免 header/select 中出现空白项。
    label: label.length > 0 ? label : id,
    provider,
    apiKey,
    baseUrl,
    enabled,
  }
}

export function normalizeTerminalCredentialsSettings(value: unknown): TerminalCredentialsSettings {
  if (!isRecord(value)) {
    return EMPTY_TERMINAL_CREDENTIAL_DEFAULTS
  }

  const usedIds = new Set<string>()
  const profiles = Array.isArray(value.profiles)
    ? value.profiles
        .map(item => normalizeTerminalCredentialProfile(item, usedIds))
        .filter((item): item is TerminalCredentialProfile => item !== null)
    : []

  const defaultsInput = isRecord(value.defaultProfileIdByProvider)
    ? value.defaultProfileIdByProvider
    : {}

  const defaultProfileIdByProvider = TERMINAL_CREDENTIAL_PROFILE_PROVIDERS.reduce<
    TerminalCredentialsSettings['defaultProfileIdByProvider']
  >((acc, provider) => {
    const profileId = normalizeTextValue(defaultsInput[provider])
    const matchedProfile = profiles.find(
      profile => profile.provider === provider && profile.id === profileId,
    )
    acc[provider] = matchedProfile ? matchedProfile.id : null
    return acc
  }, {})

  return {
    profiles,
    defaultProfileIdByProvider,
  }
}

export function resolveTerminalCredentialProfilesByProvider(
  settings: TerminalCredentialsSettings,
  provider: TerminalCredentialProvider,
): TerminalCredentialProfile[] {
  return settings.profiles.filter(profile => profile.provider === provider)
}

export function resolveTerminalCredentialProfileById(
  settings: TerminalCredentialsSettings,
  profileId: string | null | undefined,
): TerminalCredentialProfile | null {
  const normalizedId = typeof profileId === 'string' ? profileId.trim() : ''
  if (normalizedId.length === 0) {
    return null
  }

  return settings.profiles.find(profile => profile.id === normalizedId) ?? null
}

export function resolveDefaultTerminalCredentialProfile(
  settings: TerminalCredentialsSettings,
  provider: TerminalCredentialProvider,
): TerminalCredentialProfile | null {
  const preferredProfileId = settings.defaultProfileIdByProvider[provider]
  const preferredProfile =
    resolveTerminalCredentialProfileById(settings, preferredProfileId) ?? null
  if (preferredProfile && preferredProfile.provider === provider && preferredProfile.enabled) {
    return preferredProfile
  }

  return (
    settings.profiles.find(profile => profile.provider === provider && profile.enabled) ?? null
  )
}

export function resolveTerminalCredentialEnv(
  profile: TerminalCredentialProfile | null,
): ResolvedTerminalCredentialEnv | null {
  if (!profile || !profile.enabled) {
    return null
  }

  const apiKey = profile.apiKey.trim()
  const baseUrl = profile.baseUrl.trim()
  if (apiKey.length === 0 && baseUrl.length === 0) {
    return null
  }

  const apiKeyEnvName =
    profile.provider === 'codex' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
  const baseUrlEnvName =
    profile.provider === 'codex' ? 'OPENAI_BASE_URL' : 'ANTHROPIC_BASE_URL'

  const values: Record<string, string> = {}
  if (apiKey.length > 0) {
    values[apiKeyEnvName] = apiKey
  }
  if (baseUrl.length > 0) {
    values[baseUrlEnvName] = baseUrl
  }

  return {
    apiKeyEnvName,
    baseUrlEnvName,
    values,
  }
}
