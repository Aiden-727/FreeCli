import React from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type {
  QuotaMonitorKeyProfileDto,
  QuotaMonitorProfileStateDto,
  QuotaMonitorSettingsDto,
  QuotaMonitorStateDto,
} from '@shared/contracts/dto'
import { getQuotaRingColor } from './quotaRing'

interface QuotaMonitorOverviewProps {
  isPluginEnabled: boolean
  settings: QuotaMonitorSettingsDto
  state: QuotaMonitorStateDto
  onRefresh: () => void
}

interface ProfileViewModel {
  profile: QuotaMonitorKeyProfileDto
  snapshot: QuotaMonitorProfileStateDto | null
}

interface TrendSeries {
  label: string
  color: string
  values: number[]
}

interface TrendPathLayer {
  key: string
  color: string
  path: string
}

interface TrendPointLayer {
  key: string
  color: string
  points: Array<{ x: number; y: number }>
}

type TrendCardVariant = 'default' | 'summary-line'
type TrendWindowUnit = 'hour' | 'day'

type QuotaMonitorTranslator = ReturnType<typeof useTranslation>['t']

const TOKEN_COLORS = ['#4f8cff', '#f08a24', '#19b38c', '#d94878', '#7d6dff', '#e0b100'] as const

function normalizeQuotaDisplayText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed === '--') {
    return null
  }

  const cleaned = trimmed.replaceAll(/[^0-9.+-]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed.toFixed(0) : trimmed
}

function formatPercent(ratio: number): string {
  return `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return '--'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function buildProfileViewModels(
  settings: QuotaMonitorSettingsDto,
  state: QuotaMonitorStateDto,
): ProfileViewModel[] {
  const stateById = new Map(state.profiles.map(profile => [profile.profileId, profile]))

  return settings.keyProfiles
    .filter(profile => profile.enabled)
    .map(profile => ({
      profile,
      snapshot: stateById.get(profile.id) ?? null,
    }))
}

function isPendingSnapshot(snapshot: QuotaMonitorProfileStateDto | null): boolean {
  return snapshot?.error?.message === '尚未获取'
}

function resolveRemainQuotaDisplay(snapshot: QuotaMonitorProfileStateDto | null): string {
  if (!snapshot || isPendingSnapshot(snapshot)) {
    return '--'
  }

  return (
    normalizeQuotaDisplayText(snapshot.remainQuotaIntDisplay) ??
    normalizeQuotaDisplayText(snapshot.remainQuotaDisplay) ??
    (snapshot.lastFetchedAt !== null && snapshot.error === null
      ? Math.max(0, snapshot.remainQuotaValue).toFixed(0)
      : '--')
  )
}

function formatHoursDurationLabel(hours: number | null, t: QuotaMonitorTranslator): string {
  if (hours === null || Number.isNaN(hours) || !Number.isFinite(hours)) {
    return '--'
  }

  const totalMinutes = Math.round(hours * 60)
  if (totalMinutes <= 0) {
    return '--'
  }

  const roundedHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (roundedHours > 9999) {
    return t('pluginManager.plugins.quotaMonitor.formats.durationHoursMax', {
      value: 9999,
    })
  }

  return t('pluginManager.plugins.quotaMonitor.formats.durationHoursMinutes', {
    hours: roundedHours,
    minutes,
  })
}

function formatCountLabel(value: number, t: QuotaMonitorTranslator): string {
  if (!Number.isFinite(value)) {
    return '--'
  }

  return t('pluginManager.plugins.quotaMonitor.formats.callCount', {
    value: Math.max(0, Math.round(value)),
  })
}

function formatQuotaLabel(value: number): string {
  return Number.isFinite(value) ? Math.max(0, value).toFixed(0) : '--'
}

function formatAverageQuotaLabel(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '--'
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function formatTokenCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '--'
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`
  }

  return value.toFixed(0)
}

function formatTokenCompactWithZero(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    return '--'
  }

  if (value === 0) {
    return '0'
  }

  return formatTokenCompact(value)
}

function formatTrendValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }

  return value.toFixed(0)
}

function formatTrendTooltipValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '--'
  }

  const rounded = Math.round(value)
  if (Math.abs(value - rounded) < 0.001) {
    return rounded.toLocaleString()
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function createTrendPolylinePoints(
  values: number[],
  maxValue: number,
  width: number,
  height: number,
  paddingLeft: number,
  paddingRight: number,
  paddingTop: number,
  paddingBottom: number,
): string {
  if (values.length === 0) {
    return ''
  }

  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom
  const stepX = values.length > 1 ? plotWidth / (values.length - 1) : 0

  return values
    .map((value, index) => {
      const x = paddingLeft + stepX * index
      const y = paddingTop + plotHeight - (Math.max(0, value) / maxValue) * plotHeight
      return `${x},${y}`
    })
    .join(' ')
}

function createTrendPlotPoints(
  values: number[],
  maxValue: number,
  width: number,
  height: number,
  paddingLeft: number,
  paddingRight: number,
  paddingTop: number,
  paddingBottom: number,
): Array<{ x: number; y: number }> {
  if (values.length === 0) {
    return []
  }

  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom
  const stepX = values.length > 1 ? plotWidth / (values.length - 1) : 0

  return values.map((value, index) => ({
    x: paddingLeft + stepX * index,
    y: paddingTop + plotHeight - (Math.max(0, value) / maxValue) * plotHeight,
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

function sampleTrendYAtX(points: Array<{ x: number; y: number }>, targetX: number): number {
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

function alignTrendPointsToReferenceX(
  points: Array<{ x: number; y: number }>,
  referencePoints: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  return referencePoints.map(point => ({
    x: point.x,
    y: sampleTrendYAtX(points, point.x),
  }))
}

function createBaselineTrendPoints(
  referencePoints: Array<{ x: number; y: number }>,
  baselineY: number,
): Array<{ x: number; y: number }> {
  return referencePoints.map(point => ({
    x: point.x,
    y: baselineY,
  }))
}

function createInterpolatedTrendPoints(
  fromPoints: Array<{ x: number; y: number }>,
  toPoints: Array<{ x: number; y: number }>,
  progress: number,
): Array<{ x: number; y: number }> {
  const referencePoints = toPoints.length > 0 ? toPoints : fromPoints
  if (referencePoints.length === 0) {
    return []
  }

  const normalizedFrom = alignTrendPointsToReferenceX(fromPoints, referencePoints)
  const normalizedTo = alignTrendPointsToReferenceX(toPoints, referencePoints)

  return referencePoints.map((referencePoint, index) => {
    const source =
      normalizedFrom[index] ?? normalizedFrom[normalizedFrom.length - 1] ?? referencePoint
    const target = normalizedTo[index] ?? normalizedTo[normalizedTo.length - 1] ?? referencePoint
    return {
      x: referencePoint.x,
      y: source.y + (target.y - source.y) * progress,
    }
  })
}

function createTrendTickValues(maxValue: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => {
    const ratio = (count - 1 - index) / Math.max(1, count - 1)
    return Math.round(maxValue * ratio)
  })
}

function getNiceTrendMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1
  }

  const scaled = value * 1.12
  const magnitude = 10 ** Math.floor(Math.log10(scaled))
  const normalized = scaled / magnitude

  if (normalized <= 1) {
    return magnitude
  }

  if (normalized <= 2) {
    return 2 * magnitude
  }

  if (normalized <= 5) {
    return 5 * magnitude
  }

  return 10 * magnitude
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

  return [...indices].sort((left, right) => left - right).map(index => labels[index])
}

function sliceTrendSeries(series: TrendSeries[], count: number): TrendSeries[] {
  return series.map(item => ({
    ...item,
    values: item.values.slice(-count),
  }))
}

function formatTopUpLabel(
  minutes: number | null,
  amount: number | null,
  t: QuotaMonitorTranslator,
): string {
  if (minutes === null || amount === null || amount <= 0) {
    return '--'
  }

  return t('pluginManager.plugins.quotaMonitor.formats.nextTopUp', {
    amount: formatQuotaLabel(amount),
    minutes,
  })
}

function formatRemainingDaysLabel(
  expiredTimeFormatted: string | null | undefined,
  t: QuotaMonitorTranslator,
): string {
  if (typeof expiredTimeFormatted !== 'string' || expiredTimeFormatted.trim().length === 0) {
    return '--'
  }

  const normalized = expiredTimeFormatted.trim().replace(' ', 'T')
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return '--'
  }

  const remainingSeconds = Math.floor((parsed.getTime() - Date.now()) / 1000)
  if (remainingSeconds <= 0) {
    return t('pluginManager.plugins.quotaMonitor.formats.expired')
  }

  return t('pluginManager.plugins.quotaMonitor.formats.remainingDays', {
    value: Math.ceil(remainingSeconds / 86400),
  })
}

function resolveRemainingDaysLabel(
  snapshot: QuotaMonitorProfileStateDto | null,
  t: QuotaMonitorTranslator,
): string {
  if (!snapshot || isPendingSnapshot(snapshot)) {
    return '--'
  }

  if (
    typeof snapshot.remainingDaysLabel === 'string' &&
    snapshot.remainingDaysLabel.trim().length > 0
  ) {
    return snapshot.remainingDaysLabel.trim()
  }

  return formatRemainingDaysLabel(snapshot.expiredTimeFormatted, t)
}

function formatEstimatedWorkHoursLabel(
  snapshot: QuotaMonitorProfileStateDto | null,
  t: QuotaMonitorTranslator,
): string {
  const hoursLabel = formatHoursDurationLabel(snapshot?.estimatedRemainingHours ?? null, t)
  return hoursLabel !== '--' ? hoursLabel : '--'
}

function resolveAverageQuotaPerCall(snapshot: QuotaMonitorProfileStateDto | null): number | null {
  if (!snapshot || isPendingSnapshot(snapshot)) {
    return null
  }

  if (Number.isFinite(snapshot.averageQuotaPerCall) && snapshot.averageQuotaPerCall > 0) {
    return snapshot.averageQuotaPerCall
  }

  if (
    snapshot.todayUsageCount > 0 &&
    Number.isFinite(snapshot.todayUsedQuota) &&
    snapshot.todayUsedQuota > 0
  ) {
    return snapshot.todayUsedQuota / snapshot.todayUsageCount
  }

  return null
}

function QuotaRing({ ratio }: { ratio: number }): React.JSX.Element {
  const clampedRatio = Math.max(0, Math.min(1, ratio))
  const radius = 48
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clampedRatio)
  const color = getQuotaRingColor(clampedRatio)

  return (
    <div className="quota-monitor-overview__ring" aria-hidden="true">
      <svg viewBox="0 0 120 120">
        <circle
          className="quota-monitor-overview__ring-track"
          cx="60"
          cy="60"
          r={radius}
          strokeWidth="10"
        />
        <circle
          className="quota-monitor-overview__ring-fill"
          cx="60"
          cy="60"
          r={radius}
          strokeWidth="10"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span style={{ color }}>{formatPercent(clampedRatio)}</span>
    </div>
  )
}

function QuotaHeroCard({
  profile,
  snapshot,
  accent,
}: {
  profile: QuotaMonitorKeyProfileDto
  snapshot: QuotaMonitorProfileStateDto | null
  accent: string
}): React.JSX.Element {
  const { t } = useTranslation()
  const hasError = snapshot?.error && !isPendingSnapshot(snapshot)
  const remainingDaysLabel = resolveRemainingDaysLabel(snapshot, t)

  return (
    <article
      className={`quota-monitor-overview__hero-card${hasError ? ' quota-monitor-overview__hero-card--error' : ''}`}
    >
      <div className="quota-monitor-overview__hero-head">
        <div>
          <span className="quota-monitor-overview__hero-kicker">{profile.label}</span>
          <h5>{snapshot?.tokenName ?? profile.label}</h5>
          <div className="quota-monitor-overview__hero-status-line">
            <p>
              {snapshot?.statusText ?? t('pluginManager.plugins.quotaMonitor.profileState.pending')}
            </p>
            {remainingDaysLabel !== '--' ? (
              <span className="quota-monitor-overview__hero-status-meta">{remainingDaysLabel}</span>
            ) : null}
          </div>
        </div>
        <span className="quota-monitor-overview__hero-type" style={{ borderColor: accent }}>
          {profile.type === 'capped'
            ? t('pluginManager.plugins.quotaMonitor.keyTypeCapped')
            : t('pluginManager.plugins.quotaMonitor.keyTypeNormal')}
        </span>
      </div>

      <div className="quota-monitor-overview__hero-body">
        <QuotaRing ratio={snapshot?.remainRatio ?? 0} />

        <div className="quota-monitor-overview__hero-primary">
          <div className="quota-monitor-overview__hero-primary-meta">
            <span className="quota-monitor-overview__hero-primary-label">
              {t('pluginManager.plugins.quotaMonitor.metrics.remainQuota')}
            </span>
            <strong>{resolveRemainQuotaDisplay(snapshot)}</strong>
          </div>
          <div className="quota-monitor-overview__hero-primary-stats">
            <p className="quota-monitor-overview__hero-primary-stat">
              <span className="quota-monitor-overview__hero-primary-stat-label">
                {t('pluginManager.plugins.quotaMonitor.metrics.estimatedWorkHours')}
              </span>
              <span className="quota-monitor-overview__hero-primary-stat-value">
                {formatEstimatedWorkHoursLabel(snapshot, t)}
              </span>
            </p>
          </div>
        </div>
      </div>

      {profile.type === 'capped' ? (
        <footer className="quota-monitor-overview__hero-footer">
          {snapshot?.cappedInsight
            ? formatTopUpLabel(
                snapshot.cappedInsight.nextTopUpInMinutes,
                snapshot.cappedInsight.nextTopUpAmount,
                t,
              )
            : '--'}
        </footer>
      ) : null}

      {hasError ? (
        <p className="quota-monitor-overview__card-alert">
          {snapshot?.error?.message ?? t('pluginManager.plugins.quotaMonitor.profileState.error')}
        </p>
      ) : null}
    </article>
  )
}

function ModelStatsCard({
  profile,
  snapshot,
}: {
  profile: QuotaMonitorKeyProfileDto
  snapshot: QuotaMonitorProfileStateDto | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const summary = snapshot?.modelUsageSummary

  return (
    <article className="quota-monitor-overview__model-card">
      <div className="quota-monitor-overview__model-head">
        <div>
          <span className="quota-monitor-overview__hero-kicker">
            {t('pluginManager.plugins.quotaMonitor.modelStats.title')}
          </span>
        </div>
        <strong>{summary ? formatTokenCompact(summary.todayTokens) : '--'}</strong>
      </div>

      <div className="quota-monitor-overview__model-table">
        <div className="quota-monitor-overview__model-row quota-monitor-overview__model-row--head">
          <span>{t('pluginManager.plugins.quotaMonitor.modelStats.model')}</span>
          <span>{t('pluginManager.plugins.quotaMonitor.modelStats.today')}</span>
          <span>{t('pluginManager.plugins.quotaMonitor.modelStats.total')}</span>
          <span>{t('pluginManager.plugins.quotaMonitor.modelStats.average')}</span>
        </div>
        {(summary?.models ?? []).map(metric => (
          <div
            key={`${profile.id}-${metric.modelName}`}
            className="quota-monitor-overview__model-row"
          >
            <span>{metric.modelName}</span>
            <span>{formatTokenCompactWithZero(metric.todayTokens)}</span>
            <span>{formatTokenCompact(metric.totalTokens)}</span>
            <span>{formatTokenCompact(metric.averageDailyTokens)}</span>
          </div>
        ))}
        {!summary || summary.models.length === 0 ? (
          <div className="quota-monitor-overview__model-empty">
            {t('pluginManager.plugins.quotaMonitor.modelStats.empty')}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function renderGridLines(width: number, height: number, padding: number): React.JSX.Element[] {
  const lines: React.JSX.Element[] = []
  const steps = 4
  const innerHeight = height - padding * 2

  for (let index = 0; index <= steps; index += 1) {
    const y = padding + (innerHeight * index) / steps
    lines.push(
      <line
        key={`grid-line-${index}`}
        className="quota-monitor-overview__trend-grid-line"
        x1={padding}
        x2={width - padding}
        y1={y}
        y2={y}
      />,
    )
  }

  return lines
}

function TrendCard({
  title,
  summary,
  labels,
  series,
  testId,
  variant = 'default',
  windowOptions,
  windowUnit,
  defaultWindow,
}: {
  title: string
  summary: string
  labels: string[]
  series: TrendSeries[]
  testId: string
  variant?: TrendCardVariant
  windowOptions?: number[]
  windowUnit?: TrendWindowUnit
  defaultWindow?: number
}): React.JSX.Element {
  const { t } = useTranslation()
  const width = 480
  const height = 220
  const padding = 18
  const summaryWidth = 720
  const summaryHeight = 236
  const summaryPaddingLeft = 42
  const summaryPaddingRight = 14
  const summaryPaddingTop = 16
  const summaryPaddingBottom = 28
  const summaryGridLines = 4
  const [selectedWindow, setSelectedWindow] = React.useState<number | null>(defaultWindow ?? null)
  const [isLineAnimating, setIsLineAnimating] = React.useState(false)
  const [animatedPointLayers, setAnimatedPointLayers] = React.useState<TrendPointLayer[] | null>(
    null,
  )
  const animationSourceRef = React.useRef<TrendPointLayer[] | null>(null)
  const animationFrameRef = React.useRef<number | null>(null)
  const effectiveWindow =
    windowOptions && windowOptions.length > 0
      ? selectedWindow && windowOptions.includes(selectedWindow)
        ? selectedWindow
        : defaultWindow && windowOptions.includes(defaultWindow)
          ? defaultWindow
          : windowOptions[windowOptions.length - 1]
      : null
  const visibleLabels = effectiveWindow !== null ? labels.slice(-effectiveWindow) : labels
  const visibleSeries =
    effectiveWindow !== null ? sliceTrendSeries(series, effectiveWindow) : series
  const activeSeries = visibleSeries.filter(item => item.values.some(value => value > 0))
  const maxValue = Math.max(
    0,
    ...activeSeries.flatMap(item => item.values).filter(value => Number.isFinite(value)),
  )
  const chartMaxValue =
    variant === 'summary-line' ? getNiceTrendMax(maxValue) : Math.max(1, maxValue)
  const tickValues =
    variant === 'summary-line' ? createTrendTickValues(chartMaxValue, summaryGridLines) : []
  const sparseAxisLabels =
    variant === 'summary-line' ? createSparseAxisLabels(visibleLabels, 6) : visibleLabels
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null)
  React.useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  React.useEffect(() => {
    if (!windowOptions || windowOptions.length === 0) {
      return
    }

    const fallbackWindow =
      defaultWindow && windowOptions.includes(defaultWindow)
        ? defaultWindow
        : windowOptions[windowOptions.length - 1]
    setSelectedWindow(previous =>
      previous && windowOptions.includes(previous) ? previous : fallbackWindow,
    )
  }, [defaultWindow, windowOptions])

  React.useEffect(() => {
    setHoveredIndex(null)
  }, [effectiveWindow])
  const summarySeriesPoints = React.useMemo(
    () =>
      variant === 'summary-line'
        ? activeSeries.map(item => ({
            ...item,
            points: createTrendPlotPoints(
              item.values,
              chartMaxValue,
              summaryWidth,
              summaryHeight,
              summaryPaddingLeft,
              summaryPaddingRight,
              summaryPaddingTop,
              summaryPaddingBottom,
            ),
          }))
        : [],
    [
      activeSeries,
      chartMaxValue,
      summaryHeight,
      summaryPaddingBottom,
      summaryPaddingLeft,
      summaryPaddingRight,
      summaryPaddingTop,
      summaryWidth,
      variant,
    ],
  )
  const currentPointLayers =
    React.useMemo(
      () =>
        variant === 'summary-line'
          ? summarySeriesPoints.map(item => ({
              key: item.label,
              color: item.color,
              points: item.points,
            }))
          : [],
      [summarySeriesPoints, variant],
    )
  const renderedPathLayers =
    variant === 'summary-line'
      ? (animatedPointLayers ?? currentPointLayers)
          .map(item => {
            const path = createSmoothTrendPath(item.points)
            return path.length > 0
              ? {
                  key: item.key,
                  color: item.color,
                  path,
                }
              : null
          })
          .filter((item): item is TrendPathLayer => item !== null)
      : []

  React.useEffect(() => {
    if (variant !== 'summary-line') {
      return
    }

    const sourceLayers = animationSourceRef.current
    if (!sourceLayers) {
      return
    }

    animationSourceRef.current = null

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
    }

    const baselineY = summaryHeight - summaryPaddingBottom
    const targetLayersByKey = new Map(currentPointLayers.map(layer => [layer.key, layer]))
    const sourceLayersByKey = new Map(sourceLayers.map(layer => [layer.key, layer]))
    const mergedKeys = new Set([...sourceLayersByKey.keys(), ...targetLayersByKey.keys()])
    const animationLayers = [...mergedKeys].map(key => {
      const sourceLayer = sourceLayersByKey.get(key) ?? null
      const targetLayer = targetLayersByKey.get(key) ?? null
      const referencePoints = targetLayer?.points ?? sourceLayer?.points ?? []

      return {
        key,
        color: targetLayer?.color ?? sourceLayer?.color ?? TOKEN_COLORS[0],
        fromPoints: sourceLayer?.points ?? createBaselineTrendPoints(referencePoints, baselineY),
        toPoints: targetLayer?.points ?? createBaselineTrendPoints(referencePoints, baselineY),
      }
    })

    if (animationLayers.length === 0) {
      setAnimatedPointLayers(null)
      setIsLineAnimating(false)
      return
    }

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
          points: createInterpolatedTrendPoints(layer.fromPoints, layer.toPoints, easedProgress),
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
  }, [currentPointLayers, summaryHeight, summaryPaddingBottom, variant])
  const hoveredPoint =
    hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < visibleLabels.length
      ? {
          label: visibleLabels[hoveredIndex],
          x: summarySeriesPoints[0]?.points[hoveredIndex]?.x ?? summaryPaddingLeft,
          values: summarySeriesPoints.map(item => ({
            label: item.label,
            color: item.color,
            value: item.values[hoveredIndex] ?? 0,
            y: item.points[hoveredIndex]?.y ?? summaryPaddingTop,
          })),
        }
      : null

  return (
    <article
      className={`quota-monitor-overview__panel quota-monitor-overview__panel--trend${variant === 'summary-line' ? ' quota-monitor-overview__panel--summary-trend' : ''}`}
      data-testid={testId}
    >
      <div className="quota-monitor-overview__panel-head">
        <div>
          <span className="quota-monitor-overview__panel-kicker">{title}</span>
          {summary.trim().length > 0 ? <h5>{summary}</h5> : null}
        </div>
        <div className="quota-monitor-overview__panel-actions">
          {variant === 'summary-line' && activeSeries.length <= 1 ? null : (
            <div className="quota-monitor-overview__trend-legend">
              {activeSeries.slice(0, 3).map(item => (
                <span
                  key={`${testId}-${item.label}`}
                  className="quota-monitor-overview__trend-legend-item"
                >
                  <i style={{ backgroundColor: item.color }} />
                  {item.label}
                </span>
              ))}
            </div>
          )}
          {windowOptions && windowOptions.length > 0 && windowUnit ? (
            <div className="quota-monitor-overview__range-selector">
              {windowOptions.map(option => (
                <button
                  key={`${testId}-window-${option}`}
                  type="button"
                  className={`quota-monitor-overview__range-pill${selectedWindow === option ? ' quota-monitor-overview__range-pill--active' : ''}`}
                  onClick={() => {
                    if (option === effectiveWindow) {
                      return
                    }

                    setHoveredIndex(null)
                    if (variant === 'summary-line') {
                      animationSourceRef.current = currentPointLayers
                    }

                    setSelectedWindow(option)
                  }}
                >
                  {windowUnit === 'hour'
                    ? t('pluginManager.plugins.quotaMonitor.trends.rangeHours', { value: option })
                    : t('pluginManager.plugins.quotaMonitor.trends.rangeDays', { value: option })}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {visibleLabels.length > 1 && activeSeries.length > 0 && maxValue > 0 ? (
        variant === 'summary-line' ? (
          <div className="quota-monitor-overview__summary-trend-shell">
            <div className="quota-monitor-overview__summary-trend-y-axis">
              {tickValues.map(value => (
                <span key={`${testId}-tick-${value}`}>{formatTrendValue(value)}</span>
              ))}
            </div>
            <div
              className="quota-monitor-overview__summary-trend-chart"
              onMouseLeave={() => {
                setHoveredIndex(null)
              }}
            >
              <div className="quota-monitor-overview__summary-trend-stage">
                <svg
                  className="quota-monitor-overview__summary-trend-svg"
                  viewBox={`0 0 ${summaryWidth} ${summaryHeight}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {tickValues.map(value => {
                    const ratio = value / chartMaxValue
                    const plotHeight = summaryHeight - summaryPaddingTop - summaryPaddingBottom
                    const y = summaryPaddingTop + plotHeight - ratio * plotHeight
                    return (
                      <line
                        key={`${testId}-grid-${value}-${Math.round(y)}`}
                        className="quota-monitor-overview__summary-trend-grid-line"
                        x1={summaryPaddingLeft}
                        x2={summaryWidth - summaryPaddingRight}
                        y1={y}
                        y2={y}
                      />
                    )
                  })}
                  {renderedPathLayers.map(item => (
                    <path
                      key={`${testId}-summary-line-${item.key}`}
                      className="quota-monitor-overview__summary-trend-path"
                      d={item.path}
                      stroke={item.color}
                      fill="none"
                    />
                  ))}
                  {hoveredPoint ? (
                    <line
                      className="quota-monitor-overview__summary-trend-hover-line"
                      x1={hoveredPoint.x}
                      x2={hoveredPoint.x}
                      y1={summaryPaddingTop}
                      y2={summaryHeight - summaryPaddingBottom}
                    />
                  ) : null}
                  {visibleLabels.map((label, index) => {
                    const currentX = summarySeriesPoints[0]?.points[index]?.x
                    if (currentX === undefined) {
                      return null
                    }

                    const previousX =
                      index > 0 ? summarySeriesPoints[0]?.points[index - 1]?.x : undefined
                    const nextX =
                      index < visibleLabels.length - 1
                        ? summarySeriesPoints[0]?.points[index + 1]?.x
                        : undefined
                    const startX =
                      previousX !== undefined ? (previousX + currentX) / 2 : summaryPaddingLeft
                    const endX =
                      nextX !== undefined
                        ? (currentX + nextX) / 2
                        : summaryWidth - summaryPaddingRight

                    return (
                      <rect
                        key={`${testId}-hover-zone-${label}-${Math.round(startX)}-${Math.round(endX)}`}
                        className="quota-monitor-overview__summary-trend-hit-area"
                        x={startX}
                        y={summaryPaddingTop}
                        width={Math.max(1, endX - startX)}
                        height={summaryHeight - summaryPaddingTop - summaryPaddingBottom}
                        onMouseEnter={() => {
                          if (isLineAnimating) {
                            return
                          }

                          setHoveredIndex(index)
                        }}
                      />
                    )
                  })}
                </svg>
                {hoveredPoint
                  ? hoveredPoint.values.map(item => (
                      <span
                        key={`${testId}-hover-dot-${item.label}`}
                        className="quota-monitor-overview__summary-trend-hover-dot"
                        style={
                          {
                            left: `${(hoveredPoint.x / summaryWidth) * 100}%`,
                            top: `${(item.y / summaryHeight) * 100}%`,
                            ['--quota-trend-dot-color' as string]: item.color,
                          } as React.CSSProperties
                        }
                      />
                    ))
                  : null}
              </div>
              {hoveredPoint ? (
                <div
                  className="quota-monitor-overview__summary-trend-tooltip"
                  style={{ left: `${(hoveredPoint.x / summaryWidth) * 100}%` }}
                >
                  <strong>{hoveredPoint.label}</strong>
                  {hoveredPoint.values.map(item => (
                    <span key={`${testId}-tooltip-${item.label}`}>
                      <i style={{ backgroundColor: item.color }} />
                      {item.label}: {formatTrendTooltipValue(item.value)}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="quota-monitor-overview__summary-trend-x-axis">
                {sparseAxisLabels.map(label => (
                  <span key={`${testId}-summary-label-${label}`}>{label}</span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="quota-monitor-overview__trend-chart">
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
              {renderGridLines(width, height, padding)}
              {activeSeries.map(item => (
                <polyline
                  key={`${testId}-line-${item.label}`}
                  fill="none"
                  stroke={item.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={createTrendPolylinePoints(
                    item.values,
                    chartMaxValue,
                    width,
                    height,
                    padding,
                    padding,
                    padding,
                    padding,
                  )}
                />
              ))}
            </svg>
            <div className="quota-monitor-overview__trend-axis">
              {visibleLabels.map(label => (
                <span key={`${testId}-label-${label}`}>{label}</span>
              ))}
            </div>
            <div className="quota-monitor-overview__trend-footer">
              <strong>{t('pluginManager.plugins.quotaMonitor.trends.peakLabel')}</strong>
              <span>{formatTrendValue(maxValue)}</span>
            </div>
          </div>
        )
      ) : (
        <div className="quota-monitor-overview__model-empty">
          {t('pluginManager.plugins.quotaMonitor.trends.empty')}
        </div>
      )}
    </article>
  )
}

function buildTokenTrendSeries(
  trend:
    | QuotaMonitorProfileStateDto['dailyTokenTrend']
    | QuotaMonitorProfileStateDto['hourlyTokenTrend'],
): TrendSeries[] {
  return Object.entries(trend.seriesByModel)
    .sort(
      (left, right) =>
        right[1].reduce((sum, value) => sum + value, 0) -
        left[1].reduce((sum, value) => sum + value, 0),
    )
    .slice(0, 3)
    .map(([modelName, values], index) => ({
      label: modelName,
      color: TOKEN_COLORS[index % TOKEN_COLORS.length],
      values,
    }))
}

function TrendSection({
  snapshot,
}: {
  snapshot: QuotaMonitorProfileStateDto | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const hourlyTrend = snapshot?.hourlyTrend ?? []
  const dailyTrend = snapshot?.dailyTrend ?? []
  const hourlyTokenTrend = snapshot?.hourlyTokenTrend ?? { labels: [], seriesByModel: {} }
  const dailyTokenTrend = snapshot?.dailyTokenTrend ?? { labels: [], seriesByModel: {} }

  return (
    <div className="quota-monitor-overview__trend-grid" data-testid="quota-monitor-trend-grid">
      <TrendCard
        title={t('pluginManager.plugins.quotaMonitor.trends.hourlyQuotaTitle')}
        summary=""
        labels={hourlyTrend.map(point => point.label)}
        series={[
          {
            label: t('pluginManager.plugins.quotaMonitor.metrics.usedQuota'),
            color: TOKEN_COLORS[0],
            values: hourlyTrend.map(point => point.quota),
          },
        ]}
        testId="quota-monitor-hourly-quota-trend"
        variant="summary-line"
        windowOptions={[6, 12, 24]}
        windowUnit="hour"
        defaultWindow={24}
      />
      <TrendCard
        title={t('pluginManager.plugins.quotaMonitor.trends.dailyQuotaTitle')}
        summary=""
        labels={dailyTrend.map(point => point.label)}
        series={[
          {
            label: t('pluginManager.plugins.quotaMonitor.metrics.usedQuota'),
            color: TOKEN_COLORS[1],
            values: dailyTrend.map(point => point.quota),
          },
        ]}
        testId="quota-monitor-daily-quota-trend"
        variant="summary-line"
        windowOptions={[3, 7, 15, 30]}
        windowUnit="day"
        defaultWindow={30}
      />
      <TrendCard
        title={t('pluginManager.plugins.quotaMonitor.trends.hourlyTokenTitle')}
        summary=""
        labels={hourlyTokenTrend.labels}
        series={buildTokenTrendSeries(hourlyTokenTrend)}
        testId="quota-monitor-hourly-token-trend"
        variant="summary-line"
        windowOptions={[6, 12, 24]}
        windowUnit="hour"
        defaultWindow={24}
      />
      <TrendCard
        title={t('pluginManager.plugins.quotaMonitor.trends.dailyTokenTitle')}
        summary=""
        labels={dailyTokenTrend.labels}
        series={buildTokenTrendSeries(dailyTokenTrend)}
        testId="quota-monitor-daily-token-trend"
        variant="summary-line"
        windowOptions={[3, 7, 15, 30]}
        windowUnit="day"
        defaultWindow={30}
      />
    </div>
  )
}

function UsageSummaryGrid({
  snapshot,
}: {
  snapshot: QuotaMonitorProfileStateDto | null
}): React.JSX.Element {
  const { t } = useTranslation()
  const summary = snapshot?.modelUsageSummary ?? null
  const cards = [
    {
      label: t('pluginManager.plugins.quotaMonitor.metrics.usedQuota'),
      value: snapshot?.todayUsedQuotaIntDisplay ?? '--',
    },
    {
      label: t('pluginManager.plugins.quotaMonitor.metrics.usageCount'),
      value: snapshot ? formatCountLabel(snapshot.todayUsageCount, t) : '--',
    },
    {
      label: t('pluginManager.plugins.quotaMonitor.metrics.avgQuota'),
      value: formatAverageQuotaLabel(resolveAverageQuotaPerCall(snapshot) ?? Number.NaN),
    },
    {
      label: t('pluginManager.plugins.quotaMonitor.metrics.todayTokens'),
      value: summary ? formatTokenCompact(summary.todayTokens) : '--',
    },
    {
      label: t('pluginManager.plugins.quotaMonitor.modelStats.totalTokens'),
      value: summary ? formatTokenCompact(summary.totalTokens) : '--',
    },
  ]

  return (
    <div className="quota-monitor-overview__summary-grid" data-testid="quota-monitor-usage-grid">
      {cards.map(card => (
        <article key={card.label} className="quota-monitor-overview__summary-card">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </div>
  )
}

export function QuotaMonitorOverview({
  isPluginEnabled,
  settings,
  state,
  onRefresh,
}: QuotaMonitorOverviewProps): React.JSX.Element {
  const { t } = useTranslation()
  const profileViewModels = React.useMemo(
    () => buildProfileViewModels(settings, state),
    [settings, state],
  )
  const [selectedProfileId, setSelectedProfileId] = React.useState<string | null>(
    profileViewModels[0]?.profile.id ?? null,
  )

  React.useEffect(() => {
    if (
      !selectedProfileId ||
      !profileViewModels.some(item => item.profile.id === selectedProfileId)
    ) {
      setSelectedProfileId(profileViewModels[0]?.profile.id ?? null)
    }
  }, [profileViewModels, selectedProfileId])

  const selectedProfileViewModel =
    profileViewModels.find(item => item.profile.id === selectedProfileId) ??
    profileViewModels[0] ??
    null
  const selectedProfileIndex = selectedProfileViewModel
    ? Math.max(
        0,
        profileViewModels.findIndex(
          item => item.profile.id === selectedProfileViewModel.profile.id,
        ),
      )
    : 0

  const statusText = t(`pluginManager.plugins.quotaMonitor.runtimeStatus.${state.status}`)

  return (
    <section className="quota-monitor-overview" data-testid="quota-monitor-overview">
      <div className="quota-monitor-overview__header">
        <div className="quota-monitor-overview__headline">
          <h4>{t('pluginManager.plugins.quotaMonitor.overviewTitle')}</h4>
        </div>

        <div className="quota-monitor-overview__toolbar">
          <span
            className={`quota-monitor-overview__status-pill quota-monitor-overview__status-pill--${state.status}`}
          >
            {statusText}
          </span>
          <span className="quota-monitor-overview__meta-pill">
            {t('pluginManager.plugins.quotaMonitor.lastUpdated', {
              value: formatDateTime(state.lastUpdatedAt),
            })}
          </span>
          <button
            type="button"
            className="cove-window__action cove-window__action--secondary quota-monitor-overview__refresh"
            data-testid="quota-monitor-refresh"
            disabled={!isPluginEnabled || state.isRefreshing}
            onClick={() => {
              onRefresh()
            }}
          >
            <RefreshCw size={14} />
            <span>
              {state.isRefreshing
                ? t('pluginManager.plugins.quotaMonitor.refreshing')
                : t('pluginManager.plugins.quotaMonitor.refreshNow')}
            </span>
          </button>
        </div>
      </div>

      {state.lastError && state.status !== 'needs_config' ? (
        <div className="quota-monitor-overview__banner quota-monitor-overview__banner--error">
          <strong>{t('pluginManager.plugins.quotaMonitor.profileState.error')}</strong>
          <span>{state.lastError.message}</span>
        </div>
      ) : null}

      {profileViewModels.length > 1 ? (
        <div
          className="quota-monitor-overview__profile-switcher-bar"
          data-testid="quota-monitor-profile-switcher"
        >
          <div className="quota-monitor-overview__profile-switcher">
            {profileViewModels.map(item => (
              <button
                key={`quota-profile-${item.profile.id}`}
                type="button"
                className={`quota-monitor-overview__range-pill${selectedProfileViewModel?.profile.id === item.profile.id ? ' quota-monitor-overview__range-pill--active' : ''}`}
                onClick={() => {
                  setSelectedProfileId(item.profile.id)
                }}
              >
                {item.profile.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selectedProfileViewModel ? (
        <div className="quota-monitor-overview__profile-grid" data-testid="quota-monitor-hero">
          <QuotaHeroCard
            profile={selectedProfileViewModel.profile}
            snapshot={selectedProfileViewModel.snapshot}
            accent={TOKEN_COLORS[selectedProfileIndex % TOKEN_COLORS.length]}
          />
          <ModelStatsCard
            profile={selectedProfileViewModel.profile}
            snapshot={selectedProfileViewModel.snapshot}
          />
        </div>
      ) : null}

      {selectedProfileViewModel ? (
        <UsageSummaryGrid snapshot={selectedProfileViewModel.snapshot} />
      ) : (
        <div
          className="quota-monitor-overview__banner quota-monitor-overview__banner--empty"
          data-testid="quota-monitor-overview-empty"
        >
          <strong>{t('pluginManager.plugins.quotaMonitor.overviewEmptyTitle')}</strong>
          <span>{t('pluginManager.plugins.quotaMonitor.overviewEmptyBody')}</span>
        </div>
      )}

      {selectedProfileViewModel ? (
        <TrendSection snapshot={selectedProfileViewModel.snapshot} />
      ) : null}
    </section>
  )
}
