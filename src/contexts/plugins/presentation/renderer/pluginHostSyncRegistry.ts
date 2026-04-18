import type { AgentSettings, PluginSettings } from '@contexts/settings/domain/agentSettings'
import type { BuiltinPluginId } from '../../domain/pluginManifest'
import { listBuiltinPluginManifestsWithSettings } from '../../domain/pluginManifest'
import type { PluginHostDiagnosticCode } from './types'

export interface PluginHostWorkspaceSyncItem {
  id: string
  name: string
  path: string
}

export interface PluginHostSyncTask {
  code: PluginHostDiagnosticCode
  signature: string
  run: () => Promise<unknown>
}

export function buildPluginHostSyncTasks(options: {
  settings: AgentSettings
  workspaces: PluginHostWorkspaceSyncItem[]
  api: typeof window.freecliApi | undefined
}): PluginHostSyncTask[] {
  const tasks: PluginHostSyncTask[] = []
  const pluginsApi = options.api?.plugins
  if (!pluginsApi) {
    return tasks
  }

  if (typeof pluginsApi.syncRuntimeState === 'function') {
    tasks.push({
      code: 'runtime_sync',
      signature: JSON.stringify(options.settings.plugins.enabledIds),
      run: async () =>
        await pluginsApi.syncRuntimeState({
          enabledPluginIds: options.settings.plugins.enabledIds,
        }),
    })
  }

  if (typeof pluginsApi.inputStats?.syncSettings === 'function') {
    tasks.push({
      code: 'input_stats_sync',
      signature: JSON.stringify(options.settings.plugins.inputStats),
      run: async () =>
        await pluginsApi.inputStats.syncSettings({
          settings: options.settings.plugins.inputStats,
      }),
    })
  }

  if (typeof pluginsApi.systemMonitor?.syncSettings === 'function') {
    tasks.push({
      code: 'system_monitor_sync',
      signature: JSON.stringify(options.settings.plugins.systemMonitor),
      run: async () =>
        await pluginsApi.systemMonitor.syncSettings({
          settings: options.settings.plugins.systemMonitor,
        }),
    })
  }

  if (typeof pluginsApi.quotaMonitor?.syncSettings === 'function') {
    tasks.push({
      code: 'quota_monitor_sync',
      signature: JSON.stringify(options.settings.plugins.quotaMonitor),
      run: async () =>
        await pluginsApi.quotaMonitor.syncSettings({
          settings: options.settings.plugins.quotaMonitor,
        }),
    })
  }

  if (typeof pluginsApi.gitWorklog?.syncSettings === 'function') {
    tasks.push({
      code: 'git_worklog_sync',
      signature: JSON.stringify(options.settings.plugins.gitWorklog),
      run: async () =>
        await pluginsApi.gitWorklog.syncSettings({
          settings: options.settings.plugins.gitWorklog,
        }),
    })
  }

  if (typeof pluginsApi.ossBackup?.syncSettings === 'function') {
    tasks.push({
      code: 'oss_backup_sync',
      signature: JSON.stringify(options.settings.plugins.ossBackup),
      run: async () =>
        await pluginsApi.ossBackup.syncSettings({
          settings: options.settings.plugins.ossBackup,
        }),
    })
  }

  if (typeof pluginsApi.gitWorklog?.syncWorkspaces === 'function') {
    tasks.push({
      code: 'git_worklog_workspaces_sync',
      signature: JSON.stringify(options.workspaces),
      run: async () =>
        await pluginsApi.gitWorklog.syncWorkspaces({
          workspaces: options.workspaces,
        }),
    })
  }

  return tasks
}

export function resolvePersistedPluginChangeIds(
  previous: PluginSettings | null,
  next: PluginSettings,
): BuiltinPluginId[] {
  if (!previous) {
    return [...next.enabledIds]
  }

  const changedPluginIds = new Set<BuiltinPluginId>()
  const previousEnabledIds = new Set(previous.enabledIds)
  const nextEnabledIds = new Set(next.enabledIds)

  for (const pluginId of previous.enabledIds) {
    if (!nextEnabledIds.has(pluginId)) {
      changedPluginIds.add(pluginId)
    }
  }

  for (const pluginId of next.enabledIds) {
    if (!previousEnabledIds.has(pluginId)) {
      changedPluginIds.add(pluginId)
    }
  }

  for (const manifest of listBuiltinPluginManifestsWithSettings()) {
    const settingsKey = manifest.settingsKey
    if (!settingsKey) {
      continue
    }

    if (JSON.stringify(previous[settingsKey]) !== JSON.stringify(next[settingsKey])) {
      changedPluginIds.add(manifest.id)
    }
  }

  return Array.from(changedPluginIds)
}
