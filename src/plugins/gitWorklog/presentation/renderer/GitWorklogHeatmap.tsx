import React from 'react'
import type { GitWorklogDailyPointDto } from '@shared/contracts/dto'
import { CoveSelect } from '@app/renderer/components/CoveSelect'
import { useTranslation } from '@app/renderer/i18n'
import { formatGitWorklogCount, formatGitWorklogFullDate } from './gitWorklogFormatting'

const HEATMAP_ROWS = 7
const HEATMAP_GAP = 2
const HEATMAP_MIN_CELL = 5
const HEATMAP_LEFT_LABEL_WIDTH = 28
const HEATMAP_FALLBACK_WIDTH = 920

function resolveHeatLevel(value: number, maxValue: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || maxValue <= 0) {
    return 0
  }

  const ratio = value / maxValue
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

function parseDay(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null
  }

  const parsed = new Date(`${day}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value)
  next.setDate(next.getDate() + days)
  return next
}

function diffDays(start: Date, end: Date): number {
  const millisecondsPerDay = 24 * 60 * 60 * 1000
  return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay)
}

function toDayKey(value: Date): string {
  const year = `${value.getFullYear()}`.padStart(4, '0')
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfYear(year: number): Date {
  return new Date(year, 0, 1)
}

function endOfYear(year: number): Date {
  return new Date(year, 11, 31)
}

function getMonthLabel(value: Date, language: string): string {
  if (language === 'zh-CN') {
    return `${value.getMonth() + 1}月`
  }

  return new Intl.DateTimeFormat(language, { month: 'short' }).format(value)
}

function buildMonthLabels(
  language: string,
  gridStart: Date,
  weekCount: number,
  firstDay: Date,
  lastDay: Date,
): Map<number, string> {
  const labels = new Map<number, string>([[0, getMonthLabel(firstDay, language)]])

  for (let week = 0; week < weekCount; week += 1) {
    const weekStart = addDays(gridStart, week * HEATMAP_ROWS)
    for (let dayOffset = 0; dayOffset < HEATMAP_ROWS; dayOffset += 1) {
      const day = addDays(weekStart, dayOffset)
      if (day < firstDay || day > lastDay) {
        continue
      }

      if (day.getDate() === 1) {
        labels.set(week, getMonthLabel(day, language))
        break
      }
    }
  }

  return labels
}

export function GitWorklogHeatmap({
  points,
}: {
  points: GitWorklogDailyPointDto[]
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const calendarRef = React.useRef<HTMLDivElement | null>(null)
  const [calendarWidth, setCalendarWidth] = React.useState(0)
  const [isPending, startTransition] = React.useTransition()

  const parsedPoints = React.useMemo(
    () =>
      points
        .map(point => {
          const parsedDay = parseDay(point.day)
          if (!parsedDay) {
            return null
          }

          return {
            ...point,
            parsedDay: startOfDay(parsedDay),
          }
        })
        .filter((point): point is GitWorklogDailyPointDto & { parsedDay: Date } => point !== null)
        .sort((left, right) => left.day.localeCompare(right.day)),
    [points],
  )

  const yearOptions = React.useMemo(() => {
    const currentYear = new Date().getFullYear()
    const years = new Set<number>([currentYear, currentYear - 1, currentYear - 2])
    for (const point of parsedPoints) {
      years.add(point.parsedDay.getFullYear())
    }

    return [...years].sort((left, right) => right - left)
  }, [parsedPoints])

  const [selectedYear, setSelectedYear] = React.useState(
    () => yearOptions[0] ?? new Date().getFullYear(),
  )
  const deferredSelectedYear = React.useDeferredValue(selectedYear)

  const pointsByYear = React.useMemo(() => {
    const grouped = new Map<number, (GitWorklogDailyPointDto & { parsedDay: Date })[]>()

    for (const point of parsedPoints) {
      const year = point.parsedDay.getFullYear()
      const bucket = grouped.get(year)
      if (bucket) {
        bucket.push(point)
        continue
      }

      grouped.set(year, [point])
    }

    return grouped
  }, [parsedPoints])

  React.useEffect(() => {
    if (!yearOptions.includes(selectedYear)) {
      setSelectedYear(yearOptions[0] ?? new Date().getFullYear())
    }
  }, [selectedYear, yearOptions])

  React.useEffect(() => {
    const node = calendarRef.current
    if (!node) {
      return
    }

    const updateWidth = () => {
      setCalendarWidth(node.clientWidth)
    }

    updateWidth()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      updateWidth()
    })
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [])

  const calendarModel = React.useMemo(() => {
    const periodStart = startOfYear(deferredSelectedYear)
    const periodEnd = endOfYear(deferredSelectedYear)
    const gridStart = addDays(periodStart, -periodStart.getDay())
    const gridTotalDays = diffDays(gridStart, periodEnd) + 1
    const weekCount = Math.max(1, Math.ceil(gridTotalDays / HEATMAP_ROWS))
    const availableWidth = Math.max(
      200,
      (calendarWidth || HEATMAP_FALLBACK_WIDTH) - HEATMAP_LEFT_LABEL_WIDTH - 4,
    )
    const rawCellSize =
      (availableWidth - HEATMAP_GAP * Math.max(0, weekCount - 1)) / Math.max(1, weekCount)
    const cellSize = Math.max(HEATMAP_MIN_CELL, rawCellSize)
    const gridWidth = cellSize * weekCount + HEATMAP_GAP * Math.max(0, weekCount - 1)

    const pointsInYear = pointsByYear.get(deferredSelectedYear) ?? []
    const changedMap = new Map(pointsInYear.map(point => [point.day, point.changedLines]))
    const additionsMap = new Map(pointsInYear.map(point => [point.day, point.additions]))
    const deletionsMap = new Map(pointsInYear.map(point => [point.day, point.deletions]))
    const totalChangedLines = pointsInYear.reduce((sum, point) => sum + point.changedLines, 0)
    const maxChangedLines = Math.max(0, ...pointsInYear.map(point => point.changedLines))
    const weeks = Array.from({ length: weekCount }, (_, week) => {
      const weekStart = addDays(gridStart, week * HEATMAP_ROWS)

      return {
        key: `week-${week}`,
        cells: Array.from({ length: HEATMAP_ROWS }, (_, dayOffset) => {
          const day = addDays(weekStart, dayOffset)
          const dayKey = toDayKey(day)
          const inYear = day >= periodStart && day <= periodEnd
          const changedLines = inYear ? (changedMap.get(dayKey) ?? 0) : 0
          const additions = inYear ? (additionsMap.get(dayKey) ?? 0) : 0
          const deletions = inYear ? (deletionsMap.get(dayKey) ?? 0) : 0
          const heatLevel = resolveHeatLevel(changedLines, maxChangedLines)
          const formattedDate = formatGitWorklogFullDate(dayKey)

          return {
            dayKey,
            heatLevel,
            inYear,
            title: `${formattedDate}\n${t('pluginManager.plugins.gitWorklog.heatmapChangedLinesUnit')}: ${formatGitWorklogCount(changedLines)}\n${t('pluginManager.plugins.gitWorklog.summaryTrendAdditions')}: ${formatGitWorklogCount(additions)}\n${t('pluginManager.plugins.gitWorklog.summaryTrendDeletions')}: ${formatGitWorklogCount(deletions)}`,
            ariaLabel: `${formattedDate} ${t('pluginManager.plugins.gitWorklog.heatmapChangedLinesUnit')} ${formatGitWorklogCount(changedLines)}`,
          }
        }),
      }
    })

    return {
      selectedYear: deferredSelectedYear,
      periodStart,
      periodEnd,
      weekCount,
      cellSize,
      gridWidth,
      totalChangedLines,
      monthLabels: buildMonthLabels(i18n.language, gridStart, weekCount, periodStart, periodEnd),
      weeks,
    }
  }, [calendarWidth, deferredSelectedYear, i18n.language, pointsByYear, t])

  const yearSelectOptions = React.useMemo(
    () =>
      yearOptions.map(year => ({
        value: `${year}`,
        label: t('pluginManager.plugins.gitWorklog.heatmapYearOption', { year }),
      })),
    [t, yearOptions],
  )

  const monthLabelEntries = React.useMemo(
    () =>
      [...calendarModel.monthLabels.entries()].map(([week, label]) => ({
        week,
        label,
        left: week * (calendarModel.cellSize + HEATMAP_GAP),
      })),
    [calendarModel.cellSize, calendarModel.monthLabels],
  )

  return (
    <section
      className={`git-worklog-heatmap${isPending ? ' git-worklog-heatmap--pending' : ''}`}
      data-testid="git-worklog-heatmap"
      aria-label={t('pluginManager.plugins.gitWorklog.heatmapTitle')}
      aria-busy={isPending}
    >
      <div className="git-worklog-heatmap__header">
        <div className="git-worklog-heatmap__copy">
          <div className="git-worklog-heatmap__title-row">
            <strong>{t('pluginManager.plugins.gitWorklog.heatmapTitle')}</strong>
            <span className="git-worklog-heatmap__headline-meta">
              {t('pluginManager.plugins.gitWorklog.heatmapYearTotal', {
                year: calendarModel.selectedYear,
                value: formatGitWorklogCount(calendarModel.totalChangedLines),
              })}
            </span>
          </div>
        </div>

        <div className="git-worklog-heatmap__toolbar">
          <div className="git-worklog-heatmap__legend">
            <span>{t('pluginManager.plugins.gitWorklog.heatmapLegendLess')}</span>
            {[0, 1, 2, 3, 4].map(level => (
              <i
                key={`legend-${level}`}
                className={`git-worklog-heatmap__legend-swatch git-worklog-heatmap__legend-swatch--${level}`}
              />
            ))}
            <span>{t('pluginManager.plugins.gitWorklog.heatmapLegendMore')}</span>
          </div>

          <div className="git-worklog-heatmap__year-picker">
            <CoveSelect
              size="compact"
              testId="git-worklog-heatmap-year"
              triggerClassName="git-worklog-heatmap__year-select-trigger"
              menuClassName="git-worklog-heatmap__year-select-menu"
              ariaLabel={t('pluginManager.plugins.gitWorklog.heatmapYearLabel')}
              value={`${selectedYear}`}
              options={yearSelectOptions}
              onChange={nextValue => {
                const nextYear = Number.parseInt(nextValue, 10)
                if (!Number.isFinite(nextYear) || nextYear === selectedYear) {
                  return
                }

                startTransition(() => {
                  setSelectedYear(nextYear)
                })
              }}
            />
          </div>
        </div>
      </div>

      <div className="git-worklog-heatmap__calendar" ref={calendarRef}>
        <div className="git-worklog-heatmap__months">
          <div
            className="git-worklog-heatmap__months-spacer"
            style={{ width: `${HEATMAP_LEFT_LABEL_WIDTH}px` }}
          />

          <div className="git-worklog-heatmap__months-shell">
            <div
              className="git-worklog-heatmap__months-track"
              style={{ width: `${calendarModel.gridWidth}px` }}
            >
              {monthLabelEntries.map(monthLabel => (
                <span
                  key={`month-${monthLabel.week}`}
                  className="git-worklog-heatmap__month-label"
                  style={{
                    left: `${monthLabel.left}px`,
                  }}
                >
                  {monthLabel.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="git-worklog-heatmap__calendar-body">
          <div
            className="git-worklog-heatmap__day-labels"
            style={{ width: `${HEATMAP_LEFT_LABEL_WIDTH - 4}px` }}
          >
            {Array.from({ length: HEATMAP_ROWS }, (_, row) => (
              <span
                key={`weekday-${row}`}
                className="git-worklog-heatmap__day-label"
                style={{ height: `${calendarModel.cellSize}px` }}
              >
                {row === 1
                  ? t('pluginManager.plugins.gitWorklog.heatmapWeekMon')
                  : row === 3
                    ? t('pluginManager.plugins.gitWorklog.heatmapWeekWed')
                    : row === 5
                      ? t('pluginManager.plugins.gitWorklog.heatmapWeekFri')
                      : ''}
              </span>
            ))}
          </div>

          <div className="git-worklog-heatmap__weeks-shell">
            <div
              className="git-worklog-heatmap__weeks"
              style={{ width: `${calendarModel.gridWidth}px` }}
            >
              {calendarModel.weeks.map(week => (
                <div key={week.key} className="git-worklog-heatmap__week">
                  {week.cells.map(cell => (
                    <div
                      key={cell.dayKey}
                      className={`git-worklog-heatmap__cell git-worklog-heatmap__cell--${cell.heatLevel}${cell.inYear ? '' : ' git-worklog-heatmap__cell--out-of-year'}`}
                      data-testid={`git-worklog-heatmap-cell-${cell.dayKey}`}
                      title={cell.title}
                      aria-label={cell.ariaLabel}
                      style={{
                        width: `${calendarModel.cellSize}px`,
                        height: `${calendarModel.cellSize}px`,
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
