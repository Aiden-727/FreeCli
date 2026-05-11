import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import type { ControlCenterPluginWidgetProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { getQuotaRingColor } from './quotaRing'
import { useQuotaMonitorState } from './useQuotaMonitorState'

function formatQuotaValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '--'
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(Math.max(0, value))
}

export default function QuotaMonitorControlCenterWidget({
  onOpenPluginManager,
}: ControlCenterPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useQuotaMonitorState()
  const healthyProfiles = state.profiles.filter(profile => profile.error === null)
  const totalRemain = healthyProfiles.reduce((sum, profile) => sum + profile.remainQuotaValue, 0)
  const totalUsed = healthyProfiles.reduce((sum, profile) => sum + profile.todayUsedQuota, 0)
  const hasSnapshot = healthyProfiles.length > 0
  const remainRatio =
    totalRemain + totalUsed > 0
      ? Math.max(0, Math.min(1, totalRemain / (totalRemain + totalUsed)))
      : 0
  const clampedRatio = Math.max(0, Math.min(1, remainRatio))
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clampedRatio)
  const ringColor = hasSnapshot ? getQuotaRingColor(clampedRatio) : 'var(--cove-text-faint)'
  const remainDisplay = hasSnapshot ? formatQuotaValue(totalRemain) : '--'

  let subtitle = t('pluginManager.plugins.quotaMonitor.controlCenterIdle')
  if (state.status === 'loading') {
    subtitle = t('pluginManager.plugins.quotaMonitor.controlCenterLoading')
  } else if (hasSnapshot) {
    subtitle = t('pluginManager.plugins.quotaMonitor.controlCenterReady', {
      remain: remainDisplay,
    })
  } else if (state.lastError) {
    subtitle = t('pluginManager.plugins.quotaMonitor.controlCenterError', {
      message: state.lastError.message,
    })
  } else if (state.status === 'needs_config') {
    subtitle = t('pluginManager.plugins.quotaMonitor.controlCenterPending')
  }

  return (
    <button
      type="button"
      className="control-center-tile control-center-tile--plugin"
      data-testid="control-center-plugin-quota-monitor"
      onClick={() => onOpenPluginManager('quota-monitor')}
    >
      <span className="control-center-tile__icon control-center-tile__icon--quota" aria-hidden="true">
        <span className="control-center-quota-ring" style={{ color: ringColor }}>
          <svg viewBox="0 0 36 36">
            <circle className="control-center-quota-ring__track" cx="18" cy="18" r={radius} />
            <circle
              className="control-center-quota-ring__fill"
              cx="18"
              cy="18"
              r={radius}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
        </span>
      </span>
      <span className="control-center-tile__text">
        <span className="control-center-tile__label">
          {t('pluginManager.plugins.quotaMonitor.title')}
        </span>
        <span className="control-center-tile__subtitle control-center-tile__plugin-lines">
          {hasSnapshot ? (
            <>
              <span className="control-center-tile__plugin-line">
                <span className="control-center-tile__eye-care-countdown-value">
                  {remainDisplay}
                </span>
                <span className="control-center-tile__data-pill-label">剩余额度</span>
              </span>
              <span className="control-center-tile__plugin-line">
                <span className="control-center-tile__eye-care-phase-pill">
                  {healthyProfiles[0]?.estimatedRemainingTimeLabel ?? '--'}
                </span>
              </span>
            </>
          ) : (
            <>
              <span className="control-center-tile__plugin-line">
                <span className="control-center-tile__eye-care-phase-pill">{subtitle}</span>
              </span>
              <span className="control-center-tile__plugin-line">
                <span className="control-center-tile__eye-care-countdown-value">--</span>
              </span>
            </>
          )}
        </span>
      </span>
    </button>
  )
}
