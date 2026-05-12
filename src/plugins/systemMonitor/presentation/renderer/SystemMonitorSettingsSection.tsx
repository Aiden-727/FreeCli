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
            <div className="plugin-manager-panel__compact-board">
              <div className="plugin-manager-panel__compact-board-head">
                <span className="plugin-manager-panel__compact-board-pill">采样节奏</span>
                <span className="plugin-manager-panel__compact-board-hint">采样、历史与 GPU 策略</span>
              </div>
              <div className="system-monitor-config__settings-grid system-monitor-config__settings-grid--compact">
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
            </div>

            <div className="plugin-manager-panel__compact-board">
              <div className="plugin-manager-panel__compact-board-head">
                <span className="plugin-manager-panel__compact-board-pill">说明</span>
                <span className="plugin-manager-panel__compact-board-hint">
                  仅保留应用内监控入口与采样主链
                </span>
              </div>
              <div className="quota-monitor-overview__banner">
                <strong>应用内展示</strong>
                <span>系统监控当前只保留头部入口、控制中心卡片和插件页总览，不再提供 Windows 原生任务栏小窗能力。</span>
              </div>
            </div>
          </div>
        </PluginSectionCard>
      </div>
    </section>
  )
}
