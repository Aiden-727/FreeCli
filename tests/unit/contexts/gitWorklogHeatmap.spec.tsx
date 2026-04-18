import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { applyUiLanguage } from '../../../src/app/renderer/i18n'
import { GitWorklogHeatmap } from '../../../src/plugins/gitWorklog/presentation/renderer/GitWorklogHeatmap'

describe('GitWorklogHeatmap', () => {
  it('switches years through the dropdown selector and keeps month labels readable', async () => {
    const currentYear = new Date().getFullYear()
    const previousYear = currentYear - 1
    await applyUiLanguage('zh-CN')

    render(
      <GitWorklogHeatmap
        points={[
          {
            day: `${currentYear}-10-15`,
            label: '10/15',
            commitCount: 2,
            filesChanged: 3,
            additions: 42,
            deletions: 12,
            changedLines: 54,
          },
          {
            day: `${previousYear}-03-20`,
            label: '03/20',
            commitCount: 1,
            filesChanged: 1,
            additions: 10,
            deletions: 2,
            changedLines: 12,
          },
        ]}
      />,
    )

    expect(screen.getByTestId('git-worklog-heatmap-year')).toHaveValue(`${currentYear}`)
    expect(screen.getByText(`${currentYear} 年累计修改 54 行`)).toBeVisible()
    expect(screen.getByText('10月')).toBeVisible()
    expect(screen.getByText('11月')).toBeVisible()
    expect(screen.getByText('12月')).toBeVisible()

    fireEvent.click(screen.getByTestId('git-worklog-heatmap-year-trigger'))
    fireEvent.click(screen.getByRole('option', { name: `${previousYear} 年` }))

    expect(screen.getByTestId('git-worklog-heatmap-year')).toHaveValue(`${previousYear}`)
    expect(screen.getByText(`${previousYear} 年累计修改 12 行`)).toBeVisible()
  })
})
