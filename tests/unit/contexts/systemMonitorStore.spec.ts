import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SYSTEM_MONITOR_SETTINGS } from '../../../src/contexts/plugins/domain/systemMonitorSettings'
import { SystemMonitorStore } from '../../../src/plugins/systemMonitor/presentation/main/SystemMonitorStore'

describe('SystemMonitorStore', () => {
  const tempDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
    )
  })

  it('persists traffic totals and current snapshots across reloads', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'freecli-system-monitor-'))
    tempDirectories.push(directory)

    const store = new SystemMonitorStore(join(directory, 'stats.json'), {
      persistMinIntervalMs: 0,
    })

    await store.appendSample({
      recordedAt: new Date(2026, 3, 4, 9, 0, 0),
      uploadBytesPerSecond: 256,
      downloadBytesPerSecond: 512,
      uploadBytesDelta: 1024,
      downloadBytesDelta: 2048,
      cpuUsagePercent: 38,
      memoryUsagePercent: 62,
      gpuUsagePercent: null,
    })
    await store.appendSample({
      recordedAt: new Date(2026, 3, 5, 11, 30, 0),
      uploadBytesPerSecond: 4096,
      downloadBytesPerSecond: 8192,
      uploadBytesDelta: 12_000,
      downloadBytesDelta: 24_000,
      cpuUsagePercent: 41,
      memoryUsagePercent: 66,
      gpuUsagePercent: 17,
    })
    await store.flush()

    const reloadedStore = new SystemMonitorStore(join(directory, 'stats.json'), {
      persistMinIntervalMs: 0,
    })
    const snapshot = await reloadedStore.buildSnapshot(
      {
        ...DEFAULT_SYSTEM_MONITOR_SETTINGS,
        historyRangeDays: 7,
      },
      new Date(2026, 3, 5, 22, 0, 0),
    )

    expect(snapshot.current).toMatchObject({
      uploadBytesPerSecond: 4096,
      downloadBytesPerSecond: 8192,
      cpuUsagePercent: 41,
      memoryUsagePercent: 66,
      gpuUsagePercent: 17,
    })
    expect(snapshot.todayTraffic).toEqual({
      day: '2026-04-05',
      uploadBytes: 12_000,
      downloadBytes: 24_000,
    })
    expect(snapshot.recentDaysTraffic.at(-1)).toEqual(snapshot.todayTraffic)
    expect(snapshot.history.at(-1)).toMatchObject({
      uploadBytesPerSecond: 4096,
      downloadBytesPerSecond: 8192,
    })
  })
})
