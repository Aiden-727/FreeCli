import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  QuotaMonitorProfileStateDto,
  QuotaMonitorSettingsDto,
  QuotaMonitorStateDto,
} from '../../../src/shared/contracts/dto'
import {
  DEFAULT_QUOTA_MONITOR_SETTINGS,
  createDefaultQuotaMonitorKeyProfile,
} from '../../../src/contexts/plugins/domain/quotaMonitorSettings'
import { QuotaMonitorPluginController } from '../../../src/plugins/quotaMonitor/presentation/main/QuotaMonitorPluginController'
import {
  QuotaMonitorHttpClient,
  QuotaMonitorRequestError,
} from '../../../src/plugins/quotaMonitor/presentation/main/QuotaMonitorHttpClient'
import { createQuotaMonitorModelLogFingerprint } from '../../../src/plugins/quotaMonitor/domain/modelLogFingerprint'

function createSettings(overrides: Partial<QuotaMonitorSettingsDto> = {}): QuotaMonitorSettingsDto {
  return {
    ...DEFAULT_QUOTA_MONITOR_SETTINGS,
    apiBaseUrl: 'https://quota.example.test/token_stats',
    refreshIntervalMs: 60_000,
    keyProfiles: [
      {
        ...createDefaultQuotaMonitorKeyProfile(0),
        id: 'primary',
        label: 'Primary',
        apiKey: 'key-primary',
      },
    ],
    ...overrides,
  }
}

function createProfileState(
  overrides: Partial<QuotaMonitorProfileStateDto> = {},
): QuotaMonitorProfileStateDto {
  return {
    profileId: 'primary',
    label: 'Primary',
    keyType: 'normal',
    tokenName: 'Primary Token',
    todayUsedQuota: 12,
    todayUsedQuotaIntDisplay: '12',
    averageQuotaPerCall: 3,
    remainQuotaDisplay: '88',
    remainQuotaValue: 88,
    remainQuotaIntDisplay: '88',
    todayUsageCount: 4,
    expiredTimeFormatted: '2026-12-31',
    remainingDaysLabel: '剩余264天',
    estimatedRemainingHours: 22,
    estimatedRemainingTimeLabel: '22时0分',
    statusText: '正常',
    remainRatio: 0.88,
    workDurationTodaySeconds: 0,
    workDurationAllTimeSeconds: 0,
    dailyTrend: [],
    hourlyTrend: [],
    modelUsageSummary: null,
    dailyTokenTrend: { labels: [], seriesByModel: {} },
    hourlyTokenTrend: { labels: [], seriesByModel: {} },
    cappedInsight: null,
    lastFetchedAt: '2026-04-02T00:00:00.000Z',
    error: null,
    ...overrides,
  }
}

describe('QuotaMonitorPluginController', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('aggregates ready state when all configured profiles refresh successfully', async () => {
    const emitted: QuotaMonitorStateDto[] = []
    const client = {
      fetchProfile: vi.fn().mockResolvedValue(createProfileState()),
      fetchProfileLogs: vi
        .fn()
        .mockResolvedValue({ logs: [], page: 1, pageSize: 100, total: 0, totalPages: 1 }),
    }
    const historyStore = {
      appendSnapshot: vi.fn().mockResolvedValue(undefined),
      getLatestModelLogEpoch: vi.fn().mockResolvedValue(null),
      getLatestModelLogBoundary: vi.fn().mockResolvedValue({
        maxEpoch: null,
        fingerprintsAtMaxEpoch: new Set<string>(),
      }),
      saveModelLogs: vi.fn().mockResolvedValue(0),
      buildProfileHistory: vi.fn().mockResolvedValue({
        estimatedRemainingHours: 20,
        workDurationTodaySeconds: 1800,
        workDurationAllTimeSeconds: 3600,
        dailyTrend: [],
        hourlyTrend: [],
        modelUsageSummary: null,
        dailyTokenTrend: { labels: [], seriesByModel: {} },
        hourlyTokenTrend: { labels: [], seriesByModel: {} },
        cappedInsight: null,
      }),
      dispose: vi.fn(),
    }
    const controller = new QuotaMonitorPluginController({
      client: client as unknown as QuotaMonitorHttpClient,
      historyStore: historyStore as never,
      emitState: state => {
        emitted.push(state)
      },
    })

    controller.syncSettings(createSettings())
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    const state = controller.getState()
    expect(client.fetchProfile).toHaveBeenCalledTimes(1)
    expect(historyStore.appendSnapshot).toHaveBeenCalledTimes(1)
    expect(client.fetchProfileLogs).toHaveBeenCalledTimes(1)
    expect(state.status).toBe('ready')
    expect(state.successfulProfileCount).toBe(1)
    expect(state.lastError).toBeNull()
    expect(state.profiles).toHaveLength(1)
    expect(state.profiles[0]?.workDurationTodaySeconds).toBe(1800)
    expect(emitted.at(-1)?.status).toBe('ready')

    await controller.dispose()
  })

  it('reports partial_error when some profiles fail', async () => {
    const client = {
      fetchProfile: vi
        .fn()
        .mockImplementation(async (_settings: QuotaMonitorSettingsDto, profile: { id: string }) => {
          if (profile.id === 'secondary') {
            throw new QuotaMonitorRequestError({
              type: 'network',
              message: '网络连接失败',
              detail: 'ECONNRESET',
            })
          }

          return createProfileState()
        }),
      fetchProfileLogs: vi
        .fn()
        .mockResolvedValue({ logs: [], page: 1, pageSize: 100, total: 0, totalPages: 1 }),
    }
    const historyStore = {
      appendSnapshot: vi.fn().mockResolvedValue(undefined),
      getLatestModelLogEpoch: vi.fn().mockResolvedValue(null),
      getLatestModelLogBoundary: vi.fn().mockResolvedValue({
        maxEpoch: null,
        fingerprintsAtMaxEpoch: new Set<string>(),
      }),
      saveModelLogs: vi.fn().mockResolvedValue(0),
      buildProfileHistory: vi.fn().mockResolvedValue({
        estimatedRemainingHours: null,
        workDurationTodaySeconds: 0,
        workDurationAllTimeSeconds: 0,
        dailyTrend: [],
        hourlyTrend: [],
        modelUsageSummary: null,
        dailyTokenTrend: { labels: [], seriesByModel: {} },
        hourlyTokenTrend: { labels: [], seriesByModel: {} },
        cappedInsight: null,
      }),
      dispose: vi.fn(),
    }
    const controller = new QuotaMonitorPluginController({
      client: client as unknown as QuotaMonitorHttpClient,
      historyStore: historyStore as never,
      emitState: () => undefined,
    })

    controller.syncSettings(
      createSettings({
        keyProfiles: [
          {
            ...createDefaultQuotaMonitorKeyProfile(0),
            id: 'primary',
            label: 'Primary',
            apiKey: 'key-primary',
          },
          {
            ...createDefaultQuotaMonitorKeyProfile(1),
            id: 'secondary',
            label: 'Secondary',
            apiKey: 'key-secondary',
          },
        ],
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    const state = controller.getState()
    expect(client.fetchProfile).toHaveBeenCalledTimes(2)
    expect(state.status).toBe('partial_error')
    expect(state.successfulProfileCount).toBe(1)
    expect(state.lastError).toEqual({
      type: 'network',
      message: '网络连接失败',
      detail: 'ECONNRESET',
    })
    expect(state.profiles).toHaveLength(2)
    expect(historyStore.appendSnapshot).toHaveBeenCalledTimes(1)
    expect(state.profiles.find(profile => profile.profileId === 'secondary')?.error?.type).toBe(
      'network',
    )

    await controller.dispose()
  })

  it('defers timer-driven refresh while no window is focused', async () => {
    vi.useFakeTimers()

    const focusState = { current: false }
    const client = {
      fetchProfile: vi.fn().mockResolvedValue(createProfileState()),
      fetchProfileLogs: vi.fn().mockResolvedValue({
        logs: [],
        page: 1,
        pageSize: 100,
        total: 0,
        totalPages: 1,
      }),
    }
    const historyStore = {
      appendSnapshot: vi.fn().mockResolvedValue(undefined),
      getLatestModelLogEpoch: vi.fn().mockResolvedValue(null),
      saveModelLogs: vi.fn().mockResolvedValue(0),
      buildProfileHistory: vi.fn().mockResolvedValue({
        estimatedRemainingHours: null,
        workDurationTodaySeconds: 0,
        workDurationAllTimeSeconds: 0,
        dailyTrend: [],
        hourlyTrend: [],
        modelUsageSummary: null,
        dailyTokenTrend: { labels: [], seriesByModel: {} },
        hourlyTokenTrend: { labels: [], seriesByModel: {} },
        cappedInsight: null,
      }),
      dispose: vi.fn(),
    }
    const controller = new QuotaMonitorPluginController({
      client: client as unknown as QuotaMonitorHttpClient,
      historyStore: historyStore as never,
      emitState: () => undefined,
      hasFocusedWindow: () => focusState.current,
    })

    controller.syncSettings(createSettings({ refreshIntervalMs: 60_000 }))
    const runtime = controller.createRuntimeFactory()()

    focusState.current = true
    await runtime.activate()
    expect(client.fetchProfile).toHaveBeenCalledTimes(1)

    focusState.current = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(client.fetchProfile).toHaveBeenCalledTimes(1)

    focusState.current = true
    await vi.advanceTimersByTimeAsync(5_000)
    expect(client.fetchProfile).toHaveBeenCalledTimes(2)

    await controller.dispose()
  })

  it('keeps fetching same-second pages until unseen records at the boundary are persisted', async () => {
    const fetchedPages: number[] = []
    const knownSameSecondLog = {
      sourceId: 'known-same-second',
      modelName: 'gpt-5',
      requestEpochSeconds: 1_775_091_900,
      requestTimeText: '2026-04-02 09:05:00.100',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      quota: 12,
    }
    const client = {
      fetchProfile: vi.fn().mockResolvedValue(createProfileState()),
      fetchProfileLogs: vi.fn().mockImplementation(async ({ page }: { page: number }) => {
        fetchedPages.push(page)
        if (page === 1) {
          return {
            logs: [
              {
                sourceId: 'new-same-second',
                modelName: 'gpt-5',
                requestEpochSeconds: 1_775_091_900,
                requestTimeText: '2026-04-02 09:05:00.900',
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
                quota: 12,
              },
            ],
            page: 1,
            pageSize: 100,
            total: 2,
            totalPages: 2,
          }
        }

        return {
          logs: [knownSameSecondLog],
          page: 2,
          pageSize: 100,
          total: 2,
          totalPages: 2,
        }
      }),
    }
    const historyStore = {
      appendSnapshot: vi.fn().mockResolvedValue(undefined),
      getLatestModelLogBoundary: vi.fn().mockResolvedValue({
        maxEpoch: 1_775_091_900,
        fingerprintsAtMaxEpoch: new Set([
          createQuotaMonitorModelLogFingerprint(knownSameSecondLog),
        ]),
      }),
      saveModelLogs: vi.fn().mockResolvedValue(1),
      buildProfileHistory: vi.fn().mockResolvedValue({
        estimatedRemainingHours: null,
        workDurationTodaySeconds: 0,
        workDurationAllTimeSeconds: 0,
        dailyTrend: [],
        hourlyTrend: [],
        modelUsageSummary: null,
        dailyTokenTrend: { labels: [], seriesByModel: {} },
        hourlyTokenTrend: { labels: [], seriesByModel: {} },
        cappedInsight: null,
      }),
      dispose: vi.fn(),
    }

    const controller = new QuotaMonitorPluginController({
      client: client as unknown as QuotaMonitorHttpClient,
      historyStore: historyStore as never,
      emitState: () => undefined,
    })

    controller.syncSettings(createSettings())
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(historyStore.getLatestModelLogBoundary).toHaveBeenCalledTimes(1)
    expect(client.fetchProfileLogs).toHaveBeenCalledTimes(2)
    expect(fetchedPages).toEqual([1, 2])
    expect(historyStore.saveModelLogs).toHaveBeenCalledTimes(1)
    expect(historyStore.saveModelLogs).toHaveBeenCalledWith(
      expect.objectContaining({
        logs: [
          expect.objectContaining({
            sourceId: 'new-same-second',
          }),
        ],
      }),
    )

    await controller.dispose()
  })

  it('continues pagination when the backend omits total pages', async () => {
    const client = {
      fetchProfile: vi.fn().mockResolvedValue(createProfileState()),
      fetchProfileLogs: vi.fn().mockImplementation(async ({ page }: { page: number }) => ({
        logs:
          page === 1
            ? Array.from({ length: 100 }, (_, index) => ({
                sourceId: `log-${index}`,
                modelName: 'gpt-5',
                requestEpochSeconds: 1_775_091_900 - index,
                requestTimeText: `2026-04-02 09:05:${String(index % 60).padStart(2, '0')}`,
                promptTokens: 1,
                completionTokens: 1,
                totalTokens: 2,
                quota: 1,
              }))
            : [],
        page,
        pageSize: 100,
        total: 0,
        totalPages: 0,
      })),
    }
    const historyStore = {
      appendSnapshot: vi.fn().mockResolvedValue(undefined),
      getLatestModelLogBoundary: vi.fn().mockResolvedValue({
        maxEpoch: null,
        fingerprintsAtMaxEpoch: new Set<string>(),
      }),
      saveModelLogs: vi.fn().mockResolvedValue(100),
      buildProfileHistory: vi.fn().mockResolvedValue({
        estimatedRemainingHours: null,
        workDurationTodaySeconds: 0,
        workDurationAllTimeSeconds: 0,
        dailyTrend: [],
        hourlyTrend: [],
        modelUsageSummary: null,
        dailyTokenTrend: { labels: [], seriesByModel: {} },
        hourlyTokenTrend: { labels: [], seriesByModel: {} },
        cappedInsight: null,
      }),
      dispose: vi.fn(),
    }
    const controller = new QuotaMonitorPluginController({
      client: client as unknown as QuotaMonitorHttpClient,
      historyStore: historyStore as never,
      emitState: () => undefined,
    })

    controller.syncSettings(createSettings())
    await controller.createRuntimeFactory()().activate()

    expect(client.fetchProfileLogs).toHaveBeenCalledTimes(2)
    await controller.dispose()
  })
})
