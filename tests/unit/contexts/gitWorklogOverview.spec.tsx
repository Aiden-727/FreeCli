import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GitWorklogRepositoryDto, GitWorklogStateDto } from '../../../src/shared/contracts/dto'
import { GitWorklogOverview } from '../../../src/plugins/gitWorklog/presentation/renderer/GitWorklogOverview'

function createDailyPoints(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    day: `2026-04-${String(index + 1).padStart(2, '0')}`,
    label: `04/${String(index + 1).padStart(2, '0')}`,
    commitCount: index + 1,
    filesChanged: index + 2,
    additions: (index + 1) * 10,
    deletions: (index + 1) * 3,
    changedLines: (index + 1) * 13,
  }))
}

describe('GitWorklogOverview', () => {
  it('starts dragging only from card headers instead of the full card body', () => {
    const repoId = 'repo_freecli'
    const configuredRepositories: GitWorklogRepositoryDto[] = [
      {
        id: repoId,
        label: 'FreeCli',
        path: 'D:/Project/FreeCli',
        enabled: true,
        assignedWorkspaceId: null,
      },
    ]
    const state: GitWorklogStateDto = {
      isEnabled: true,
      isRefreshing: false,
      status: 'ready',
      lastUpdatedAt: '2026-04-30T10:00:00.000Z',
      configuredRepoCount: 1,
      activeRepoCount: 1,
      successfulRepoCount: 1,
      lastError: null,
      overview: {
        monitoredRepoCount: 1,
        activeRepoCount: 1,
        healthyRepoCount: 1,
        commitCountToday: 3,
        filesChangedToday: 5,
        additionsToday: 120,
        deletionsToday: 40,
        changedLinesToday: 160,
        commitCountInRange: 12,
        filesChangedInRange: 18,
        additionsInRange: 640,
        deletionsInRange: 210,
        changedLinesInRange: 850,
        totalCodeFiles: 42,
        totalCodeLines: 4200,
        dailyPoints: createDailyPoints(30),
        heatmapDailyPoints: createDailyPoints(30).map(point => ({
          day: point.day,
          label: point.label,
          commitCount: point.commitCount,
          changedLines: point.changedLines,
        })),
      },
      repos: [
        {
          repoId,
          label: 'FreeCli',
          path: 'D:/Project/FreeCli',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 3,
          filesChangedToday: 5,
          additionsToday: 120,
          deletionsToday: 40,
          changedLinesToday: 160,
          netLinesToday: 80,
          commitCountInRange: 12,
          filesChangedInRange: 18,
          additionsInRange: 640,
          deletionsInRange: 210,
          changedLinesInRange: 850,
          totalCodeFiles: 42,
          totalCodeLines: 4200,
          dailyPoints: createDailyPoints(30),
          heatmapDailyPoints: createDailyPoints(30).map(point => ({
            day: point.day,
            label: point.label,
            commitCount: point.commitCount,
            changedLines: point.changedLines,
          })),
          lastScannedAt: '2026-04-30T09:30:00.000Z',
          error: null,
        },
      ],
      autoCandidates: [],
      pendingImports: [],
      dismissedImports: [],
      availableWorkspaces: [
        {
          id: 'workspace_freecli',
          name: 'FreeCli Workspace',
          path: 'D:/Project/FreeCli',
        },
      ],
    }

    render(
      <GitWorklogOverview
        isPluginEnabled
        state={state}
        onRefresh={vi.fn()}
        configuredRepositories={configuredRepositories}
        repositoryOrder={[]}
        workspaceOrder={[]}
        availableWorkspaces={state.availableWorkspaces}
      />,
    )

    const repoCard = screen.getByTestId(`git-worklog-repo-card-${repoId}`)
    const repoHeader = repoCard.querySelector('.git-worklog-overview__repo-top')
    expect(repoHeader).not.toBeNull()

    fireEvent.mouseDown(repoCard, {
      button: 0,
      clientX: 40,
      clientY: 40,
    })
    fireEvent.mouseMove(window, {
      clientX: 58,
      clientY: 58,
    })
    expect(repoCard).not.toHaveClass('git-worklog-overview__repo-row--dragging')
    fireEvent.mouseUp(window)

    fireEvent.mouseDown(repoHeader as HTMLElement, {
      button: 0,
      clientX: 40,
      clientY: 20,
    })
    fireEvent.mouseMove(window, {
      clientX: 58,
      clientY: 38,
    })
    expect(repoCard).toHaveClass('git-worklog-overview__repo-row--dragging')
    fireEvent.mouseUp(window)
  })

  it('keeps mini trend range switching clickable inside draggable repo cards', () => {
    const repoId = 'repo_freecli'
    const fullHistoryPoints = createDailyPoints(30)
    const recentRangePoints = fullHistoryPoints.slice(-7)
    const configuredRepositories: GitWorklogRepositoryDto[] = [
      {
        id: repoId,
        label: 'FreeCli',
        path: 'D:/Project/FreeCli',
        enabled: true,
        assignedWorkspaceId: null,
      },
    ]
    const state: GitWorklogStateDto = {
      isEnabled: true,
      isRefreshing: false,
      status: 'ready',
      lastUpdatedAt: '2026-04-30T10:00:00.000Z',
      configuredRepoCount: 1,
      activeRepoCount: 1,
      successfulRepoCount: 1,
      lastError: null,
      overview: {
        monitoredRepoCount: 1,
        activeRepoCount: 1,
        healthyRepoCount: 1,
        commitCountToday: 3,
        filesChangedToday: 5,
        additionsToday: 120,
        deletionsToday: 40,
        changedLinesToday: 160,
        commitCountInRange: 12,
        filesChangedInRange: 18,
        additionsInRange: 640,
        deletionsInRange: 210,
        changedLinesInRange: 850,
        totalCodeFiles: 42,
        totalCodeLines: 4200,
        dailyPoints: fullHistoryPoints,
        heatmapDailyPoints: fullHistoryPoints.map(point => ({
          day: point.day,
          label: point.label,
          commitCount: point.commitCount,
          changedLines: point.changedLines,
        })),
      },
      repos: [
        {
          repoId,
          label: 'FreeCli',
          path: 'D:/Project/FreeCli',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 3,
          filesChangedToday: 5,
          additionsToday: 120,
          deletionsToday: 40,
          changedLinesToday: 160,
          netLinesToday: 80,
          commitCountInRange: 12,
          filesChangedInRange: 18,
          additionsInRange: 640,
          deletionsInRange: 210,
          changedLinesInRange: 850,
          totalCodeFiles: 42,
          totalCodeLines: 4200,
          dailyPoints: recentRangePoints,
          heatmapDailyPoints: fullHistoryPoints.map(point => ({
            day: point.day,
            label: point.label,
            commitCount: point.commitCount,
            changedLines: point.changedLines,
          })),
          lastScannedAt: '2026-04-30T09:30:00.000Z',
          error: null,
        },
      ],
      autoCandidates: [],
      pendingImports: [],
      dismissedImports: [],
      availableWorkspaces: [],
    }

    render(
      <GitWorklogOverview
        isPluginEnabled
        state={state}
        onRefresh={vi.fn()}
        configuredRepositories={configuredRepositories}
        repositoryOrder={[]}
        workspaceOrder={[]}
      />,
    )

    const trend = screen.getByTestId(`git-worklog-mini-trend-${repoId}`)
    expect(within(trend).getByText('最近 7 天')).toBeVisible()
    expect(within(trend).getByText('04/24')).toBeVisible()

    fireEvent.mouseDown(screen.getByTestId(`git-worklog-mini-trend-range-${repoId}-15`), {
      button: 0,
      clientX: 24,
      clientY: 24,
    })
    fireEvent.click(screen.getByTestId(`git-worklog-mini-trend-range-${repoId}-15`))

    expect(screen.getByTestId(`git-worklog-mini-trend-range-${repoId}-15`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(trend).getByText('最近 15 天')).toBeVisible()

    fireEvent.mouseDown(screen.getByTestId(`git-worklog-mini-trend-range-${repoId}-30`), {
      button: 0,
      clientX: 28,
      clientY: 24,
    })
    fireEvent.click(screen.getByTestId(`git-worklog-mini-trend-range-${repoId}-30`))

    expect(screen.getByTestId(`git-worklog-mini-trend-range-${repoId}-30`)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(trend).getByText('最近 30 天')).toBeVisible()
    expect(within(trend).getByText('04/01')).toBeVisible()
  })

  it('updates repo changed-lines summary together with the selected mini trend window', () => {
    const repoId = 'repo_freecli'
    const fullHistoryPoints = createDailyPoints(30)
    const recentRangePoints = fullHistoryPoints.slice(-7)
    const configuredRepositories: GitWorklogRepositoryDto[] = [
      {
        id: repoId,
        label: 'FreeCli',
        path: 'D:/Project/FreeCli',
        enabled: true,
        assignedWorkspaceId: null,
      },
    ]
    const state: GitWorklogStateDto = {
      isEnabled: true,
      isRefreshing: false,
      status: 'ready',
      lastUpdatedAt: '2026-04-30T10:00:00.000Z',
      configuredRepoCount: 1,
      activeRepoCount: 1,
      successfulRepoCount: 1,
      lastError: null,
      overview: {
        monitoredRepoCount: 1,
        activeRepoCount: 1,
        healthyRepoCount: 1,
        commitCountToday: 3,
        filesChangedToday: 5,
        additionsToday: 120,
        deletionsToday: 40,
        changedLinesToday: 160,
        commitCountInRange: 12,
        filesChangedInRange: 18,
        additionsInRange: 640,
        deletionsInRange: 210,
        changedLinesInRange: 850,
        totalCodeFiles: 42,
        totalCodeLines: 4200,
        dailyPoints: fullHistoryPoints,
        heatmapDailyPoints: fullHistoryPoints.map(point => ({
          day: point.day,
          label: point.label,
          commitCount: point.commitCount,
          changedLines: point.changedLines,
        })),
      },
      repos: [
        {
          repoId,
          label: 'FreeCli',
          path: 'D:/Project/FreeCli',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 3,
          filesChangedToday: 5,
          additionsToday: 120,
          deletionsToday: 40,
          changedLinesToday: 160,
          netLinesToday: 80,
          commitCountInRange: 12,
          filesChangedInRange: 18,
          additionsInRange: 640,
          deletionsInRange: 210,
          changedLinesInRange: 850,
          totalCodeFiles: 42,
          totalCodeLines: 4200,
          dailyPoints: recentRangePoints,
          heatmapDailyPoints: fullHistoryPoints,
          lastScannedAt: '2026-04-30T09:30:00.000Z',
          error: null,
        },
      ],
      autoCandidates: [],
      pendingImports: [],
      dismissedImports: [],
      availableWorkspaces: [],
    }

    render(
      <GitWorklogOverview
        isPluginEnabled
        state={state}
        onRefresh={vi.fn()}
        configuredRepositories={configuredRepositories}
        repositoryOrder={[]}
        workspaceOrder={[]}
      />,
    )

    const repoCard = screen.getByTestId(`git-worklog-repo-card-${repoId}`)
    expect(within(repoCard).getByText('2457')).toBeVisible()

    fireEvent.click(screen.getByTestId(`git-worklog-mini-trend-range-${repoId}-15`))
    expect(within(repoCard).getByText('4485')).toBeVisible()

    fireEvent.click(screen.getByTestId(`git-worklog-mini-trend-range-${repoId}-30`))
    expect(within(repoCard).getByText('6045')).toBeVisible()
  })
})
