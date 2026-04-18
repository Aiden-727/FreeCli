import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SystemMonitorStateDto } from '../../../src/shared/contracts/dto'
import SystemMonitorHeaderWidget from '../../../src/plugins/systemMonitor/presentation/renderer/SystemMonitorHeaderWidget'

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

describe('SystemMonitorHeaderWidget', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('renders metrics using the configured display items and opens the plugin page', async () => {
    installSystemMonitorApiMock({
      isEnabled: true,
      isSupported: true,
      isMonitoring: true,
      status: 'ready',
      lastUpdatedAt: '2026-04-16T10:00:00.000Z',
      settings: {
        pollIntervalMs: 1000,
        backgroundPollIntervalMs: 1000,
        saveIntervalMs: 30000,
        historyRangeDays: 7,
        gpuMode: 'total',
        taskbarWidgetEnabled: true,
        taskbarWidget: {
          notifyIconEnabled: true,
          compactModeEnabled: true,
          alwaysOnTop: true,
          fontSize: 9,
          displayItems: ['download', 'cpu', 'gpu'],
        },
      },
      current: {
        recordedAt: '2026-04-16T10:00:00.000Z',
        uploadBytesPerSecond: 2048,
        downloadBytesPerSecond: 4096,
        cpuUsagePercent: 37,
        memoryUsagePercent: 55,
        gpuUsagePercent: 62,
      },
      historyRangeDays: 7,
      history: [],
      todayTraffic: {
        day: '2026-04-16',
        uploadBytes: 8192,
        downloadBytes: 16384,
      },
      recentDaysTraffic: [],
      lastError: null,
    })

    const onOpenPluginManager = vi.fn()

    render(<SystemMonitorHeaderWidget onOpenPluginManager={onOpenPluginManager} />)

    const button = await screen.findByTestId('app-header-system-monitor')
    await waitFor(() => {
      expect(screen.getByTestId('app-header-system-monitor-download')).toHaveTextContent('4 KB/s')
      expect(screen.getByTestId('app-header-system-monitor-cpu')).toHaveTextContent('CPU37%')
      expect(screen.getByTestId('app-header-system-monitor-gpu')).toHaveTextContent('GPU62%')
    })
    expect(screen.getByText('4 KB/s')).toHaveClass('cove-animated-number')
    expect(screen.getByTestId('app-header-system-monitor-download')).toHaveClass(
      'app-header__system-monitor-item--speed',
    )
    expect(screen.getByTestId('app-header-system-monitor-cpu')).toHaveClass(
      'app-header__system-monitor-item--percent',
    )
    expect(screen.getByTestId('app-header-system-monitor-download')).toHaveClass(
      'app-header__system-monitor-item--speed',
    )
    expect(screen.queryByTestId('app-header-system-monitor-upload')).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(onOpenPluginManager).toHaveBeenCalledWith('system-monitor')
  })
})
