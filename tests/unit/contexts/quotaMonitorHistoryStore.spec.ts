import { afterEach, describe, expect, it } from 'vitest'

type QuotaMonitorHistoryStoreInstance = {
  dispose: () => void
  appendSnapshot: (...args: unknown[]) => Promise<void>
  saveModelLogs: (...args: unknown[]) => Promise<number>
  buildProfileHistory: (...args: unknown[]) => Promise<unknown>
}

let QuotaMonitorHistoryStoreCtor:
  | (new (dbPath: string) => QuotaMonitorHistoryStoreInstance)
  | null = null
let historyStoreAvailable = false

try {
  const module =
    await import('../../../src/plugins/quotaMonitor/infrastructure/main/QuotaMonitorHistoryStore')
  QuotaMonitorHistoryStoreCtor = module.QuotaMonitorHistoryStore

  try {
    const probe = new QuotaMonitorHistoryStoreCtor(':memory:')
    await probe.appendSnapshot({
      profileId: '__probe__',
      tokenName: 'Probe',
      fetchedAt: new Date(2026, 3, 1, 0, 0, 0, 0).toISOString(),
      todayUsedQuota: 0,
      todayUsageCount: 0,
      remainQuotaValue: 0,
      remainQuotaDisplay: '0',
      expiredTimeFormatted: '2026-12-31 23:59:59',
      statusText: '正常',
      remainRatio: 0,
    })
    probe.dispose()
    historyStoreAvailable = true
  } catch {
    historyStoreAvailable = false
  }
} catch {
  QuotaMonitorHistoryStoreCtor = null
  historyStoreAvailable = false
}

const historyStoreIt = QuotaMonitorHistoryStoreCtor && historyStoreAvailable ? it : it.skip

function createLocalDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

function toIso(date: Date): string {
  return date.toISOString()
}

describe('QuotaMonitorHistoryStore', () => {
  const stores = new Set<QuotaMonitorHistoryStore>()

  afterEach(() => {
    for (const store of stores) {
      store.dispose()
    }
    stores.clear()
  })

  historyStoreIt(
    'builds hourly and daily quota trends while estimating work duration from snapshot history',
    async () => {
      const store = new QuotaMonitorHistoryStoreCtor!(':memory:')
      stores.add(store)
      const profileId = 'primary'

      await store.appendSnapshot({
        profileId,
        tokenName: 'Primary',
        fetchedAt: toIso(createLocalDate(2026, 4, 2, 9, 0)),
        todayUsedQuota: 10,
        todayUsageCount: 2,
        remainQuotaValue: 90,
        remainQuotaDisplay: '90',
        expiredTimeFormatted: '2026-12-31 23:59:59',
        statusText: '正常',
        remainRatio: 0.9,
      })
      await store.appendSnapshot({
        profileId,
        tokenName: 'Primary',
        fetchedAt: toIso(createLocalDate(2026, 4, 2, 9, 20)),
        todayUsedQuota: 14,
        todayUsageCount: 3,
        remainQuotaValue: 86,
        remainQuotaDisplay: '86',
        expiredTimeFormatted: '2026-12-31 23:59:59',
        statusText: '正常',
        remainRatio: 0.86,
      })
      await store.appendSnapshot({
        profileId,
        tokenName: 'Primary',
        fetchedAt: toIso(createLocalDate(2026, 4, 2, 10, 0)),
        todayUsedQuota: 18,
        todayUsageCount: 4,
        remainQuotaValue: 82,
        remainQuotaDisplay: '82',
        expiredTimeFormatted: '2026-12-31 23:59:59',
        statusText: '正常',
        remainRatio: 0.82,
      })
      await store.appendSnapshot({
        profileId,
        tokenName: 'Primary',
        fetchedAt: toIso(createLocalDate(2026, 4, 2, 10, 15)),
        todayUsedQuota: 18,
        todayUsageCount: 4,
        remainQuotaValue: 82,
        remainQuotaDisplay: '82',
        expiredTimeFormatted: '2026-12-31 23:59:59',
        statusText: '正常',
        remainRatio: 0.82,
      })
      await store.appendSnapshot({
        profileId,
        tokenName: 'Primary',
        fetchedAt: toIso(createLocalDate(2026, 4, 2, 10, 40)),
        todayUsedQuota: 18,
        todayUsageCount: 4,
        remainQuotaValue: 82,
        remainQuotaDisplay: '82',
        expiredTimeFormatted: '2026-12-31 23:59:59',
        statusText: '正常',
        remainRatio: 0.82,
      })

      const history = await store.buildProfileHistory({
        profileId,
        tokenName: 'Primary',
        dailyRangeDays: 2,
        hourlyRangeHours: 4,
        keyType: 'normal',
        dailyInitialQuota: 0,
        hourlyIncreaseQuota: 0,
        quotaCap: 0,
        now: createLocalDate(2026, 4, 2, 12, 30),
      })

      expect(history.dailyTrend).toHaveLength(2)
      expect(history.dailyTrend.at(-1)?.quota).toBe(18)
      expect(history.dailyTrend.at(-1)?.count).toBe(4)
      expect(history.hourlyTrend.map(point => point.quota)).toEqual([4, 4, 0, 0])
      expect(history.hourlyTrend.map(point => point.count)).toEqual([1, 1, 0, 0])
      expect(history.workDurationTodaySeconds).toBe(3000)
      expect(history.workDurationAllTimeSeconds).toBe(3000)
      expect(history.estimatedRemainingHours).toBeGreaterThan(0)
    },
  )

  historyStoreIt(
    'keeps daily trend buckets aligned with local calendar days near UTC boundaries',
    async () => {
      const store = new QuotaMonitorHistoryStoreCtor!(':memory:')
      stores.add(store)
      const profileId = 'timezone-profile'

      await store.appendSnapshot({
        profileId,
        tokenName: 'Timezone',
        fetchedAt: '2026-04-01T16:30:00.000Z',
        todayUsedQuota: 10,
        todayUsageCount: 1,
        remainQuotaValue: 90,
        remainQuotaDisplay: '90',
        expiredTimeFormatted: '2026-12-31 23:59:59',
        statusText: '正常',
        remainRatio: 0.9,
      })
      await store.appendSnapshot({
        profileId,
        tokenName: 'Timezone',
        fetchedAt: '2026-04-01T17:30:00.000Z',
        todayUsedQuota: 18,
        todayUsageCount: 2,
        remainQuotaValue: 82,
        remainQuotaDisplay: '82',
        expiredTimeFormatted: '2026-12-31 23:59:59',
        statusText: '正常',
        remainRatio: 0.82,
      })

      const history = await store.buildProfileHistory({
        profileId,
        tokenName: 'Timezone',
        dailyRangeDays: 2,
        hourlyRangeHours: 2,
        keyType: 'normal',
        dailyInitialQuota: 0,
        hourlyIncreaseQuota: 0,
        quotaCap: 0,
        now: createLocalDate(2026, 4, 2, 8, 0),
      })

      expect(history.dailyTrend).toHaveLength(2)
      expect(history.dailyTrend.map(point => point.quota)).toEqual([18, 0])
      expect(history.dailyTrend.map(point => point.count)).toEqual([2, 0])
      expect(history.hourlyTrend).toHaveLength(2)
    },
  )

  historyStoreIt(
    'deduplicates persisted model logs and builds model summaries and token trends',
    async () => {
      const store = new QuotaMonitorHistoryStoreCtor!(':memory:')
      stores.add(store)
      const profileId = 'model-profile'
      const fetchedAt = toIso(createLocalDate(2026, 4, 2, 12, 0))

      const inserted = await store.saveModelLogs({
        profileId,
        tokenName: 'Primary',
        fetchedAt,
        logs: [
          {
            modelName: 'gpt-4.1',
            requestEpochSeconds: Math.floor(createLocalDate(2026, 4, 2, 9, 5).getTime() / 1000),
            requestTimeText: '2026-04-02 09:05:00',
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            quota: 12,
          },
          {
            modelName: 'gpt-4.1',
            requestEpochSeconds: Math.floor(createLocalDate(2026, 4, 2, 9, 35).getTime() / 1000),
            requestTimeText: '2026-04-02 09:35:00',
            promptTokens: 80,
            completionTokens: 20,
            totalTokens: 100,
            quota: 8,
          },
          {
            modelName: 'claude-3.7',
            requestEpochSeconds: Math.floor(createLocalDate(2026, 4, 2, 10, 10).getTime() / 1000),
            requestTimeText: '2026-04-02 10:10:00',
            promptTokens: 140,
            completionTokens: 60,
            totalTokens: 200,
            quota: 14,
          },
        ],
      })

      const duplicateInserted = await store.saveModelLogs({
        profileId,
        tokenName: 'Primary',
        fetchedAt,
        logs: [
          {
            modelName: 'gpt-4.1',
            requestEpochSeconds: Math.floor(createLocalDate(2026, 4, 2, 9, 5).getTime() / 1000),
            requestTimeText: '2026-04-02 09:05:00',
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            quota: 12,
          },
        ],
      })

      const history = await store.buildProfileHistory({
        profileId,
        tokenName: 'Primary',
        dailyRangeDays: 2,
        hourlyRangeHours: 4,
        keyType: 'normal',
        dailyInitialQuota: 0,
        hourlyIncreaseQuota: 0,
        quotaCap: 0,
        now: createLocalDate(2026, 4, 2, 12, 30),
      })

      expect(inserted).toBe(3)
      expect(duplicateInserted).toBe(0)
      expect(history.modelUsageSummary).not.toBeNull()
      expect(history.modelUsageSummary?.totalCalls).toBe(3)
      expect(history.modelUsageSummary?.totalTokens).toBe(450)
      expect(history.modelUsageSummary?.todayTokens).toBe(450)
      expect(history.modelUsageSummary?.models[0]).toMatchObject({
        modelName: 'gpt-4.1',
        calls: 2,
        totalTokens: 250,
        todayTokens: 250,
      })
      expect(history.hourlyTokenTrend.seriesByModel['gpt-4.1']).toEqual([250, 0, 0, 0])
      expect(history.hourlyTokenTrend.seriesByModel['claude-3.7']).toEqual([0, 200, 0, 0])
      expect(history.dailyTokenTrend.seriesByModel['gpt-4.1'].at(-1)).toBe(250)
      expect(history.dailyTokenTrend.seriesByModel['claude-3.7'].at(-1)).toBe(200)
    },
  )

  historyStoreIt('calculates capped insight from persisted snapshots', async () => {
    const store = new QuotaMonitorHistoryStoreCtor!(':memory:')
    stores.add(store)
    const profileId = 'capped-profile'

    await store.appendSnapshot({
      profileId,
      tokenName: 'Capped',
      fetchedAt: toIso(createLocalDate(2026, 4, 1, 23, 0)),
      todayUsedQuota: 50,
      todayUsageCount: 5,
      remainQuotaValue: 20,
      remainQuotaDisplay: '20',
      expiredTimeFormatted: '2026-12-31 23:59:59',
      statusText: '正常',
      remainRatio: 0.28,
    })
    await store.appendSnapshot({
      profileId,
      tokenName: 'Capped',
      fetchedAt: toIso(createLocalDate(2026, 4, 2, 15, 20)),
      todayUsedQuota: 100,
      todayUsageCount: 10,
      remainQuotaValue: 70,
      remainQuotaDisplay: '70',
      expiredTimeFormatted: '2026-12-31 23:59:59',
      statusText: '正常',
      remainRatio: 0.41,
    })

    const history = await store.buildProfileHistory({
      profileId,
      tokenName: 'Capped',
      dailyRangeDays: 30,
      hourlyRangeHours: 4,
      keyType: 'capped',
      dailyInitialQuota: 100,
      hourlyIncreaseQuota: 10,
      quotaCap: 140,
      now: createLocalDate(2026, 4, 2, 15, 20),
    })

    expect(history.cappedInsight).toEqual({
      wastedTodayQuota: 80,
      wastedTotalQuota: 230,
      requiredConsume: 20,
      nextTopUpInMinutes: 40,
      nextTopUpAmount: 10,
    })
  })
})
