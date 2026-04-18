import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  SystemMonitorDailyTrafficDto,
  SystemMonitorSettingsDto,
  SystemMonitorSnapshotDto,
} from '@shared/contracts/dto'

interface StoredSnapshot {
  recordedAt: string
  uploadBytesPerSecond: number
  downloadBytesPerSecond: number
  cpuUsagePercent: number
  memoryUsagePercent: number
  gpuUsagePercent: number | null
}

interface StoredDayTraffic {
  uploadBytes: number
  downloadBytes: number
}

interface PersistedSystemMonitorPayload {
  version: 1
  updatedAt: string
  days: Record<string, StoredDayTraffic>
  snapshots: StoredSnapshot[]
}

export interface SystemMonitorSample {
  recordedAt: Date
  uploadBytesPerSecond: number
  downloadBytesPerSecond: number
  uploadBytesDelta: number
  downloadBytesDelta: number
  cpuUsagePercent: number
  memoryUsagePercent: number
  gpuUsagePercent: number | null
}

const STORE_VERSION = 1
const MAX_HISTORY_POINTS = 512
const MAX_DAY_RECORDS = 90
const DEFAULT_PERSIST_MIN_INTERVAL_MS = 3_000

function clampNonNegative(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return 0
  }

  return value
}

function clampPercent(value: unknown): number {
  return Math.min(100, Math.max(0, Math.round(clampNonNegative(value))))
}

function normalizeSnapshot(value: unknown): StoredSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const recordedAt =
    typeof record.recordedAt === 'string' && record.recordedAt.trim().length > 0
      ? record.recordedAt.trim()
      : null
  if (!recordedAt) {
    return null
  }

  return {
    recordedAt,
    uploadBytesPerSecond: clampNonNegative(record.uploadBytesPerSecond),
    downloadBytesPerSecond: clampNonNegative(record.downloadBytesPerSecond),
    cpuUsagePercent: clampPercent(record.cpuUsagePercent),
    memoryUsagePercent: clampPercent(record.memoryUsagePercent),
    gpuUsagePercent:
      typeof record.gpuUsagePercent === 'number' && Number.isFinite(record.gpuUsagePercent)
        ? clampPercent(record.gpuUsagePercent)
        : null,
  }
}

function normalizeDayTraffic(value: unknown): StoredDayTraffic | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  return {
    uploadBytes: clampNonNegative(record.uploadBytes),
    downloadBytes: clampNonNegative(record.downloadBytes),
  }
}

function formatDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createEmptyDayTraffic(): StoredDayTraffic {
  return {
    uploadBytes: 0,
    downloadBytes: 0,
  }
}

function addDays(date: Date, offset: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + offset)
  return next
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function toSnapshotDto(snapshot: StoredSnapshot): SystemMonitorSnapshotDto {
  return {
    recordedAt: snapshot.recordedAt,
    uploadBytesPerSecond: snapshot.uploadBytesPerSecond,
    downloadBytesPerSecond: snapshot.downloadBytesPerSecond,
    cpuUsagePercent: snapshot.cpuUsagePercent,
    memoryUsagePercent: snapshot.memoryUsagePercent,
    gpuUsagePercent: snapshot.gpuUsagePercent,
  }
}

function toDailyTrafficDto(day: string, payload: StoredDayTraffic): SystemMonitorDailyTrafficDto {
  return {
    day,
    uploadBytes: payload.uploadBytes,
    downloadBytes: payload.downloadBytes,
  }
}

export class SystemMonitorStore {
  private readonly filePath: string
  private readonly days = new Map<string, StoredDayTraffic>()
  private snapshots: StoredSnapshot[] = []
  private persistMinIntervalMs: number
  private loaded = false
  private loadPromise: Promise<void> | null = null
  private dirty = false
  private lastPersistedAt = 0

  public constructor(filePath: string, options?: { persistMinIntervalMs?: number }) {
    this.filePath = filePath
    this.persistMinIntervalMs = Math.max(
      0,
      Math.round(options?.persistMinIntervalMs ?? DEFAULT_PERSIST_MIN_INTERVAL_MS),
    )
  }

  public setPersistMinIntervalMs(value: number): void {
    this.persistMinIntervalMs = Math.max(0, Math.round(value))
  }

  public async appendSample(sample: SystemMonitorSample): Promise<void> {
    await this.ensureLoaded()

    const dayKey = formatDayKey(sample.recordedAt)
    const day = this.days.get(dayKey) ?? createEmptyDayTraffic()
    day.uploadBytes += Math.max(0, Math.round(sample.uploadBytesDelta))
    day.downloadBytes += Math.max(0, Math.round(sample.downloadBytesDelta))
    this.days.set(dayKey, day)

    this.snapshots.push({
      recordedAt: sample.recordedAt.toISOString(),
      uploadBytesPerSecond: Math.max(0, Math.round(sample.uploadBytesPerSecond)),
      downloadBytesPerSecond: Math.max(0, Math.round(sample.downloadBytesPerSecond)),
      cpuUsagePercent: clampPercent(sample.cpuUsagePercent),
      memoryUsagePercent: clampPercent(sample.memoryUsagePercent),
      gpuUsagePercent:
        typeof sample.gpuUsagePercent === 'number' ? clampPercent(sample.gpuUsagePercent) : null,
    })

    if (this.snapshots.length > MAX_HISTORY_POINTS) {
      this.snapshots = this.snapshots.slice(-MAX_HISTORY_POINTS)
    }

    this.trimOldDays()
    this.dirty = true
    await this.persistIfNeeded(false)
  }

  public async buildSnapshot(
    settings: SystemMonitorSettingsDto,
    now: Date = new Date(),
  ): Promise<{
    current: SystemMonitorSnapshotDto
    history: SystemMonitorSnapshotDto[]
    todayTraffic: SystemMonitorDailyTrafficDto
    recentDaysTraffic: SystemMonitorDailyTrafficDto[]
  }> {
    await this.ensureLoaded()

    const currentSnapshot =
      this.snapshots[this.snapshots.length - 1] ??
      ({
        recordedAt: now.toISOString(),
        uploadBytesPerSecond: 0,
        downloadBytesPerSecond: 0,
        cpuUsagePercent: 0,
        memoryUsagePercent: 0,
        gpuUsagePercent: null,
      } satisfies StoredSnapshot)

    const historyStart = addDays(startOfLocalDay(now), -(settings.historyRangeDays - 1))
    const historyStartTime = historyStart.getTime()
    const history = this.snapshots
      .filter(snapshot => {
        const time = Date.parse(snapshot.recordedAt)
        return Number.isFinite(time) && time >= historyStartTime
      })
      .map(toSnapshotDto)

    const todayKey = formatDayKey(now)
    const todayTraffic = toDailyTrafficDto(todayKey, this.days.get(todayKey) ?? createEmptyDayTraffic())

    const recentDaysTraffic: SystemMonitorDailyTrafficDto[] = []
    for (let index = settings.historyRangeDays - 1; index >= 0; index -= 1) {
      const date = addDays(startOfLocalDay(now), -index)
      const dayKey = formatDayKey(date)
      recentDaysTraffic.push(
        toDailyTrafficDto(dayKey, this.days.get(dayKey) ?? createEmptyDayTraffic()),
      )
    }

    return {
      current: toSnapshotDto(currentSnapshot),
      history,
      todayTraffic,
      recentDaysTraffic,
    }
  }

  public async flush(): Promise<void> {
    await this.persistIfNeeded(true)
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
        const parsed = JSON.parse(raw) as PersistedSystemMonitorPayload
        if (!parsed || typeof parsed !== 'object') {
          this.days.clear()
          this.snapshots = []
          return
        }

        this.days.clear()
        const days = parsed.days
        if (days && typeof days === 'object') {
          for (const [dayKey, payload] of Object.entries(days)) {
            const normalized = normalizeDayTraffic(payload)
            if (!normalized) {
              continue
            }

            this.days.set(dayKey, normalized)
          }
        }

        this.snapshots = Array.isArray(parsed.snapshots)
          ? parsed.snapshots
              .map(normalizeSnapshot)
              .filter((snapshot): snapshot is StoredSnapshot => snapshot !== null)
              .slice(-MAX_HISTORY_POINTS)
          : []
      } catch {
        this.days.clear()
        this.snapshots = []
      } finally {
        this.loaded = true
        this.loadPromise = null
      }
    })()

    await this.loadPromise
  }

  private trimOldDays(): void {
    if (this.days.size <= MAX_DAY_RECORDS) {
      return
    }

    const sortedKeys = [...this.days.keys()].sort()
    const removeCount = sortedKeys.length - MAX_DAY_RECORDS
    for (let index = 0; index < removeCount; index += 1) {
      this.days.delete(sortedKeys[index])
    }
  }

  private async persistIfNeeded(force: boolean): Promise<void> {
    await this.ensureLoaded()
    if (!this.dirty) {
      return
    }

    const now = Date.now()
    if (!force && now - this.lastPersistedAt < this.persistMinIntervalMs) {
      return
    }

    const payload: PersistedSystemMonitorPayload = {
      version: STORE_VERSION,
      updatedAt: new Date(now).toISOString(),
      days: Object.fromEntries(this.days.entries()),
      snapshots: this.snapshots,
    }

    const directory = dirname(this.filePath)
    const tempPath = `${this.filePath}.tmp`
    await mkdir(directory, { recursive: true })
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

    try {
      await stat(this.filePath)
      await rm(this.filePath, { force: true })
    } catch {
      // Ignore missing target file.
    }

    await rename(tempPath, this.filePath)
    this.dirty = false
    this.lastPersistedAt = now
  }
}
