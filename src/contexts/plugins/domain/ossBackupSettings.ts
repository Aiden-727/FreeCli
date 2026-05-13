import type { OssBackupErrorDto, OssBackupSettingsDto } from '@shared/contracts/dto'
import {
  listBuiltinPluginCloudBackupParticipantIds,
  normalizeBuiltinPluginIds,
} from './pluginManifest'

export const OSS_BACKUP_DEFAULT_OBJECT_KEY = 'freecli/plugin-settings'
export const OSS_BACKUP_PROVIDERS = ['aliyun-oss'] as const
const MIN_AUTO_BACKUP_MIN_INTERVAL_SECONDS = 60
const MAX_AUTO_BACKUP_MIN_INTERVAL_SECONDS = 86400
const DEFAULT_INCLUDED_PLUGIN_IDS = listBuiltinPluginCloudBackupParticipantIds()
const LEGACY_OBJECT_FILE_NAMES = new Set([
  'latest.json',
  'manifest.json',
  'input-stats-history.json',
  'quota-monitor-history.json',
  'git-worklog-history.json',
])

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeDatasetSyncFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeIntegerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  const rounded = Math.round(value)
  if (rounded < min) {
    return min
  }
  if (rounded > max) {
    return max
  }
  return rounded
}

export function normalizeOssBackupObjectDirectory(value: unknown): string {
  const normalized = normalizeText(value, OSS_BACKUP_DEFAULT_OBJECT_KEY)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')

  if (normalized.length === 0) {
    return OSS_BACKUP_DEFAULT_OBJECT_KEY
  }

  const segments = normalized.split('/').filter(segment => segment.length > 0)
  if (segments.length === 0) {
    return OSS_BACKUP_DEFAULT_OBJECT_KEY
  }

  const lastSegment = segments.at(-1)?.toLowerCase() ?? ''
  if (LEGACY_OBJECT_FILE_NAMES.has(lastSegment) && segments.length > 1) {
    const legacyDirectory = segments.slice(0, -1).join('/')
    return legacyDirectory.length > 0 ? legacyDirectory : OSS_BACKUP_DEFAULT_OBJECT_KEY
  }

  return segments.join('/')
}

function normalizeError(value: unknown): OssBackupErrorDto | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const message = normalizeText(record.message)
  if (message.length === 0) {
    return null
  }

  const detail = normalizeText(record.detail)
  return {
    message,
    detail: detail.length > 0 ? detail : null,
  }
}

export const DEFAULT_OSS_BACKUP_SETTINGS: OssBackupSettingsDto = {
  enabled: false,
  provider: 'aliyun-oss',
  endpoint: '',
  region: '',
  bucket: '',
  objectKey: OSS_BACKUP_DEFAULT_OBJECT_KEY,
  accessKeyId: '',
  accessKeySecret: '',
  autoBackupEnabled: false,
  autoBackupMinIntervalSeconds: 180,
  restoreOnStartupEnabled: false,
  backupOnExitEnabled: false,
  includedPluginIds: DEFAULT_INCLUDED_PLUGIN_IDS,
  syncInputStatsHistoryEnabled: false,
  syncQuotaMonitorHistoryEnabled: false,
  syncGitWorklogHistoryEnabled: false,
  lastBackupAt: null,
  lastRestoreAt: null,
  lastError: null,
}

export function normalizeOssBackupSettings(value: unknown): OssBackupSettingsDto {
  if (!value || typeof value !== 'object') {
    return DEFAULT_OSS_BACKUP_SETTINGS
  }

  const record = value as Record<string, unknown>
  const objectKey = normalizeOssBackupObjectDirectory(record.objectKey)
  const lastBackupAt = normalizeText(record.lastBackupAt)
  const lastRestoreAt = normalizeText(record.lastRestoreAt)
  const hasIncludedPluginIds = Object.prototype.hasOwnProperty.call(record, 'includedPluginIds')
  const normalizedIncludedPluginIds = normalizeBuiltinPluginIds(record.includedPluginIds).filter(
    id => DEFAULT_INCLUDED_PLUGIN_IDS.includes(id),
  )

  return {
    enabled: normalizeBoolean(record.enabled, DEFAULT_OSS_BACKUP_SETTINGS.enabled),
    provider: OSS_BACKUP_PROVIDERS.includes(record.provider as 'aliyun-oss')
      ? (record.provider as 'aliyun-oss')
      : DEFAULT_OSS_BACKUP_SETTINGS.provider,
    endpoint: normalizeText(record.endpoint),
    region: normalizeText(record.region),
    bucket: normalizeText(record.bucket),
    objectKey,
    accessKeyId: normalizeText(record.accessKeyId),
    accessKeySecret: normalizeText(record.accessKeySecret),
    autoBackupEnabled: normalizeBoolean(
      record.autoBackupEnabled,
      DEFAULT_OSS_BACKUP_SETTINGS.autoBackupEnabled,
    ),
    autoBackupMinIntervalSeconds: normalizeIntegerInRange(
      record.autoBackupMinIntervalSeconds,
      DEFAULT_OSS_BACKUP_SETTINGS.autoBackupMinIntervalSeconds,
      MIN_AUTO_BACKUP_MIN_INTERVAL_SECONDS,
      MAX_AUTO_BACKUP_MIN_INTERVAL_SECONDS,
    ),
    restoreOnStartupEnabled: normalizeBoolean(
      record.restoreOnStartupEnabled,
      DEFAULT_OSS_BACKUP_SETTINGS.restoreOnStartupEnabled,
    ),
    backupOnExitEnabled: normalizeBoolean(
      record.backupOnExitEnabled,
      DEFAULT_OSS_BACKUP_SETTINGS.backupOnExitEnabled,
    ),
    includedPluginIds: hasIncludedPluginIds
      ? normalizedIncludedPluginIds
      : DEFAULT_OSS_BACKUP_SETTINGS.includedPluginIds,
    syncInputStatsHistoryEnabled: normalizeDatasetSyncFlag(
      record.syncInputStatsHistoryEnabled,
      DEFAULT_OSS_BACKUP_SETTINGS.syncInputStatsHistoryEnabled,
    ),
    syncQuotaMonitorHistoryEnabled: normalizeDatasetSyncFlag(
      record.syncQuotaMonitorHistoryEnabled,
      DEFAULT_OSS_BACKUP_SETTINGS.syncQuotaMonitorHistoryEnabled,
    ),
    syncGitWorklogHistoryEnabled: normalizeDatasetSyncFlag(
      record.syncGitWorklogHistoryEnabled,
      DEFAULT_OSS_BACKUP_SETTINGS.syncGitWorklogHistoryEnabled,
    ),
    lastBackupAt: lastBackupAt.length > 0 ? lastBackupAt : null,
    lastRestoreAt: lastRestoreAt.length > 0 ? lastRestoreAt : null,
    lastError: normalizeError(record.lastError),
  }
}

export function isOssBackupConfigured(settings: OssBackupSettingsDto): boolean {
  return (
    settings.endpoint.trim().length > 0 &&
    settings.region.trim().length > 0 &&
    settings.bucket.trim().length > 0 &&
    settings.objectKey.trim().length > 0 &&
    settings.accessKeyId.trim().length > 0 &&
    settings.accessKeySecret.trim().length > 0
  )
}
