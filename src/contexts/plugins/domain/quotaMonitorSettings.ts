import type {
  QuotaMonitorKeyProfileDto,
  QuotaMonitorKeyType,
  QuotaMonitorSettingsDto,
} from '@shared/contracts/dto'

export const QUOTA_MONITOR_KEY_TYPES = ['normal', 'capped'] as const
export const QUOTA_MONITOR_DEFAULT_REFRESH_INTERVAL_MS = 180000
export const QUOTA_MONITOR_MIN_REFRESH_INTERVAL_MS = 30000
export const QUOTA_MONITOR_MAX_REFRESH_INTERVAL_MS = 60 * 60 * 1000
export const QUOTA_MONITOR_DEFAULT_TIMEOUT_SECONDS = 12
export const QUOTA_MONITOR_MIN_TIMEOUT_SECONDS = 3
export const QUOTA_MONITOR_MAX_TIMEOUT_SECONDS = 120
export const QUOTA_MONITOR_DEFAULT_RETRY_TIMES = 3
export const QUOTA_MONITOR_MIN_RETRY_TIMES = 1
export const QUOTA_MONITOR_MAX_RETRY_TIMES = 8

export function isQuotaMonitorKeyType(value: unknown): value is QuotaMonitorKeyType {
  return typeof value === 'string' && QUOTA_MONITOR_KEY_TYPES.includes(value as QuotaMonitorKeyType)
}

export function createDefaultQuotaMonitorKeyProfile(
  index = 0,
): QuotaMonitorKeyProfileDto {
  return {
    id: `key_${index + 1}`,
    label: `Key ${index + 1}`,
    apiKey: '',
    enabled: true,
    type: 'normal',
    dailyInitialQuota: 0,
    hourlyIncreaseQuota: 0,
    quotaCap: 0,
  }
}

export const DEFAULT_QUOTA_MONITOR_SETTINGS: QuotaMonitorSettingsDto = {
  apiBaseUrl: '',
  refreshIntervalMs: QUOTA_MONITOR_DEFAULT_REFRESH_INTERVAL_MS,
  timeoutSeconds: QUOTA_MONITOR_DEFAULT_TIMEOUT_SECONDS,
  retryTimes: QUOTA_MONITOR_DEFAULT_RETRY_TIMES,
  verifySsl: true,
  proxy: '',
  keyProfiles: [createDefaultQuotaMonitorKeyProfile()],
}

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value)
        : Number.NaN

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
}

function normalizeIntegerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(parsed)))
}

export function normalizeQuotaMonitorKeyProfiles(
  value: unknown,
): QuotaMonitorKeyProfileDto[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_QUOTA_MONITOR_SETTINGS.keyProfiles]
  }

  const normalized: QuotaMonitorKeyProfileDto[] = []
  const seenIds = new Set<string>()

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index]
    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Record<string, unknown>
    const fallback = createDefaultQuotaMonitorKeyProfile(index)
    const id = normalizeText(record.id, fallback.id) || fallback.id

    if (seenIds.has(id)) {
      continue
    }

    seenIds.add(id)
    normalized.push({
      id,
      label: normalizeText(record.label, fallback.label) || fallback.label,
      apiKey: normalizeText(record.apiKey),
      enabled: normalizeBoolean(record.enabled, fallback.enabled),
      type: isQuotaMonitorKeyType(record.type) ? record.type : fallback.type,
      dailyInitialQuota: normalizeNonNegativeNumber(
        record.dailyInitialQuota,
        fallback.dailyInitialQuota,
      ),
      hourlyIncreaseQuota: normalizeNonNegativeNumber(
        record.hourlyIncreaseQuota,
        fallback.hourlyIncreaseQuota,
      ),
      quotaCap: normalizeNonNegativeNumber(record.quotaCap, fallback.quotaCap),
    })
  }

  return normalized.length > 0
    ? normalized
    : [...DEFAULT_QUOTA_MONITOR_SETTINGS.keyProfiles]
}

export function normalizeQuotaMonitorSettings(
  value: unknown,
): QuotaMonitorSettingsDto {
  if (!value || typeof value !== 'object') {
    return DEFAULT_QUOTA_MONITOR_SETTINGS
  }

  const record = value as Record<string, unknown>
  return {
    apiBaseUrl: normalizeText(record.apiBaseUrl),
    refreshIntervalMs: normalizeIntegerInRange(
      record.refreshIntervalMs,
      DEFAULT_QUOTA_MONITOR_SETTINGS.refreshIntervalMs,
      QUOTA_MONITOR_MIN_REFRESH_INTERVAL_MS,
      QUOTA_MONITOR_MAX_REFRESH_INTERVAL_MS,
    ),
    timeoutSeconds: normalizeIntegerInRange(
      record.timeoutSeconds,
      DEFAULT_QUOTA_MONITOR_SETTINGS.timeoutSeconds,
      QUOTA_MONITOR_MIN_TIMEOUT_SECONDS,
      QUOTA_MONITOR_MAX_TIMEOUT_SECONDS,
    ),
    retryTimes: normalizeIntegerInRange(
      record.retryTimes,
      DEFAULT_QUOTA_MONITOR_SETTINGS.retryTimes,
      QUOTA_MONITOR_MIN_RETRY_TIMES,
      QUOTA_MONITOR_MAX_RETRY_TIMES,
    ),
    verifySsl: normalizeBoolean(record.verifySsl, DEFAULT_QUOTA_MONITOR_SETTINGS.verifySsl),
    proxy: normalizeText(record.proxy),
    keyProfiles: normalizeQuotaMonitorKeyProfiles(record.keyProfiles),
  }
}

export function isQuotaMonitorSettingsConfigured(settings: QuotaMonitorSettingsDto): boolean {
  return getConfiguredQuotaMonitorProfiles(settings).length > 0
}

export function getConfiguredQuotaMonitorProfiles(
  settings: QuotaMonitorSettingsDto,
): QuotaMonitorKeyProfileDto[] {
  if (settings.apiBaseUrl.trim().length === 0) {
    return []
  }

  return settings.keyProfiles.filter(profile => {
    return profile.enabled && profile.apiKey.trim().length > 0
  })
}
