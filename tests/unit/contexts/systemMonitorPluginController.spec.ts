import { afterEach, describe, expect, it, vi } from 'vitest'
import { SystemMonitorPluginController } from '../../../src/plugins/systemMonitor/presentation/main/SystemMonitorPluginController'
import { DEFAULT_SYSTEM_MONITOR_SETTINGS } from '../../../src/contexts/plugins/domain/systemMonitorSettings'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  app: {
    getPath: vi.fn(() => 'D:/Project/freecli/.tmp'),
  },
}))

describe('SystemMonitorPluginController', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('schedules the next refresh against the original one-second cadence instead of refresh duration', async () => {
    vi.useFakeTimers()

    const nowRef = { value: 0 }
    vi.spyOn(Date, 'now').mockImplementation(() => nowRef.value)

    const helperClient = {
      configure: vi.fn().mockResolvedValue({
        requestedEnabled: true,
        visible: true,
        embedded: true,
        error: null,
      }),
      getSnapshot: vi.fn().mockImplementation(async () => {
        nowRef.value += 220
        return {
          recordedAt: new Date(nowRef.value),
          uploadBytesTotal: 1_024,
          downloadBytesTotal: 2_048,
          uploadBytesPerSecond: 1_024,
          downloadBytesPerSecond: 2_048,
          cpuUsagePercent: 31,
          memoryUsagePercent: 52,
          gpuUsagePercent: null,
          taskbarWidgetStatus: {
            requestedEnabled: false,
            visible: false,
            embedded: false,
            error: null,
          },
        }
      }),
      stop: vi.fn().mockResolvedValue(undefined),
    }
    const store = {
      setPersistMinIntervalMs: vi.fn(),
      appendSample: vi.fn().mockResolvedValue(undefined),
      buildSnapshot: vi.fn().mockImplementation(async () => ({
        current: {
          recordedAt: new Date(nowRef.value).toISOString(),
          uploadBytesPerSecond: 1_024,
          downloadBytesPerSecond: 2_048,
          cpuUsagePercent: 31,
          memoryUsagePercent: 52,
          gpuUsagePercent: null,
        },
        history: [],
        todayTraffic: {
          day: '2026-04-16',
          uploadBytes: 0,
          downloadBytes: 0,
        },
        recentDaysTraffic: [],
      })),
      flush: vi.fn().mockResolvedValue(undefined),
    }

    const controller = new SystemMonitorPluginController({
      emitState: () => undefined,
      helperClient: helperClient as never,
      store: store as never,
      userDataPath: 'D:/Project/freecli/.tmp',
      hasFocusedWindow: () => true,
    })

    controller.syncSettings({
      ...DEFAULT_SYSTEM_MONITOR_SETTINGS,
      pollIntervalMs: 1_000,
      backgroundPollIntervalMs: 1_000,
    })

    await controller.createRuntimeFactory()().activate()
    expect(helperClient.getSnapshot).toHaveBeenCalledTimes(1)

    nowRef.value = 220
    await vi.advanceTimersByTimeAsync(779)
    expect(helperClient.getSnapshot).toHaveBeenCalledTimes(1)

    nowRef.value = 1_000
    await vi.advanceTimersByTimeAsync(1)
    expect(helperClient.getSnapshot).toHaveBeenCalledTimes(2)

    await controller.dispose()
  })

  it('moves to error state with helper diagnostics when the first snapshot fails', async () => {
    const helperClient = {
      configure: vi.fn().mockResolvedValue({
        requestedEnabled: false,
        visible: false,
        embedded: false,
        error: null,
      }),
      getSnapshot: vi
        .fn()
        .mockRejectedValue(
          new Error(
            'System monitor helper exited unexpectedly (binary=D:/FreeCli/resources/system-monitor-helper/WindowsMonitorHelper.exe; packaged=true; detail=You must install or update .NET to run this application.)',
          ),
        ),
      stop: vi.fn().mockResolvedValue(undefined),
    }
    const store = {
      setPersistMinIntervalMs: vi.fn(),
      appendSample: vi.fn().mockResolvedValue(undefined),
      buildSnapshot: vi.fn().mockResolvedValue({
        current: {
          recordedAt: new Date('2026-04-17T03:00:00.000Z').toISOString(),
          uploadBytesPerSecond: 0,
          downloadBytesPerSecond: 0,
          cpuUsagePercent: 0,
          memoryUsagePercent: 0,
          gpuUsagePercent: null,
        },
        history: [],
        todayTraffic: {
          day: '2026-04-17',
          uploadBytes: 0,
          downloadBytes: 0,
        },
        recentDaysTraffic: [],
      }),
      flush: vi.fn().mockResolvedValue(undefined),
    }

    const controller = new SystemMonitorPluginController({
      emitState: () => undefined,
      helperClient: helperClient as never,
      store: store as never,
      userDataPath: 'D:/Project/freecli/.tmp',
      hasFocusedWindow: () => true,
    })

    controller.syncSettings(DEFAULT_SYSTEM_MONITOR_SETTINGS)
    await controller.createRuntimeFactory()().activate()

    const state = controller.getState()
    expect(state.status).toBe('error')
    expect(state.isMonitoring).toBe(false)
    expect(state.lastError?.message).toContain('System monitor helper exited unexpectedly')
    expect(state.lastError?.message).toContain('WindowsMonitorHelper.exe')

    await controller.dispose()
  })
})
