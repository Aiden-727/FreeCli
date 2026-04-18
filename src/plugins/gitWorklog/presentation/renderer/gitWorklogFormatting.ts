import type { GitWorklogDailyPointDto } from '@shared/contracts/dto'

export function formatGitWorklogCount(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0
  const absolute = Math.abs(safeValue)

  if (absolute >= 1_000_000) {
    return trimTrailingZeroes((safeValue / 1_000_000).toFixed(1)) + 'M'
  }

  if (absolute >= 10_000) {
    return trimTrailingZeroes((safeValue / 1_000).toFixed(1)) + 'K'
  }

  return `${Math.round(safeValue)}`
}

export function formatGitWorklogFullDate(day: string): string {
  const parsed = parseDay(day)
  if (!parsed) {
    return day
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed)
}

export function createGitWorklogWindowLabel(pointCount: number): string {
  return pointCount <= 0 ? '--' : `${pointCount}d`
}

export function getGitWorklogRecentPoints(
  points: GitWorklogDailyPointDto[],
  windowSize: number,
): GitWorklogDailyPointDto[] {
  if (windowSize <= 0 || points.length <= windowSize) {
    return points
  }

  return points.slice(-windowSize)
}

function parseDay(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null
  }

  const parsed = new Date(`${day}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function trimTrailingZeroes(value: string): string {
  if (value.endsWith('.0')) {
    return value.slice(0, -2)
  }

  return value
}
