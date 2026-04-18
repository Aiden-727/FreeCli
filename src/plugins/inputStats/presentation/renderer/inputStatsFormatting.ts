import type {
  InputStatsHistoryMetric,
  InputStatsHistoryPointDto,
  InputStatsMetricTotalsDto,
} from '@shared/contracts/dto'
import type { TranslateFn } from '@app/renderer/i18n'

export function formatInputCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    Math.max(0, Math.round(value)),
  )
}

export function formatInputPercent(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits,
  }).format(Number.isFinite(value) ? Math.max(0, value) : 0)
}

export function formatInputDistance(value: number, t: TranslateFn): string {
  const safe = Math.max(0, value)
  const meters = safe * 0.000264583
  if (meters >= 1000) {
    return t('pluginManager.plugins.inputStats.distanceKilometers', {
      value: (meters / 1000).toFixed(2),
    })
  }

  return t('pluginManager.plugins.inputStats.distanceMeters', {
    value: meters.toFixed(1),
  })
}

export function formatInputMetricValue(
  metric: InputStatsHistoryMetric,
  value: number,
  t: TranslateFn,
): string {
  if (metric === 'movement') {
    return formatInputDistance(value, t)
  }

  return formatInputCount(value)
}

export function formatInputTimestamp(value: string | null): string {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function sumInputHistorySeries(items: InputStatsHistoryPointDto[]): number {
  return items.reduce((sum, item) => sum + Math.max(0, item.value), 0)
}

export function averageInputHistorySeries(items: InputStatsHistoryPointDto[]): number {
  if (items.length === 0) {
    return 0
  }

  return sumInputHistorySeries(items) / items.length
}

export function averageInputCount(total: number, count: number): number {
  if (count <= 0) {
    return 0
  }

  return total / count
}

export function totalInputMetric(
  totals: InputStatsMetricTotalsDto,
  metric: InputStatsHistoryMetric,
): number {
  switch (metric) {
    case 'clicks':
      return totals.clicks
    case 'keys':
      return totals.keys
    case 'movement':
      return totals.movement
    case 'scroll':
      return totals.scroll
  }
}
