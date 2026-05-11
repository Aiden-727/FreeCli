import React from 'react'
import { GitCommitHorizontal } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { ControlCenterPluginWidgetProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { useGitWorklogState } from './useGitWorklogState'

function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return '--'
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(Math.max(0, value))
}

export default function GitWorklogControlCenterWidget({
  onOpenPluginManager,
}: ControlCenterPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useGitWorklogState()
  const hasSnapshot = state.successfulRepoCount > 0
  const showMetrics = hasSnapshot && state.status !== 'loading'

  let subtitle = t('pluginManager.plugins.gitWorklog.controlCenterIdle')
  if (state.status === 'loading') {
    subtitle = t('pluginManager.plugins.gitWorklog.controlCenterLoading')
  } else if (hasSnapshot) {
    subtitle = t('pluginManager.plugins.gitWorklog.controlCenterReady', {
      commits: formatCount(state.overview.commitCountToday),
      changedLines: formatCount(state.overview.changedLinesToday),
    })
  } else if (state.lastError) {
    subtitle = t('pluginManager.plugins.gitWorklog.controlCenterError', {
      message: state.lastError.message,
    })
  } else if (state.status === 'needs_config') {
    subtitle = t('pluginManager.plugins.gitWorklog.controlCenterPending')
  }

  return (
    <button
      type="button"
      className="control-center-tile control-center-tile--plugin"
      data-testid="control-center-plugin-git-worklog"
      onClick={() => onOpenPluginManager('git-worklog')}
    >
      <span className="control-center-tile__icon" aria-hidden="true">
        <GitCommitHorizontal size={18} />
      </span>
      <span className="control-center-tile__text">
        <span className="control-center-tile__label">
          {t('pluginManager.plugins.gitWorklog.title')}
        </span>
        {showMetrics ? (
          <span className="control-center-tile__subtitle control-center-tile__plugin-lines">
            <span className="control-center-tile__plugin-line">
              <span className="control-center-tile__eye-care-phase-pill">
                <span>今日</span>
              </span>
              <span className="control-center-tile__plugin-value">
                {formatCount(state.overview.changedLinesToday)}
              </span>
            </span>
            <span className="control-center-tile__plugin-line">
              <span className="control-center-tile__eye-care-phase-pill">
                <span>累计</span>
              </span>
              <span className="control-center-tile__plugin-value">
                {formatCount(state.overview.changedLinesInRange)}
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
