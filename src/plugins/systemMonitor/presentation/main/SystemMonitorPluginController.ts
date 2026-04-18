import { BrowserWindow, app } from 'electron'
import { resolve } from 'node:path'
import type {
  SystemMonitorErrorDto,
  SystemMonitorSettingsDto,
  SystemMonitorStateDto,
} from '@shared/contracts/dto'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import { DEFAULT_SYSTEM_MONITOR_SETTINGS } from '@contexts/plugins/domain/systemMonitorSettings'
import {
  hasVisibleFocusedWindow,
  type MainWindowActivityProbe,
} from '../../../shared/presentation/main/windowActivity'
import type {
  MainPluginRuntime,
  MainPluginRuntimeFactory,
} from '../../../../contexts/plugins/application/MainPluginRuntimeHost'
import {
  SystemMonitorHelperClient,
  type SystemMonitorRawSample,
  type SystemMonitorTaskbarWidgetRuntimeStatus,
} from './SystemMonitorHelperClient'
import { SystemMonitorStore, type SystemMonitorSample } from './SystemMonitorStore'

function createEmptyState(
  settings: SystemMonitorSettingsDto,
  isEnabled: boolean,
): SystemMonitorStateDto {
  const now = new Date().toISOString()
  const day = new Date().toISOString().slice(0, 10)

  return {
    isEnabled,
    isSupported: process.platform === 'win32',
    isMonitoring: false,
    status: isEnabled ? (process.platform === 'win32' ? 'idle' : 'unsupported') : 'disabled',
    lastUpdatedAt: null,
    settings,
    current: {
      recordedAt: now,
      uploadBytesPerSecond: 0,
      downloadBytesPerSecond: 0,
      cpuUsagePercent: 0,
      memoryUsagePercent: 0,
      gpuUsagePercent: null,
    },
    historyRangeDays: settings.historyRangeDays,
    history: [],
    todayTraffic: {
      day,
      uploadBytes: 0,
      downloadBytes: 0,
    },
    recentDaysTraffic: [],
    lastError: null,
  }
}

function toErrorDto(error: unknown): SystemMonitorErrorDto {
  if (error instanceof Error) {
    return {
      message: error.message,
      detail: error.stack ?? null,
    }
  }

  return {
    message: 'System monitor runtime failed',
    detail: null,
  }
}

const CONFIG_REFRESH_DEBOUNCE_MS = 400

export class SystemMonitorPluginController {
  private readonly store: SystemMonitorStore
  private readonly helperClient: SystemMonitorHelperClient
  private readonly emitState: (state: SystemMonitorStateDto) => void
  private readonly hasFocusedWindow: MainWindowActivityProbe
  private settings: SystemMonitorSettingsDto = DEFAULT_SYSTEM_MONITOR_SETTINGS
  private state: SystemMonitorStateDto = createEmptyState(DEFAULT_SYSTEM_MONITOR_SETTINGS, false)
  private isEnabled = false
  private disposed = false
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private configRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private currentRefreshPromise: Promise<SystemMonitorStateDto> | null = null
  private previousRawSample: SystemMonitorRawSample | null = null
  private helperTaskbarStatus: SystemMonitorTaskbarWidgetRuntimeStatus = {
    requestedEnabled: false,
    visible: false,
    embedded: false,
    error: null,
  }
  private lastRefreshStartedAtMs: number | null = null

  public constructor(options?: {
    emitState?: (state: SystemMonitorStateDto) => void
    userDataPath?: string
    store?: SystemMonitorStore
    helperClient?: SystemMonitorHelperClient
    hasFocusedWindow?: MainWindowActivityProbe
  }) {
    const userDataPath = options?.userDataPath ?? app.getPath('userData')
    this.store =
      options?.store ??
      new SystemMonitorStore(resolve(userDataPath, 'plugins', 'system-monitor', 'stats.json'), {
        persistMinIntervalMs: DEFAULT_SYSTEM_MONITOR_SETTINGS.saveIntervalMs,
      })
    this.helperClient = options?.helperClient ?? new SystemMonitorHelperClient()
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

  public syncSettings(settings: SystemMonitorSettingsDto): SystemMonitorStateDto {
    this.settings = settings
    this.store.setPersistMinIntervalMs(settings.saveIntervalMs)
    this.applyState({
      ...this.state,
      isEnabled: this.isEnabled,
      settings,
      historyRangeDays: settings.historyRangeDays,
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

  public getState(): SystemMonitorStateDto {
    return this.state
  }

  public async refreshNow(): Promise<SystemMonitorStateDto> {
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
    this.previousRawSample = null
    await this.helperClient.stop()
    this.applyState({
      ...this.state,
      isEnabled: false,
      isMonitoring: false,
      status: 'disabled',
    })
  }

  private async performRefresh(): Promise<SystemMonitorStateDto> {
    this.lastRefreshStartedAtMs = Date.now()
    const refreshAt = new Date()

    try {
      await this.syncHelperConfiguration()
      const rawSample = await this.helperClient.getSnapshot()
      this.helperTaskbarStatus = rawSample.taskbarWidgetStatus
      const deltaSample = this.toStoreSample(rawSample)
      this.previousRawSample = rawSample
      await this.store.appendSample(deltaSample)

      const taskbarError =
        this.settings.taskbarWidgetEnabled && rawSample.taskbarWidgetStatus.error
          ? {
              message: rawSample.taskbarWidgetStatus.error,
              detail: null,
            }
          : null
      const gpuUnavailable =
        this.settings.gpuMode !== 'off' && rawSample.gpuUsagePercent === null
      const nextStatus =
        taskbarError
          ? 'error'
          : gpuUnavailable
            ? 'partial_error'
            : 'ready'
      const nextLastError =
        taskbarError ??
        (gpuUnavailable
          ? {
              message: 'GPU monitoring is unavailable on this device',
              detail: null,
            }
          : null)

      await this.rebuildFromStore({
        status: nextStatus,
        isMonitoring: true,
        lastUpdatedAt: refreshAt.toISOString(),
        lastError: nextLastError,
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

  private toStoreSample(rawSample: SystemMonitorRawSample): SystemMonitorSample {
    if (!this.previousRawSample) {
      return {
        recordedAt: rawSample.recordedAt,
        uploadBytesPerSecond: rawSample.uploadBytesPerSecond,
        downloadBytesPerSecond: rawSample.downloadBytesPerSecond,
        uploadBytesDelta: 0,
        downloadBytesDelta: 0,
        cpuUsagePercent: rawSample.cpuUsagePercent,
        memoryUsagePercent: rawSample.memoryUsagePercent,
        gpuUsagePercent: rawSample.gpuUsagePercent,
      }
    }

    const elapsedMs = rawSample.recordedAt.getTime() - this.previousRawSample.recordedAt.getTime()
    const elapsedSeconds = elapsedMs > 0 ? elapsedMs / 1_000 : 1
    const uploadBytesDelta = Math.max(
      0,
      rawSample.uploadBytesTotal - this.previousRawSample.uploadBytesTotal,
    )
    const downloadBytesDelta = Math.max(
      0,
      rawSample.downloadBytesTotal - this.previousRawSample.downloadBytesTotal,
    )

    return {
      recordedAt: rawSample.recordedAt,
      uploadBytesPerSecond:
        rawSample.uploadBytesPerSecond > 0
          ? rawSample.uploadBytesPerSecond
          : uploadBytesDelta / elapsedSeconds,
      downloadBytesPerSecond:
        rawSample.downloadBytesPerSecond > 0
          ? rawSample.downloadBytesPerSecond
          : downloadBytesDelta / elapsedSeconds,
      uploadBytesDelta,
      downloadBytesDelta,
      cpuUsagePercent: rawSample.cpuUsagePercent,
      memoryUsagePercent: rawSample.memoryUsagePercent,
      gpuUsagePercent: rawSample.gpuUsagePercent,
    }
  }

  private async rebuildFromStore(
    options?: Partial<
      Pick<SystemMonitorStateDto, 'status' | 'isMonitoring' | 'lastUpdatedAt' | 'lastError'>
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
      current: snapshot.current,
      historyRangeDays: this.settings.historyRangeDays,
      history: snapshot.history,
      todayTraffic: snapshot.todayTraffic,
      recentDaysTraffic: snapshot.recentDaysTraffic,
      lastError: options?.lastError ?? this.state.lastError,
    })
  }

  private resolveStatus(): SystemMonitorStateDto['status'] {
    if (!this.isEnabled) {
      return 'disabled'
    }

    if (!this.isSupported()) {
      return 'unsupported'
    }

    if (!this.state.lastUpdatedAt) {
      return 'idle'
    }

    return this.state.status === 'disabled' || this.state.status === 'unsupported'
      ? 'idle'
      : this.state.status
  }

  private isSupported(): boolean {
    return process.platform === 'win32'
  }

  private scheduleConfigRefresh(delayMs = CONFIG_REFRESH_DEBOUNCE_MS): void {
    this.clearConfigRefreshTimer()
    this.configRefreshTimer = setTimeout(() => {
      void this.refreshNow()
    }, delayMs)
  }

  private restartRefreshTimer(): void {
    this.clearRefreshTimer()
    if (!this.isEnabled || this.disposed || !this.isSupported()) {
      return
    }

    const delayMs = this.resolveNextRefreshDelayMs()

    this.refreshTimer = setTimeout(() => {
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

  private resolvePollIntervalMs(): number {
    return this.hasFocusedWindow()
      ? Math.max(1_000, this.settings.pollIntervalMs)
      : Math.max(1_000, this.settings.backgroundPollIntervalMs)
  }

  private resolveNextRefreshDelayMs(nowMs = Date.now()): number {
    const intervalMs = this.resolvePollIntervalMs()
    const baseMs = this.lastRefreshStartedAtMs ?? nowMs
    const elapsedMs = Math.max(0, nowMs - baseMs)
    const remainingMs = intervalMs - elapsedMs
    return Math.max(0, remainingMs)
  }

  private async syncHelperConfiguration(): Promise<void> {
    this.helperTaskbarStatus = await this.helperClient.configure({
      gpuMode: this.settings.gpuMode,
      taskbarWidgetEnabled: this.settings.taskbarWidgetEnabled,
      taskbarWidget: this.settings.taskbarWidget,
    })
  }

  private applyState(nextState: SystemMonitorStateDto): void {
    this.state = nextState
    this.emitState(this.state)
  }

  private broadcastState = (state: SystemMonitorStateDto): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.pluginsSystemMonitorState, state)
    }
  }
}
