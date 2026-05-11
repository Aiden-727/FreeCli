import React from 'react'
import { Keyboard, MousePointer2 } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { ControlCenterPluginWidgetProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { useInputStatsState } from './useInputStatsState'

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    Math.max(0, Math.round(value)),
  )
}

export default function InputStatsControlCenterWidget({
  onOpenPluginManager,
}: ControlCenterPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useInputStatsState()
  const clicks = state.today.leftClicks + state.today.rightClicks

  let subtitle = t('pluginManager.plugins.inputStats.controlCenterIdle')
  if (!state.isSupported) {
    subtitle = t('pluginManager.plugins.inputStats.controlCenterUnsupported')
  } else if (state.status === 'starting') {
    subtitle = t('pluginManager.plugins.inputStats.controlCenterLoading')
  } else if (state.lastError) {
    subtitle = t('pluginManager.plugins.inputStats.controlCenterError', {
      message: state.lastError.message,
    })
  }

  const showMetrics = state.status === 'ready' || (state.today.keyPresses > 0 || clicks > 0)

  return (
    <button
      type="button"
      className="control-center-tile control-center-tile--plugin"
      data-testid="control-center-plugin-input-stats"
      onClick={() => onOpenPluginManager('input-stats')}
    >
      <span className="control-center-tile__icon" aria-hidden="true">
        <Keyboard size={18} />
      </span>
      <span className="control-center-tile__text">
        <span className="control-center-tile__label">
          {t('pluginManager.plugins.inputStats.title')}
        </span>
        {showMetrics ? (
          <span className="control-center-tile__subtitle control-center-tile__plugin-lines">
            <span className="control-center-tile__plugin-line control-center-tile__plugin-line--input">
              <span className="control-center-tile__eye-care-phase-pill control-center-tile__eye-care-phase-pill--metric">
                <Keyboard size={14} />
                <span>{t('pluginManager.plugins.inputStats.controlCenterMetrics.keys')}</span>
              </span>
              <span className="control-center-tile__plugin-value">
                {formatCount(state.today.keyPresses)}
              </span>
            </span>
            <span className="control-center-tile__plugin-line control-center-tile__plugin-line--input">
              <span className="control-center-tile__eye-care-phase-pill control-center-tile__eye-care-phase-pill--metric">
                <MousePointer2 size={14} />
                <span>{t('pluginManager.plugins.inputStats.controlCenterMetrics.clicks')}</span>
              </span>
              <span className="control-center-tile__plugin-value">
                {formatCount(clicks)}
              </span>
            </span>
          </span>
        ) : (
          <span className="control-center-tile__subtitle">{subtitle}</span>
        )}
      </span>
    </button>
  )
}
