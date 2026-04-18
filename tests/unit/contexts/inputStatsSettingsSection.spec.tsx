import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'
import InputStatsSettingsSection from '../../../src/plugins/inputStats/presentation/renderer/InputStatsSettingsSection'

function installInputStatsApiMock() {
  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        inputStats: {
          getState: vi.fn().mockResolvedValue({
            isEnabled: true,
            isSupported: true,
            isMonitoring: true,
            status: 'ready',
            lastUpdatedAt: '2026-04-04T09:00:00.000Z',
            settings: {
              pollIntervalMs: 15000,
              historyRangeDays: 7,
              topKeysRange: 7,
              cumulativeRangeDays: 7,
            },
            today: {
              day: '2026-04-04',
              keyPresses: 128,
              leftClicks: 12,
              rightClicks: 3,
              mouseDistancePx: 2400,
              scrollSteps: 30,
            },
            topKeysRange: 7,
            topKeys: [
              { key: 'A', count: 24 },
              { key: 'Enter', count: 19 },
            ],
            allKeys: [
              { key: 'A', count: 24 },
              { key: 'Enter', count: 19 },
            ],
            historyRangeDays: 7,
            historySeriesByMetric: {
              clicks: [
                { day: '2026-04-01', label: '04-01', value: 10 },
                { day: '2026-04-02', label: '04-02', value: 12 },
              ],
              keys: [
                { day: '2026-04-01', label: '04-01', value: 50 },
                { day: '2026-04-02', label: '04-02', value: 78 },
              ],
              movement: [
                { day: '2026-04-01', label: '04-01', value: 1000 },
                { day: '2026-04-02', label: '04-02', value: 1400 },
              ],
              scroll: [
                { day: '2026-04-01', label: '04-01', value: 8 },
                { day: '2026-04-02', label: '04-02', value: 14 },
              ],
            },
            cumulativeRangeDays: 7,
            cumulativeTotals: {
              clicks: 88,
              keys: 480,
              movement: 12400,
              scroll: 96,
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

describe('InputStatsSettingsSection', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('renders the Flutter-like section hierarchy for input stats', async () => {
    installInputStatsApiMock()

    render(
      <InputStatsSettingsSection
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['input-stats'],
          },
        }}
        onChange={() => undefined}
      />,
    )

    expect(await screen.findByTestId('input-stats-overview')).toBeVisible()
    expect(screen.getByTestId('input-stats-today-grid')).toBeVisible()
    expect(screen.getByTestId('input-stats-key-distribution')).toBeVisible()
    expect(screen.getByTestId('input-stats-history-section')).toBeVisible()
    expect(screen.getByTestId('input-stats-history-line-chart')).toBeVisible()
    expect(screen.getByTestId('input-stats-history-range-actions')).toBeVisible()
    expect(screen.getByTestId('input-stats-history-metric-tabs')).toBeVisible()
    expect(screen.getByTestId('input-stats-history-legend')).toBeVisible()
    expect(screen.getByTestId('input-stats-cumulative-grid')).toBeVisible()
    expect(screen.getByTestId('input-stats-cumulative-range-actions')).toBeVisible()
    expect(screen.getByTestId('input-stats-keyboard-heatmap')).toBeVisible()
    expect(screen.getByTestId('input-stats-history-metric-tab-clicks')).toBeVisible()
    expect(screen.getByTestId('input-stats-history-metric-tab-keys')).toBeVisible()
    expect(screen.getByTestId('input-stats-history-metric-tab-movement')).toBeVisible()
    expect(screen.getByTestId('input-stats-history-metric-tab-scroll')).toBeVisible()
    expect(screen.getByText('零散')).toBeVisible()
    expect(screen.getByText('常用')).toBeVisible()
    expect(screen.getByText('核心高频')).toBeVisible()
    expect(screen.getByTestId('input-stats-distribution-range-actions')).toBeVisible()
    expect(screen.queryByTestId('input-stats-selected-key-panel')).not.toBeInTheDocument()
    expect(screen.queryByText('覆盖按键数')).not.toBeInTheDocument()
    expect(screen.queryByText('Top10 占比')).not.toBeInTheDocument()
    expect(screen.queryByText('榜首按键')).not.toBeInTheDocument()
    expect(screen.queryByTestId('input-stats-zoom-slider')).not.toBeInTheDocument()
    expect(screen.queryByTestId('input-stats-zoom-value')).not.toBeInTheDocument()
    expect(screen.queryByTestId('input-stats-history-current-metric')).not.toBeInTheDocument()
    expect(screen.queryByText('左键 12 / 右键 3')).not.toBeInTheDocument()
    expect(screen.queryByText('日均 69')).not.toBeInTheDocument()
  })

  it('filters history lines when metric tabs toggle on and off', async () => {
    installInputStatsApiMock()

    render(
      <InputStatsSettingsSection
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['input-stats'],
          },
        }}
        onChange={() => undefined}
      />,
    )

    await screen.findByTestId('input-stats-history-path-clicks')
    expect(screen.getByTestId('input-stats-history-path-keys')).toBeInTheDocument()
    expect(screen.getByTestId('input-stats-history-path-movement')).toBeInTheDocument()
    expect(screen.getByTestId('input-stats-history-path-scroll')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('input-stats-history-metric-tab-movement'))

    expect(screen.getByTestId('input-stats-history-metric-tab-movement')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => {
      expect(screen.queryByTestId('input-stats-history-path-clicks')).not.toBeInTheDocument()
      expect(screen.queryByTestId('input-stats-history-path-keys')).not.toBeInTheDocument()
      expect(screen.getByTestId('input-stats-history-path-movement')).toBeInTheDocument()
      expect(screen.queryByTestId('input-stats-history-path-scroll')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('input-stats-history-metric-tab-movement'))

    expect(screen.getByTestId('input-stats-history-metric-tab-movement')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await waitFor(() => {
      expect(screen.getByTestId('input-stats-history-path-clicks')).toBeInTheDocument()
      expect(screen.getByTestId('input-stats-history-path-keys')).toBeInTheDocument()
      expect(screen.getByTestId('input-stats-history-path-movement')).toBeInTheDocument()
      expect(screen.getByTestId('input-stats-history-path-scroll')).toBeInTheDocument()
    })
  })

  it('moves history and cumulative ranges into section-level actions', async () => {
    installInputStatsApiMock()
    const onChange = vi.fn()

    render(
      <InputStatsSettingsSection
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['input-stats'],
          },
        }}
        onChange={onChange}
      />,
    )

    fireEvent.click(await screen.findByTestId('input-stats-history-range-30'))
    fireEvent.click(screen.getByTestId('input-stats-distribution-range-0'))
    fireEvent.click(screen.getByTestId('input-stats-cumulative-range-30'))

    expect(onChange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        plugins: expect.objectContaining({
          inputStats: expect.objectContaining({
            historyRangeDays: 30,
          }),
        }),
      }),
    )
    expect(onChange).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        plugins: expect.objectContaining({
          inputStats: expect.objectContaining({
            topKeysRange: 0,
          }),
        }),
      }),
    )
    expect(onChange).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        plugins: expect.objectContaining({
          inputStats: expect.objectContaining({
            cumulativeRangeDays: 30,
          }),
        }),
      }),
    )
  })

  it('clears history hover state after pointer leaves the chart', async () => {
    installInputStatsApiMock()

    render(
      <InputStatsSettingsSection
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['input-stats'],
          },
        }}
        onChange={() => undefined}
      />,
    )

    fireEvent.mouseEnter(await screen.findByTestId('input-stats-history-day-2026-04-01'))
    expect(screen.getByTestId('input-stats-history-tooltip')).toBeVisible()

    fireEvent.mouseLeave(screen.getByTestId('input-stats-history-line-chart'))
    expect(screen.queryByTestId('input-stats-history-tooltip')).not.toBeInTheDocument()
  })
})
