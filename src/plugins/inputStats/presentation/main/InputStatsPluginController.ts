import { BrowserWindow, app } from 'electron'
import { resolve } from 'node:path'
import type {
  InputStatsErrorDto,
  InputStatsSettingsDto,
  InputStatsStateDto,
} from '@shared/contracts/dto'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import { DEFAULT_INPUT_STATS_SETTINGS } from '@contexts/plugins/domain/inputStatsSettings'
import {
  hasVisibleFocusedWindow,
  type MainWindowActivityProbe,
} from '../../../shared/presentation/main/windowActivity'
import type {
  MainPluginRuntime,
  MainPluginRuntimeFactory,
} from '../../../../contexts/plugins/application/MainPluginRuntimeHost'
import { InputStatsHelperClient, resolveInputStatsHelperScriptPath } from './InputStatsHelperClient'
import { InputStatsStore } from './InputStatsStore'

const CONFIG_REFRESH_DEBOUNCE_MS = 400
const BACKGROUND_REFRESH_RETRY_MS = 5_000

function createEmptyState(settings: InputStatsSettingsDto, isEnabled: boolean): InputStatsStateDto {
  return {
    isEnabled,
    isSupported: process.platform === 'win32',
    isMonitoring: false,
    status: isEnabled ? (process.platform === 'win32' ? 'idle' : 'unsupported') : 'disabled',
    lastUpdatedAt: null,
    settings,
    today: {
      day: new Date().toISOString().slice(0, 10),
      keyPresses: 0,
      leftClicks: 0,
      rightClicks: 0,
      mouseDistancePx: 0,
      scrollSteps: 0,
    },
    topKeysRange: settings.topKeysRange,
    topKeys: [],
    allKeys: [],
    historyRangeDays: settings.historyRangeDays,
    historySeriesByMetric: {
      clicks: [],
      keys: [],
      movement: [],
      scroll: [],
    },
    cumulativeRangeDays: settings.cumulativeRangeDays,
    cumulativeTotals: {
      clicks: 0,
      keys: 0,
      movement: 0,
      scroll: 0,
    },
    lastError: null,
  }
}

function toErrorDto(error: unknown): InputStatsErrorDto {
  if (error instanceof Error) {
    return {
      message: error.message,
      detail: error.stack ?? null,
    }
  }

  return {
    message: 'Input stats runtime failed',
    detail: null,
  }
}

export class InputStatsPluginController {
  private readonly store: InputStatsStore
  private readonly helperClient: InputStatsHelperClient | null
  private readonly emitState: (state: InputStatsStateDto) => void
  private readonly hasFocusedWindow: MainWindowActivityProbe
  private settings: InputStatsSettingsDto = DEFAULT_INPUT_STATS_SETTINGS
  private state: InputStatsStateDto = createEmptyState(DEFAULT_INPUT_STATS_SETTINGS, false)
  private isEnabled = false
  private disposed = false
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private configRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private currentRefreshPromise: Promise<InputStatsStateDto> | null = null

  public constructor(options?: {
    emitState?: (state: InputStatsStateDto) => void
    userDataPath?: string
    store?: InputStatsStore
    helperClient?: InputStatsHelperClient | null
    hasFocusedWindow?: MainWindowActivityProbe
  }) {
    const userDataPath = options?.userDataPath ?? app.getPath('userData')
    this.store =
      options?.store ??
      new InputStatsStore(resolve(userDataPath, 'plugins', 'input-stats', 'stats.json'))
    this.helperClient =
      options?.helperClient ??
      (process.platform === 'win32'
        ? new InputStatsHelperClient(resolveInputStatsHelperScriptPath(userDataPath))
        : null)
    this.emitState = options?.emitState ?? this.broadcastState
    this.hasFocusedWindow = options?.hasFocusedWindow ?? hasVisibleFocusedWindow
  }

  public createRuntimeFactory(): MainPluginRuntimeFactory {
    return () =>
      ({
        activate: async () => {
          await this.activate()
        },
        deactivate: async () => {
          await this.deactivate()
        },
      }) satisfies MainPluginRuntime
  }

  public syncSettings(settings: InputStatsSettingsDto): InputStatsStateDto {
    this.settings = settings
    this.applyState({
      ...this.state,
      isEnabled: this.isEnabled,
      settings,
      topKeysRange: settings.topKeysRange,
      historyRangeDays: settings.historyRangeDays,
      cumulativeRangeDays: settings.cumulativeRangeDays,
      status: this.resolveStatus(),
    })

    if (this.isEnabled && this.isSupported()) {
      this.restartRefreshTimer()
      this.scheduleConfigRefresh()
    } else {
      void this.rebuildFromStore()
    }

    return this.state
  }

  public getState(): InputStatsStateDto {
    return this.state
  }

  public async refreshNow(): Promise<InputStatsStateDto> {
    if (this.disposed) {
      return this.state
    }

    if (!this.isEnabled) {
      this.applyState({
        ...this.state,
        isEnabled: false,
        isMonitoring: false,
        status: 'disabled',
      })
      return this.state
    }

    if (!this.isSupported()) {
      await this.rebuildFromStore({
        status: 'unsupported',
        isMonitoring: false,
      })
      return this.state
    }

    if (this.currentRefreshPromise) {
      return await this.currentRefreshPromise
    }

    this.applyState({
      ...this.state,
      isEnabled: true,
      status: this.state.lastUpdatedAt ? 'ready' : 'starting',
      lastError: null,
    })

    const refreshPromise = this.performRefresh().finally(() => {
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
    await this.store.flush()
  }

  private async activate(): Promise<void> {
    if (this.disposed || this.isEnabled) {
      return
    }

    this.isEnabled = true
    this.applyState({
      ...this.state,
      isEnabled: true,
      status: this.resolveStatus(),
    })
    await this.refreshNow()
  }

  private async deactivate(): Promise<void> {
    this.isEnabled = false
    this.clearRefreshTimer()
    this.clearConfigRefreshTimer()
    await this.helperClient?.stop()
    this.applyState({
      ...this.state,
      isEnabled: false,
      isMonitoring: false,
      status: 'disabled',
    })
  }

  private async performRefresh(): Promise<InputStatsStateDto> {
    const refreshAt = new Date()

    try {
      const delta = await this.helperClient!.fetchAndResetDelta()
      await this.store.applyDelta(delta, refreshAt)
      await this.rebuildFromStore({
        status: 'ready',
        isMonitoring: true,
        lastUpdatedAt: refreshAt.toISOString(),
        lastError: null,
      })
    } catch (error) {
      await this.rebuildFromStore({
        status: 'error',
        isMonitoring: false,
        lastError: toErrorDto(error),
      })
    }

    if (this.isEnabled && this.isSupported()) {
      this.restartRefreshTimer()
    }

    return this.state
  }

  private async rebuildFromStore(
    options?: Partial<
      Pick<InputStatsStateDto, 'status' | 'isMonitoring' | 'lastUpdatedAt' | 'lastError'>
    >,
  ): Promise<void> {
    const snapshot = await this.store.buildSnapshot(this.settings)
    if (this.disposed) {
      return
    }

    this.applyState({
      ...this.state,
      isEnabled: this.isEnabled,
      isSupported: this.isSupported(),
      isMonitoring: options?.isMonitoring ?? this.state.isMonitoring,
      status: options?.status ?? this.resolveStatus(),
      lastUpdatedAt: options?.lastUpdatedAt ?? this.state.lastUpdatedAt,
      settings: this.settings,
      today: snapshot.today,
      topKeysRange: this.settings.topKeysRange,
      topKeys: snapshot.topKeys,
      allKeys: snapshot.allKeys,
      historyRangeDays: this.settings.historyRangeDays,
      historySeriesByMetric: snapshot.historySeriesByMetric,
      cumulativeRangeDays: this.settings.cumulativeRangeDays,
      cumulativeTotals: snapshot.cumulativeTotals,
      lastError: options?.lastError ?? this.state.lastError,
    })
  }

  private resolveStatus(): InputStatsStateDto['status'] {
    if (!this.isEnabled) {
      return 'disabled'
    }

    if (!this.isSupported()) {
      return 'unsupported'
    }

    return this.state.lastUpdatedAt ? this.state.status : 'idle'
  }

  private isSupported(): boolean {
    return process.platform === 'win32'
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

  private restartRefreshTimer(delayMs = this.settings.pollIntervalMs): void {
    this.clearRefreshTimer()
    if (!this.isEnabled || this.disposed || !this.isSupported()) {
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
    return this.isEnabled && !this.disposed && this.isSupported() && !this.hasFocusedWindow()
  }

  private applyState(nextState: InputStatsStateDto): void {
    this.state = nextState
    this.emitState(this.state)
  }

  private broadcastState = (state: InputStatsStateDto): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.pluginsInputStatsState, state)
    }
  }
}
