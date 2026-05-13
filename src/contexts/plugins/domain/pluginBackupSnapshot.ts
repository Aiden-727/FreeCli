import type {
  BackupOssSettingsDto,
  BackupQuotaMonitorSettingsDto,
  BackupWorkspaceAssistantSettingsDto,
  OssBackupSettingsDto,
  PluginBackupSnapshotDto,
  QuotaMonitorSettingsDto,
  WorkspaceAssistantSettingsDto,
} from '@shared/contracts/dto'
import type { PluginSettings } from '@contexts/settings/domain/agentSettings'
import { DEFAULT_GIT_WORKLOG_SETTINGS, normalizeGitWorklogSettings } from './gitWorklogSettings'
import { DEFAULT_INPUT_STATS_SETTINGS } from './inputStatsSettings'
import { DEFAULT_OSS_BACKUP_SETTINGS, normalizeOssBackupSettings } from './ossBackupSettings'
import {
  DEFAULT_QUOTA_MONITOR_SETTINGS,
  normalizeQuotaMonitorSettings,
} from './quotaMonitorSettings'
import { DEFAULT_SYSTEM_MONITOR_SETTINGS } from './systemMonitorSettings'
import { DEFAULT_EYE_CARE_SETTINGS, normalizeEyeCareSettings } from './eyeCareSettings'
import { normalizeBuiltinPluginIds } from './pluginManifest'
import { normalizeWorkspaceAssistantSettings } from './workspaceAssistantSettings'

export const PLUGIN_BACKUP_SNAPSHOT_FORMAT_VERSION = 1

function sanitizeQuotaMonitorSettings(
  settings: QuotaMonitorSettingsDto,
): BackupQuotaMonitorSettingsDto {
  return {
    ...settings,
    keyProfiles: settings.keyProfiles.map(profile => ({
      ...profile,
      apiKey: '',
    })),
  }
}

function sanitizeOssBackupSettings(settings: OssBackupSettingsDto): BackupOssSettingsDto {
  return {
    provider: settings.provider,
    endpoint: settings.endpoint,
    region: settings.region,
    bucket: settings.bucket,
    objectKey: settings.objectKey,
    autoBackupEnabled: settings.autoBackupEnabled,
    autoBackupMinIntervalSeconds: settings.autoBackupMinIntervalSeconds,
    restoreOnStartupEnabled: settings.restoreOnStartupEnabled,
    backupOnExitEnabled: settings.backupOnExitEnabled,
    includedPluginIds: normalizeBuiltinPluginIds(settings.includedPluginIds),
    syncInputStatsHistoryEnabled: settings.syncInputStatsHistoryEnabled,
    syncQuotaMonitorHistoryEnabled: settings.syncQuotaMonitorHistoryEnabled,
    syncGitWorklogHistoryEnabled: settings.syncGitWorklogHistoryEnabled,
  }
}

function sanitizeWorkspaceAssistantSettings(
  settings: WorkspaceAssistantSettingsDto,
): BackupWorkspaceAssistantSettingsDto {
  return {
    ...settings,
    // The endpoint/model preference is portable, but the credential must stay local-only.
    apiKey: '',
  }
}

export function createPluginBackupSnapshot(options: {
  appVersion: string
  pluginSettings: PluginSettings
  createdAt?: string
}): PluginBackupSnapshotDto {
  const { appVersion, pluginSettings, createdAt } = options

  return {
    formatVersion: PLUGIN_BACKUP_SNAPSHOT_FORMAT_VERSION,
    createdAt: createdAt ?? new Date().toISOString(),
    appVersion,
    plugins: {
      enabledIds: normalizeBuiltinPluginIds(pluginSettings.enabledIds),
      eyeCare: normalizeEyeCareSettings(pluginSettings.eyeCare),
      quotaMonitor: sanitizeQuotaMonitorSettings(pluginSettings.quotaMonitor),
      gitWorklog: normalizeGitWorklogSettings(pluginSettings.gitWorklog),
      ossBackup: sanitizeOssBackupSettings(pluginSettings.ossBackup),
      workspaceAssistant: sanitizeWorkspaceAssistantSettings(pluginSettings.workspaceAssistant),
    },
  }
}

export function normalizePluginBackupSnapshot(snapshot: unknown): PluginBackupSnapshotDto | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null
  }

  const record = snapshot as Record<string, unknown>
  const plugins =
    record.plugins && typeof record.plugins === 'object' && !Array.isArray(record.plugins)
      ? (record.plugins as Record<string, unknown>)
      : null

  if (!plugins) {
    return null
  }

  const createdAt =
    typeof record.createdAt === 'string' && record.createdAt.trim().length > 0
      ? record.createdAt.trim()
      : null
  const appVersion =
    typeof record.appVersion === 'string' && record.appVersion.trim().length > 0
      ? record.appVersion.trim()
      : 'unknown'

  if (!createdAt) {
    return null
  }

  return {
    formatVersion:
      typeof record.formatVersion === 'number' && Number.isFinite(record.formatVersion)
        ? Math.max(1, Math.round(record.formatVersion))
        : PLUGIN_BACKUP_SNAPSHOT_FORMAT_VERSION,
    createdAt,
    appVersion,
    plugins: {
      enabledIds: normalizeBuiltinPluginIds(plugins.enabledIds),
      eyeCare:
        plugins.eyeCare !== undefined ? normalizeEyeCareSettings(plugins.eyeCare) : undefined,
      quotaMonitor:
        plugins.quotaMonitor !== undefined
          ? sanitizeQuotaMonitorSettings(normalizeQuotaMonitorSettings(plugins.quotaMonitor))
          : undefined,
      gitWorklog:
        plugins.gitWorklog !== undefined
          ? normalizeGitWorklogSettings(plugins.gitWorklog)
          : undefined,
      ossBackup:
        plugins.ossBackup !== undefined
          ? sanitizeOssBackupSettings(normalizeOssBackupSettings(plugins.ossBackup))
          : undefined,
      workspaceAssistant:
        plugins.workspaceAssistant !== undefined
          ? sanitizeWorkspaceAssistantSettings(
              normalizeWorkspaceAssistantSettings(plugins.workspaceAssistant),
            )
          : undefined,
    },
  }
}

export function mergeRestoredPluginSettings(
  current: PluginSettings,
  snapshot: PluginBackupSnapshotDto,
): PluginSettings {
  return {
    enabledIds:
      snapshot.plugins.enabledIds.length > 0
        ? normalizeBuiltinPluginIds(snapshot.plugins.enabledIds)
        : current.enabledIds,
    eyeCare: snapshot.plugins.eyeCare
      ? normalizeEyeCareSettings({
          ...current.eyeCare,
          ...snapshot.plugins.eyeCare,
        })
      : current.eyeCare,
    inputStats: current.inputStats,
    systemMonitor: current.systemMonitor,
    quotaMonitor: snapshot.plugins.quotaMonitor
      ? normalizeQuotaMonitorSettings({
          ...current.quotaMonitor,
          ...snapshot.plugins.quotaMonitor,
        })
      : current.quotaMonitor,
    gitWorklog: snapshot.plugins.gitWorklog
      ? normalizeGitWorklogSettings({
          ...current.gitWorklog,
          ...snapshot.plugins.gitWorklog,
        })
      : current.gitWorklog,
    ossBackup: snapshot.plugins.ossBackup
      ? normalizeOssBackupSettings({
          ...current.ossBackup,
          ...snapshot.plugins.ossBackup,
        })
      : current.ossBackup,
    workspaceAssistant: snapshot.plugins.workspaceAssistant
      ? normalizeWorkspaceAssistantSettings({
          ...current.workspaceAssistant,
          ...snapshot.plugins.workspaceAssistant,
        })
      : current.workspaceAssistant,
  }
}

export function getEmptyPluginSettingsForBackup(): PluginSettings {
  return {
    enabledIds: [],
    eyeCare: DEFAULT_EYE_CARE_SETTINGS,
    inputStats: DEFAULT_INPUT_STATS_SETTINGS,
    systemMonitor: DEFAULT_SYSTEM_MONITOR_SETTINGS,
    quotaMonitor: DEFAULT_QUOTA_MONITOR_SETTINGS,
    gitWorklog: DEFAULT_GIT_WORKLOG_SETTINGS,
    ossBackup: DEFAULT_OSS_BACKUP_SETTINGS,
    workspaceAssistant: normalizeWorkspaceAssistantSettings(undefined),
  }
}
