import { BrowserWindow, app } from 'electron'
import { resolve } from 'node:path'
import type {
  QuotaMonitorErrorDto,
  QuotaMonitorKeyProfileDto,
  QuotaMonitorModelTrendDto,
  QuotaMonitorModelUsageSummaryDto,
  QuotaMonitorProfileStateDto,
  QuotaMonitorSettingsDto,
  QuotaMonitorStateDto,
} from '@shared/contracts/dto'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import {
  DEFAULT_QUOTA_MONITOR_SETTINGS,
  getConfiguredQuotaMonitorProfiles,
} from '@contexts/plugins/domain/quotaMonitorSettings'
import {
  hasVisibleFocusedWindow,
  type MainWindowActivityProbe,
} from '../../../shared/presentation/main/windowActivity'
import type {
  MainPluginRuntime,
  MainPluginRuntimeFactory,
} from '../../../../contexts/plugins/application/MainPluginRuntimeHost'
import { QuotaMonitorHttpClient, QuotaMonitorRequestError } from './QuotaMonitorHttpClient'
import { QuotaMonitorHistoryStore } from '../../infrastructure/main/QuotaMonitorHistoryStore'

const CONFIG_REFRESH_DEBOUNCE_MS = 400
const BACKGROUND_REFRESH_RETRY_MS = 5_000
const DEFAULT_DAILY_RANGE_DAYS = 30
const DEFAULT_HOURLY_RANGE_HOURS = 12
const MODEL_LOG_PAGE_SIZE = 100
const MAX_MODEL_LOG_PAGES = 12

function createDefaultState(
  settings: QuotaMonitorSettingsDto,
  isEnabled: boolean,
): QuotaMonitorStateDto {
  return {
    isEnabled,
    isRefreshing: false,
    status: isEnabled ? 'needs_config' : 'disabled',
    lastUpdatedAt: null,
    configuredProfileCount: getConfiguredQuotaMonitorProfiles(settings).length,
    activeProfileCount: settings.keyProfiles.filter(profile => profile.enabled).length,
    successfulProfileCount: 0,
    profiles: [],
    lastError: null,
  }
}

function toProfileErrorState(
  profile: QuotaMonitorKeyProfileDto,
  error: QuotaMonitorErrorDto,
): QuotaMonitorProfileStateDto {
  return {
    profileId: profile.id,
    label: profile.label,
    keyType: profile.type,
    tokenName: null,
    todayUsedQuota: 0,
    todayUsedQuotaIntDisplay: '0',
    averageQuotaPerCall: 0,
    remainQuotaDisplay: '--',
    remainQuotaValue: 0,
    remainQuotaIntDisplay: '--',
    todayUsageCount: 0,
    expiredTimeFormatted: '--',
    remainingDaysLabel: '--',
    estimatedRemainingHours: null,
    estimatedRemainingTimeLabel: '--',
    statusText: '异常',
    remainRatio: 0,
    workDurationTodaySeconds: 0,
    workDurationAllTimeSeconds: 0,
    dailyTrend: [],
    hourlyTrend: [],
    modelUsageSummary: null,
    dailyTokenTrend: createEmptyModelTrend(),
    hourlyTokenTrend: createEmptyModelTrend(),
    cappedInsight:
      profile.type === 'capped'
        ? {
            wastedTodayQuota: 0,
            wastedTotalQuota: 0,
            requiredConsume: 0,
            nextTopUpInMinutes: null,
            nextTopUpAmount: null,
          }
        : null,
    lastFetchedAt: null,
    error,
  }
}

function createEmptyModelTrend(): QuotaMonitorModelTrendDto {
  return {
    labels: [],
    seriesByModel: {},
  }
}

function createEmptyModelUsageSummary(): QuotaMonitorModelUsageSummaryDto | null {
  return null
}

function formatEstimatedRemainingTimeLabel(hours: number | null): string {
  if (hours === null || Number.isNaN(hours) || !Number.isFinite(hours)) {
    return '--'
  }

  const totalMinutes = Math.round(hours * 60)
  if (totalMinutes <= 0) {
    return '--'
  }

  const roundedHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (roundedHours > 9999) {
    return '≥9999时'
  }

  return `${roundedHours}时${minutes}分`
}

function reconcileProfiles(
  previous: QuotaMonitorProfileStateDto[],
  settings: QuotaMonitorSettingsDto,
): QuotaMonitorProfileStateDto[] {
  const previousById = new Map(previous.map(profile => [profile.profileId, profile]))

  return settings.keyProfiles
    .filter(profile => profile.enabled)
    .map(profile => {
      const existing = previousById.get(profile.id)
      if (!existing) {
        return toProfileErrorState(profile, {
          type: 'unknown',
          message: '尚未获取',
          detail: null,
        })
      }

      return {
        ...existing,
        label: profile.label,
        keyType: profile.type,
      }
    })
}

export class QuotaMonitorPluginController {
  private readonly client: QuotaMonitorHttpClient
  private readonly historyStore: QuotaMonitorHistoryStore
  private readonly ensurePersistenceReady: () => Promise<void>
  private readonly emitState: (state: QuotaMonitorStateDto) => void
  private readonly hasFocusedWindow: MainWindowActivityProbe
  private settings: QuotaMonitorSettingsDto = DEFAULT_QUOTA_MONITOR_SETTINGS
  private state: QuotaMonitorStateDto = createDefaultState(DEFAULT_QUOTA_MONITOR_SETTINGS, false)
  private isEnabled = false
  private disposed = false
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private configRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private currentRefreshPromise: Promise<QuotaMonitorStateDto> | null = null
  private refreshVersion = 0

  public constructor(options?: {
    client?: QuotaMonitorHttpClient
    historyStore?: QuotaMonitorHistoryStore
    ensurePersistenceReady?: () => Promise<void>
    dbPath?: string
    emitState?: (state: QuotaMonitorStateDto) => void
    hasFocusedWindow?: MainWindowActivityProbe
  }) {
    const dbPath =
      options?.dbPath ??
      (process.env.NODE_ENV === 'test'
        ? ':memory:'
        : resolve(app.getPath('userData'), 'freecli.db'))
    this.client = options?.client ?? new QuotaMonitorHttpClient()
    this.historyStore = options?.historyStore ?? new QuotaMonitorHistoryStore(dbPath)
    this.ensurePersistenceReady = options?.ensurePersistenceReady ?? (async () => undefined)
    this.emitState = options?.emitState ?? this.broadcastState
    this.hasFocusedWindow = options?.hasFocusedWindow ?? hasVisibleFocusedWindow
  }

  public createRuntimeFactory(): MainPluginRuntimeFactory {
    return () => {
      return {
        activate: async () => {
          await this.activate()
        },
        deactivate: async () => {
          await this.deactivate()
        },
      } satisfies MainPluginRuntime
    }
  }

  public syncSettings(settings: QuotaMonitorSettingsDto): QuotaMonitorStateDto {
    this.settings = settings
    this.applyState({
      ...this.state,
      isEnabled: this.isEnabled,
      status: this.resolveStatus(this.state, this.isEnabled),
      configuredProfileCount: getConfiguredQuotaMonitorProfiles(settings).length,
      activeProfileCount: settings.keyProfiles.filter(profile => profile.enabled).length,
      profiles: reconcileProfiles(this.state.profiles, settings),
    })

    if (this.isEnabled) {
      this.restartRefreshTimer()
      this.scheduleConfigRefresh()
    }

    return this.state
  }

  public getState(): QuotaMonitorStateDto {
    return this.state
  }

  public async refreshNow(): Promise<QuotaMonitorStateDto> {
    if (this.disposed) {
      return this.state
    }

    if (!this.isEnabled) {
      this.applyState({
        ...this.state,
        isEnabled: false,
        isRefreshing: false,
        status: 'disabled',
      })
      return this.state
    }

    const configuredProfiles = getConfiguredQuotaMonitorProfiles(this.settings)
    if (configuredProfiles.length === 0) {
      this.applyState({
        ...this.state,
        isEnabled: true,
        isRefreshing: false,
        status: 'needs_config',
        configuredProfileCount: 0,
        activeProfileCount: this.settings.keyProfiles.filter(profile => profile.enabled).length,
        successfulProfileCount: 0,
        lastError: null,
      })
      this.restartRefreshTimer()
      return this.state
    }

    if (this.currentRefreshPromise) {
      return await this.currentRefreshPromise
    }

    const refreshVersion = ++this.refreshVersion
    this.applyState({
      ...this.state,
      isEnabled: true,
      isRefreshing: true,
      status: 'loading',
      configuredProfileCount: configuredProfiles.length,
      activeProfileCount: this.settings.keyProfiles.filter(profile => profile.enabled).length,
      profiles: reconcileProfiles(this.state.profiles, this.settings),
    })

    const refreshPromise = this.performRefresh(refreshVersion, configuredProfiles).finally(() => {
      if (this.currentRefreshPromise === refreshPromise) {
        this.currentRefreshPromise = null
      }
    })

    this.currentRefreshPromise = refreshPromise
    return await refreshPromise
  }

  public async dispose(): Promise<void> {
    this.disposed = true
    await this.deactivate()
    this.historyStore.dispose()
  }

  private async activate(): Promise<void> {
    if (this.disposed || this.isEnabled) {
      return
    }

    this.isEnabled = true
    this.applyState({
      ...this.state,
      isEnabled: true,
      status: this.resolveStatus(this.state, true),
    })
    await this.refreshNow()
  }

  private async deactivate(): Promise<void> {
    this.isEnabled = false
    this.refreshVersion += 1
    this.clearRefreshTimer()
    this.clearConfigRefreshTimer()
    this.applyState({
      ...this.state,
      isEnabled: false,
      isRefreshing: false,
      status: 'disabled',
    })
  }

  private async performRefresh(
    refreshVersion: number,
    profiles: QuotaMonitorKeyProfileDto[],
  ): Promise<QuotaMonitorStateDto> {
    await this.ensurePersistenceReady()
    const settled = await Promise.all(
      profiles.map(async profile => {
        try {
          const state = await this.client.fetchProfile(this.settings, profile)
          const enrichedState = await this.hydrateProfileHistory(profile, state)

          return {
            profileId: profile.id,
            ok: true as const,
            state: enrichedState,
          }
        } catch (error) {
          const descriptor =
            error instanceof QuotaMonitorRequestError
              ? error.descriptor
              : ({
                  type: 'unknown',
                  message: '未知错误',
                  detail: error instanceof Error ? error.message : null,
                } satisfies QuotaMonitorErrorDto)

          return {
            profileId: profile.id,
            ok: false as const,
            state: toProfileErrorState(profile, descriptor),
            error: descriptor,
          }
        }
      }),
    )

    if (this.disposed || refreshVersion !== this.refreshVersion) {
      return this.state
    }

    const successfulProfiles = settled.filter(result => result.ok)
    const failedProfiles = settled.filter(result => !result.ok)
    const nextState: QuotaMonitorStateDto = {
      isEnabled: this.isEnabled,
      isRefreshing: false,
      status:
        failedProfiles.length === 0
          ? 'ready'
          : successfulProfiles.length > 0
            ? 'partial_error'
            : 'error',
      lastUpdatedAt: new Date().toISOString(),
      configuredProfileCount: profiles.length,
      activeProfileCount: this.settings.keyProfiles.filter(profile => profile.enabled).length,
      successfulProfileCount: successfulProfiles.length,
      profiles: settled
        .map(result => result.state)
        .sort((left, right) => left.label.localeCompare(right.label)),
      lastError: failedProfiles[0]?.error ?? null,
    }

    this.applyState(nextState)
    this.restartRefreshTimer()
    return this.state
  }

  private resolveStatus(
    state: QuotaMonitorStateDto,
    isEnabled: boolean,
  ): QuotaMonitorStateDto['status'] {
    if (!isEnabled) {
      return 'disabled'
    }

    if (state.isRefreshing) {
      return 'loading'
    }

    if (getConfiguredQuotaMonitorProfiles(this.settings).length === 0) {
      return 'needs_config'
    }

    return state.lastUpdatedAt ? state.status : 'idle'
  }

  private scheduleConfigRefresh(delayMs = CONFIG_REFRESH_DEBOUNCE_MS): void {
    this.clearConfigRefreshTimer()
    this.configRefreshTimer = setTimeout(() => {
      if (this.shouldDeferBackgroundRefresh()) {
        this.scheduleConfigRefresh(BACKGROUND_REFRESH_RETRY_MS)
        return
      }

      void this.refreshNow()
    }, delayMs)
  }

  private restartRefreshTimer(delayMs = this.settings.refreshIntervalMs): void {
    this.clearRefreshTimer()
    if (!this.isEnabled || this.disposed) {
      return
    }

    this.refreshTimer = setTimeout(() => {
      if (this.shouldDeferBackgroundRefresh()) {
        this.restartRefreshTimer(BACKGROUND_REFRESH_RETRY_MS)
        return
      }

      void this.refreshNow()
    }, delayMs)
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private clearConfigRefreshTimer(): void {
    if (this.configRefreshTimer) {
      clearTimeout(this.configRefreshTimer)
      this.configRefreshTimer = null
    }
  }

  private shouldDeferBackgroundRefresh(): boolean {
    return this.isEnabled && !this.disposed && !this.hasFocusedWindow()
  }

  private applyState(nextState: QuotaMonitorStateDto): void {
    this.state = nextState
    this.emitState(this.state)
  }

  private async hydrateProfileHistory(
    profile: QuotaMonitorKeyProfileDto,
    state: QuotaMonitorProfileStateDto,
  ): Promise<QuotaMonitorProfileStateDto> {
    await this.historyStore.appendSnapshot({
      profileId: profile.id,
      tokenName: state.tokenName ?? profile.label,
      fetchedAt: state.lastFetchedAt ?? new Date().toISOString(),
      todayUsedQuota: state.todayUsedQuota,
      todayUsageCount: state.todayUsageCount,
      remainQuotaValue: state.remainQuotaValue,
      remainQuotaDisplay: state.remainQuotaDisplay,
      expiredTimeFormatted: state.expiredTimeFormatted,
      statusText: state.statusText,
      remainRatio: state.remainRatio,
    })

    await this.syncModelLogs(profile, state)

    const history = await this.historyStore.buildProfileHistory({
      profileId: profile.id,
      tokenName: state.tokenName,
      dailyRangeDays: DEFAULT_DAILY_RANGE_DAYS,
      hourlyRangeHours: DEFAULT_HOURLY_RANGE_HOURS,
      keyType: profile.type,
      dailyInitialQuota: profile.dailyInitialQuota,
      hourlyIncreaseQuota: profile.hourlyIncreaseQuota,
      quotaCap: profile.quotaCap,
    })

    return {
      ...state,
      estimatedRemainingHours: history.estimatedRemainingHours ?? state.estimatedRemainingHours,
      estimatedRemainingTimeLabel:
        history.estimatedRemainingHours !== null
          ? formatEstimatedRemainingTimeLabel(history.estimatedRemainingHours)
          : state.estimatedRemainingTimeLabel,
      workDurationTodaySeconds: history.workDurationTodaySeconds,
      workDurationAllTimeSeconds: history.workDurationAllTimeSeconds,
      dailyTrend: history.dailyTrend,
      hourlyTrend: history.hourlyTrend,
      modelUsageSummary: history.modelUsageSummary ?? createEmptyModelUsageSummary(),
      dailyTokenTrend: history.dailyTokenTrend,
      hourlyTokenTrend: history.hourlyTokenTrend,
      cappedInsight: history.cappedInsight,
    }
  }

  private async syncModelLogs(
    profile: QuotaMonitorKeyProfileDto,
    state: QuotaMonitorProfileStateDto,
  ): Promise<void> {
    const latestEpoch = await this.historyStore.getLatestModelLogEpoch(profile.id)
    const syncPage = async (page: number): Promise<void> => {
      if (page > MAX_MODEL_LOG_PAGES) {
        return
      }

      const pageResult = await this.client.fetchProfileLogs({
        settings: this.settings,
        profile,
        page,
        pageSize: MODEL_LOG_PAGE_SIZE,
      })

      let reachedKnownBoundary = false
      const nextLogs = pageResult.logs.filter(log => {
        if (latestEpoch === null) {
          return true
        }

        if (log.requestEpochSeconds > latestEpoch) {
          return true
        }

        reachedKnownBoundary = true
        return false
      })

      if (nextLogs.length > 0) {
        await this.historyStore.saveModelLogs({
          profileId: profile.id,
          tokenName: state.tokenName ?? profile.label,
          fetchedAt: state.lastFetchedAt ?? new Date().toISOString(),
          logs: nextLogs,
        })
      }

      if (
        reachedKnownBoundary ||
        pageResult.logs.length === 0 ||
        page >= pageResult.totalPages
      ) {
        return
      }

      await syncPage(page + 1)
    }

    await syncPage(1)
  }

  private broadcastState = (state: QuotaMonitorStateDto): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.pluginsQuotaMonitorState, state)
    }
  }
}
