import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import type { QuotaMonitorProfileStateDto, QuotaMonitorStateDto } from '@shared/contracts/dto'
import type { HeaderPluginWidgetProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { useQuotaMonitorState } from './useQuotaMonitorState'
import { getQuotaRingColor } from './quotaRing'

function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) {
    return '--'
  }

  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`
}

function buildSummary(state: QuotaMonitorStateDto): {
  displayValue: string
  remainRatio: number
  titleKey: string
  titleParams?: Record<string, string | number>
} {
  const healthyProfiles = state.profiles.filter(
    (profile): profile is QuotaMonitorProfileStateDto => profile.error === null,
  )

  if (state.status === 'loading') {
    return {
      displayValue: '--',
      remainRatio: 0,
      titleKey: 'pluginManager.plugins.quotaMonitor.header.loading',
    }
  }

  if (healthyProfiles.length === 0) {
    if (state.lastError) {
      return {
        displayValue: '--',
        remainRatio: 0,
        titleKey: 'pluginManager.plugins.quotaMonitor.header.error',
        titleParams: { message: state.lastError.message },
      }
    }

    return {
      displayValue: '--',
      remainRatio: 0,
      titleKey: 'pluginManager.plugins.quotaMonitor.header.pending',
    }
  }

  const totalRemain = healthyProfiles.reduce((sum, profile) => sum + profile.remainQuotaValue, 0)
  const totalUsed = healthyProfiles.reduce((sum, profile) => sum + profile.todayUsedQuota, 0)
  const remainRatio =
    totalRemain + totalUsed > 0 ? Math.max(0, Math.min(1, totalRemain / (totalRemain + totalUsed))) : 0

  return {
    displayValue: formatPercent(remainRatio),
    remainRatio,
    titleKey: 'pluginManager.plugins.quotaMonitor.header.ready',
    titleParams: {
      remain: Math.round(totalRemain),
      percent: Math.round(remainRatio * 100),
      profiles: healthyProfiles.length,
    },
  }
}

export default function QuotaMonitorHeaderWidget({
  onOpenPluginManager,
}: HeaderPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useQuotaMonitorState()
  const summary = React.useMemo(() => buildSummary(state), [state])
  const clampedRatio = Math.max(0, Math.min(1, summary.remainRatio))
  const radius = 14
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clampedRatio)
  const color = getQuotaRingColor(clampedRatio)

  return (
    <button
      type="button"
      className="app-header__quota-button"
      data-testid="app-header-quota-monitor"
      aria-label={t(summary.titleKey, summary.titleParams)}
      title={t(summary.titleKey, summary.titleParams)}
      onClick={() => onOpenPluginManager('quota-monitor')}
    >
      <span className="app-header__quota-ring" aria-hidden="true">
        <svg viewBox="0 0 36 36">
          <circle className="app-header__quota-ring-track" cx="18" cy="18" r={radius} />
          <circle
            className="app-header__quota-ring-fill"
            cx="18"
            cy="18"
            r={radius}
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="app-header__quota-value">{summary.displayValue}</span>
      </span>
    </button>
  )
}
