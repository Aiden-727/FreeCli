import React from 'react'
import { Bot } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { ControlCenterPluginWidgetProps } from '@contexts/plugins/presentation/renderer/types'
import { useWorkspaceAssistantState } from './useWorkspaceAssistantState'

export default function WorkspaceAssistantControlCenterWidget({
  onOpenPluginManager,
}: ControlCenterPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useWorkspaceAssistantState()
  const subtitle = state.currentWorkspace
    ? t('pluginManager.plugins.workspaceAssistant.controlCenterSummary', {
        taskCount: state.currentWorkspace.taskCount,
        insightCount: state.insights.length,
      })
    : t('pluginManager.plugins.workspaceAssistant.controlCenterEmpty')

  return (
    <button
      type="button"
      className="control-center-tile control-center-tile--plugin"
      data-testid="control-center-plugin-workspace-assistant"
      onClick={() => onOpenPluginManager('workspace-assistant')}
    >
      <span className="control-center-tile__icon" aria-hidden="true">
        <Bot size={18} />
      </span>
      <span className="control-center-tile__text">
        <span className="control-center-tile__label">
          {t('pluginManager.plugins.workspaceAssistant.title')}
        </span>
        <span className="control-center-tile__subtitle">
          {state.currentWorkspace?.projectSummary ?? subtitle}
        </span>
      </span>
    </button>
  )
}
