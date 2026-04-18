import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { BuiltinPluginId } from '../../domain/pluginManifest'

export type PluginHostDiagnosticCode =
  | 'runtime_sync'
  | 'input_stats_sync'
  | 'system_monitor_sync'
  | 'quota_monitor_sync'
  | 'git_worklog_sync'
  | 'oss_backup_sync'
  | 'git_worklog_workspaces_sync'

export interface PluginHostDiagnosticItem {
  code: PluginHostDiagnosticCode
  message: string
}

export interface ControlCenterPluginWidgetProps {
  onOpenPluginManager: (pageId?: BuiltinPluginId | 'general') => void
}

export interface HeaderPluginWidgetProps {
  onOpenPluginManager: (pageId?: BuiltinPluginId | 'general') => void
}

export interface SettingsPluginSectionProps {
  settings: AgentSettings
  onChange: (settings: AgentSettings) => void
  onFlushPersistNow?: () => void | Promise<void>
}
