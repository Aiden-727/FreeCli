import React from 'react'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { BuiltinPluginId } from '../../domain/pluginManifest'
import {
  isPluginCloudBackupEnabled,
  setPluginCloudBackupEnabled,
} from '../../domain/pluginCloudBackup'

export function PluginCloudBackupToggleRow({
  settings,
  pluginId,
  label,
  helpText,
  disabledHelpText,
  testId,
  onChange,
}: {
  settings: AgentSettings
  pluginId: BuiltinPluginId
  label: string
  helpText: string
  disabledHelpText: string
  testId: string
  onChange: (settings: AgentSettings) => void
}): React.JSX.Element {
  const isOssBackupPluginEnabled = settings.plugins.enabledIds.includes('oss-backup')
  const isCloudBackupEnabled = isPluginCloudBackupEnabled(settings, pluginId)

  return (
    <div className="settings-panel__row">
      <div className="settings-panel__row-label">
        <strong>{label}</strong>
        <span>{isOssBackupPluginEnabled ? helpText : disabledHelpText}</span>
      </div>
      <div className="settings-panel__control settings-panel__control--stack plugin-manager-panel__control-wide">
        <label className="plugin-manager-panel__toggle-row">
          <span>{label}</span>
          <span className="cove-toggle">
            <input
              type="checkbox"
              data-testid={testId}
              checked={isCloudBackupEnabled}
              disabled={!isOssBackupPluginEnabled}
              onChange={event => {
                onChange(setPluginCloudBackupEnabled(settings, pluginId, event.target.checked))
              }}
            />
            <span className="cove-toggle__slider"></span>
          </span>
        </label>
      </div>
    </div>
  )
}
