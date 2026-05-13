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

export function getGitWorklogCalendarWindowPoints(
  points: GitWorklogDailyPointDto[],
  windowSize: number,
  anchorDay?: string | null,
): GitWorklogDailyPointDto[] {
  if (points.length === 0) {
    return []
  }

  const normalizedWindowSize =
    Number.isFinite(windowSize) && windowSize > 0 ? Math.floor(windowSize) : 1
  const pointsByDay = new Map(points.map(point => [point.day, point] as const))
  const latestPointDay = resolveLatestPointDay(points)
  const endDay = resolveAnchorDay(anchorDay, latestPointDay)
  if (!endDay) {
    return points.slice(-normalizedWindowSize)
  }

  const startDay = new Date(endDay)
  startDay.setDate(startDay.getDate() - (normalizedWindowSize - 1))

  const windowPoints: GitWorklogDailyPointDto[] = []
  let cursor = new Date(startDay)
  while (cursor <= endDay) {
    const currentDay = formatDay(cursor)
    const existing = pointsByDay.get(currentDay)
    if (existing) {
      windowPoints.push(existing)
    } else {
      windowPoints.push({
        day: currentDay,
        label: formatMonthDay(cursor),
        commitCount: 0,
        filesChanged: 0,
        additions: 0,
        deletions: 0,
        changedLines: 0,
      })
    }

    const nextCursor = new Date(cursor)
    nextCursor.setDate(nextCursor.getDate() + 1)
    cursor = nextCursor
  }

  return windowPoints
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

function resolveLatestPointDay(points: GitWorklogDailyPointDto[]): Date | null {
  let latest: Date | null = null
  for (const point of points) {
    const parsed = parseDay(point.day)
    if (!parsed) {
      continue
    }

    if (!latest || parsed.getTime() > latest.getTime()) {
      latest = parsed
    }
  }

  return latest
}

function resolveAnchorDay(anchorDay: string | null | undefined, latestPointDay: Date | null): Date | null {
  const parsedAnchor = anchorDay ? parseDay(anchorDay) : null
  if (parsedAnchor) {
    return parsedAnchor
  }

  return latestPointDay
}

function formatDay(value: Date): string {
  const year = `${value.getFullYear()}`.padStart(4, '0')
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonthDay(value: Date): string {
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${month}/${day}`
}
