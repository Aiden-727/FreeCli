import React from 'react'
import { Bot } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { HeaderPluginWidgetProps } from '@contexts/plugins/presentation/renderer/types'
import { useWorkspaceAssistantState } from './useWorkspaceAssistantState'

export default function WorkspaceAssistantHeaderWidget({
  onOpenPluginManager,
  onToggleWorkspaceAssistant,
}: HeaderPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useWorkspaceAssistantState()
  const urgentCount = state.insights.filter(item => item.tone === 'urgent').length
  const title =
    urgentCount > 0
      ? t('pluginManager.plugins.workspaceAssistant.headerAttention', { count: urgentCount })
      : t('pluginManager.plugins.workspaceAssistant.headerReady')

  return (
    <button
      type="button"
      className="app-header__workspace-assistant-button"
      data-testid="app-header-workspace-assistant"
      aria-label={title}
      title={title}
      onClick={() => {
        if (onToggleWorkspaceAssistant) {
          onToggleWorkspaceAssistant()
          return
        }

        onOpenPluginManager('workspace-assistant')
      }}
    >
      <Bot size={16} aria-hidden="true" />
      {urgentCount > 0 ? (
        <span className="app-header__workspace-assistant-badge" aria-hidden="true">
          {urgentCount > 9 ? '9+' : urgentCount}
        </span>
      ) : null}
    </button>
  )
}
