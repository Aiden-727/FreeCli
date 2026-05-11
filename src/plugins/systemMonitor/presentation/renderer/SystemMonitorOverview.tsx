import React from 'react'
import { Cpu, Download, HardDrive, RefreshCw, Upload } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { SystemMonitorStateDto } from '@shared/contracts/dto'
import { formatBytes, formatDateTime, formatPercent, formatSpeed } from './systemMonitorFormatting'

interface SystemMonitorOverviewProps {
  isPluginEnabled: boolean
  state: SystemMonitorStateDto
  onRefresh: () => void
}

interface MetricCardItem {
  icon: typeof Download
  label: string
  tone: 'network' | 'memory' | 'cpu' | 'gpu'
  value: React.ReactNode
}

interface TrendPoint {
  x: number
  y: number
}

interface TrafficTrendSeries {
  key: string
  label: string
  currentValue: string
  color: string
  values: number[]
}

function buildCurrentMetricItems(
  state: SystemMonitorStateDto,
  t: ReturnType<typeof useTranslation>['t'],
): MetricCardItem[] {
  return [
    {
      icon: Download,
      label: t('pluginManager.plugins.systemMonitor.metrics.networkSpeed'),
      tone: 'network',
      value: (
        <span
          className="system-monitor-overview__metric-dual"
          data-testid="system-monitor-network-speed-card"
        >
          <span className="system-monitor-overview__metric-dual-item">
            <Download size={14} />
            <span>{formatSpeed(state.current.downloadBytesPerSecond)}</span>
          </span>
          <span className="system-monitor-overview__metric-dual-item">
            <Upload size={14} />
            <span>{formatSpeed(state.current.uploadBytesPerSecond)}</span>
          </span>
        </span>
      ),
    },
    {
      icon: HardDrive,
      label: t('pluginManager.plugins.systemMonitor.metrics.memory'),
      tone: 'memory',
      value: formatPercent(state.current.memoryUsagePercent, t),
    },
    {
      icon: Cpu,
      label: t('pluginManager.plugins.systemMonitor.metrics.cpu'),
      tone: 'cpu',
      value: formatPercent(state.current.cpuUsagePercent, t),
    },
    {
      icon: HardDrive,
      label: t('pluginManager.plugins.systemMonitor.metrics.gpu'),
      tone: 'gpu',
      value:
        state.current.gpuUsagePercent === null
          ? t('pluginManager.plugins.systemMonitor.notAvailable')
          : formatPercent(state.current.gpuUsagePercent, t),
    },
  ]
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

function createTrendTickValues(maxValue: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => {
    const ratio = (count - 1 - index) / Math.max(1, count - 1)
    return Math.round(maxValue * ratio)
  })
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
): TrendPoint[] {
  if (values.length === 0) {
    return []
  }

  if (values.length === 1) {
    return [
      {
        x: paddingLeft + (width - paddingLeft - paddingRight) / 2,
        y: height - paddingBottom,
      },
    ]
  }

  const safeMaxValue = Math.max(1, maxValue)
  const plotWidth = width - paddingLeft - paddingRight
  const plotHeight = height - paddingTop - paddingBottom

  return values.map((value, index) => ({
    x: paddingLeft + (index / Math.max(1, values.length - 1)) * plotWidth,
    y: paddingTop + plotHeight - (Math.max(0, value) / safeMaxValue) * plotHeight,
  }))
}

function createSmoothTrendPath(points: TrendPoint[]): string {
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

interface TrafficTrendCardProps {
  testId: string
  title: string
  labels: string[]
  series: TrafficTrendSeries[]
}

function TrafficTrendCard({
  testId,
  title,
  labels,
  series,
}: TrafficTrendCardProps): React.JSX.Element {
  const width = 520
  const height = 236
  const paddingLeft = 10
  const paddingRight = 10
  const paddingTop = 12
  const paddingBottom = 24
  const activeSeries = series.filter(item => item.values.length > 0)
  const chartMaxValue = getNiceTrendMax(Math.max(0, ...activeSeries.flatMap(item => item.values)))
  const tickValues = createTrendTickValues(chartMaxValue, 4)
  const sparseAxisLabels = createSparseAxisLabels(labels, 4)
  const pathLayers = activeSeries.map(item => ({
    key: item.key,
    color: item.color,
    path: createSmoothTrendPath(
      createTrendPlotPoints(
        item.values,
        chartMaxValue,
        width,
        height,
        paddingLeft,
        paddingRight,
        paddingTop,
        paddingBottom,
      ),
    ),
  }))

  return (
    <article
      className="quota-monitor-overview__panel quota-monitor-overview__panel--trend system-monitor-overview__traffic-trend-card"
      data-testid={testId}
    >
      <div className="quota-monitor-overview__panel-head system-monitor-overview__traffic-trend-head">
        <div className="system-monitor-overview__traffic-trend-copy">
          <span className="quota-monitor-overview__panel-kicker">{title}</span>
        </div>
        <div className="quota-monitor-overview__panel-actions">
          <div className="quota-monitor-overview__trend-legend">
            {series.map(item => (
              <span
                key={`${testId}-${item.key}`}
                className="quota-monitor-overview__trend-legend-item"
              >
                <i style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="system-monitor-overview__traffic-trend-metrics">
        {series.map(item => (
          <div
            key={`${testId}-${item.key}-metric`}
            className="quota-monitor-overview__stat-chip system-monitor-overview__traffic-trend-metric"
          >
            <span>{item.label}</span>
            <strong>{item.currentValue}</strong>
          </div>
        ))}
      </div>
      <div className="quota-monitor-overview__summary-trend-shell">
        <div className="quota-monitor-overview__summary-trend-y-axis">
          {tickValues.map(value => (
            <span key={`${testId}-tick-${value}`}>{formatBytes(value)}</span>
          ))}
        </div>
        <div className="quota-monitor-overview__summary-trend-chart">
          <div className="quota-monitor-overview__summary-trend-stage">
            <svg
              className="quota-monitor-overview__summary-trend-svg"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {tickValues.map((value, index) => {
                const ratio = value / chartMaxValue
                const plotHeight = height - paddingTop - paddingBottom
                const y = paddingTop + plotHeight - ratio * plotHeight
                return (
                  <line
                    key={`${testId}-grid-${index}`}
                    className="quota-monitor-overview__summary-trend-grid-line"
                    x1={paddingLeft}
                    x2={width - paddingRight}
                    y1={y}
                    y2={y}
                  />
                )
              })}
              {pathLayers.map(item => (
                <path
                  key={`${testId}-path-${item.key}`}
                  className="quota-monitor-overview__summary-trend-path"
                  d={item.path}
                  stroke={item.color}
                  fill="none"
                />
              ))}
            </svg>
          </div>
          <div className="quota-monitor-overview__summary-trend-x-axis">
            {sparseAxisLabels.map(label => (
              <span key={`${testId}-label-${label}`}>{label}</span>
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}

export function SystemMonitorOverview({
  isPluginEnabled,
  state,
  onRefresh,
}: SystemMonitorOverviewProps): React.JSX.Element {
  const { t } = useTranslation()
  const currentMetrics = React.useMemo(() => buildCurrentMetricItems(state, t), [state, t])

  return (
    <section className="system-monitor-overview" data-testid="system-monitor-overview">
      <div className="quota-monitor-overview__header">
        <div className="quota-monitor-overview__headline">
          <h4>{t('pluginManager.plugins.systemMonitor.overviewTitle')}</h4>
        </div>

        <div className="quota-monitor-overview__toolbar">
          <span
            className={`quota-monitor-overview__status-pill quota-monitor-overview__status-pill--${state.status}`}
          >
            {t(`pluginManager.plugins.systemMonitor.runtimeStatus.${state.status}`)}
          </span>
          <span className="quota-monitor-overview__meta-pill">
            {t('pluginManager.plugins.systemMonitor.lastUpdated', {
              value: formatDateTime(state.lastUpdatedAt, t),
            })}
          </span>
          <button
            type="button"
            className="cove-window__action cove-window__action--secondary quota-monitor-overview__refresh"
            data-testid="system-monitor-refresh"
            disabled={!isPluginEnabled}
            onClick={onRefresh}
          >
            <RefreshCw size={14} />
            <span>{t('pluginManager.plugins.systemMonitor.refreshNow')}</span>
          </button>
        </div>
      </div>

      {state.lastError ? (
        <div className="quota-monitor-overview__banner quota-monitor-overview__banner--error">
          <strong>{t('pluginManager.plugins.systemMonitor.lastErrorTitle')}</strong>
          <span>{state.lastError.message}</span>
        </div>
      ) : null}

      <div
        className="quota-monitor-overview__summary-grid system-monitor-overview__grid"
        data-testid="system-monitor-current-grid"
      >
        {currentMetrics.map(item => (
          <article
            key={item.label}
            className={`quota-monitor-overview__summary-card system-monitor-overview__metric-card system-monitor-overview__metric-card--${item.tone}`}
          >
            <div className="system-monitor-overview__metric-head">
              <span className="system-monitor-overview__metric-icon" aria-hidden="true">
                <item.icon size={16} />
              </span>
              <div className="system-monitor-overview__metric-copy">
                <span>{item.label}</span>
              </div>
            </div>
            <div className="system-monitor-overview__metric-value">{item.value}</div>
          </article>
        ))}
      </div>

      <div className="system-monitor-overview__grid system-monitor-overview__grid--traffic">
        <TrafficTrendCard
          testId="system-monitor-traffic-trend"
          title={t('pluginManager.plugins.systemMonitor.trafficTrendTitle')}
          labels={state.recentDaysTraffic.map(day => day.day)}
          series={[
            {
              key: 'download',
              label: t('pluginManager.plugins.systemMonitor.metrics.downloadSpeed'),
              currentValue: formatBytes(state.todayTraffic.downloadBytes),
              color: 'var(--cove-accent)',
              values: state.recentDaysTraffic.map(day => day.downloadBytes),
            },
            {
              key: 'upload',
              label: t('pluginManager.plugins.systemMonitor.metrics.uploadSpeed'),
              currentValue: formatBytes(state.todayTraffic.uploadBytes),
              color: 'color-mix(in srgb, var(--cove-positive) 72%, var(--cove-accent))',
              values: state.recentDaysTraffic.map(day => day.uploadBytes),
            },
          ]}
        />
      </div>
    </section>
  )
}

export default SystemMonitorOverview
