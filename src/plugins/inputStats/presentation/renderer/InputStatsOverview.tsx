import React from 'react'
import type { InputStatsStateDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import { formatInputTimestamp } from './inputStatsFormatting'

export function InputStatsOverview({
  isPluginEnabled,
  state,
  onRefresh,
}: {
  isPluginEnabled: boolean
  state: InputStatsStateDto
  onRefresh: () => void
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <section className="input-stats-overview" data-testid="input-stats-overview">
      <div className="input-stats-overview__header">
        <div className="input-stats-overview__headline">
          <h4>{t('pluginManager.plugins.inputStats.overviewTitle')}</h4>
        </div>

        <div className="input-stats-overview__toolbar">
          <span
            className={`input-stats-overview__status-pill input-stats-overview__status-pill--${state.status}`}
          >
            {t(`pluginManager.plugins.inputStats.runtimeStatus.${state.status}`)}
          </span>
          <span className="input-stats-overview__meta-pill">
            {t('pluginManager.plugins.inputStats.lastUpdated', {
              value: formatInputTimestamp(state.lastUpdatedAt),
            })}
          </span>
          <button
            type="button"
            className="cove-window__action cove-window__action--secondary input-stats-overview__refresh"
            disabled={!isPluginEnabled || !state.isSupported}
            onClick={onRefresh}
          >
            {state.status === 'starting'
              ? t('pluginManager.plugins.inputStats.refreshing')
              : t('pluginManager.plugins.inputStats.refreshNow')}
          </button>
        </div>
      </div>

      {!state.isSupported ? (
        <div className="input-stats-overview__banner">
          <strong>{t('pluginManager.plugins.inputStats.unsupportedTitle')}</strong>
          <span>{t('pluginManager.plugins.inputStats.unsupportedBody')}</span>
        </div>
      ) : null}

      {state.lastError ? (
        <div className="input-stats-overview__banner input-stats-overview__banner--error">
          <strong>{t('pluginManager.plugins.inputStats.lastErrorTitle')}</strong>
          <span>{state.lastError.message}</span>
        </div>
      ) : null}
    </section>
  )
}
