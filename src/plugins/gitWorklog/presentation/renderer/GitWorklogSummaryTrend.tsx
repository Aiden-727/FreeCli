import React from 'react'
import type { GitWorklogDailyPointDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import {
  createGitWorklogWindowLabel,
  formatGitWorklogCount,
  getGitWorklogRecentPoints,
} from './gitWorklogFormatting'
import { createGitWorklogPlotPoints, createGitWorklogSmoothPath } from './gitWorklogTrendPaths'

const CHART_WIDTH = 720
const CHART_HEIGHT = 236
const PADDING_LEFT = 42
const PADDING_RIGHT = 14
const PADDING_TOP = 16
const PADDING_BOTTOM = 28
const GRID_LINES = 4
const SUMMARY_TREND_WINDOW = 30

export function GitWorklogSummaryTrend({
  points,
}: {
  points: GitWorklogDailyPointDto[]
}): React.JSX.Element {
  const { t } = useTranslation()
  const displayPoints = React.useMemo(
    () => getGitWorklogRecentPoints(points, SUMMARY_TREND_WINDOW),
    [points],
  )

  const additions = displayPoints.map(point => point.additions)
  const deletions = displayPoints.map(point => point.deletions)
  const maxValue = Math.max(1, ...additions, ...deletions)
  const additionPath = createGitWorklogSmoothPath(
    createGitWorklogPlotPoints(
      additions,
      maxValue,
      CHART_WIDTH,
      CHART_HEIGHT,
      PADDING_LEFT,
      PADDING_RIGHT,
      PADDING_TOP,
      PADDING_BOTTOM,
    ),
  )
  const deletionPath = createGitWorklogSmoothPath(
    createGitWorklogPlotPoints(
      deletions,
      maxValue,
      CHART_WIDTH,
      CHART_HEIGHT,
      PADDING_LEFT,
      PADDING_RIGHT,
      PADDING_TOP,
      PADDING_BOTTOM,
    ),
  )
  const plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM
  const tickValues = Array.from({ length: GRID_LINES }, (_, index) => {
    const ratio = (GRID_LINES - 1 - index) / (GRID_LINES - 1)
    return Math.round(maxValue * ratio)
  })

  return (
    <section
      className="git-worklog-trend-card"
      data-testid="git-worklog-summary-trend"
      aria-label={t('pluginManager.plugins.gitWorklog.summaryTrendTitle')}
    >
      <div className="git-worklog-trend-card__header">
        <div className="git-worklog-trend-card__copy">
          <strong>{t('pluginManager.plugins.gitWorklog.summaryTrendTitle')}</strong>
          <span>
            {t('pluginManager.plugins.gitWorklog.summaryTrendSummary', {
              window: createGitWorklogWindowLabel(displayPoints.length),
            })}
          </span>
        </div>
        <div className="git-worklog-trend-card__legend">
          <span className="git-worklog-trend-card__legend-item">
            <i className="git-worklog-trend-card__legend-dot git-worklog-trend-card__legend-dot--additions" />
            {t('pluginManager.plugins.gitWorklog.summaryTrendAdditions')}
          </span>
          <span className="git-worklog-trend-card__legend-item">
            <i className="git-worklog-trend-card__legend-dot git-worklog-trend-card__legend-dot--deletions" />
            {t('pluginManager.plugins.gitWorklog.summaryTrendDeletions')}
          </span>
        </div>
      </div>

      {displayPoints.length > 0 ? (
        <div className="git-worklog-trend-card__chart-shell">
          <div className="git-worklog-trend-card__y-axis">
            {tickValues.map(value => (
              <span key={`tick-${value}`}>{formatGitWorklogCount(value)}</span>
            ))}
          </div>
          <div className="git-worklog-trend-card__chart">
            <svg
              className="git-worklog-trend-card__svg"
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={t('pluginManager.plugins.gitWorklog.summaryTrendTitle')}
            >
              {tickValues.map(value => {
                const ratio = value / maxValue
                const y = PADDING_TOP + plotHeight - ratio * plotHeight
                return (
                  <line
                    key={`grid-${value}-${Math.round(y)}`}
                    x1={PADDING_LEFT}
                    y1={y}
                    x2={CHART_WIDTH - PADDING_RIGHT}
                    y2={y}
                    className="git-worklog-trend-card__grid-line"
                  />
                )
              })}
              <path
                d={additionPath}
                className="git-worklog-trend-card__path git-worklog-trend-card__path--additions"
              />
              <path
                d={deletionPath}
                className="git-worklog-trend-card__path git-worklog-trend-card__path--deletions"
              />
            </svg>

            <div className="git-worklog-trend-card__x-axis">
              {displayPoints.map(point => (
                <span key={point.day}>{point.label}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="git-worklog-trend-card__empty">
          {t('pluginManager.plugins.gitWorklog.summaryTrendEmpty')}
        </div>
      )}
    </section>
  )
}
