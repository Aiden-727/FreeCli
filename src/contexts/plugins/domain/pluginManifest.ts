export const BUILTIN_PLUGIN_IDS = [
  'eye-care',
  'input-stats',
  'system-monitor',
  'quota-monitor',
  'git-worklog',
  'oss-backup',
  'workspace-assistant',
] as const

export type BuiltinPluginId = (typeof BUILTIN_PLUGIN_IDS)[number]
export const BUILTIN_PLUGIN_SETTINGS_KEYS = [
  'eyeCare',
  'inputStats',
  'systemMonitor',
  'quotaMonitor',
  'gitWorklog',
  'ossBackup',
  'workspaceAssistant',
] as const
export type BuiltinPluginSettingsKey = (typeof BUILTIN_PLUGIN_SETTINGS_KEYS)[number]
export type PluginCloudBackupRole = 'none' | 'participant' | 'owner'

export interface PluginManifest {
  id: BuiltinPluginId
  defaultEnabled: boolean
  titleKey: string
  descriptionKey: string
  settingsKey: BuiltinPluginSettingsKey | null
  cloudBackupRole: PluginCloudBackupRole
  contributes: {
    headerWidget: boolean
    controlCenterWidget: boolean
    settingsSection: boolean
    mainRuntime: boolean
  }
}

const BUILTIN_PLUGIN_MANIFESTS: Record<BuiltinPluginId, PluginManifest> = {
  'eye-care': {
    id: 'eye-care',
    defaultEnabled: false,
    titleKey: 'pluginManager.plugins.eyeCare.title',
    descriptionKey: 'pluginManager.plugins.eyeCare.description',
    settingsKey: 'eyeCare',
    cloudBackupRole: 'none',
    contributes: {
      headerWidget: true,
      controlCenterWidget: true,
      settingsSection: true,
      mainRuntime: true,
    },
  },
  'input-stats': {
    id: 'input-stats',
    defaultEnabled: false,
    titleKey: 'pluginManager.plugins.inputStats.title',
    descriptionKey: 'pluginManager.plugins.inputStats.description',
    settingsKey: 'inputStats',
    cloudBackupRole: 'none',
    contributes: {
      headerWidget: false,
      controlCenterWidget: true,
      settingsSection: true,
      mainRuntime: true,
    },
  },
  'system-monitor': {
    id: 'system-monitor',
    defaultEnabled: false,
    titleKey: 'pluginManager.plugins.systemMonitor.title',
    descriptionKey: 'pluginManager.plugins.systemMonitor.description',
    settingsKey: 'systemMonitor',
    cloudBackupRole: 'none',
    contributes: {
      headerWidget: true,
      controlCenterWidget: true,
      settingsSection: true,
      mainRuntime: true,
    },
  },
  'quota-monitor': {
    id: 'quota-monitor',
    defaultEnabled: false,
    titleKey: 'pluginManager.plugins.quotaMonitor.title',
    descriptionKey: 'pluginManager.plugins.quotaMonitor.description',
    settingsKey: 'quotaMonitor',
    cloudBackupRole: 'participant',
    contributes: {
      headerWidget: true,
      controlCenterWidget: true,
      settingsSection: true,
      mainRuntime: true,
    },
  },
  'git-worklog': {
    id: 'git-worklog',
    defaultEnabled: false,
    titleKey: 'pluginManager.plugins.gitWorklog.title',
    descriptionKey: 'pluginManager.plugins.gitWorklog.description',
    settingsKey: 'gitWorklog',
    cloudBackupRole: 'participant',
    contributes: {
      headerWidget: false,
      controlCenterWidget: true,
      settingsSection: true,
      mainRuntime: true,
    },
  },
  'oss-backup': {
    id: 'oss-backup',
    defaultEnabled: false,
    titleKey: 'pluginManager.plugins.ossBackup.title',
    descriptionKey: 'pluginManager.plugins.ossBackup.description',
    settingsKey: 'ossBackup',
    cloudBackupRole: 'owner',
    contributes: {
      headerWidget: true,
      controlCenterWidget: false,
      settingsSection: true,
      mainRuntime: true,
    },
  },
  'workspace-assistant': {
    id: 'workspace-assistant',
    defaultEnabled: false,
    titleKey: 'pluginManager.plugins.workspaceAssistant.title',
    descriptionKey: 'pluginManager.plugins.workspaceAssistant.description',
    settingsKey: 'workspaceAssistant',
    cloudBackupRole: 'none',
    contributes: {
      headerWidget: true,
      controlCenterWidget: true,
      settingsSection: true,
      mainRuntime: true,
    },
  },
}

export function isBuiltinPluginId(value: unknown): value is BuiltinPluginId {
  return typeof value === 'string' && BUILTIN_PLUGIN_IDS.includes(value as BuiltinPluginId)
}

export function listBuiltinPluginManifests(): PluginManifest[] {
  return BUILTIN_PLUGIN_IDS.map(id => BUILTIN_PLUGIN_MANIFESTS[id])
}

export function getBuiltinPluginManifest(id: BuiltinPluginId): PluginManifest {
  return BUILTIN_PLUGIN_MANIFESTS[id]
}

export function listBuiltinPluginManifestsWithSettings(): PluginManifest[] {
  return listBuiltinPluginManifests().filter(manifest => manifest.settingsKey !== null)
}

export function listBuiltinPluginCloudBackupParticipantIds(): BuiltinPluginId[] {
  return listBuiltinPluginManifests()
    .filter(manifest => manifest.cloudBackupRole === 'participant')
    .map(manifest => manifest.id)
}

export function isBuiltinPluginCloudBackupParticipant(pluginId: BuiltinPluginId): boolean {
  return getBuiltinPluginManifest(pluginId).cloudBackupRole === 'participant'
}

export function normalizeBuiltinPluginIds(value: unknown): BuiltinPluginId[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized: BuiltinPluginId[] = []
  for (const entry of value) {
    if (!isBuiltinPluginId(entry) || normalized.includes(entry)) {
      continue
    }

    normalized.push(entry)
  }

  return normalized
}

export function getDefaultEnabledPluginIds(): BuiltinPluginId[] {
  return listBuiltinPluginManifests()
    .filter(manifest => manifest.defaultEnabled)
    .map(manifest => manifest.id)
}
