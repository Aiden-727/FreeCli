import Database from 'better-sqlite3'
import type {
  QuotaMonitorCappedInsightDto,
  QuotaMonitorModelTrendDto,
  QuotaMonitorModelUsageSummaryDto,
  QuotaMonitorTrendPointDto,
} from '@shared/contracts/dto'

const DEFAULT_IDLE_THRESHOLD_MS = 10 * 60 * 1000

export interface QuotaMonitorModelLogEntryInput {
  modelName: string
  requestEpochSeconds: number
  requestTimeText: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  quota: number
}

export interface AppendQuotaMonitorSnapshotInput {
  profileId: string
  tokenName: string
  fetchedAt: string
  todayUsedQuota: number
  todayUsageCount: number
  remainQuotaValue: number
  remainQuotaDisplay: string
  expiredTimeFormatted: string
  statusText: string
  remainRatio: number
}

export interface QuotaMonitorProfileHistorySnapshot {
  dailyTrend: QuotaMonitorTrendPointDto[]
  hourlyTrend: QuotaMonitorTrendPointDto[]
  estimatedRemainingHours: number | null
  workDurationTodaySeconds: number
  workDurationAllTimeSeconds: number
  modelUsageSummary: QuotaMonitorModelUsageSummaryDto | null
  dailyTokenTrend: QuotaMonitorModelTrendDto
  hourlyTokenTrend: QuotaMonitorModelTrendDto
  cappedInsight: QuotaMonitorCappedInsightDto | null
}

interface SnapshotRow {
  fetchedAt: Date
  todayUsedQuota: number
  todayUsageCount: number
}

interface UsageRateSample {
  ts: Date
  deltaQuota: number
  deltaHours: number
}

interface ModelMetricRow {
  model_name: string
  model_calls: number
  model_tokens: number
  model_today_tokens: number
  model_active_days: number
}

export interface QuotaMonitorHistorySyncSnapshotRow {
  profileId: string
  tokenName: string
  fetchedAt: string
  todayUsedQuota: number
  todayUsageCount: number
  remainQuotaValue: number
  remainQuotaDisplay: string
  expiredTimeFormatted: string
  statusText: string
  remainRatio: number
}

export interface QuotaMonitorHistorySyncModelLogRow {
  profileId: string
  tokenName: string
  modelName: string
  createdAtEpoch: number
  createdTimeText: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  quota: number
  fetchedAt: string
}

export interface QuotaMonitorHistorySyncPayload {
  formatVersion: 1
  exportedAt: string
  snapshots: QuotaMonitorHistorySyncSnapshotRow[]
  modelLogs: QuotaMonitorHistorySyncModelLogRow[]
}

function normalizeEpochSeconds(raw: number): number {
  if (raw >= 1_000_000_000_000_000) {
    return Math.floor(raw / 1_000_000)
  }

  if (raw >= 1_000_000_000_000) {
    return Math.floor(raw / 1000)
  }

  return raw
}

function clampToNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function toHourKey(value: Date): string {
  return `${value.toISOString().slice(0, 13)}:00`
}

function formatDayLabel(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
  }).format(value)
}

function formatHourLabel(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function buildEmptyModelTrend(): QuotaMonitorModelTrendDto {
  return {
    labels: [],
    seriesByModel: {},
  }
}

function createCappedInsight(options: {
  wastedTodayQuota: number
  wastedTotalQuota: number
  requiredConsume: number
  nextTopUpInMinutes: number | null
  nextTopUpAmount: number | null
}): QuotaMonitorCappedInsightDto {
  return {
    wastedTodayQuota: clampToNonNegative(options.wastedTodayQuota),
    wastedTotalQuota: clampToNonNegative(options.wastedTotalQuota),
    requiredConsume: clampToNonNegative(options.requiredConsume),
    nextTopUpInMinutes:
      options.nextTopUpInMinutes !== null && options.nextTopUpInMinutes >= 0
        ? options.nextTopUpInMinutes
        : null,
    nextTopUpAmount:
      options.nextTopUpAmount !== null ? clampToNonNegative(options.nextTopUpAmount) : null,
  }
}

export class QuotaMonitorHistoryStore {
  private db: Database.Database | null = null

  public constructor(private readonly dbPath: string) {}

  public dispose(): void {
    try {
      this.db?.close()
    } catch {
      // ignore
    } finally {
      this.db = null
    }
  }

  public async appendSnapshot(input: AppendQuotaMonitorSnapshotInput): Promise<void> {
    const db = this.getDb()
    db.prepare(
      `
        INSERT INTO quota_monitor_snapshots (
          profile_id,
          token_name,
          fetched_at,
          today_used_quota,
          today_usage_count,
          remain_quota_value,
          remain_quota_display,
          expired_time_formatted,
          status_text,
          remain_ratio
        ) VALUES (
          @profileId,
          @tokenName,
          @fetchedAt,
          @todayUsedQuota,
          @todayUsageCount,
          @remainQuotaValue,
          @remainQuotaDisplay,
          @expiredTimeFormatted,
          @statusText,
          @remainRatio
        )
      `,
    ).run(input)
  }

  public async getLatestModelLogEpoch(profileId: string): Promise<number | null> {
    const db = this.getDb()
    const row = db
      .prepare(
        `
          SELECT MAX(created_at_epoch) AS max_epoch
          FROM quota_monitor_model_logs
          WHERE profile_id = ?
        `,
      )
      .get(profileId) as { max_epoch?: number | null } | undefined

    return typeof row?.max_epoch === 'number' && row.max_epoch > 0 ? row.max_epoch : null
  }

  public async saveModelLogs(params: {
    profileId: string
    tokenName: string
    fetchedAt: string
    logs: QuotaMonitorModelLogEntryInput[]
  }): Promise<number> {
    if (params.logs.length === 0) {
      return 0
    }

    const db = this.getDb()
    const insert = db.prepare(
      `
        INSERT OR IGNORE INTO quota_monitor_model_logs (
          profile_id,
          token_name,
          model_name,
          created_at_epoch,
          created_time_text,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          quota,
          fetched_at
        ) VALUES (
          @profileId,
          @tokenName,
          @modelName,
          @createdAtEpoch,
          @createdTimeText,
          @promptTokens,
          @completionTokens,
          @totalTokens,
          @quota,
          @fetchedAt
        )
      `,
    )

    const transaction = db.transaction(() => {
      let inserted = 0
      for (const log of params.logs) {
        const result = insert.run({
          profileId: params.profileId,
          tokenName: params.tokenName,
          modelName: log.modelName,
          createdAtEpoch: normalizeEpochSeconds(log.requestEpochSeconds),
          createdTimeText: log.requestTimeText,
          promptTokens: clampToNonNegative(log.promptTokens),
          completionTokens: clampToNonNegative(log.completionTokens),
          totalTokens: clampToNonNegative(log.totalTokens),
          quota: clampToNonNegative(log.quota),
          fetchedAt: params.fetchedAt,
        })
        inserted += result.changes
      }

      return inserted
    })

    return transaction()
  }

  public async exportForSync(): Promise<QuotaMonitorHistorySyncPayload> {
    const db = this.getDb()
    const snapshots = db
      .prepare(
        `
          SELECT
            profile_id AS profileId,
            token_name AS tokenName,
            fetched_at AS fetchedAt,
            today_used_quota AS todayUsedQuota,
            today_usage_count AS todayUsageCount,
            remain_quota_value AS remainQuotaValue,
            remain_quota_display AS remainQuotaDisplay,
            expired_time_formatted AS expiredTimeFormatted,
            status_text AS statusText,
            remain_ratio AS remainRatio
          FROM quota_monitor_snapshots
          ORDER BY id ASC
        `,
      )
      .all() as QuotaMonitorHistorySyncSnapshotRow[]
    const modelLogs = db
      .prepare(
        `
          SELECT
            profile_id AS profileId,
            token_name AS tokenName,
            model_name AS modelName,
            created_at_epoch AS createdAtEpoch,
            created_time_text AS createdTimeText,
            prompt_tokens AS promptTokens,
            completion_tokens AS completionTokens,
            total_tokens AS totalTokens,
            quota AS quota,
            fetched_at AS fetchedAt
          FROM quota_monitor_model_logs
          ORDER BY id ASC
        `,
      )
      .all() as QuotaMonitorHistorySyncModelLogRow[]

    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      snapshots,
      modelLogs,
    }
  }

  public async importForSync(payload: QuotaMonitorHistorySyncPayload): Promise<void> {
    const db = this.getDb()
    const insertSnapshot = db.prepare(
      `
        INSERT INTO quota_monitor_snapshots (
          profile_id,
          token_name,
          fetched_at,
          today_used_quota,
          today_usage_count,
          remain_quota_value,
          remain_quota_display,
          expired_time_formatted,
          status_text,
          remain_ratio
        ) VALUES (
          @profileId,
          @tokenName,
          @fetchedAt,
          @todayUsedQuota,
          @todayUsageCount,
          @remainQuotaValue,
          @remainQuotaDisplay,
          @expiredTimeFormatted,
          @statusText,
          @remainRatio
        )
      `,
    )
    const insertModelLog = db.prepare(
      `
        INSERT OR IGNORE INTO quota_monitor_model_logs (
          profile_id,
          token_name,
          model_name,
          created_at_epoch,
          created_time_text,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          quota,
          fetched_at
        ) VALUES (
          @profileId,
          @tokenName,
          @modelName,
          @createdAtEpoch,
          @createdTimeText,
          @promptTokens,
          @completionTokens,
          @totalTokens,
          @quota,
          @fetchedAt
        )
      `,
    )

    const writeTx = db.transaction(() => {
      db.exec(`
        DELETE FROM quota_monitor_snapshots;
        DELETE FROM quota_monitor_model_logs;
      `)

      for (const row of payload.snapshots) {
        insertSnapshot.run({
          profileId: row.profileId,
          tokenName: row.tokenName,
          fetchedAt: row.fetchedAt,
          todayUsedQuota: clampToNonNegative(row.todayUsedQuota),
          todayUsageCount: clampToNonNegative(row.todayUsageCount),
          remainQuotaValue: clampToNonNegative(row.remainQuotaValue),
          remainQuotaDisplay: row.remainQuotaDisplay,
          expiredTimeFormatted: row.expiredTimeFormatted,
          statusText: row.statusText,
          remainRatio: clampToNonNegative(row.remainRatio),
        })
      }

      for (const row of payload.modelLogs) {
        insertModelLog.run({
          profileId: row.profileId,
          tokenName: row.tokenName,
          modelName: row.modelName,
          createdAtEpoch: normalizeEpochSeconds(row.createdAtEpoch),
          createdTimeText: row.createdTimeText,
          promptTokens: clampToNonNegative(row.promptTokens),
          completionTokens: clampToNonNegative(row.completionTokens),
          totalTokens: clampToNonNegative(row.totalTokens),
          quota: clampToNonNegative(row.quota),
          fetchedAt: row.fetchedAt,
        })
      }
    })

    writeTx()
  }

  public async buildProfileHistory(params: {
    profileId: string
    tokenName: string | null
    dailyRangeDays: number
    hourlyRangeHours: number
    keyType: 'normal' | 'capped'
    dailyInitialQuota: number
    hourlyIncreaseQuota: number
    quotaCap: number
    now?: Date
  }): Promise<QuotaMonitorProfileHistorySnapshot> {
    const now = params.now ?? new Date()
    const latestSnapshot = this.readLatestSnapshot(params.profileId)
    const dailyTrend = this.getDailyTrend(params.profileId, params.dailyRangeDays, now)
    const hourlyTrend = this.getHourlyTrend(params.profileId, params.hourlyRangeHours, now)
    const usageRatePerHour = this.estimateUsageRatePerHour(params.profileId, now)
    const estimatedRemainingHours =
      latestSnapshot && usageRatePerHour && usageRatePerHour > 0
        ? latestSnapshot.remainQuotaValue / usageRatePerHour
        : null
    const workDurationTodaySeconds = Math.floor(
      this.getWorkDuration(params.profileId, now, { allTime: false }) / 1000,
    )
    const workDurationAllTimeSeconds = Math.floor(
      this.getWorkDuration(params.profileId, now, { allTime: true }) / 1000,
    )
    const modelUsageSummary = this.getModelUsageSummary(params.profileId, now)
    const dailyTokenTrend = this.getDailyTokenTrendByModel(
      params.profileId,
      params.dailyRangeDays,
      now,
    )
    const hourlyTokenTrend = this.getHourlyTokenTrendByModel(
      params.profileId,
      params.hourlyRangeHours,
      now,
    )
    const cappedInsight =
      params.keyType === 'capped'
        ? this.buildCappedInsight({
            profileId: params.profileId,
            now,
            dailyInitialQuota: params.dailyInitialQuota,
            hourlyIncreaseQuota: params.hourlyIncreaseQuota,
            quotaCap: params.quotaCap,
          })
        : null

    return {
      dailyTrend,
      hourlyTrend,
      estimatedRemainingHours,
      workDurationTodaySeconds,
      workDurationAllTimeSeconds,
      modelUsageSummary,
      dailyTokenTrend,
      hourlyTokenTrend,
      cappedInsight,
    }
  }

  private getDb(): Database.Database {
    if (this.db) {
      return this.db
    }

    const db = new Database(this.dbPath)
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS quota_monitor_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL,
        token_name TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        today_used_quota REAL NOT NULL,
        today_usage_count INTEGER NOT NULL,
        remain_quota_value REAL NOT NULL,
        remain_quota_display TEXT NOT NULL,
        expired_time_formatted TEXT NOT NULL,
        status_text TEXT NOT NULL,
        remain_ratio REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_quota_monitor_snapshots_profile_time
      ON quota_monitor_snapshots(profile_id, fetched_at DESC);

      CREATE INDEX IF NOT EXISTS idx_quota_monitor_snapshots_token_time
      ON quota_monitor_snapshots(token_name, fetched_at DESC);

      CREATE TABLE IF NOT EXISTS quota_monitor_model_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL,
        token_name TEXT NOT NULL,
        model_name TEXT NOT NULL,
        created_at_epoch INTEGER NOT NULL,
        created_time_text TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        quota REAL NOT NULL,
        fetched_at TEXT NOT NULL,
        UNIQUE (
          profile_id,
          token_name,
          model_name,
          created_at_epoch,
          prompt_tokens,
          completion_tokens,
          quota
        )
      );

      CREATE INDEX IF NOT EXISTS idx_quota_monitor_model_logs_profile_time
      ON quota_monitor_model_logs(profile_id, created_at_epoch DESC);

      CREATE INDEX IF NOT EXISTS idx_quota_monitor_model_logs_token_model
      ON quota_monitor_model_logs(token_name, model_name);
    `)

    this.db = db
    return db
  }

  private readSnapshotRows(profileId: string, options?: { since?: Date }): SnapshotRow[] {
    const db = this.getDb()
    const since = options?.since ?? null
    const rows = db
      .prepare(
        since
          ? `
              SELECT fetched_at, today_used_quota, today_usage_count
              FROM quota_monitor_snapshots
              WHERE profile_id = ? AND fetched_at >= ?
              ORDER BY fetched_at ASC
            `
          : `
              SELECT fetched_at, today_used_quota, today_usage_count
              FROM quota_monitor_snapshots
              WHERE profile_id = ?
              ORDER BY fetched_at ASC
            `,
      )
      .all(...(since ? [profileId, since.toISOString()] : [profileId])) as Array<{
      fetched_at: string
      today_used_quota: number
      today_usage_count: number
    }>

    return rows
      .map(row => ({
        fetchedAt: new Date(row.fetched_at),
        todayUsedQuota: clampToNonNegative(row.today_used_quota),
        todayUsageCount: clampToNonNegative(row.today_usage_count),
      }))
      .filter(row => !Number.isNaN(row.fetchedAt.getTime()))
  }

  private getDailyTrend(profileId: string, days: number, now: Date): QuotaMonitorTrendPointDto[] {
    if (days <= 0) {
      return []
    }

    const start = startOfLocalDay(now)
    start.setDate(start.getDate() - (days - 1))
    const rows = this.readSnapshotRows(profileId, { since: start })
    const buckets = new Map<string, SnapshotRow[]>()
    for (const row of rows) {
      const key = toDateKey(row.fetchedAt)
      const items = buckets.get(key)
      if (items) {
        items.push(row)
      } else {
        buckets.set(key, [row])
      }
    }

    const result: QuotaMonitorTrendPointDto[] = []
    for (let index = 0; index < days; index += 1) {
      const day = new Date(start)
      day.setDate(start.getDate() + index)
      const key = toDateKey(day)
      const items = buckets.get(key) ?? []
      result.push({
        label: formatDayLabel(day),
        quota: this.computeDailyQuota(items),
        count: this.computeDailyCount(items),
      })
    }

    return result
  }

  private getHourlyTrend(profileId: string, hours: number, now: Date): QuotaMonitorTrendPointDto[] {
    if (hours <= 0) {
      return []
    }

    const endHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
    const start = new Date(endHour)
    start.setHours(endHour.getHours() - (hours - 1))
    const rows = this.readSnapshotRows(profileId, { since: start })
    const previous = this.readLastSnapshotBefore(profileId, start)
    const historyRows = previous ? [previous, ...rows] : rows
    const buckets = new Map<string, SnapshotRow[]>()
    for (const row of rows) {
      const key = toHourKey(new Date(
        row.fetchedAt.getFullYear(),
        row.fetchedAt.getMonth(),
        row.fetchedAt.getDate(),
        row.fetchedAt.getHours(),
      ))
      const items = buckets.get(key)
      if (items) {
        items.push(row)
      } else {
        buckets.set(key, [row])
      }
    }

    const result: QuotaMonitorTrendPointDto[] = []
    for (let index = 0; index < hours; index += 1) {
      const hour = new Date(start)
      hour.setHours(start.getHours() + index)
      const key = toHourKey(hour)
      const items = buckets.get(key) ?? []
      const baseline = this.findLastSnapshotBefore(historyRows, hour)
      const calcRows = baseline ? [baseline, ...items] : items

      result.push({
        label: formatHourLabel(hour),
        quota: this.computeHourlyQuotaIncrement(calcRows),
        count: this.computeHourlyCountIncrement(calcRows),
      })
    }

    return result
  }

  private estimateUsageRatePerHour(profileId: string, now: Date): number | null {
    const rows = this.readSnapshotRows(profileId)
    if (rows.length < 2) {
      return null
    }

    const samples: UsageRateSample[] = []
    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]
      const current = rows[index]
      const deltaQuota = current.todayUsedQuota - previous.todayUsedQuota
      if (deltaQuota <= 0) {
        continue
      }

      const deltaMs = current.fetchedAt.getTime() - previous.fetchedAt.getTime()
      if (deltaMs <= 0) {
        continue
      }

      const deltaHours = deltaMs / (1000 * 60 * 60)
      if (deltaHours < 1 / 60 || deltaHours > 8) {
        continue
      }

      samples.push({
        ts: current.fetchedAt,
        deltaQuota,
        deltaHours,
      })
    }

    if (samples.length === 0) {
      return null
    }

    const recentSamples = samples.filter(sample => now.getTime() - sample.ts.getTime() <= 24 * 60 * 60 * 1000)
    const relevant = recentSamples.length > 0 ? recentSamples : samples.slice(-24)
    let totalWeight = 0
    let weightedRate = 0
    for (let index = relevant.length - 1; index >= 0; index -= 1) {
      const distance = relevant.length - 1 - index
      const weight = 0.72 ** distance
      weightedRate += weight * (relevant[index].deltaQuota / relevant[index].deltaHours)
      totalWeight += weight
    }

    if (totalWeight <= 0) {
      return null
    }

    return weightedRate / totalWeight
  }

  private getWorkDuration(
    profileId: string,
    now: Date,
    options: { allTime: boolean },
  ): number {
    const rows = this.readSnapshotRows(profileId, {
      since: options.allTime ? undefined : startOfLocalDay(now),
    })
    if (rows.length < 2) {
      return 0
    }

    let total = 0
    let activeStart: Date | null = null
    let lastChange = rows[0].fetchedAt
    let lastQuota = rows[0].todayUsedQuota

    for (let index = 1; index < rows.length; index += 1) {
      const current = rows[index]
      if (current.todayUsedQuota !== lastQuota) {
        activeStart ??= current.fetchedAt
        lastChange = current.fetchedAt
        lastQuota = current.todayUsedQuota
        continue
      }

      if (!activeStart) {
        continue
      }

      const idleMs = current.fetchedAt.getTime() - lastChange.getTime()
      if (idleMs >= DEFAULT_IDLE_THRESHOLD_MS) {
        total += lastChange.getTime() + DEFAULT_IDLE_THRESHOLD_MS - activeStart.getTime()
        activeStart = null
      }
    }

    if (activeStart) {
      const idleMs = now.getTime() - lastChange.getTime()
      const endMs =
        idleMs >= DEFAULT_IDLE_THRESHOLD_MS
          ? lastChange.getTime() + DEFAULT_IDLE_THRESHOLD_MS
          : now.getTime()
      total += endMs - activeStart.getTime()
    }

    return Math.max(0, total)
  }

  private getModelUsageSummary(
    profileId: string,
    now: Date,
  ): QuotaMonitorModelUsageSummaryDto | null {
    const db = this.getDb()
    const todayStartEpoch = Math.floor(startOfLocalDay(now).getTime() / 1000)
    const summary = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total_calls,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(CASE WHEN created_at_epoch >= ? THEN total_tokens ELSE 0 END), 0) AS today_tokens,
            COUNT(DISTINCT strftime('%Y-%m-%d', created_at_epoch, 'unixepoch', 'localtime')) AS active_days,
            MAX(created_at_epoch) AS latest_epoch
          FROM quota_monitor_model_logs
          WHERE profile_id = ?
        `,
      )
      .get(todayStartEpoch, profileId) as
      | {
          total_calls?: number
          total_tokens?: number
          today_tokens?: number
          active_days?: number
          latest_epoch?: number | null
        }
      | undefined

    const totalCalls = clampToNonNegative(summary?.total_calls ?? 0)
    if (totalCalls <= 0) {
      return null
    }

    const metricRows = db
      .prepare(
        `
          SELECT
            model_name,
            COUNT(*) AS model_calls,
            COALESCE(SUM(total_tokens), 0) AS model_tokens,
            COALESCE(SUM(CASE WHEN created_at_epoch >= ? THEN total_tokens ELSE 0 END), 0) AS model_today_tokens,
            COUNT(DISTINCT strftime('%Y-%m-%d', created_at_epoch, 'unixepoch', 'localtime')) AS model_active_days
          FROM quota_monitor_model_logs
          WHERE profile_id = ?
          GROUP BY model_name
          ORDER BY model_calls DESC, model_name ASC
        `,
      )
      .all(todayStartEpoch, profileId) as ModelMetricRow[]

    const activeDays = clampToNonNegative(summary?.active_days ?? 0)
    const totalTokens = clampToNonNegative(summary?.total_tokens ?? 0)
    return {
      totalCalls,
      totalTokens,
      todayTokens: clampToNonNegative(summary?.today_tokens ?? 0),
      activeDays,
      averageDailyTokens: activeDays > 0 ? totalTokens / activeDays : 0,
      latestRequestTime:
        typeof summary?.latest_epoch === 'number' && summary.latest_epoch > 0
          ? new Date(summary.latest_epoch * 1000).toISOString()
          : null,
      models: metricRows.map(row => {
        const activeModelDays = clampToNonNegative(row.model_active_days)
        const totalModelTokens = clampToNonNegative(row.model_tokens)
        return {
          modelName: row.model_name?.trim() || 'unknown',
          calls: clampToNonNegative(row.model_calls),
          todayTokens: clampToNonNegative(row.model_today_tokens),
          totalTokens: totalModelTokens,
          activeDays: activeModelDays,
          averageDailyTokens: activeModelDays > 0 ? totalModelTokens / activeModelDays : 0,
        }
      }),
    }
  }

  private getHourlyTokenTrendByModel(
    profileId: string,
    hours: number,
    now: Date,
  ): QuotaMonitorModelTrendDto {
    if (hours <= 0) {
      return buildEmptyModelTrend()
    }

    const db = this.getDb()
    const endHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours())
    const start = new Date(endHour)
    start.setHours(endHour.getHours() - (hours - 1))
    const startEpoch = Math.floor(start.getTime() / 1000)
    const rows = db
      .prepare(
        `
          SELECT model_name, created_at_epoch, total_tokens
          FROM quota_monitor_model_logs
          WHERE profile_id = ? AND created_at_epoch >= ?
          ORDER BY created_at_epoch ASC
        `,
      )
      .all(profileId, startEpoch) as Array<{
      model_name: string
      created_at_epoch: number
      total_tokens: number
    }>

    return this.buildModelTrend(rows, hours, start, 'hour')
  }

  private getDailyTokenTrendByModel(
    profileId: string,
    days: number,
    now: Date,
  ): QuotaMonitorModelTrendDto {
    if (days <= 0) {
      return buildEmptyModelTrend()
    }

    const db = this.getDb()
    const start = startOfLocalDay(now)
    start.setDate(start.getDate() - (days - 1))
    const startEpoch = Math.floor(start.getTime() / 1000)
    const rows = db
      .prepare(
        `
          SELECT model_name, created_at_epoch, total_tokens
          FROM quota_monitor_model_logs
          WHERE profile_id = ? AND created_at_epoch >= ?
          ORDER BY created_at_epoch ASC
        `,
      )
      .all(profileId, startEpoch) as Array<{
      model_name: string
      created_at_epoch: number
      total_tokens: number
    }>

    return this.buildModelTrend(rows, days, start, 'day')
  }

  private buildModelTrend(
    rows: Array<{ model_name: string; created_at_epoch: number; total_tokens: number }>,
    length: number,
    start: Date,
    granularity: 'day' | 'hour',
  ): QuotaMonitorModelTrendDto {
    const labels: string[] = []
    const bucketKeys: string[] = []
    const buckets = new Map<string, Map<string, number>>()

    for (let index = 0; index < length; index += 1) {
      const bucketTime = new Date(start)
      if (granularity === 'day') {
        bucketTime.setDate(start.getDate() + index)
      } else {
        bucketTime.setHours(start.getHours() + index)
      }

      const key = granularity === 'day' ? toDateKey(bucketTime) : toHourKey(bucketTime)
      bucketKeys.push(key)
      labels.push(granularity === 'day' ? formatDayLabel(bucketTime) : formatHourLabel(bucketTime))
      buckets.set(key, new Map())
    }

    const modelTotals = new Map<string, number>()
    for (const row of rows) {
      const epoch = normalizeEpochSeconds(row.created_at_epoch)
      if (epoch <= 0) {
        continue
      }

      const timestamp = new Date(epoch * 1000)
      const bucketTime =
        granularity === 'day'
          ? new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate())
          : new Date(
              timestamp.getFullYear(),
              timestamp.getMonth(),
              timestamp.getDate(),
              timestamp.getHours(),
            )
      const bucketKey = granularity === 'day' ? toDateKey(bucketTime) : toHourKey(bucketTime)
      const bucket = buckets.get(bucketKey)
      if (!bucket) {
        continue
      }

      const modelName = row.model_name?.trim() || 'unknown'
      const value = clampToNonNegative(row.total_tokens)
      bucket.set(modelName, (bucket.get(modelName) ?? 0) + value)
      modelTotals.set(modelName, (modelTotals.get(modelName) ?? 0) + value)
    }

    const models = [...modelTotals.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([modelName]) => modelName)
    const seriesByModel: Record<string, number[]> = {}
    for (const modelName of models) {
      seriesByModel[modelName] = bucketKeys.map(bucketKey => buckets.get(bucketKey)?.get(modelName) ?? 0)
    }

    return {
      labels,
      seriesByModel,
    }
  }

  private buildCappedInsight(params: {
    profileId: string
    now: Date
    dailyInitialQuota: number
    hourlyIncreaseQuota: number
    quotaCap: number
  }): QuotaMonitorCappedInsightDto | null {
    if (
      params.quotaCap <= 0 ||
      params.dailyInitialQuota < 0 ||
      params.hourlyIncreaseQuota < 0
    ) {
      return null
    }

    const latest = this.readLatestSnapshot(params.profileId)
    if (!latest) {
      return null
    }

    const dayStart = startOfLocalDay(params.now)
    const elapsedHours = Math.max(
      0,
      Math.min(24, Math.floor((params.now.getTime() - dayStart.getTime()) / (1000 * 60 * 60))),
    )
    const futureHours = Math.max(0, 24 - elapsedHours)
    const theoretical = params.dailyInitialQuota + elapsedHours * params.hourlyIncreaseQuota
    const effective = latest.todayUsedQuota + latest.remainQuotaValue
    const wastedToday = Math.max(0, theoretical - effective)
    const requiredConsume = Math.max(
      0,
      latest.remainQuotaValue + futureHours * params.hourlyIncreaseQuota - params.quotaCap,
    )

    let wastedTotal = wastedToday
    const dailyOverflow = Math.max(
      0,
      params.dailyInitialQuota + 24 * params.hourlyIncreaseQuota - params.quotaCap,
    )
    if (dailyOverflow > 0) {
      const history = this.getDailyTrend(params.profileId, 30, params.now)
      wastedTotal += history
        .slice(0, Math.max(0, history.length - 1))
        .reduce((sum, item) => sum + Math.max(0, dailyOverflow - item.quota), 0)
    }

    const nextTopUpInMinutes =
      params.hourlyIncreaseQuota > 0 ? Math.max(0, 60 - params.now.getMinutes()) : null

    return createCappedInsight({
      wastedTodayQuota: wastedToday,
      wastedTotalQuota: wastedTotal,
      requiredConsume,
      nextTopUpInMinutes,
      nextTopUpAmount: params.hourlyIncreaseQuota > 0 ? params.hourlyIncreaseQuota : null,
    })
  }

  private readLatestSnapshot(profileId: string): {
    todayUsedQuota: number
    remainQuotaValue: number
  } | null {
    const db = this.getDb()
    const row = db
      .prepare(
        `
          SELECT today_used_quota, remain_quota_value
          FROM quota_monitor_snapshots
          WHERE profile_id = ?
          ORDER BY fetched_at DESC
          LIMIT 1
        `,
      )
      .get(profileId) as { today_used_quota?: number; remain_quota_value?: number } | undefined

    if (!row) {
      return null
    }

    return {
      todayUsedQuota: clampToNonNegative(row.today_used_quota ?? 0),
      remainQuotaValue: clampToNonNegative(row.remain_quota_value ?? 0),
    }
  }

  private readLastSnapshotBefore(profileId: string, before: Date): SnapshotRow | null {
    const db = this.getDb()
    const row = db
      .prepare(
        `
          SELECT fetched_at, today_used_quota, today_usage_count
          FROM quota_monitor_snapshots
          WHERE profile_id = ? AND fetched_at < ?
          ORDER BY fetched_at DESC
          LIMIT 1
        `,
      )
      .get(profileId, before.toISOString()) as
      | {
          fetched_at?: string
          today_used_quota?: number
          today_usage_count?: number
        }
      | undefined

    if (!row?.fetched_at) {
      return null
    }

    const fetchedAt = new Date(row.fetched_at)
    if (Number.isNaN(fetchedAt.getTime())) {
      return null
    }

    return {
      fetchedAt,
      todayUsedQuota: clampToNonNegative(row.today_used_quota ?? 0),
      todayUsageCount: clampToNonNegative(row.today_usage_count ?? 0),
    }
  }

  private computeDailyQuota(items: SnapshotRow[]): number {
    if (items.length === 0) {
      return 0
    }

    let quota = clampToNonNegative(items[0].todayUsedQuota)
    for (let index = 1; index < items.length; index += 1) {
      const delta = items[index].todayUsedQuota - items[index - 1].todayUsedQuota
      if (delta > 0) {
        quota += delta
      }
    }

    return clampToNonNegative(quota)
  }

  private computeDailyCount(items: SnapshotRow[]): number {
    if (items.length === 0) {
      return 0
    }

    let count = clampToNonNegative(items[0].todayUsageCount)
    for (let index = 1; index < items.length; index += 1) {
      const delta = items[index].todayUsageCount - items[index - 1].todayUsageCount
      if (delta > 0) {
        count += delta
      }
    }

    return clampToNonNegative(count)
  }

  private computeHourlyQuotaIncrement(rows: SnapshotRow[]): number {
    if (rows.length < 2) {
      return 0
    }

    let quota = 0
    for (let index = 1; index < rows.length; index += 1) {
      const delta = rows[index].todayUsedQuota - rows[index - 1].todayUsedQuota
      if (delta > 0) {
        quota += delta
      }
    }

    return clampToNonNegative(quota)
  }

  private computeHourlyCountIncrement(rows: SnapshotRow[]): number {
    if (rows.length < 2) {
      return 0
    }

    let count = 0
    for (let index = 1; index < rows.length; index += 1) {
      const delta = rows[index].todayUsageCount - rows[index - 1].todayUsageCount
      if (delta > 0) {
        count += delta
      }
    }

    return clampToNonNegative(count)
  }

  private findLastSnapshotBefore(rows: SnapshotRow[], before: Date): SnapshotRow | null {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index].fetchedAt.getTime() < before.getTime()) {
        return rows[index]
      }
    }

    return null
  }
}
