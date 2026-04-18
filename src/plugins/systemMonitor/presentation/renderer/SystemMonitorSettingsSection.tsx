import React from 'react'
import type { SystemMonitorSettingsDto } from '@shared/contracts/dto'
import { CoveSelect } from '@app/renderer/components/CoveSelect'
import { useTranslation } from '@app/renderer/i18n'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import {
  SYSTEM_MONITOR_HISTORY_RANGE_OPTIONS,
  SYSTEM_MONITOR_GPU_MODE_OPTIONS,
  SYSTEM_MONITOR_MAX_BACKGROUND_POLL_INTERVAL_MS,
  SYSTEM_MONITOR_MAX_POLL_INTERVAL_MS,
  SYSTEM_MONITOR_MAX_SAVE_INTERVAL_MS,
  SYSTEM_MONITOR_MIN_BACKGROUND_POLL_INTERVAL_MS,
  SYSTEM_MONITOR_MIN_POLL_INTERVAL_MS,
  SYSTEM_MONITOR_MIN_SAVE_INTERVAL_MS,
  SYSTEM_MONITOR_MAX_TASKBAR_FONT_SIZE,
  SYSTEM_MONITOR_MIN_TASKBAR_FONT_SIZE,
  SYSTEM_MONITOR_TASKBAR_DISPLAY_ITEM_OPTIONS,
} from '@contexts/plugins/domain/systemMonitorSettings'
import { PluginSectionCard } from '../../../../contexts/plugins/presentation/renderer/PluginSectionCard'
import type { SettingsPluginSectionProps } from '../../../../contexts/plugins/presentation/renderer/types'
import SystemMonitorOverview from './SystemMonitorOverview'
import { useSystemMonitorState } from './useSystemMonitorState'

function updateSystemMonitorSettings(
  settings: AgentSettings,
  onChange: (settings: AgentSettings) => void,
  updater: (current: SystemMonitorSettingsDto) => SystemMonitorSettingsDto,
): void {
  onChange({
    ...settings,
    plugins: {
      ...settings.plugins,
      systemMonitor: updater(settings.plugins.systemMonitor),
    },
  })
}

export default function SystemMonitorSettingsSection({
  settings,
  onChange,
}: SettingsPluginSectionProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state, refresh } = useSystemMonitorState()
  const monitorSettings = settings.plugins.systemMonitor
  const isPluginEnabled = settings.plugins.enabledIds.includes('system-monitor')
  const historyRangeOptions = React.useMemo(
    () =>
      SYSTEM_MONITOR_HISTORY_RANGE_OPTIONS.map(option => ({
        value: `${option}`,
        label: t('pluginManager.plugins.systemMonitor.historyRangeOption', {
          value: option,
        }),
      })),
    [t],
  )
  const gpuModeOptions = React.useMemo(
    () =>
      SYSTEM_MONITOR_GPU_MODE_OPTIONS.map(option => ({
        value: option,
        label: t(`pluginManager.plugins.systemMonitor.gpuModeOptions.${option}`),
      })),
    [t],
  )

  const updateSettings = React.useCallback(
    (updater: (current: SystemMonitorSettingsDto) => SystemMonitorSettingsDto) => {
      updateSystemMonitorSettings(settings, onChange, updater)
    },
    [onChange, settings],
  )

  return (
    <section
      className="plugin-manager-panel__plugin-section system-monitor-config"
      data-testid="plugin-manager-plugin-system-monitor-section"
    >
      <SystemMonitorOverview
        isPluginEnabled={isPluginEnabled}
        state={state}
        onRefresh={() => {
          void refresh()
        }}
      />

      <div className="plugin-manager-panel__section-grid plugin-manager-panel__section-grid--stack">
        <PluginSectionCard
          title={t('pluginManager.plugins.systemMonitor.configurationTitle')}
          description={t('pluginManager.plugins.systemMonitor.configurationSummary')}
        >
          <div className="system-monitor-config__board">
            <div className="system-monitor-config__settings-grid">
              <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                <label htmlFor="system-monitor-poll-interval">
                  {t('pluginManager.plugins.systemMonitor.pollIntervalLabel')}
                </label>
                <input
                  id="system-monitor-poll-interval"
                  className="cove-field"
                  data-testid="system-monitor-poll-interval"
                  type="number"
                  min={SYSTEM_MONITOR_MIN_POLL_INTERVAL_MS}
                  max={SYSTEM_MONITOR_MAX_POLL_INTERVAL_MS}
                  step={1000}
                  value={monitorSettings.pollIntervalMs}
                  onChange={event => {
                    updateSettings(current => ({
                      ...current,
                      pollIntervalMs:
                        Number.parseInt(event.target.value, 10) || current.pollIntervalMs,
                    }))
                  }}
                />
              </div>

              <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                <label htmlFor="system-monitor-background-poll-interval">
                  {t('pluginManager.plugins.systemMonitor.backgroundPollIntervalLabel')}
                </label>
                <input
                  id="system-monitor-background-poll-interval"
                  className="cove-field"
                  data-testid="system-monitor-background-poll-interval"
                  type="number"
                  min={SYSTEM_MONITOR_MIN_BACKGROUND_POLL_INTERVAL_MS}
                  max={SYSTEM_MONITOR_MAX_BACKGROUND_POLL_INTERVAL_MS}
                  step={1000}
                  value={monitorSettings.backgroundPollIntervalMs}
                  onChange={event => {
                    updateSettings(current => ({
                      ...current,
                      backgroundPollIntervalMs:
                        Number.parseInt(event.target.value, 10) ||
                        current.backgroundPollIntervalMs,
                    }))
                  }}
                />
              </div>

              <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                <label htmlFor="system-monitor-save-interval">
                  {t('pluginManager.plugins.systemMonitor.saveIntervalLabel')}
                </label>
                <input
                  id="system-monitor-save-interval"
                  className="cove-field"
                  data-testid="system-monitor-save-interval"
                  type="number"
                  min={SYSTEM_MONITOR_MIN_SAVE_INTERVAL_MS}
                  max={SYSTEM_MONITOR_MAX_SAVE_INTERVAL_MS}
                  step={1000}
                  value={monitorSettings.saveIntervalMs}
                  onChange={event => {
                    updateSettings(current => ({
                      ...current,
                      saveIntervalMs:
                        Number.parseInt(event.target.value, 10) || current.saveIntervalMs,
                    }))
                  }}
                />
              </div>

              <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                <label htmlFor="system-monitor-history-range">
                  {t('pluginManager.plugins.systemMonitor.historyRangeLabel')}
                </label>
                <CoveSelect
                  id="system-monitor-history-range"
                  testId="system-monitor-history-range"
                  triggerClassName="system-monitor-config__select-trigger"
                  menuClassName="system-monitor-config__select-menu"
                  ariaLabel={t('pluginManager.plugins.systemMonitor.historyRangeLabel')}
                  value={`${monitorSettings.historyRangeDays}`}
                  options={historyRangeOptions}
                  onChange={nextValue => {
                    const nextRangeValue = Number.parseInt(nextValue, 10)
                    updateSettings(current => ({
                      ...current,
                      historyRangeDays: SYSTEM_MONITOR_HISTORY_RANGE_OPTIONS.includes(
                        nextRangeValue as SystemMonitorSettingsDto['historyRangeDays'],
                      )
                        ? (nextRangeValue as SystemMonitorSettingsDto['historyRangeDays'])
                        : current.historyRangeDays,
                    }))
                  }}
                />
              </div>

              <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                <label htmlFor="system-monitor-gpu-mode">
                  {t('pluginManager.plugins.systemMonitor.gpuModeLabel')}
                </label>
                <CoveSelect
                  id="system-monitor-gpu-mode"
                  testId="system-monitor-gpu-mode"
                  triggerClassName="system-monitor-config__select-trigger"
                  menuClassName="system-monitor-config__select-menu"
                  ariaLabel={t('pluginManager.plugins.systemMonitor.gpuModeLabel')}
                  value={monitorSettings.gpuMode}
                  options={gpuModeOptions}
                  onChange={nextValue => {
                    updateSettings(current => ({
                      ...current,
                      gpuMode: SYSTEM_MONITOR_GPU_MODE_OPTIONS.includes(
                        nextValue as SystemMonitorSettingsDto['gpuMode'],
                      )
                        ? (nextValue as SystemMonitorSettingsDto['gpuMode'])
                        : current.gpuMode,
                    }))
                  }}
                />
              </div>
            </div>

            <div className="system-monitor-config__settings-grid system-monitor-config__settings-grid--toggles">
              <label className="system-monitor-config__toggle-card">
                <span className="system-monitor-config__toggle-label">
                  {t('pluginManager.plugins.systemMonitor.taskbarWidgetLabel')}
                </span>
                <span className="cove-toggle">
                  <input
                    type="checkbox"
                    data-testid="system-monitor-taskbar-widget-enabled"
                    checked={monitorSettings.taskbarWidgetEnabled}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        taskbarWidgetEnabled: event.target.checked,
                      }))
                    }}
                  />
                  <span className="cove-toggle__slider"></span>
                </span>
              </label>

              <label className="system-monitor-config__toggle-card">
                <span className="system-monitor-config__toggle-label">
                  {t('pluginManager.plugins.systemMonitor.notifyIconLabel')}
                </span>
                <span className="cove-toggle">
                  <input
                    type="checkbox"
                    data-testid="system-monitor-notify-icon-enabled"
                    checked={monitorSettings.taskbarWidget.notifyIconEnabled}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        taskbarWidget: {
                          ...current.taskbarWidget,
                          notifyIconEnabled: event.target.checked,
                        },
                      }))
                    }}
                  />
                  <span className="cove-toggle__slider"></span>
                </span>
              </label>

              <label className="system-monitor-config__toggle-card">
                <span className="system-monitor-config__toggle-label">
                  {t('pluginManager.plugins.systemMonitor.taskbarCompactModeLabel')}
                </span>
                <span className="cove-toggle">
                  <input
                    type="checkbox"
                    data-testid="system-monitor-taskbar-compact-mode-enabled"
                    checked={monitorSettings.taskbarWidget.compactModeEnabled}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        taskbarWidget: {
                          ...current.taskbarWidget,
                          compactModeEnabled: event.target.checked,
                        },
                      }))
                    }}
                  />
                  <span className="cove-toggle__slider"></span>
                </span>
              </label>

              <label className="system-monitor-config__toggle-card">
                <span className="system-monitor-config__toggle-label">
                  {t('pluginManager.plugins.systemMonitor.taskbarAlwaysOnTopLabel')}
                </span>
                <span className="cove-toggle">
                  <input
                    type="checkbox"
                    data-testid="system-monitor-taskbar-always-on-top"
                    checked={monitorSettings.taskbarWidget.alwaysOnTop}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        taskbarWidget: {
                          ...current.taskbarWidget,
                          alwaysOnTop: event.target.checked,
                        },
                      }))
                    }}
                  />
                  <span className="cove-toggle__slider"></span>
                </span>
              </label>

              <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                <label htmlFor="system-monitor-taskbar-font-size">
                  {t('pluginManager.plugins.systemMonitor.taskbarFontSizeLabel')}
                </label>
                <input
                  id="system-monitor-taskbar-font-size"
                  className="cove-field"
                  data-testid="system-monitor-taskbar-font-size"
                  type="number"
                  min={SYSTEM_MONITOR_MIN_TASKBAR_FONT_SIZE}
                  max={SYSTEM_MONITOR_MAX_TASKBAR_FONT_SIZE}
                  step={1}
                  value={monitorSettings.taskbarWidget.fontSize}
                  onChange={event => {
                    updateSettings(current => ({
                      ...current,
                      taskbarWidget: {
                        ...current.taskbarWidget,
                        fontSize:
                          Number.parseInt(event.target.value, 10) ||
                          current.taskbarWidget.fontSize,
                      },
                    }))
                  }}
                />
              </div>
            </div>

            <div className="system-monitor-config__display-panel">
              <label className="system-monitor-config__display-panel-label">
                {t('pluginManager.plugins.systemMonitor.taskbarDisplayItemsLabel')}
              </label>
              <div className="system-monitor-config__display-items">
                {SYSTEM_MONITOR_TASKBAR_DISPLAY_ITEM_OPTIONS.map(option => {
                  const isChecked = monitorSettings.taskbarWidget.displayItems.includes(option)
                  return (
                    <label
                      key={option}
                      className="system-monitor-config__display-item"
                      data-testid={`system-monitor-display-item-${option}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={event => {
                          updateSettings(current => {
                            const nextItems = event.target.checked
                              ? [...current.taskbarWidget.displayItems, option]
                              : current.taskbarWidget.displayItems.filter(item => item !== option)

                            return {
                              ...current,
                              taskbarWidget: {
                                ...current.taskbarWidget,
                                displayItems: nextItems,
                              },
                            }
                          })
                        }}
                      />
                      <span>
                        {t(`pluginManager.plugins.systemMonitor.taskbarDisplayItems.${option}`)}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>
        </PluginSectionCard>
      </div>
    </section>
  )
}
