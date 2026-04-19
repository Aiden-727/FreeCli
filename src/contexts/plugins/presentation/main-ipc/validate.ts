import { createAppError } from '../../../../shared/errors/appError'
import type { BuiltinPluginId } from '../../domain/pluginManifest'
import {
  normalizeGitWorklogSettings,
  normalizeGitWorklogWorkspaces,
} from '../../domain/gitWorklogSettings'
import { normalizeInputStatsSettings } from '../../domain/inputStatsSettings'
import { normalizeOssBackupSettings } from '../../domain/ossBackupSettings'
import { normalizeQuotaMonitorSettings } from '../../domain/quotaMonitorSettings'
import { normalizeSystemMonitorSettings } from '../../domain/systemMonitorSettings'
import { normalizeBuiltinPluginIds } from '../../domain/pluginManifest'
import type {
  GitWorklogSettingsDto,
  GitWorklogWorkspaceDto,
  InputStatsSettingsDto,
  NotifyOssBackupPersistedSettingsInput,
  OssBackupSettingsDto,
  QuotaMonitorSettingsDto,
  ResolveGitWorklogRepositoryInput,
  SystemMonitorSettingsDto,
} from '@shared/contracts/dto'

export interface NormalizedSyncPluginRuntimeStatePayload {
  enabledPluginIds: BuiltinPluginId[]
}

export interface NormalizedSyncQuotaMonitorSettingsPayload {
  settings: QuotaMonitorSettingsDto
}

export interface NormalizedSyncInputStatsSettingsPayload {
  settings: InputStatsSettingsDto
}

export interface NormalizedSyncSystemMonitorSettingsPayload {
  settings: SystemMonitorSettingsDto
}

export interface NormalizedSyncGitWorklogSettingsPayload {
  settings: GitWorklogSettingsDto
}

export interface NormalizedSyncGitWorklogWorkspacesPayload {
  workspaces: GitWorklogWorkspaceDto[]
}

export interface NormalizedResolveGitWorklogRepositoryPayload
  extends ResolveGitWorklogRepositoryInput {}

export interface NormalizedSyncOssBackupSettingsPayload {
  settings: OssBackupSettingsDto
}

export interface NormalizedNotifyOssBackupPersistedSettingsPayload extends NotifyOssBackupPersistedSettingsInput {}

export function normalizeSyncPluginRuntimeStatePayload(
  payload: unknown,
): NormalizedSyncPluginRuntimeStatePayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:sync-runtime-state',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    enabledPluginIds: normalizeBuiltinPluginIds(record.enabledPluginIds),
  }
}

export function normalizeSyncQuotaMonitorSettingsPayload(
  payload: unknown,
): NormalizedSyncQuotaMonitorSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:quota-monitor:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeQuotaMonitorSettings(record.settings),
  }
}

export function normalizeSyncInputStatsSettingsPayload(
  payload: unknown,
): NormalizedSyncInputStatsSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:input-stats:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeInputStatsSettings(record.settings),
  }
}

export function normalizeSyncSystemMonitorSettingsPayload(
  payload: unknown,
): NormalizedSyncSystemMonitorSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:system-monitor:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeSystemMonitorSettings(record.settings),
  }
}

export function normalizeSyncGitWorklogSettingsPayload(
  payload: unknown,
): NormalizedSyncGitWorklogSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:git-worklog:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeGitWorklogSettings(record.settings),
  }
}

export function normalizeSyncGitWorklogWorkspacesPayload(
  payload: unknown,
): NormalizedSyncGitWorklogWorkspacesPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:git-worklog:sync-workspaces',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    workspaces: normalizeGitWorklogWorkspaces(record.workspaces),
  }
}

export function normalizeResolveGitWorklogRepositoryPayload(
  payload: unknown,
): NormalizedResolveGitWorklogRepositoryPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:git-worklog:resolve-repository',
    })
  }

  const record = payload as Record<string, unknown>
  const path = typeof record.path === 'string' ? record.path.trim() : ''
  if (path.length === 0) {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid path for plugins:git-worklog:resolve-repository',
    })
  }

  return { path }
}

export function normalizeSyncOssBackupSettingsPayload(
  payload: unknown,
): NormalizedSyncOssBackupSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:oss-backup:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeOssBackupSettings(record.settings),
  }
}

export function normalizeNotifyOssBackupPersistedSettingsPayload(
  payload: unknown,
): NormalizedNotifyOssBackupPersistedSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:oss-backup:notify-persisted-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    changedPluginIds: normalizeBuiltinPluginIds(record.changedPluginIds),
  }
}
