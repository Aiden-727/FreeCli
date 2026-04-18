import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InputStatsStateDto } from '../../../src/shared/contracts/dto'
import InputStatsControlCenterWidget from '../../../src/plugins/inputStats/presentation/renderer/InputStatsControlCenterWidget'

function installInputStatsApiMock(state: InputStatsStateDto) {
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
          getState: vi.fn().mockResolvedValue(state),
          refresh: vi.fn().mockResolvedValue(state),
          onState: vi.fn().mockImplementation(() => () => undefined),
        },
      },
    },
  })
}

describe('InputStatsControlCenterWidget', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('renders keyboard and mouse metrics and opens the plugin manager', async () => {
    installInputStatsApiMock({
      isEnabled: true,
      isSupported: true,
      isMonitoring: true,
      status: 'ready',
      lastUpdatedAt: '2026-04-04T09:00:00.000Z',
      settings: {
        pollIntervalMs: 15_000,
        historyRangeDays: 7,
        topKeysRange: 7,
        cumulativeRangeDays: 7,
      },
      today: {
        day: '2026-04-04',
        keyPresses: 128,
        leftClicks: 12,
        rightClicks: 3,
        mouseDistancePx: 2_400,
        scrollSteps: 30,
      },
      topKeysRange: 7,
      topKeys: [],
      allKeys: [],
      historyRangeDays: 7,
      historySeriesByMetric: {
        clicks: [],
        keys: [],
        movement: [],
        scroll: [],
      },
      cumulativeRangeDays: 7,
      cumulativeTotals: {
        clicks: 15,
        keys: 128,
        movement: 2_400,
        scroll: 30,
      },
      lastError: null,
    })

    const onOpenPluginManager = vi.fn()
    render(<InputStatsControlCenterWidget onOpenPluginManager={onOpenPluginManager} />)

    const button = await screen.findByTestId('control-center-plugin-input-stats')
    const scope = within(button)

    expect(scope.getByText('128')).toBeVisible()
    expect(scope.getByText('15')).toBeVisible()

    fireEvent.click(button)
    expect(onOpenPluginManager).toHaveBeenCalledWith('input-stats')
  })
})
