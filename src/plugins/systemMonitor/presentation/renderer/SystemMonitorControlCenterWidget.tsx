import React from 'react'
import { Activity } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { ControlCenterPluginWidgetProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { useSystemMonitorState } from './useSystemMonitorState'
import { formatPercent, formatSpeed } from './systemMonitorFormatting'

export default function SystemMonitorControlCenterWidget({
  onOpenPluginManager,
}: ControlCenterPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useSystemMonitorState()
  const cpuTone =
    state.current.cpuUsagePercent >= 85
      ? 'danger'
      : state.current.cpuUsagePercent >= 65
        ? 'warn'
        : 'normal'
  const memoryTone =
    state.current.memoryUsagePercent >= 85
      ? 'danger'
      : state.current.memoryUsagePercent >= 65
        ? 'warn'
        : 'normal'

  let subtitle = t('pluginManager.plugins.systemMonitor.controlCenterIdle')
  if (!state.isSupported) {
    subtitle = t('pluginManager.plugins.systemMonitor.controlCenterUnsupported')
  } else if (state.status === 'starting' || state.status === 'idle') {
    subtitle = t('pluginManager.plugins.systemMonitor.controlCenterLoading')
  } else if (state.lastError) {
    subtitle = t('pluginManager.plugins.systemMonitor.controlCenterError', {
      message: state.lastError.message,
    })
  }

  const showMetrics =
    state.status === 'ready' ||
    state.status === 'partial_error' ||
    state.current.downloadBytesPerSecond > 0 ||
    state.current.uploadBytesPerSecond > 0

  return (
    <button
      type="button"
      className="control-center-tile control-center-tile--plugin"
      data-testid="control-center-plugin-system-monitor"
      onClick={() => onOpenPluginManager('system-monitor')}
    >
      <span className="control-center-tile__icon" aria-hidden="true">
        <Activity size={18} />
      </span>
      <span className="control-center-tile__text">
        <span className="control-center-tile__label">
          {t('pluginManager.plugins.systemMonitor.title')}
        </span>
        {showMetrics ? (
          <span className="control-center-tile__subtitle control-center-tile__plugin-lines">
            <span className="control-center-tile__plugin-line">
              <span
                className={`control-center-tile__eye-care-phase-pill control-center-tile__system-pill control-center-tile__system-pill--${cpuTone}`}
              >
                <span>{formatPercent(state.current.cpuUsagePercent, t)}</span>
              </span>
              <span className="control-center-tile__data-pill-label">
                {t('pluginManager.plugins.systemMonitor.metrics.cpu')}
              </span>
            </span>
            <span className="control-center-tile__plugin-line">
              <span
                className={`control-center-tile__eye-care-countdown-value control-center-tile__system-pill control-center-tile__system-pill--${memoryTone}`}
              >
                {formatPercent(state.current.memoryUsagePercent, t)}
              </span>
              <span className="control-center-tile__data-pill-label">
                {t('pluginManager.plugins.systemMonitor.metrics.memory')}
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
