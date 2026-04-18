import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { BuiltinPluginId } from './pluginManifest'
import { isBuiltinPluginCloudBackupParticipant, normalizeBuiltinPluginIds } from './pluginManifest'

export function isPluginCloudBackupEnabled(
  settings: AgentSettings,
  pluginId: BuiltinPluginId,
): boolean {
  if (!isBuiltinPluginCloudBackupParticipant(pluginId)) {
    return false
  }

  return settings.plugins.ossBackup.includedPluginIds.includes(pluginId)
}

export function setPluginCloudBackupEnabled(
  settings: AgentSettings,
  pluginId: BuiltinPluginId,
  enabled: boolean,
): AgentSettings {
  if (!isBuiltinPluginCloudBackupParticipant(pluginId)) {
    return settings
  }

  const filtered = settings.plugins.ossBackup.includedPluginIds.filter(id => id !== pluginId)
  const includedPluginIds = enabled ? normalizeBuiltinPluginIds([...filtered, pluginId]) : filtered

  return {
    ...settings,
    plugins: {
      ...settings.plugins,
      ossBackup: {
        ...settings.plugins.ossBackup,
        includedPluginIds,
      },
    },
  }
}
