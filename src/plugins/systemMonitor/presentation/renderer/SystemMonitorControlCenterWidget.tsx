import React from 'react'
import { Activity, Download, Upload } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { ControlCenterPluginWidgetProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { useSystemMonitorState } from './useSystemMonitorState'
import { formatPercent, formatSpeed } from './systemMonitorFormatting'

export default function SystemMonitorControlCenterWidget({
  onOpenPluginManager,
}: ControlCenterPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useSystemMonitorState()

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
          <span className="control-center-tile__subtitle control-center-tile__subtitle--stack">
            <span className="control-center-tile__metric-row">
              <span className="control-center-tile__metric">
                <Download size={12} />
                <span className="control-center-tile__metric-value">
                  {formatSpeed(state.current.downloadBytesPerSecond)}
                </span>
              </span>
              <span className="control-center-tile__metric">
                <Upload size={12} />
                <span className="control-center-tile__metric-value">
                  {formatSpeed(state.current.uploadBytesPerSecond)}
                </span>
              </span>
            </span>
            <span className="control-center-tile__metric-row">
              <span className="control-center-tile__metric">
                <span className="control-center-tile__metric-value">
                  {formatPercent(state.current.cpuUsagePercent, t)}
                </span>
                <span className="control-center-tile__metric-label">
                  {t('pluginManager.plugins.systemMonitor.metrics.cpu')}
                </span>
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
