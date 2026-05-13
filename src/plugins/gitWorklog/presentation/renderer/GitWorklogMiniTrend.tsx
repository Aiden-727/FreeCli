import React from 'react'
import type { GitWorklogDailyPointDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import { formatGitWorklogCount, getGitWorklogCalendarWindowPoints } from './gitWorklogFormatting'
import { createGitWorklogPlotPoints, createGitWorklogSmoothPath } from './gitWorklogTrendPaths'

const REPO_TREND_WINDOWS = [7, 15, 30] as const
const MINI_WIDTH = 220
const MINI_HEIGHT = 112
const MINI_PADDING_LEFT = 10
const MINI_PADDING_RIGHT = 8
const MINI_PADDING_TOP = 10
const MINI_PADDING_BOTTOM = 22
const MINI_GRID_LINES = 4
const MINI_TREND_TRANSITION_MS = 220

export type GitWorklogMiniTrendWindow = (typeof REPO_TREND_WINDOWS)[number]

type MiniTrendChartModel = {
  displayPoints: GitWorklogDailyPointDto[]
  tickValues: number[]
  additionsPath: string
  deletionsPath: string
  totalChangedLines: number
}

function buildMiniTrendChartModel(points: GitWorklogDailyPointDto[]): MiniTrendChartModel {
  if (points.length === 0) {
    return {
      displayPoints: [],
      tickValues: [],
      additionsPath: '',
      deletionsPath: '',
      totalChangedLines: 0,
    }
  }

  const additions = points.map(point => point.additions)
  const deletions = points.map(point => point.deletions)
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
  const tickValues = Array.from({ length: MINI_GRID_LINES }, (_, index) => {
    const ratio = (MINI_GRID_LINES - 1 - index) / (MINI_GRID_LINES - 1)
    return Math.round(maxValue * ratio)
  })

  return {
    displayPoints: points,
    tickValues,
    additionsPath,
    deletionsPath,
    totalChangedLines: points.reduce((sum, point) => sum + point.changedLines, 0),
  }
}

function renderMiniTrendSvg(model: MiniTrendChartModel, className?: string): React.JSX.Element {
  const additionsClassName = className
    ? `git-worklog-mini-trend__path git-worklog-mini-trend__path--additions ${className}`
    : 'git-worklog-mini-trend__path git-worklog-mini-trend__path--additions'
  const deletionsClassName = className
    ? `git-worklog-mini-trend__path git-worklog-mini-trend__path--deletions ${className}`
    : 'git-worklog-mini-trend__path git-worklog-mini-trend__path--deletions'
  const plotHeight = MINI_HEIGHT - MINI_PADDING_TOP - MINI_PADDING_BOTTOM
  const maxValue = Math.max(...model.tickValues, 1)

  return (
    <svg
      className="git-worklog-mini-trend__svg"
      viewBox={`0 0 ${MINI_WIDTH} ${MINI_HEIGHT}`}
      preserveAspectRatio="none"
    >
      {model.tickValues.map(value => {
        const ratio = value / maxValue
        const y = MINI_PADDING_TOP + plotHeight - ratio * plotHeight
        return (
          <line
            key={`grid-${value}-${Math.round(y)}`}
            x1={MINI_PADDING_LEFT}
            y1={y}
            x2={MINI_WIDTH - MINI_PADDING_RIGHT}
            y2={y}
            className="git-worklog-mini-trend__grid-line"
          />
        )
      })}
      <path d={model.additionsPath} className={additionsClassName} />
      <path d={model.deletionsPath} className={deletionsClassName} />
    </svg>
  )
}

export function GitWorklogMiniTrend({
  points,
  anchorDay,
  repoId,
  windowSize,
  onWindowSizeChange,
}: {
  points: GitWorklogDailyPointDto[]
  anchorDay?: string | null
  repoId: string
  windowSize?: GitWorklogMiniTrendWindow
  onWindowSizeChange?: (nextWindow: GitWorklogMiniTrendWindow) => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [internalWindowSize, setInternalWindowSize] = React.useState<GitWorklogMiniTrendWindow>(7)
  const [transitionChart, setTransitionChart] = React.useState<{
    previous: MiniTrendChartModel
    current: MiniTrendChartModel
  } | null>(null)
  const transitionTimerRef = React.useRef<number | null>(null)
  const activeWindowSize = windowSize ?? internalWindowSize
  const displayPoints = React.useMemo(
    () => getGitWorklogCalendarWindowPoints(points, activeWindowSize, anchorDay),
    [activeWindowSize, anchorDay, points],
  )
  const chartModel = React.useMemo(() => buildMiniTrendChartModel(displayPoints), [displayPoints])

  React.useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current)
      }
    }
  }, [])

  if (chartModel.displayPoints.length === 0) {
    return null
  }

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
              days: chartModel.displayPoints.length,
            })}
          </strong>
        </div>
        <div className="git-worklog-mini-trend__range-switcher" role="group">
          {REPO_TREND_WINDOWS.map(range => (
            <button
              key={range}
              type="button"
              className={`git-worklog-mini-trend__range-button${
                activeWindowSize === range ? ' git-worklog-mini-trend__range-button--active' : ''
              }`}
              data-testid={`git-worklog-mini-trend-range-${repoId}-${range}`}
              aria-pressed={activeWindowSize === range}
              onMouseDown={event => {
                // 仓库卡支持拖拽重排，这里必须先拦住 mousedown，避免时间切换按钮被父级误判为拖拽起点。
                event.stopPropagation()
              }}
              onClick={() => {
                if (range === activeWindowSize) {
                  return
                }

                const nextDisplayPoints = getGitWorklogCalendarWindowPoints(
                  points,
                  range,
                  anchorDay,
                )
                const nextChartModel = buildMiniTrendChartModel(nextDisplayPoints)
                if (transitionTimerRef.current !== null) {
                  window.clearTimeout(transitionTimerRef.current)
                }
                setTransitionChart({
                  previous: chartModel,
                  current: nextChartModel,
                })
                transitionTimerRef.current = window.setTimeout(() => {
                  setTransitionChart(null)
                  transitionTimerRef.current = null
                }, MINI_TREND_TRANSITION_MS)
                if (windowSize === undefined) {
                  setInternalWindowSize(range)
                }
                onWindowSizeChange?.(range)
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

      <div className="git-worklog-mini-trend__chart-stack">
        {transitionChart ? (
          <>
            <div className="git-worklog-mini-trend__chart-layer git-worklog-mini-trend__chart-layer--previous">
              {renderMiniTrendSvg(transitionChart.previous)}
            </div>
            <div className="git-worklog-mini-trend__chart-layer git-worklog-mini-trend__chart-layer--current">
              {renderMiniTrendSvg(transitionChart.current)}
            </div>
          </>
        ) : (
          <div className="git-worklog-mini-trend__chart-layer">
            {renderMiniTrendSvg(chartModel)}
          </div>
        )}
      </div>

      <div className="git-worklog-mini-trend__footer">
        <span>{chartModel.displayPoints[0]?.label}</span>
        <span>
          {t('pluginManager.plugins.gitWorklog.repoTrendTotal', {
            value: formatGitWorklogCount(chartModel.totalChangedLines),
          })}
        </span>
        <span>{chartModel.displayPoints.at(-1)?.label}</span>
      </div>
    </div>
  )
}
