import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SystemMonitorStateDto } from '../../../src/shared/contracts/dto'
import SystemMonitorControlCenterWidget from '../../../src/plugins/systemMonitor/presentation/renderer/SystemMonitorControlCenterWidget'

function installSystemMonitorApiMock(state: SystemMonitorStateDto) {
  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        systemMonitor: {
          getState: vi.fn().mockResolvedValue(state),
          refresh: vi.fn().mockResolvedValue(state),
          onState: vi.fn().mockImplementation(() => () => undefined),
        },
      },
    },
  })
}

describe('SystemMonitorControlCenterWidget', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('renders cpu and memory summaries and opens plugin manager', async () => {
    installSystemMonitorApiMock({
      isEnabled: true,
      isSupported: true,
      isMonitoring: true,
      status: 'ready',
      lastUpdatedAt: '2026-04-15T10:00:00.000Z',
      settings: {
        pollIntervalMs: 1000,
        backgroundPollIntervalMs: 5000,
        saveIntervalMs: 30000,
        historyRangeDays: 7,
        gpuMode: 'off',
        header: {
          displayItems: ['download', 'upload', 'cpu'],
        },
      },
      current: {
        recordedAt: '2026-04-15T10:00:00.000Z',
        uploadBytesPerSecond: 2048,
        downloadBytesPerSecond: 4096,
        cpuUsagePercent: 37,
        memoryUsagePercent: 55,
        gpuUsagePercent: null,
      },
      historyRangeDays: 7,
      history: [],
      todayTraffic: {
        day: '2026-04-15',
        uploadBytes: 8192,
        downloadBytes: 16384,
      },
      recentDaysTraffic: [],
      lastError: null,
    })

    const onOpenPluginManager = vi.fn()
    render(<SystemMonitorControlCenterWidget onOpenPluginManager={onOpenPluginManager} />)

    const button = await screen.findByTestId('control-center-plugin-system-monitor')
    const scope = within(button)
    expect(scope.getByText('37%')).toBeVisible()
    expect(scope.getByText('55%')).toBeVisible()

    fireEvent.click(button)
    expect(onOpenPluginManager).toHaveBeenCalledWith('system-monitor')
  })
})
