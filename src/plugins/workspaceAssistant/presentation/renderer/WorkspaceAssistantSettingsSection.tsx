import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import type { WorkspaceAssistantSettingsDto } from '@shared/contracts/dto'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import { PluginSectionCard } from '@contexts/plugins/presentation/renderer/PluginSectionCard'
import type { SettingsPluginSectionProps } from '@contexts/plugins/presentation/renderer/types'
import { useWorkspaceAssistantState } from './useWorkspaceAssistantState'

function updateWorkspaceAssistantSettings(
  settings: AgentSettings,
  onChange: (settings: AgentSettings) => void,
  updater: (current: WorkspaceAssistantSettingsDto) => WorkspaceAssistantSettingsDto,
): void {
  onChange({
    ...settings,
    plugins: {
      ...settings.plugins,
      workspaceAssistant: updater(settings.plugins.workspaceAssistant),
    },
  })
}

export default function WorkspaceAssistantSettingsSection({
  settings,
  onChange,
  onFlushPersistNow,
}: SettingsPluginSectionProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useWorkspaceAssistantState()
  const assistantSettings = settings.plugins.workspaceAssistant
  const [isTestingConnection, setIsTestingConnection] = React.useState(false)
  const [testFeedback, setTestFeedback] = React.useState<{
    tone: 'info' | 'error'
    text: string
  } | null>(null)

  const updateSettings = React.useCallback(
    (updater: (current: WorkspaceAssistantSettingsDto) => WorkspaceAssistantSettingsDto) => {
      updateWorkspaceAssistantSettings(settings, onChange, updater)
    },
    [onChange, settings],
  )

  const handleTestConnection = React.useCallback(async () => {
    const api = window.freecliApi?.plugins?.workspaceAssistant
    if (!api) {
      return
    }

    setIsTestingConnection(true)
    try {
      setTestFeedback(null)

      if (typeof onFlushPersistNow === 'function') {
        await onFlushPersistNow()
      }

      await api.syncSettings({
        settings: settings.plugins.workspaceAssistant,
      })
      const result = await api.testConnection()
      setTestFeedback({
        tone: result.ok ? 'info' : 'error',
        text: result.ok
          ? t('pluginManager.plugins.workspaceAssistant.testConnectionSuccess', {
              message: result.message,
            })
          : t('pluginManager.plugins.workspaceAssistant.testConnectionFailed', {
              message: result.message,
            }),
      })
    } finally {
      setIsTestingConnection(false)
    }
  }, [onFlushPersistNow, settings.plugins.workspaceAssistant, t])

  return (
    <section
      className="plugin-manager-panel__plugin-section workspace-assistant-config"
      data-testid="plugin-manager-plugin-workspace-assistant-section"
    >
      <div className="plugin-manager-panel__section-grid plugin-manager-panel__section-grid--stack">
        <PluginSectionCard
          title={t('pluginManager.plugins.workspaceAssistant.overviewTitle')}
          description={t('pluginManager.plugins.workspaceAssistant.overviewSummary')}
        >
          <div className="workspace-assistant-overview__summary-grid">
            <div className="workspace-assistant-overview__summary-card">
              <span>{t('pluginManager.plugins.workspaceAssistant.metrics.tasks')}</span>
              <strong>{state.currentWorkspace?.taskCount ?? 0}</strong>
            </div>
            <div className="workspace-assistant-overview__summary-card">
              <span>{t('pluginManager.plugins.workspaceAssistant.metrics.agents')}</span>
              <strong>{state.currentWorkspace?.agentCount ?? 0}</strong>
            </div>
            <div className="workspace-assistant-overview__summary-card">
              <span>{t('pluginManager.plugins.workspaceAssistant.metrics.insights')}</span>
              <strong>{state.insights.length}</strong>
            </div>
          </div>
          <div className="workspace-assistant-overview__insights">
            {state.insights.map(insight => (
              <div
                key={insight.id}
                className={`workspace-assistant-overview__insight workspace-assistant-overview__insight--${insight.tone}`}
              >
                <strong>{insight.title}</strong>
                <p>{insight.body}</p>
              </div>
            ))}
          </div>
          {state.currentWorkspace?.projectSummary ? (
            <div className="workspace-assistant-overview__insight workspace-assistant-overview__insight--neutral">
              <strong>{t('pluginManager.plugins.workspaceAssistant.projectSummaryTitle')}</strong>
              <p>{state.currentWorkspace.projectSummary}</p>
            </div>
          ) : null}
        </PluginSectionCard>

        <PluginSectionCard
          title={t('pluginManager.plugins.workspaceAssistant.configurationTitle')}
          description={t('pluginManager.plugins.workspaceAssistant.configurationSummary')}
        >
          <div className="workspace-assistant-config__grid">
            <label className="plugin-manager-panel__toggle-row">
              <span>{t('pluginManager.plugins.workspaceAssistant.autoOpenOnStartupLabel')}</span>
              <span className="cove-toggle">
                <input
                  type="checkbox"
                  checked={assistantSettings.autoOpenOnStartup}
                  onChange={event => {
                    updateSettings(current => ({
                      ...current,
                      autoOpenOnStartup: event.target.checked,
                    }))
                  }}
                />
                <span className="cove-toggle__slider"></span>
              </span>
            </label>

            <label className="plugin-manager-panel__toggle-row">
              <span>{t('pluginManager.plugins.workspaceAssistant.proactiveRemindersLabel')}</span>
              <span className="cove-toggle">
                <input
                  type="checkbox"
                  checked={assistantSettings.proactiveRemindersEnabled}
                  onChange={event => {
                    updateSettings(current => ({
                      ...current,
                      proactiveRemindersEnabled: event.target.checked,
                    }))
                  }}
                />
                <span className="cove-toggle__slider"></span>
              </span>
            </label>

            <label className="plugin-manager-panel__toggle-row">
              <span>{t('pluginManager.plugins.workspaceAssistant.allowSuggestionToastsLabel')}</span>
              <span className="cove-toggle">
                <input
                  type="checkbox"
                  checked={assistantSettings.allowSuggestionToasts}
                  onChange={event => {
                    updateSettings(current => ({
                      ...current,
                      allowSuggestionToasts: event.target.checked,
                    }))
                  }}
                />
                <span className="cove-toggle__slider"></span>
              </span>
            </label>
          </div>

          <div className="plugin-manager-panel__field-grid plugin-manager-panel__field-grid--triple">
            <div className="plugin-manager-panel__field-stack">
              <label htmlFor="workspace-assistant-reminder-interval">
                {t('pluginManager.plugins.workspaceAssistant.reminderIntervalLabel')}
              </label>
              <input
                id="workspace-assistant-reminder-interval"
                className="cove-field"
                type="number"
                min={3}
                max={180}
                value={assistantSettings.proactiveReminderIntervalMinutes}
                onChange={event => {
                  updateSettings(current => ({
                    ...current,
                    proactiveReminderIntervalMinutes:
                      Number.parseInt(event.target.value, 10) ||
                      current.proactiveReminderIntervalMinutes,
                  }))
                }}
              />
            </div>

            <div className="plugin-manager-panel__field-stack">
              <label htmlFor="workspace-assistant-api-base-url">
                {t('pluginManager.plugins.workspaceAssistant.apiBaseUrlLabel')}
              </label>
              <input
                id="workspace-assistant-api-base-url"
                className="cove-field"
                value={assistantSettings.apiBaseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={event => {
                  updateSettings(current => ({
                    ...current,
                    modelProvider: 'openai-compatible',
                    apiBaseUrl: event.target.value,
                  }))
                }}
              />
            </div>

            <div className="plugin-manager-panel__field-stack">
              <label htmlFor="workspace-assistant-model-name">
                {t('pluginManager.plugins.workspaceAssistant.modelNameLabel')}
              </label>
              <input
                id="workspace-assistant-model-name"
                className="cove-field"
                value={assistantSettings.modelName}
                onChange={event => {
                  updateSettings(current => ({
                    ...current,
                    modelProvider: 'openai-compatible',
                    modelName: event.target.value,
                  }))
                }}
              />
            </div>
          </div>

          <div className="plugin-manager-panel__field-stack">
            <label htmlFor="workspace-assistant-api-key">
              {t('pluginManager.plugins.workspaceAssistant.apiKeyLabel')}
            </label>
            <input
              id="workspace-assistant-api-key"
              className="cove-field"
              type="password"
              value={assistantSettings.apiKey}
              placeholder={t('pluginManager.plugins.workspaceAssistant.apiKeyPlaceholder')}
              onChange={event => {
                updateSettings(current => ({
                  ...current,
                  modelProvider: 'openai-compatible',
                  apiKey: event.target.value,
                }))
              }}
            />
          </div>

          <div className="plugin-manager-panel__plugin-actions">
            <button
              type="button"
              className="cove-window__action cove-window__action--secondary"
              data-testid="workspace-assistant-test-connection"
              onClick={() => {
                void handleTestConnection()
              }}
              disabled={isTestingConnection}
            >
              {isTestingConnection
                ? t('pluginManager.plugins.workspaceAssistant.testingConnection')
                : t('pluginManager.plugins.workspaceAssistant.testConnection')}
            </button>
          </div>
          {testFeedback ? (
            <div
              className={`plugin-manager-panel__hint plugin-manager-panel__hint--${testFeedback.tone === 'error' ? 'error' : 'info'}`}
              data-testid="workspace-assistant-test-connection-feedback"
            >
              <span>{testFeedback.text}</span>
            </div>
          ) : null}

          <div className="plugin-manager-panel__field-stack">
            <label htmlFor="workspace-assistant-notes">
              {t('pluginManager.plugins.workspaceAssistant.notesLabel')}
            </label>
            <textarea
              id="workspace-assistant-notes"
              className="cove-field workspace-assistant-config__notes"
              value={assistantSettings.assistantNotes}
              onChange={event => {
                updateSettings(current => ({
                  ...current,
                  assistantNotes: event.target.value,
                }))
              }}
            />
          </div>
        </PluginSectionCard>
      </div>
    </section>
  )
}
