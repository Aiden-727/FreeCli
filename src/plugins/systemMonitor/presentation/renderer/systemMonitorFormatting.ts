import type { TFunction } from 'i18next'

function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(Math.max(0, value))
}

function formatBinaryUnitValue(
  value: number,
  units: readonly string[],
  minimumUnitIndex = 0,
): string {
  if (!Number.isFinite(value) || value <= 0) {
    return `0 ${units[Math.min(minimumUnitIndex, units.length - 1)]}`
  }

  let index = Math.min(minimumUnitIndex, units.length - 1)
  let current = value / 1024 ** index

  while (current >= 1024 && index < units.length - 1) {
    current /= 1024
    index += 1
  }

  const fractionDigits = current >= 100 ? 0 : current >= 10 ? 1 : 2
  return `${formatNumber(current, fractionDigits)} ${units[index]}`
}

function resolveBinaryUnit(
  value: number,
  units: readonly string[],
  minimumUnitIndex = 0,
): {
  value: number
  unit: string
} {
  if (!Number.isFinite(value) || value <= 0) {
    return {
      value: 0,
      unit: units[Math.min(minimumUnitIndex, units.length - 1)] ?? units[0] ?? '',
    }
  }

  let index = Math.min(minimumUnitIndex, units.length - 1)
  let current = value / 1024 ** index

  while (current >= 1024 && index < units.length - 1) {
    current /= 1024
    index += 1
  }

  return {
    value: current,
    unit: units[index] ?? units[units.length - 1] ?? '',
  }
}

export function formatPercent(value: number | null | undefined, t: TFunction): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return t('pluginManager.plugins.systemMonitor.notAvailable')
  }

  return `${formatNumber(Math.round(value))}${t('common.percentUnit')}`
}

export function formatBytes(value: number): string {
  return formatBinaryUnitValue(value, ['B', 'KB', 'MB', 'GB', 'TB'], 1)
}

export function formatSpeed(value: number): string {
  return `${formatBytes(value)}/s`
}

export function formatHeaderSpeed(value: number): string {
  const resolved = resolveBinaryUnit(value, ['B', 'KB', 'MB', 'GB', 'TB'], 1)
  const fractionDigits = resolved.unit === 'KB' ? 0 : resolved.value >= 100 ? 0 : 1
  const numericValue = Math.max(0, resolved.value)
  const rounded =
    fractionDigits === 0 ? Math.round(numericValue) : Math.round(numericValue * 10) / 10
  return `${formatNumber(rounded, fractionDigits)} ${resolved.unit}/s`
}

export function formatHeaderPercent(value: number | null | undefined, t: TFunction): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return t('pluginManager.plugins.systemMonitor.notAvailable')
  }

  const rounded = Math.max(0, Math.min(100, Math.round(value)))
  return `${rounded}${t('common.percentUnit')}`
}

export function formatDateTime(value: string | null, t: TFunction): string {
  if (!value) {
    return t('pluginManager.plugins.systemMonitor.notAvailable')
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return t('pluginManager.plugins.systemMonitor.notAvailable')
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(parsed)
}
