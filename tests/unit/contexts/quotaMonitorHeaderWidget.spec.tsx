import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QuotaMonitorStateDto } from '../../../src/shared/contracts/dto'
import QuotaMonitorHeaderWidget from '../../../src/plugins/quotaMonitor/presentation/renderer/QuotaMonitorHeaderWidget'

function createQuotaProfileState(overrides: Record<string, unknown> = {}) {
  return {
    profileId: 'key_1',
    label: 'Key 1',
    keyType: 'normal',
    tokenName: 'Alpha',
    todayUsedQuota: 900,
    todayUsedQuotaIntDisplay: '900',
    averageQuotaPerCall: 90,
    remainQuotaDisplay: '2048',
    remainQuotaValue: 2048,
    remainQuotaIntDisplay: '2048',
    todayUsageCount: 10,
    expiredTimeFormatted: '2026-12-31',
    remainingDaysLabel: '剩余273天',
    estimatedRemainingHours: 24,
    estimatedRemainingTimeLabel: '24时0分',
    statusText: '正常',
    remainRatio: 0.69,
    workDurationTodaySeconds: 0,
    workDurationAllTimeSeconds: 0,
    dailyTrend: [],
    hourlyTrend: [],
    modelUsageSummary: null,
    dailyTokenTrend: { labels: [], seriesByModel: {} },
    hourlyTokenTrend: { labels: [], seriesByModel: {} },
    cappedInsight: null,
    lastFetchedAt: '2026-04-02T10:00:00.000Z',
    error: null,
    ...overrides,
  }
}

function installQuotaMonitorApiMock(state: QuotaMonitorStateDto) {
  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        quotaMonitor: {
          getState: vi.fn().mockResolvedValue(state),
          refresh: vi.fn().mockResolvedValue(state),
          onState: vi.fn().mockImplementation(() => () => undefined),
        },
      },
    },
  })
}

describe('QuotaMonitorHeaderWidget', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('renders aggregated remain percent and opens the plugin page on click', async () => {
    installQuotaMonitorApiMock({
      isEnabled: true,
      isRefreshing: false,
      status: 'ready',
      lastUpdatedAt: '2026-04-02T10:00:00.000Z',
      configuredProfileCount: 2,
      activeProfileCount: 2,
      successfulProfileCount: 2,
      profiles: [
        createQuotaProfileState(),
        createQuotaProfileState({
          profileId: 'key_2',
          label: 'Key 2',
          tokenName: 'Beta',
          todayUsedQuota: 1100,
          todayUsedQuotaIntDisplay: '1100',
          averageQuotaPerCall: 91.67,
          remainQuotaDisplay: '1024',
          remainQuotaValue: 1024,
          remainQuotaIntDisplay: '1024',
          todayUsageCount: 12,
          estimatedRemainingHours: 12,
          estimatedRemainingTimeLabel: '12时0分',
          remainRatio: 0.48,
        }),
      ],
      lastError: null,
    })

    const onOpenPluginManager = vi.fn()

    render(<QuotaMonitorHeaderWidget onOpenPluginManager={onOpenPluginManager} />)

    const button = await screen.findByTestId('app-header-quota-monitor')
    expect(button).toHaveAttribute('title', expect.stringContaining('3072'))
    expect(button).toHaveTextContent('61%')

    fireEvent.click(button)
    expect(onOpenPluginManager).toHaveBeenCalledTimes(1)
  })
})
