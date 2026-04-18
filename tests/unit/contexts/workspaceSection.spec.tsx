import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkspaceSection } from '../../../src/contexts/settings/presentation/renderer/settingsPanel/WorkspaceSection'

describe('WorkspaceSection', () => {
  it('renders project worktree root controls with description', () => {
    const onChangeWorktreesRoot = vi.fn()

    render(
      <WorkspaceSection
        workspaceName="Demo Project"
        workspacePath="/repo/demo"
        worktreesRoot=".freecli/worktrees"
        onChangeWorktreesRoot={onChangeWorktreesRoot}
        pullRequestBaseBranchOptions={[]}
        onChangePullRequestBaseBranchOptions={() => undefined}
      />,
    )

    expect(screen.getByText('工作区 Worktree')).toBeVisible()
    expect(screen.getByTestId('settings-workspace-path-display')).toHaveTextContent('demo')
    expect(screen.getByTestId('settings-workspace-path-display')).toHaveAttribute(
      'title',
      '/repo/demo',
    )
    expect(screen.getByTestId('settings-worktree-root')).toHaveValue('.freecli/worktrees')
    expect(screen.getByText(/相对路径以项目根目录为基准/i)).toBeVisible()
    expect(screen.getByTestId('settings-resolved-worktree-path-display')).toHaveTextContent(
      '.../.freecli/worktrees',
    )
    expect(screen.getByTestId('settings-resolved-worktree-path-display')).toHaveAttribute(
      'title',
      '/repo/demo/.freecli/worktrees',
    )

    fireEvent.change(screen.getByTestId('settings-worktree-root'), {
      target: { value: '/tmp/custom-worktrees' },
    })
    expect(onChangeWorktreesRoot).toHaveBeenCalledWith('/tmp/custom-worktrees')
  })

  it('shows guidance when no project is selected', () => {
    render(
      <WorkspaceSection
        workspaceName={null}
        workspacePath={null}
        worktreesRoot=""
        onChangeWorktreesRoot={() => undefined}
        pullRequestBaseBranchOptions={[]}
        onChangePullRequestBaseBranchOptions={() => undefined}
      />,
    )

    expect(screen.getByText(/请先选择一个项目/i)).toBeVisible()
    expect(screen.queryByTestId('settings-worktree-root')).not.toBeInTheDocument()
  })
})
