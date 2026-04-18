import React from 'react'
import type {
  InputStatsHistoryMetric,
  InputStatsHistoryPointDto,
  InputStatsStateDto,
} from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import { formatInputMetricValue } from './inputStatsFormatting'

interface HistorySeriesConfig {
  metric: InputStatsHistoryMetric
  color: string
}

interface DaySeriesPoint {
  day: string
  label: string
  value: number
}

interface HistoryPoint {
  day: string
  label: string
  rawValue: number
  x: number
  y: number
}

interface HistoryPointLayer {
  key: string
  color: string
  points: HistoryPoint[]
}

const HISTORY_SERIES: readonly HistorySeriesConfig[] = [
  {
    metric: 'clicks',
    color: 'var(--input-stats-history-color-clicks)',
  },
  {
    metric: 'keys',
    color: 'var(--input-stats-history-color-keys)',
  },
  {
    metric: 'movement',
    color: 'var(--input-stats-history-color-movement)',
  },
  {
    metric: 'scroll',
    color: 'var(--input-stats-history-color-scroll)',
  },
] as const

const HISTORY_LEVELS = [100, 75, 50, 25, 0] as const

function formatHistoryDay(day: string): string {
  const date = new Date(`${day}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return day
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function resolveBaseSeries(state: InputStatsStateDto): InputStatsHistoryPointDto[] {
  for (const { metric } of HISTORY_SERIES) {
    const series = state.historySeriesByMetric[metric]
    if (series.length > 0) {
      return series
    }
  }

  return []
}

function createSparseAxisLabels(labels: string[], maxTicks: number): string[] {
  if (labels.length <= maxTicks) {
    return labels
  }

  const lastIndex = labels.length - 1
  const interval = Math.max(1, Math.ceil(lastIndex / Math.max(1, maxTicks - 1)))
  const indices = new Set<number>()

  for (let index = 0; index < labels.length; index += interval) {
    indices.add(index)
  }

  indices.add(lastIndex)

  return [...indices].sort((left, right) => left - right).map(index => labels[index] ?? '')
}

function createHistoryPlotPoints(
  series: DaySeriesPoint[],
  maxValue: number,
  width: number,
  height: number,
  paddingLeft: number,
  paddingRight: number,
  paddingTop: number,
  paddingBottom: number,
): HistoryPoint[] {
  if (series.length === 0) {
    return []
  }

  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom
  const stepX = series.length > 1 ? plotWidth / (series.length - 1) : 0
  const safeMaxValue = maxValue > 0 ? maxValue : 1

  return series.map((point, index) => ({
    day: point.day,
    label: point.label,
    rawValue: point.value,
    x: paddingLeft + stepX * index,
    y: paddingTop + plotHeight - (Math.max(0, point.value) / safeMaxValue) * plotHeight,
  }))
}

function createSmoothTrendPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return ''
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`
  }

  return points
    .map((point, index) => {
      if (index === 0) {
        return `M ${point.x} ${point.y}`
      }

      const previous = points[index - 1]
      const controlX = (previous.x + point.x) / 2
      return `C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`
    })
    .join(' ')
}

function sampleHistoryYAtX(points: Array<{ x: number; y: number }>, targetX: number): number {
  if (points.length === 0) {
    return 0
  }

  if (points.length === 1) {
    return points[0].y
  }

  if (targetX <= points[0].x) {
    return points[0].y
  }

  if (targetX >= points[points.length - 1].x) {
    return points[points.length - 1].y
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]

    if (targetX > current.x) {
      continue
    }

    const span = current.x - previous.x
    if (span <= 0) {
      return current.y
    }

    const mix = (targetX - previous.x) / span
    return previous.y + (current.y - previous.y) * mix
  }

  return points[points.length - 1].y
}

function alignHistoryPointsToReferenceX(
  points: HistoryPoint[],
  referencePoints: HistoryPoint[],
): HistoryPoint[] {
  return referencePoints.map(point => ({
    ...point,
    y: sampleHistoryYAtX(points, point.x),
  }))
}

function createBaselineHistoryPoints(
  referencePoints: HistoryPoint[],
  baselineY: number,
): HistoryPoint[] {
  return referencePoints.map(point => ({
    ...point,
    y: baselineY,
  }))
}

function createInterpolatedHistoryPoints(
  fromPoints: HistoryPoint[],
  toPoints: HistoryPoint[],
  progress: number,
): HistoryPoint[] {
  const referencePoints = toPoints.length > 0 ? toPoints : fromPoints
  if (referencePoints.length === 0) {
    return []
  }

  const normalizedFrom = alignHistoryPointsToReferenceX(fromPoints, referencePoints)
  const normalizedTo = alignHistoryPointsToReferenceX(toPoints, referencePoints)

  return referencePoints.map((referencePoint, index) => {
    const source =
      normalizedFrom[index] ?? normalizedFrom[normalizedFrom.length - 1] ?? referencePoint
    const target = normalizedTo[index] ?? normalizedTo[normalizedTo.length - 1] ?? referencePoint

    return {
      ...referencePoint,
      y: source.y + (target.y - source.y) * progress,
    }
  })
}

export function InputStatsHistorySection({
  state,
  title,
  rangeActions,
}: {
  state: InputStatsStateDto
  title: string
  rangeActions: React.ReactNode
}): React.JSX.Element {
  const { t } = useTranslation()
  const baseSeries = React.useMemo(() => resolveBaseSeries(state), [state])
  const [selectedMetric, setSelectedMetric] = React.useState<InputStatsHistoryMetric | null>(null)
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null)
  const [isLineAnimating, setIsLineAnimating] = React.useState(false)
  const [animatedPointLayers, setAnimatedPointLayers] = React.useState<HistoryPointLayer[] | null>(
    null,
  )
  const previousPointLayersRef = React.useRef<HistoryPointLayer[] | null>(null)
  const animationFrameRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    setSelectedMetric(current => {
      if (current && state.historySeriesByMetric[current]?.length > 0) {
        return current
      }

      return null
    })
  }, [state])

  React.useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  const chartWidth = 760
  const chartHeight = 236
  const paddingLeft = 8
  const paddingRight = 8
  const paddingTop = 18
  const paddingBottom = 34
  const plotHeight = Math.max(1, chartHeight - paddingTop - paddingBottom)

  const seriesMaps = React.useMemo(() => {
    const mapping = new Map<InputStatsHistoryMetric, Map<string, DaySeriesPoint>>()
    for (const { metric } of HISTORY_SERIES) {
      mapping.set(
        metric,
        new Map(
          state.historySeriesByMetric[metric].map(item => [
            item.day,
            {
              day: item.day,
              label: item.label,
              value: item.value,
            },
          ]),
        ),
      )
    }
    return mapping
  }, [state.historySeriesByMetric])

  const normalizedSeries = React.useMemo(() => {
    return HISTORY_SERIES.map(series => {
      const values = state.historySeriesByMetric[series.metric]
      const maxValue = values.reduce((max, item) => Math.max(max, item.value), 0)
      const seriesPoints = baseSeries.map(item => {
        const current = seriesMaps.get(series.metric)?.get(item.day)
        return {
          day: item.day,
          label: current?.label ?? item.label,
          value: current?.value ?? 0,
        }
      })
      const points = createHistoryPlotPoints(
        seriesPoints,
        maxValue,
        chartWidth,
        chartHeight,
        paddingLeft,
        paddingRight,
        paddingTop,
        paddingBottom,
      )

      return {
        ...series,
        points,
        path: createSmoothTrendPath(points),
      }
    })
  }, [
    baseSeries,
    chartHeight,
    chartWidth,
    paddingBottom,
    paddingLeft,
    paddingRight,
    paddingTop,
    seriesMaps,
    state.historySeriesByMetric,
  ])

  const visibleMetrics = React.useMemo(
    () => new Set(selectedMetric ? [selectedMetric] : HISTORY_SERIES.map(series => series.metric)),
    [selectedMetric],
  )
  const visibleSeries = React.useMemo(
    () =>
      normalizedSeries.filter(
        series => visibleMetrics.has(series.metric) && series.path.length > 0,
      ),
    [normalizedSeries, visibleMetrics],
  )
  const sparseAxisLabels = React.useMemo(
    () =>
      createSparseAxisLabels(
        baseSeries.map(item => item.label),
        6,
      ),
    [baseSeries],
  )
  const currentPointLayers = React.useMemo<HistoryPointLayer[]>(
    () =>
      visibleSeries.map(series => ({
        key: series.metric,
        color: series.color,
        points: series.points,
      })),
    [visibleSeries],
  )
  const renderedPathLayers = React.useMemo(
    () =>
      (animatedPointLayers ?? currentPointLayers)
        .map(layer => {
          const path = createSmoothTrendPath(layer.points)
          return path.length > 0
            ? {
                key: layer.key,
                color: layer.color,
                path,
              }
            : null
        })
        .filter(
          (
            item,
          ): item is {
            key: string
            color: string
            path: string
          } => item !== null,
        ),
    [animatedPointLayers, currentPointLayers],
  )
  const referencePoints = currentPointLayers[0]?.points ?? []

  React.useEffect(() => {
    setHoveredIndex(null)
  }, [currentPointLayers])

  React.useEffect(() => {
    const previousPointLayers = previousPointLayersRef.current
    previousPointLayersRef.current = currentPointLayers

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
    }

    if (!previousPointLayers) {
      setAnimatedPointLayers(null)
      setIsLineAnimating(false)
      return
    }

    const baselineY = chartHeight - paddingBottom
    const targetLayersByKey = new Map(currentPointLayers.map(layer => [layer.key, layer]))
    const previousLayersByKey = new Map(previousPointLayers.map(layer => [layer.key, layer]))
    const mergedKeys = new Set([...previousLayersByKey.keys(), ...targetLayersByKey.keys()])
    const animationLayers = [...mergedKeys].map(key => {
      const previousLayer = previousLayersByKey.get(key) ?? null
      const targetLayer = targetLayersByKey.get(key) ?? null
      const referenceLayerPoints = targetLayer?.points ?? previousLayer?.points ?? []

      return {
        key,
        color: targetLayer?.color ?? previousLayer?.color ?? HISTORY_SERIES[0].color,
        fromPoints:
          previousLayer?.points ?? createBaselineHistoryPoints(referenceLayerPoints, baselineY),
        toPoints:
          targetLayer?.points ?? createBaselineHistoryPoints(referenceLayerPoints, baselineY),
      }
    })

    if (animationLayers.length === 0) {
      setAnimatedPointLayers(null)
      setIsLineAnimating(false)
      return
    }

    setHoveredIndex(null)
    setIsLineAnimating(true)

    const durationMs = 260
    const start = window.performance.now()

    const step = (timestamp: number) => {
      const elapsed = timestamp - start
      const rawProgress = Math.min(1, elapsed / durationMs)
      const easedProgress = 1 - (1 - rawProgress) ** 3

      setAnimatedPointLayers(
        animationLayers.map(layer => ({
          key: layer.key,
          color: layer.color,
          points: createInterpolatedHistoryPoints(layer.fromPoints, layer.toPoints, easedProgress),
        })),
      )

      if (rawProgress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(step)
        return
      }

      setAnimatedPointLayers(null)
      setIsLineAnimating(false)
      animationFrameRef.current = null
    }

    animationFrameRef.current = window.requestAnimationFrame(step)
  }, [chartHeight, currentPointLayers, paddingBottom])

  const focusIndex = hoveredIndex
  const focusedPoint =
    focusIndex !== null && focusIndex >= 0 && focusIndex < referencePoints.length
      ? {
          label: baseSeries[focusIndex]?.label ?? '',
          x: referencePoints[focusIndex]?.x ?? paddingLeft,
          values: visibleSeries.map(series => {
            const point = series.points[focusIndex]
            return {
              metric: series.metric,
              color: series.color,
              rawValue: point?.rawValue ?? 0,
              y: point?.y ?? paddingTop + plotHeight,
            }
          }),
        }
      : null

  const tooltipLeft =
    focusedPoint === null ? 50 : Math.min(88, Math.max(12, (focusedPoint.x / chartWidth) * 100))

  return (
    <div className="input-stats-history" data-testid="input-stats-history-section">
      <div className="input-stats-history__header">
        <strong className="input-stats-history__title">{title}</strong>
        <div className="input-stats-history__range-selector">{rangeActions}</div>
      </div>

      <div
        className="input-stats-history__metric-tabs"
        data-testid="input-stats-history-metric-tabs"
      >
        {HISTORY_SERIES.map(series => (
          <button
            key={`metric-tab-${series.metric}`}
            type="button"
            className={`input-stats-history__metric-pill${selectedMetric === series.metric ? ' input-stats-history__metric-pill--active' : ''}`}
            data-testid={`input-stats-history-metric-tab-${series.metric}`}
            aria-pressed={selectedMetric === series.metric}
            onClick={() => {
              setSelectedMetric(current => (current === series.metric ? null : series.metric))
            }}
          >
            {t(`pluginManager.plugins.inputStats.historyMetricTabs.${series.metric}`)}
          </button>
        ))}
      </div>

      <div className="input-stats-history__chart-shell">
        <div className="input-stats-history__chart-card">
          <div className="input-stats-history__chart-frame">
            <div className="input-stats-history__y-axis" aria-hidden="true">
              {HISTORY_LEVELS.map(level => (
                <span key={`level-${level}`}>{level}%</span>
              ))}
            </div>

            <div
              className="input-stats-history__chart"
              data-testid="input-stats-history-line-chart"
              onMouseLeave={() => {
                setHoveredIndex(null)
              }}
            >
              <div className="input-stats-history__chart-stage">
                <svg
                  className="input-stats-history__svg"
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {[0, 0.25, 0.5, 0.75, 1].map(value => {
                    const y = paddingTop + value * plotHeight
                    return (
                      <line
                        key={`grid-${value}`}
                        className="input-stats-history__grid-line"
                        x1={paddingLeft}
                        x2={chartWidth - paddingRight}
                        y1={y}
                        y2={y}
                      />
                    )
                  })}

                  {renderedPathLayers.map(series => (
                    <path
                      key={`path-${series.key}`}
                      className="input-stats-history__path"
                      data-testid={`input-stats-history-path-${series.key}`}
                      d={series.path}
                      fill="none"
                      stroke={series.color}
                    />
                  ))}

                  {focusedPoint ? (
                    <line
                      className="input-stats-history__focus-line"
                      x1={focusedPoint.x}
                      x2={focusedPoint.x}
                      y1={paddingTop}
                      y2={chartHeight - paddingBottom}
                    />
                  ) : null}
                </svg>

                {baseSeries.map((item, index) => {
                  const currentX = referencePoints[index]?.x
                  if (currentX === undefined) {
                    return null
                  }

                  const previousX = index > 0 ? referencePoints[index - 1]?.x : undefined
                  const nextX =
                    index < referencePoints.length - 1 ? referencePoints[index + 1]?.x : undefined
                  const startX = previousX !== undefined ? (previousX + currentX) / 2 : paddingLeft
                  const endX =
                    nextX !== undefined ? (currentX + nextX) / 2 : chartWidth - paddingRight

                  return (
                    <button
                      key={item.day}
                      type="button"
                      className="input-stats-history__day-hitbox"
                      data-testid={`input-stats-history-day-${item.day}`}
                      aria-label={formatHistoryDay(item.day)}
                      style={{
                        left: `${(startX / chartWidth) * 100}%`,
                        width: `${((endX - startX) / chartWidth) * 100}%`,
                      }}
                      title={formatHistoryDay(item.day)}
                      onMouseEnter={() => {
                        if (isLineAnimating) {
                          return
                        }

                        setHoveredIndex(index)
                      }}
                      onFocus={() => {
                        if (isLineAnimating) {
                          return
                        }

                        setHoveredIndex(index)
                      }}
                      onBlur={() => {
                        setHoveredIndex(null)
                      }}
                    />
                  )
                })}

                {focusedPoint
                  ? focusedPoint.values.map(item => (
                      <span
                        key={`hover-dot-${item.metric}`}
                        className="input-stats-history__hover-dot"
                        style={
                          {
                            left: `${(focusedPoint.x / chartWidth) * 100}%`,
                            top: `${(item.y / chartHeight) * 100}%`,
                            ['--input-stats-history-dot-color' as string]: item.color,
                          } as React.CSSProperties
                        }
                      />
                    ))
                  : null}
              </div>

              {hoveredIndex !== null && focusedPoint ? (
                <div
                  className="input-stats-history__chart-tooltip"
                  data-testid="input-stats-history-tooltip"
                  style={{ left: `${tooltipLeft}%` }}
                >
                  <strong>{focusedPoint.label}</strong>
                  {focusedPoint.values.map(item => (
                    <span
                      key={`tooltip-${item.metric}`}
                      className="input-stats-history__chart-tooltip-row"
                    >
                      <i style={{ backgroundColor: item.color }} />
                      {t(`pluginManager.plugins.inputStats.historyMetricTabs.${item.metric}`)}:{' '}
                      {formatInputMetricValue(item.metric, item.rawValue, t)}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="input-stats-history__x-axis" aria-hidden="true">
                {sparseAxisLabels.map(label => (
                  <span key={`history-axis-${label}`}>{label}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="input-stats-history__chart-meta">
          <div className="input-stats-history__legend" data-testid="input-stats-history-legend">
            {visibleSeries.map(series => (
              <span key={series.metric} className="input-stats-history__legend-pill">
                <i
                  className="input-stats-history__legend-dot"
                  style={{ backgroundColor: series.color }}
                  aria-hidden="true"
                />
                {t(`pluginManager.plugins.inputStats.historyMetricTabs.${series.metric}`)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
