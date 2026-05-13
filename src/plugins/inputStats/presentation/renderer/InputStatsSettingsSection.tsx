import React from 'react'
import { ArrowDownUp, Keyboard, MousePointer2, Move, ScrollText } from 'lucide-react'
import type { InputStatsSettingsDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import {
  INPUT_STATS_CUMULATIVE_RANGE_OPTIONS,
  INPUT_STATS_HISTORY_RANGE_OPTIONS,
} from '@contexts/plugins/domain/inputStatsSettings'
import { PluginSectionCard } from '../../../../contexts/plugins/presentation/renderer/PluginSectionCard'
import type { SettingsPluginSectionProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { InputStatsHistorySection } from './InputStatsHistorySection'
import { InputStatsKeyDistribution } from './InputStatsKeyDistribution'
import { InputStatsMetricGrid } from './InputStatsMetricGrid'
import { InputStatsOverview } from './InputStatsOverview'
import { useInputStatsState } from './useInputStatsState'
import {
  formatInputCount,
  formatInputDistance,
  formatInputMetricValue,
} from './inputStatsFormatting'

function updateInputStatsSettings(
  settings: AgentSettings,
  onChange: (settings: AgentSettings) => void,
  updater: (current: InputStatsSettingsDto) => InputStatsSettingsDto,
): void {
  onChange({
    ...settings,
    plugins: {
      ...settings.plugins,
      inputStats: updater(settings.plugins.inputStats),
    },
  })
}

export default function InputStatsSettingsSection({
  settings,
  onChange,
}: SettingsPluginSectionProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state, refresh } = useInputStatsState()
  const inputStatsSettings = settings.plugins.inputStats
  const isPluginEnabled = settings.plugins.enabledIds.includes('input-stats')

  const updateSettings = React.useCallback(
    (updater: (current: InputStatsSettingsDto) => InputStatsSettingsDto) => {
      updateInputStatsSettings(settings, onChange, updater)
    },
    [onChange, settings],
  )

  const todayClicks = state.today.leftClicks + state.today.rightClicks
  const todayMetricItems = [
    {
      icon: Keyboard,
      label: t('pluginManager.plugins.inputStats.metrics.keys'),
      value: formatInputCount(state.today.keyPresses),
    },
    {
      icon: MousePointer2,
      label: t('pluginManager.plugins.inputStats.metrics.clicks'),
      value: formatInputCount(todayClicks),
    },
    {
      icon: Move,
      label: t('pluginManager.plugins.inputStats.metrics.movement'),
      value: formatInputDistance(state.today.mouseDistancePx, t),
    },
    {
      icon: ScrollText,
      label: t('pluginManager.plugins.inputStats.metrics.scroll'),
      value: formatInputCount(state.today.scrollSteps),
    },
  ]

  const cumulativeMetricItems = [
    {
      icon: Keyboard,
      label: t('pluginManager.plugins.inputStats.metrics.keys'),
      value: formatInputCount(state.cumulativeTotals.keys),
      animatedValue: {
        value: state.cumulativeTotals.keys,
        formatter: formatInputCount,
      },
    },
    {
      icon: MousePointer2,
      label: t('pluginManager.plugins.inputStats.metrics.clicks'),
      value: formatInputCount(state.cumulativeTotals.clicks),
      animatedValue: {
        value: state.cumulativeTotals.clicks,
        formatter: formatInputCount,
      },
    },
    {
      icon: Move,
      label: t('pluginManager.plugins.inputStats.metrics.movement'),
      value: formatInputMetricValue('movement', state.cumulativeTotals.movement, t),
      animatedValue: {
        value: state.cumulativeTotals.movement,
        formatter: value => formatInputMetricValue('movement', value, t),
      },
    },
    {
      icon: ArrowDownUp,
      label: t('pluginManager.plugins.inputStats.metrics.scroll'),
      value: formatInputCount(state.cumulativeTotals.scroll),
      animatedValue: {
        value: state.cumulativeTotals.scroll,
        formatter: formatInputCount,
      },
    },
  ]

  const distributionRangeActions = (
    <div className="input-stats-range-actions" data-testid="input-stats-distribution-range-actions">
      {[1, 7, 15, 30, 0].map(option => (
        <button
          key={`distribution-${option}`}
          type="button"
          className={`input-stats-range-actions__pill${inputStatsSettings.topKeysRange === option ? ' input-stats-range-actions__pill--active' : ''}`}
          data-testid={`input-stats-distribution-range-${option}`}
          onClick={() => {
            updateSettings(current => ({
              ...current,
              topKeysRange: option as InputStatsSettingsDto['topKeysRange'],
            }))
          }}
        >
          {option === 1
            ? t('pluginManager.plugins.inputStats.rangeToday')
            : option === 15
              ? t('pluginManager.plugins.inputStats.range15Days')
              : option === 30
                ? t('pluginManager.plugins.inputStats.range30Days')
                : option === 0
                  ? t('pluginManager.plugins.inputStats.rangeAll')
                  : t('pluginManager.plugins.inputStats.range7Days')}
        </button>
      ))}
    </div>
  )

  const historyRangeActions = (
    <div className="input-stats-range-actions" data-testid="input-stats-history-range-actions">
      {INPUT_STATS_HISTORY_RANGE_OPTIONS.map(option => (
        <button
          key={`history-${option}`}
          type="button"
          className={`input-stats-range-actions__pill${inputStatsSettings.historyRangeDays === option ? ' input-stats-range-actions__pill--active' : ''}`}
          data-testid={`input-stats-history-range-${option}`}
          onClick={() => {
            updateSettings(current => ({
              ...current,
              historyRangeDays: option,
            }))
          }}
        >
          {option === 30
            ? t('pluginManager.plugins.inputStats.range30Days')
            : t('pluginManager.plugins.inputStats.range7Days')}
        </button>
      ))}
    </div>
  )

  const cumulativeRangeActions = (
    <div className="input-stats-range-actions" data-testid="input-stats-cumulative-range-actions">
      {INPUT_STATS_CUMULATIVE_RANGE_OPTIONS.map(option => (
        <button
          key={`cumulative-${option}`}
          type="button"
          className={`input-stats-range-actions__pill${inputStatsSettings.cumulativeRangeDays === option ? ' input-stats-range-actions__pill--active' : ''}`}
          data-testid={`input-stats-cumulative-range-${option}`}
          onClick={() => {
            updateSettings(current => ({
              ...current,
              cumulativeRangeDays: option,
            }))
          }}
        >
          {option === 1
            ? t('pluginManager.plugins.inputStats.rangeToday')
            : option === 15
              ? t('pluginManager.plugins.inputStats.range15Days')
              : option === 30
                ? t('pluginManager.plugins.inputStats.range30Days')
                : option === 0
                  ? t('pluginManager.plugins.inputStats.rangeAll')
                  : t('pluginManager.plugins.inputStats.range7Days')}
        </button>
      ))}
    </div>
  )

  return (
    <section
      className="plugin-manager-panel__plugin-section input-stats-config"
      data-testid="plugin-manager-plugin-input-stats-section"
    >
      <InputStatsOverview
        isPluginEnabled={isPluginEnabled}
        state={state}
        onRefresh={() => {
          void refresh()
        }}
      />

      <div className="plugin-manager-panel__section-grid plugin-manager-panel__section-grid--stack">
        <PluginSectionCard title={t('pluginManager.plugins.inputStats.todayTitle')}>
          <InputStatsMetricGrid items={todayMetricItems} testId="input-stats-today-grid" />
        </PluginSectionCard>

        <PluginSectionCard
          title={t('pluginManager.plugins.inputStats.distributionTitle')}
          actions={distributionRangeActions}
        >
          <InputStatsKeyDistribution state={state} />
        </PluginSectionCard>

        <PluginSectionCard
          title={t('pluginManager.plugins.inputStats.historyTitle')}
          className="input-stats-config__shellless-card"
          hideHeader
        >
          <InputStatsHistorySection
            state={state}
            rangeActions={historyRangeActions}
            title={t('pluginManager.plugins.inputStats.historyTitle')}
          />
        </PluginSectionCard>

        <PluginSectionCard
          title={t('pluginManager.plugins.inputStats.cumulativeTitle')}
          className="input-stats-config__cumulative-card"
          actions={cumulativeRangeActions}
        >
          <InputStatsMetricGrid
            items={cumulativeMetricItems}
            testId="input-stats-cumulative-grid"
          />
        </PluginSectionCard>

        <PluginSectionCard title={t('pluginManager.plugins.inputStats.configurationTitle')}>
          <div className="input-stats-config__grid">
            <div className="plugin-manager-panel__compact-board">
              <div className="plugin-manager-panel__compact-board-head">
                <span className="plugin-manager-panel__compact-board-pill">采集节奏</span>
                <span className="plugin-manager-panel__compact-board-hint">
                  控制 helper 刷新频率
                </span>
              </div>
              <div className="input-stats-config__settings-grid">
                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="input-stats-poll-interval">
                    {t('pluginManager.plugins.inputStats.pollIntervalLabel')}
                  </label>
                  <input
                    id="input-stats-poll-interval"
                    className="cove-field"
                    data-testid="input-stats-poll-interval"
                    type="number"
                    min={3000}
                    max={120000}
                    step={1000}
                    value={inputStatsSettings.pollIntervalMs}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        pollIntervalMs: Number.parseInt(event.target.value, 10) || 15000,
                      }))
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="plugin-manager-panel__compact-board">
              <div className="plugin-manager-panel__compact-board-head">
                <span className="plugin-manager-panel__compact-board-pill">热力图区间</span>
                <span className="plugin-manager-panel__compact-board-hint">
                  键盘分布与排行榜使用同一范围
                </span>
              </div>
              <div className="input-stats-config__settings-grid">
                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="input-stats-top-keys-range">
                    {t('pluginManager.plugins.inputStats.topKeysRangeLabel')}
                  </label>
                  <select
                    id="input-stats-top-keys-range"
                    className="cove-field"
                    data-testid="input-stats-top-keys-range"
                    value={inputStatsSettings.topKeysRange}
                    onChange={event => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      updateSettings(current => ({
                        ...current,
                        topKeysRange: [0, 1, 7, 15, 30].includes(nextValue)
                          ? (nextValue as 0 | 1 | 7 | 15 | 30)
                          : 7,
                      }))
                    }}
                  >
                    <option value={1}>{t('pluginManager.plugins.inputStats.rangeToday')}</option>
                    <option value={7}>{t('pluginManager.plugins.inputStats.range7Days')}</option>
                    <option value={15}>{t('pluginManager.plugins.inputStats.range15Days')}</option>
                    <option value={30}>{t('pluginManager.plugins.inputStats.range30Days')}</option>
                    <option value={0}>{t('pluginManager.plugins.inputStats.rangeAll')}</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </PluginSectionCard>
      </div>
    </section>
  )
}
