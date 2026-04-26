import React from 'react'
import type { GitWorklogDailyPointDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import { formatGitWorklogCount, getGitWorklogRecentPoints } from './gitWorklogFormatting'
import { createGitWorklogPlotPoints, createGitWorklogSmoothPath } from './gitWorklogTrendPaths'

const REPO_TREND_WINDOWS = [7, 15, 30] as const
const MINI_WIDTH = 220
const MINI_HEIGHT = 112
const MINI_PADDING_LEFT = 10
const MINI_PADDING_RIGHT = 8
const MINI_PADDING_TOP = 10
const MINI_PADDING_BOTTOM = 22
const MINI_GRID_LINES = 4

type RepoTrendWindow = (typeof REPO_TREND_WINDOWS)[number]

export function GitWorklogMiniTrend({
  points,
  repoId,
}: {
  points: GitWorklogDailyPointDto[]
  repoId: string
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [windowSize, setWindowSize] = React.useState<RepoTrendWindow>(7)
  const displayPoints = React.useMemo(
    () => getGitWorklogRecentPoints(points, windowSize),
    [points, windowSize],
  )

  if (displayPoints.length === 0) {
    return null
  }

  const additions = displayPoints.map(point => point.additions)
  const deletions = displayPoints.map(point => point.deletions)
  const maxValue = Math.max(1, ...additions, ...deletions)
  const additionsPath = createGitWorklogSmoothPath(
    createGitWorklogPlotPoints(
      additions,
      maxValue,
      MINI_WIDTH,
      MINI_HEIGHT,
      MINI_PADDING_LEFT,
      MINI_PADDING_RIGHT,
      MINI_PADDING_TOP,
      MINI_PADDING_BOTTOM,
    ),
  )
  const deletionsPath = createGitWorklogSmoothPath(
    createGitWorklogPlotPoints(
      deletions,
      maxValue,
      MINI_WIDTH,
      MINI_HEIGHT,
      MINI_PADDING_LEFT,
      MINI_PADDING_RIGHT,
      MINI_PADDING_TOP,
      MINI_PADDING_BOTTOM,
    ),
  )
  const plotHeight = MINI_HEIGHT - MINI_PADDING_TOP - MINI_PADDING_BOTTOM
  const tickValues = Array.from({ length: MINI_GRID_LINES }, (_, index) => {
    const ratio = (MINI_GRID_LINES - 1 - index) / (MINI_GRID_LINES - 1)
    return Math.round(maxValue * ratio)
  })
  const totalChangedLines = displayPoints.reduce((sum, point) => sum + point.changedLines, 0)

  return (
    <div
      className="git-worklog-mini-trend"
      data-testid={`git-worklog-mini-trend-${repoId}`}
      aria-label={t('pluginManager.plugins.gitWorklog.repoTrendTitle')}
    >
      <div className="git-worklog-mini-trend__header">
        <div className="git-worklog-mini-trend__copy">
          <span>{t('pluginManager.plugins.gitWorklog.repoTrendTitle')}</span>
          <strong>
            {t('pluginManager.plugins.gitWorklog.repoTrendSummary', {
              days: displayPoints.length,
            })}
          </strong>
        </div>
        <div className="git-worklog-mini-trend__range-switcher" role="group">
          {REPO_TREND_WINDOWS.map(range => (
            <button
              key={range}
              type="button"
              className={`git-worklog-mini-trend__range-button${
                windowSize === range ? ' git-worklog-mini-trend__range-button--active' : ''
              }`}
              data-testid={`git-worklog-mini-trend-range-${repoId}-${range}`}
              aria-pressed={windowSize === range}
              onClick={() => {
                setWindowSize(range)
              }}
            >
              {t(`pluginManager.plugins.inputStats.range${range}Days`)}
            </button>
          ))}
        </div>
      </div>

      <div className="git-worklog-mini-trend__legend">
        <span className="git-worklog-mini-trend__legend-item">
          <i className="git-worklog-mini-trend__legend-dot git-worklog-mini-trend__legend-dot--additions" />
          {t('pluginManager.plugins.gitWorklog.summaryTrendAdditions')}
        </span>
        <span className="git-worklog-mini-trend__legend-item">
          <i className="git-worklog-mini-trend__legend-dot git-worklog-mini-trend__legend-dot--deletions" />
          {t('pluginManager.plugins.gitWorklog.summaryTrendDeletions')}
        </span>
      </div>

      <svg
        className="git-worklog-mini-trend__svg"
        viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`}
        preserveAspectRatio="none"
      >
        {tickValues.map((value, index) => {
          const ratio = value / maxValue
          const y = MINI_PADDING_TOP + plotHeight - ratio * plotHeight
          return (
            <line
              key={`grid-${index}`}
              x1={MINI_PADDING_LEFT}
              y1={y}
              x2={MINI_WIDTH - MINI_PADDING_RIGHT}
              y2={y}
              className="git-worklog-mini-trend__grid-line"
            />
          )
        })}
        <path
          d={additionsPath}
          className="git-worklog-mini-trend__path git-worklog-mini-trend__path--additions"
        />
        <path
          d={deletionsPath}
          className="git-worklog-mini-trend__path git-worklog-mini-trend__path--deletions"
        />
      </svg>

      <div className="git-worklog-mini-trend__footer">
        <span>{displayPoints[0]?.label}</span>
        <span>
          {t('pluginManager.plugins.gitWorklog.repoTrendTotal', {
            value: formatGitWorklogCount(totalChangedLines),
          })}
        </span>
        <span>{displayPoints.at(-1)?.label}</span>
      </div>
    </div>
  )
}
