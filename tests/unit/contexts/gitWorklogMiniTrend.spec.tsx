import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { GitWorklogMiniTrend } from '../../../src/plugins/gitWorklog/presentation/renderer/GitWorklogMiniTrend'

function createPoints(count: number) {
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

describe('GitWorklogMiniTrend', () => {
  it('animates chart layers when switching range windows', () => {
    vi.useFakeTimers()
    render(<GitWorklogMiniTrend points={createPoints(30)} repoId="repo_animated" />)

    const trend = screen.getByTestId('git-worklog-mini-trend-repo_animated')
    act(() => {
      fireEvent.click(screen.getByTestId('git-worklog-mini-trend-range-repo_animated-15'))
    })

    expect(
      trend.querySelector('.git-worklog-mini-trend__chart-layer--previous'),
    ).not.toBeNull()
    expect(
      trend.querySelector('.git-worklog-mini-trend__chart-layer--current'),
    ).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(221)
    })

    expect(trend.querySelector('.git-worklog-mini-trend__chart-layer--previous')).toBeNull()
    expect(trend.querySelector('.git-worklog-mini-trend__chart-layer--current')).toBeNull()
    vi.useRealTimers()
  })

  it('renders additions and deletions trend with 7/15/30 day range switching', () => {
    render(<GitWorklogMiniTrend points={createPoints(30)} repoId="repo_a" />)

    const trend = screen.getByTestId('git-worklog-mini-trend-repo_a')
    expect(within(trend).getByText('仓库节奏')).toBeVisible()
    expect(within(trend).getByText('新增')).toBeVisible()
    expect(within(trend).getByText('删除')).toBeVisible()
    expect(screen.getByTestId('git-worklog-mini-trend-range-repo_a-7')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(trend).getByText('最近 7 天')).toBeVisible()

    fireEvent.click(screen.getByTestId('git-worklog-mini-trend-range-repo_a-15'))
    expect(screen.getByTestId('git-worklog-mini-trend-range-repo_a-15')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(trend).getByText('最近 15 天')).toBeVisible()

    fireEvent.click(screen.getByTestId('git-worklog-mini-trend-range-repo_a-30'))
    expect(screen.getByTestId('git-worklog-mini-trend-range-repo_a-30')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(trend).getByText('最近 30 天')).toBeVisible()
    expect(within(trend).getByText('累计 6045')).toBeVisible()
  })
})
