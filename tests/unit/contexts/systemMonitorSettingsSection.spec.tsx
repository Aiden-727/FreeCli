import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'
import SystemMonitorSettingsSection from '../../../src/plugins/systemMonitor/presentation/renderer/SystemMonitorSettingsSection'

function installSystemMonitorApiMock() {
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
          getState: vi.fn().mockResolvedValue({
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
              taskbarWidgetEnabled: false,
              taskbarWidget: {
                notifyIconEnabled: false,
                compactModeEnabled: true,
                alwaysOnTop: true,
                fontSize: 9,
                displayItems: ['download', 'upload', 'cpu'],
                followSystemTheme: true,
                speedShortModeEnabled: false,
                separateValueUnitWithSpace: true,
                useByteUnit: true,
                hideUnit: false,
                hidePercent: false,
                valueRightAligned: true,
                digitsNumber: 4,
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
            recentDaysTraffic: [
              {
                day: '2026-04-13',
                uploadBytes: 1024,
                downloadBytes: 2048,
              },
              {
                day: '2026-04-14',
                uploadBytes: 2048,
                downloadBytes: 4096,
              },
              {
                day: '2026-04-15',
                uploadBytes: 8192,
                downloadBytes: 16384,
              },
            ],
            taskbarDiagnostics: {
              requestedEnabled: false,
              visible: false,
              embedded: false,
              error: null,
              lastCheckedAt: '2026-04-15T10:00:00.000Z',
            },
            lastError: null,
          }),
          refresh: vi.fn(),
          onState: vi.fn().mockImplementation(() => () => undefined),
        },
      },
    },
  })
}

describe('SystemMonitorSettingsSection', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('renders overview and updates settings through the plugin settings branch', async () => {
    installSystemMonitorApiMock()
    const onChange = vi.fn()

    render(
      <SystemMonitorSettingsSection
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['system-monitor'],
          },
        }}
        onChange={onChange}
      />,
    )

    expect(await screen.findByTestId('system-monitor-overview')).toBeVisible()
    expect(screen.getByTestId('system-monitor-current-grid')).toBeVisible()
    expect(screen.getByTestId('system-monitor-network-speed-card')).toBeVisible()
    expect(screen.getByTestId('system-monitor-traffic-trend')).toBeVisible()
    expect(screen.getByTestId('system-monitor-history-range-trigger')).toHaveClass(
      'cove-select__trigger',
    )
    expect(screen.getByTestId('system-monitor-gpu-mode-trigger')).toHaveClass(
      'cove-select__trigger',
    )

    fireEvent.change(screen.getByTestId('system-monitor-poll-interval'), {
      target: { value: '3000' },
    })
    fireEvent.click(screen.getByTestId('system-monitor-gpu-mode-trigger'))
    fireEvent.click(screen.getByRole('option', { name: '总占用（按需）' }))
    fireEvent.click(screen.getByTestId('system-monitor-taskbar-widget-enabled'))
    fireEvent.click(screen.getByTestId('system-monitor-taskbar-follow-theme-enabled'))

    expect(onChange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        plugins: expect.objectContaining({
          systemMonitor: expect.objectContaining({
            pollIntervalMs: 3000,
          }),
        }),
      }),
    )
    expect(onChange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        plugins: expect.objectContaining({
          systemMonitor: expect.objectContaining({
            gpuMode: 'total',
          }),
        }),
      }),
    )
    expect(onChange).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        plugins: expect.objectContaining({
          systemMonitor: expect.objectContaining({
            taskbarWidgetEnabled: true,
          }),
        }),
      }),
    )
    expect(onChange).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        plugins: expect.objectContaining({
          systemMonitor: expect.objectContaining({
            taskbarWidget: expect.objectContaining({
              followSystemTheme: false,
            }),
          }),
        }),
      }),
    )
  })
})
