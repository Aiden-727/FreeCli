import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  InputStatsDailyStatsDto,
  InputStatsHistoryMetric,
  InputStatsHistoryPointDto,
  InputStatsKeyCountItemDto,
  InputStatsMetricTotalsDto,
  InputStatsSettingsDto,
} from '@shared/contracts/dto'

interface InputStatsDelta {
  keyPresses: number
  leftClicks: number
  rightClicks: number
  mouseDistancePx: number
  scrollSteps: number
  keyCounts: Record<string, number>
}

interface StoredDayPayload {
  keyPresses: number
  leftClicks: number
  rightClicks: number
  mouseDistancePx: number
  scrollSteps: number
  keyCounts: Record<string, number>
}

interface PersistedInputStatsPayload {
  version: 1
  updatedAt: string
  days: Record<string, StoredDayPayload>
}

const PERSIST_MIN_INTERVAL_MS = 3_000
const HISTORY_METRICS: InputStatsHistoryMetric[] = ['clicks', 'keys', 'movement', 'scroll']

function createEmptyDay(): StoredDayPayload {
  return {
    keyPresses: 0,
    leftClicks: 0,
    rightClicks: 0,
    mouseDistancePx: 0,
    scrollSteps: 0,
    keyCounts: {},
  }
}

function formatDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDayLabel(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, offset: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

function clampNumber(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }

  return value
}

function normalizeStoredDayPayload(value: unknown): StoredDayPayload | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const normalizedKeyCounts: Record<string, number> = {}
  const keyCounts = record.keyCounts
  if (keyCounts && typeof keyCounts === 'object') {
    for (const [key, rawCount] of Object.entries(keyCounts as Record<string, unknown>)) {
      const normalizedKey = key.trim()
      const normalizedCount = Math.round(clampNumber(rawCount))
      if (normalizedKey.length === 0 || normalizedCount <= 0) {
        continue
      }

      normalizedKeyCounts[normalizedKey] = normalizedCount
    }
  }

  return {
    keyPresses: Math.round(clampNumber(record.keyPresses)),
    leftClicks: Math.round(clampNumber(record.leftClicks)),
    rightClicks: Math.round(clampNumber(record.rightClicks)),
    mouseDistancePx: clampNumber(record.mouseDistancePx),
    scrollSteps: clampNumber(record.scrollSteps),
    keyCounts: normalizedKeyCounts,
  }
}

function buildMetricTotals(): InputStatsMetricTotalsDto {
  return {
    clicks: 0,
    keys: 0,
    movement: 0,
    scroll: 0,
  }
}

function metricValue(day: StoredDayPayload, metric: InputStatsHistoryMetric): number {
  switch (metric) {
    case 'clicks':
      return day.leftClicks + day.rightClicks
    case 'keys':
      return day.keyPresses
    case 'movement':
      return day.mouseDistancePx
    case 'scroll':
      return day.scrollSteps
  }
}

function toDailyStatsDto(dayKey: string, payload: StoredDayPayload): InputStatsDailyStatsDto {
  return {
    day: dayKey,
    keyPresses: payload.keyPresses,
    leftClicks: payload.leftClicks,
    rightClicks: payload.rightClicks,
    mouseDistancePx: payload.mouseDistancePx,
    scrollSteps: payload.scrollSteps,
  }
}

export class InputStatsStore {
  private readonly filePath: string
  private readonly days = new Map<string, StoredDayPayload>()
  private loaded = false
  private loadPromise: Promise<void> | null = null
  private dirty = false
  private lastPersistedAt = 0

  public constructor(filePath: string) {
    this.filePath = filePath
  }

  public async applyDelta(delta: InputStatsDelta, now: Date): Promise<void> {
    if (
      delta.keyPresses <= 0 &&
      delta.leftClicks <= 0 &&
      delta.rightClicks <= 0 &&
      delta.mouseDistancePx <= 0 &&
      delta.scrollSteps <= 0 &&
      Object.keys(delta.keyCounts).length === 0
    ) {
      return
    }

    await this.ensureLoaded()
    const dayKey = formatDayKey(now)
    const payload = this.days.get(dayKey) ?? createEmptyDay()
    payload.keyPresses += Math.max(0, Math.round(delta.keyPresses))
    payload.leftClicks += Math.max(0, Math.round(delta.leftClicks))
    payload.rightClicks += Math.max(0, Math.round(delta.rightClicks))
    payload.mouseDistancePx += Math.max(0, delta.mouseDistancePx)
    payload.scrollSteps += Math.max(0, delta.scrollSteps)

    for (const [rawKey, rawCount] of Object.entries(delta.keyCounts)) {
      const key = rawKey.trim()
      const count = Math.max(0, Math.round(rawCount))
      if (key.length === 0 || count <= 0) {
        continue
      }

      payload.keyCounts[key] = (payload.keyCounts[key] ?? 0) + count
    }

    this.days.set(dayKey, payload)
    this.dirty = true
    await this.persistIfNeeded(false)
  }

  public async flush(): Promise<void> {
    await this.persistIfNeeded(true)
  }

  public async getTodayStats(now: Date = new Date()): Promise<InputStatsDailyStatsDto> {
    await this.ensureLoaded()
    const dayKey = formatDayKey(now)
    return toDailyStatsDto(dayKey, this.days.get(dayKey) ?? createEmptyDay())
  }

  public async getTopKeys(
    rangeDays: number,
    limit = 24,
    now: Date = new Date(),
  ): Promise<InputStatsKeyCountItemDto[]> {
    await this.ensureLoaded()
    const merged: Record<string, number> = {}
    const today = startOfLocalDay(now)
    const start = rangeDays <= 0 ? null : addDays(today, -(Math.max(1, rangeDays) - 1))
    const startKey = start ? formatDayKey(start) : null
    const endKey = formatDayKey(today)

    for (const [dayKey, day] of this.days) {
      if (startKey && (dayKey < startKey || dayKey > endKey)) {
        continue
      }

      for (const [key, count] of Object.entries(day.keyCounts)) {
        if (count <= 0) {
          continue
        }

        merged[key] = (merged[key] ?? 0) + count
      }
    }

    const entries = Object.entries(merged)
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => {
        const byCount = right.count - left.count
        return byCount !== 0 ? byCount : left.key.localeCompare(right.key)
      })

    if (limit <= 0 || entries.length <= limit) {
      return entries
    }

    return entries.slice(0, limit)
  }

  public async getHistorySeries(
    days: number,
    now: Date = new Date(),
  ): Promise<Record<InputStatsHistoryMetric, InputStatsHistoryPointDto[]>> {
    await this.ensureLoaded()
    const safeDays = Math.max(1, days)
    const today = startOfLocalDay(now)
    const start = addDays(today, -(safeDays - 1))
    const series = {
      clicks: [] as InputStatsHistoryPointDto[],
      keys: [] as InputStatsHistoryPointDto[],
      movement: [] as InputStatsHistoryPointDto[],
      scroll: [] as InputStatsHistoryPointDto[],
    }

    for (let index = 0; index < safeDays; index += 1) {
      const currentDay = addDays(start, index)
      const dayKey = formatDayKey(currentDay)
      const payload = this.days.get(dayKey) ?? createEmptyDay()
      for (const metric of HISTORY_METRICS) {
        series[metric].push({
          day: dayKey,
          label: formatDayLabel(currentDay),
          value: metricValue(payload, metric),
        })
      }
    }

    return series
  }

  public async getCumulativeTotals(
    days: number,
    now: Date = new Date(),
  ): Promise<InputStatsMetricTotalsDto> {
    await this.ensureLoaded()
    const totals = buildMetricTotals()
    const today = startOfLocalDay(now)
    const endKey = formatDayKey(today)
    const startKey = days <= 0 ? null : formatDayKey(addDays(today, -(Math.max(1, days) - 1)))

    for (const [dayKey, day] of this.days) {
      if ((startKey !== null && dayKey < startKey) || dayKey > endKey) {
        continue
      }

      totals.clicks += metricValue(day, 'clicks')
      totals.keys += metricValue(day, 'keys')
      totals.movement += metricValue(day, 'movement')
      totals.scroll += metricValue(day, 'scroll')
    }

    return totals
  }

  public async buildSnapshot(
    settings: InputStatsSettingsDto,
    now: Date = new Date(),
  ): Promise<{
    today: InputStatsDailyStatsDto
    topKeys: InputStatsKeyCountItemDto[]
    allKeys: InputStatsKeyCountItemDto[]
    historySeriesByMetric: Record<InputStatsHistoryMetric, InputStatsHistoryPointDto[]>
    cumulativeTotals: InputStatsMetricTotalsDto
  }> {
    const [today, topKeys, allKeys, historySeriesByMetric, cumulativeTotals] = await Promise.all([
      this.getTodayStats(now),
      this.getTopKeys(settings.topKeysRange, 24, now),
      this.getTopKeys(settings.topKeysRange, 0, now),
      this.getHistorySeries(settings.historyRangeDays, now),
      this.getCumulativeTotals(settings.cumulativeRangeDays, now),
    ])

    return {
      today,
      topKeys,
      allKeys,
      historySeriesByMetric,
      cumulativeTotals,
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return
    }

    if (this.loadPromise) {
      await this.loadPromise
      return
    }

    this.loadPromise = (async () => {
      try {
        const raw = await readFile(this.filePath, 'utf8')
        const parsed = JSON.parse(raw) as PersistedInputStatsPayload
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !parsed.days ||
          typeof parsed.days !== 'object'
        ) {
          this.days.clear()
          return
        }

        this.days.clear()
        for (const [dayKey, value] of Object.entries(parsed.days)) {
          const normalizedDay = normalizeStoredDayPayload(value)
          if (!normalizedDay) {
            continue
          }

          this.days.set(dayKey, normalizedDay)
        }
      } catch {
        this.days.clear()
      } finally {
        this.loaded = true
        this.loadPromise = null
      }
    })()

    await this.loadPromise
  }

  private async persistIfNeeded(force: boolean): Promise<void> {
    await this.ensureLoaded()
    if (!this.dirty) {
      return
    }

    const now = Date.now()
    if (!force && now - this.lastPersistedAt < PERSIST_MIN_INTERVAL_MS) {
      return
    }

    const payload: PersistedInputStatsPayload = {
      version: 1,
      updatedAt: new Date(now).toISOString(),
      days: Object.fromEntries(this.days.entries()),
    }

    const directory = dirname(this.filePath)
    const tempPath = `${this.filePath}.tmp`
    await mkdir(directory, { recursive: true })
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

    try {
      await stat(this.filePath)
      await rm(this.filePath, { force: true })
    } catch {
      // ignore missing target file
    }

    await rename(tempPath, this.filePath)
    this.dirty = false
    this.lastPersistedAt = now
  }
}
