import type { ComponentType, LazyExoticComponent } from 'react'
import { lazy } from 'react'
import type { BuiltinPluginId } from '../../domain/pluginManifest'
import type {
  ControlCenterPluginWidgetProps,
  HeaderPluginWidgetProps,
  SettingsPluginSectionProps,
  WorkspaceOverlayPluginWidgetProps,
} from './types'

type LazyHeaderWidget = LazyExoticComponent<ComponentType<HeaderPluginWidgetProps>>
type LazyControlCenterWidget = LazyExoticComponent<ComponentType<ControlCenterPluginWidgetProps>>
type LazySettingsSection = LazyExoticComponent<ComponentType<SettingsPluginSectionProps>>
type LazyWorkspaceOverlayWidget = LazyExoticComponent<
  ComponentType<WorkspaceOverlayPluginWidgetProps>
>
type RendererContributionDefinition = {
  headerWidget?: () => Promise<{ default: ComponentType<HeaderPluginWidgetProps> }>
  controlCenterWidget?: () => Promise<{ default: ComponentType<ControlCenterPluginWidgetProps> }>
  settingsSection?: () => Promise<{ default: ComponentType<SettingsPluginSectionProps> }>
  workspaceOverlayWidget?: () => Promise<{ default: ComponentType<WorkspaceOverlayPluginWidgetProps> }>
}

const headerWidgetCache = new Map<BuiltinPluginId, LazyHeaderWidget>()
const controlCenterWidgetCache = new Map<BuiltinPluginId, LazyControlCenterWidget>()
const settingsSectionCache = new Map<BuiltinPluginId, LazySettingsSection>()
const workspaceOverlayWidgetCache = new Map<BuiltinPluginId, LazyWorkspaceOverlayWidget>()

const BUILTIN_PLUGIN_RENDERER_CONTRIBUTIONS: Partial<
  Record<BuiltinPluginId, RendererContributionDefinition>
> = {
  'eye-care': {
    headerWidget: async () =>
      await import('../../../../plugins/eyeCare/presentation/renderer/EyeCareHeaderWidget'),
    controlCenterWidget: async () =>
      await import(
        '../../../../plugins/eyeCare/presentation/renderer/EyeCareControlCenterWidget'
      ),
    settingsSection: async () =>
      await import('../../../../plugins/eyeCare/presentation/renderer/EyeCareSettingsSection'),
    workspaceOverlayWidget: async () =>
      await import('../../../../plugins/eyeCare/presentation/renderer/EyeCareBreakOverlay'),
  },
  'input-stats': {
    controlCenterWidget: async () =>
      await import(
        '../../../../plugins/inputStats/presentation/renderer/InputStatsControlCenterWidget'
      ),
    settingsSection: async () =>
      await import('../../../../plugins/inputStats/presentation/renderer/InputStatsSettingsSection'),
  },
  'system-monitor': {
    headerWidget: async () =>
      await import(
        '../../../../plugins/systemMonitor/presentation/renderer/SystemMonitorHeaderWidget'
      ),
    controlCenterWidget: async () =>
      await import(
        '../../../../plugins/systemMonitor/presentation/renderer/SystemMonitorControlCenterWidget'
      ),
    settingsSection: async () =>
      await import(
        '../../../../plugins/systemMonitor/presentation/renderer/SystemMonitorSettingsSection'
      ),
  },
  'quota-monitor': {
    headerWidget: async () =>
      await import('../../../../plugins/quotaMonitor/presentation/renderer/QuotaMonitorHeaderWidget'),
    controlCenterWidget: async () =>
      await import(
        '../../../../plugins/quotaMonitor/presentation/renderer/QuotaMonitorControlCenterWidget'
      ),
    settingsSection: async () =>
      await import(
        '../../../../plugins/quotaMonitor/presentation/renderer/QuotaMonitorSettingsSection'
      ),
  },
  'git-worklog': {
    controlCenterWidget: async () =>
      await import(
        '../../../../plugins/gitWorklog/presentation/renderer/GitWorklogControlCenterWidget'
      ),
    settingsSection: async () =>
      await import(
        '../../../../plugins/gitWorklog/presentation/renderer/GitWorklogSettingsSection'
      ),
  },
  'oss-backup': {
    headerWidget: async () =>
      await import('../../../../plugins/ossBackup/presentation/renderer/OssBackupHeaderWidget'),
    settingsSection: async () =>
      await import('../../../../plugins/ossBackup/presentation/renderer/OssBackupSettingsSection'),
  },
  'workspace-assistant': {
    headerWidget: async () =>
      await import(
        '../../../../plugins/workspaceAssistant/presentation/renderer/WorkspaceAssistantHeaderWidget'
      ),
    controlCenterWidget: async () =>
      await import(
        '../../../../plugins/workspaceAssistant/presentation/renderer/WorkspaceAssistantControlCenterWidget'
      ),
    settingsSection: async () =>
      await import(
        '../../../../plugins/workspaceAssistant/presentation/renderer/WorkspaceAssistantSettingsSection'
      ),
    workspaceOverlayWidget: async () =>
      await import(
        '../../../../plugins/workspaceAssistant/presentation/renderer/WorkspaceAssistantOverlay'
      ),
  },
}

function getOrCreateLazyHeaderWidget(
  pluginId: BuiltinPluginId,
  loader: () => Promise<{ default: ComponentType<HeaderPluginWidgetProps> }>,
): LazyHeaderWidget {
  const existing = headerWidgetCache.get(pluginId)
  if (existing) {
    return existing
  }

  const component = lazy(loader)
  headerWidgetCache.set(pluginId, component)
  return component
}

function getOrCreateLazyControlCenterWidget(
  pluginId: BuiltinPluginId,
  loader: () => Promise<{ default: ComponentType<ControlCenterPluginWidgetProps> }>,
): LazyControlCenterWidget {
  const existing = controlCenterWidgetCache.get(pluginId)
  if (existing) {
    return existing
  }

  const component = lazy(loader)
  controlCenterWidgetCache.set(pluginId, component)
  return component
}

function getOrCreateLazySettingsSection(
  pluginId: BuiltinPluginId,
  loader: () => Promise<{ default: ComponentType<SettingsPluginSectionProps> }>,
): LazySettingsSection {
  const existing = settingsSectionCache.get(pluginId)
  if (existing) {
    return existing
  }

  const component = lazy(loader)
  settingsSectionCache.set(pluginId, component)
  return component
}

function getOrCreateLazyWorkspaceOverlayWidget(
  pluginId: BuiltinPluginId,
  loader: () => Promise<{ default: ComponentType<WorkspaceOverlayPluginWidgetProps> }>,
): LazyWorkspaceOverlayWidget {
  const existing = workspaceOverlayWidgetCache.get(pluginId)
  if (existing) {
    return existing
  }

  const component = lazy(loader)
  workspaceOverlayWidgetCache.set(pluginId, component)
  return component
}

export function getControlCenterPluginWidget(
  pluginId: BuiltinPluginId,
): LazyControlCenterWidget | null {
  const loader = BUILTIN_PLUGIN_RENDERER_CONTRIBUTIONS[pluginId]?.controlCenterWidget
  return loader ? getOrCreateLazyControlCenterWidget(pluginId, loader) : null
}

export function getHeaderPluginWidget(pluginId: BuiltinPluginId): LazyHeaderWidget | null {
  const loader = BUILTIN_PLUGIN_RENDERER_CONTRIBUTIONS[pluginId]?.headerWidget
  return loader ? getOrCreateLazyHeaderWidget(pluginId, loader) : null
}

export function getSettingsPluginSection(pluginId: BuiltinPluginId): LazySettingsSection | null {
  const loader = BUILTIN_PLUGIN_RENDERER_CONTRIBUTIONS[pluginId]?.settingsSection
  return loader ? getOrCreateLazySettingsSection(pluginId, loader) : null
}

export function getWorkspaceOverlayPluginWidget(
  pluginId: BuiltinPluginId,
): LazyWorkspaceOverlayWidget | null {
  const loader = BUILTIN_PLUGIN_RENDERER_CONTRIBUTIONS[pluginId]?.workspaceOverlayWidget
  return loader ? getOrCreateLazyWorkspaceOverlayWidget(pluginId, loader) : null
}
