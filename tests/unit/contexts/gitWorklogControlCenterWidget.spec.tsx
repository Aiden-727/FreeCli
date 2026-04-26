import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitWorklogStateDto } from '../../../src/shared/contracts/dto'
import GitWorklogControlCenterWidget from '../../../src/plugins/gitWorklog/presentation/renderer/GitWorklogControlCenterWidget'

function installGitWorklogApiMock(state: GitWorklogStateDto) {
  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        gitWorklog: {
          getState: vi.fn().mockResolvedValue(state),
          refresh: vi.fn().mockResolvedValue(state),
          onState: vi.fn().mockImplementation(() => () => undefined),
        },
      },
    },
  })
}

describe('GitWorklogControlCenterWidget', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('renders only commit and changed-line metrics', async () => {
    installGitWorklogApiMock({
      isEnabled: true,
      isRefreshing: false,
      status: 'ready',
      lastUpdatedAt: '2026-04-04T09:00:00.000Z',
      configuredRepoCount: 2,
      activeRepoCount: 2,
      successfulRepoCount: 2,
      overview: {
        monitoredRepoCount: 2,
        activeRepoCount: 2,
        healthyRepoCount: 2,
        commitCountToday: 5,
        filesChangedToday: 7,
        additionsToday: 120,
        deletionsToday: 20,
        changedLinesToday: 140,
        commitCountInRange: 12,
        filesChangedInRange: 24,
        additionsInRange: 420,
        deletionsInRange: 80,
        changedLinesInRange: 500,
        totalCodeFiles: 80,
        totalCodeLines: 4000,
        dailyPoints: [],
        heatmapDailyPoints: [],
      },
      repos: [],
      lastError: null,
    })

    const onOpenPluginManager = vi.fn()
    render(<GitWorklogControlCenterWidget onOpenPluginManager={onOpenPluginManager} />)

    const button = await screen.findByTestId('control-center-plugin-git-worklog')
    const scope = within(button)

    expect(scope.getByText('5')).toBeVisible()
    expect(scope.getByText('140')).toBeVisible()
    expect(scope.queryByText('新增')).not.toBeInTheDocument()
    expect(scope.queryByText('删除')).not.toBeInTheDocument()
    expect(scope.queryByText('仓库')).not.toBeInTheDocument()

    fireEvent.click(button)
    expect(onOpenPluginManager).toHaveBeenCalledWith('git-worklog')
  })
})
