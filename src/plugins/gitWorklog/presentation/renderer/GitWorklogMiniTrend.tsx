import React from 'react'
import type { GitWorklogDailyPointDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import { formatGitWorklogCount, getGitWorklogRecentPoints } from './gitWorklogFormatting'
import { createGitWorklogPlotPoints, createGitWorklogSmoothPath } from './gitWorklogTrendPaths'

const MINI_TREND_WINDOW = 14
const MINI_WIDTH = 220
const MINI_HEIGHT = 74
const MINI_PADDING_X = 6
const MINI_PADDING_Y = 8

export function GitWorklogMiniTrend({
  points,
  repoId,
}: {
  points: GitWorklogDailyPointDto[]
  repoId: string
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const displayPoints = React.useMemo(
    () => getGitWorklogRecentPoints(points, MINI_TREND_WINDOW),
    [points],
  )

  if (displayPoints.length === 0) {
    return null
  }

  const maxValue = Math.max(1, ...displayPoints.map(point => point.changedLines))
  const sparklinePath = createGitWorklogSmoothPath(
    createGitWorklogPlotPoints(
      displayPoints.map(point => point.changedLines),
      maxValue,
      MINI_WIDTH,
      MINI_HEIGHT,
      MINI_PADDING_X,
      MINI_PADDING_X,
      MINI_PADDING_Y,
      MINI_PADDING_Y,
    ),
  )

  return (
    <div
      className="git-worklog-mini-trend"
      data-testid={`git-worklog-mini-trend-${repoId}`}
      aria-label={t('pluginManager.plugins.gitWorklog.repoTrendTitle')}
    >
      <div className="git-worklog-mini-trend__header">
        <span>{t('pluginManager.plugins.gitWorklog.repoTrendTitle')}</span>
        <strong>
          {t('pluginManager.plugins.gitWorklog.repoTrendSummary', { days: displayPoints.length })}
        </strong>
      </div>
      <svg
        className="git-worklog-mini-trend__svg"
        viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`}
        preserveAspectRatio="none"
      >
        <line
          x1={MINI_PADDING_X}
          y1={MINI_HEIGHT - MINI_PADDING_Y}
          x2={MINI_WIDTH - MINI_PADDING_X}
          y2={MINI_HEIGHT - MINI_PADDING_Y}
          className="git-worklog-mini-trend__baseline"
        />
        <path d={sparklinePath} className="git-worklog-mini-trend__path" />
      </svg>
      <div className="git-worklog-mini-trend__footer">
        <span>{displayPoints[0]?.label}</span>
        <span>
          {t('pluginManager.plugins.gitWorklog.repoTrendPeak', {
            value: formatGitWorklogCount(maxValue),
          })}
        </span>
        <span>{displayPoints.at(-1)?.label}</span>
      </div>
    </div>
  )
}
