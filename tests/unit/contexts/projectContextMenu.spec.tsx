import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectContextMenu } from '../../../src/app/renderer/shell/components/ProjectContextMenu'

describe('ProjectContextMenu', () => {
  it('sorts openers with file manager first, terminal second, then alphabetically', () => {
    render(
      <ProjectContextMenu
        workspaceId="workspace-1"
        x={120}
        y={80}
        availableOpeners={[
          { id: 'zed', label: 'Zed' },
          { id: 'cursor', label: 'Cursor' },
          { id: 'terminal', label: 'Terminal' },
          { id: 'finder', label: 'Finder' },
          { id: 'android-studio', label: 'Android Studio' },
        ]}
        isLoadingOpeners={false}
        isArchived={false}
        onOpenPath={() => undefined}
        onToggleArchive={() => undefined}
        onRequestRemove={() => undefined}
      />,
    )

    fireEvent.mouseEnter(screen.getByTestId('workspace-project-open-workspace-1'))

    const submenu = screen.getByTestId('workspace-project-open-menu-workspace-1')
    const labels = within(submenu)
      .getAllByRole('button')
      .map(button => button.textContent?.trim())

    expect(labels).toEqual(['Finder', 'Terminal', 'Android Studio', 'Cursor', 'Zed'])
  })

  it('opens the selected opener and keeps remove action available', async () => {
    const onOpenPath = vi.fn(() => Promise.resolve())
    const onToggleArchive = vi.fn()
    const onRequestRemove = vi.fn()

    render(
      <ProjectContextMenu
        workspaceId="workspace-1"
        x={120}
        y={80}
        availableOpeners={[{ id: 'vscode', label: 'VS Code' }]}
        isLoadingOpeners={false}
        isArchived={false}
        onOpenPath={onOpenPath}
        onToggleArchive={onToggleArchive}
        onRequestRemove={onRequestRemove}
      />,
    )

    fireEvent.mouseEnter(screen.getByTestId('workspace-project-open-workspace-1'))
    fireEvent.click(screen.getByTestId('workspace-project-open-workspace-1-vscode'))

    expect(onOpenPath).toHaveBeenCalledWith('workspace-1', 'vscode')

    fireEvent.click(screen.getByTestId('workspace-project-archive-workspace-1'))

    expect(onToggleArchive).toHaveBeenCalledWith('workspace-1')

    fireEvent.click(screen.getByTestId('workspace-project-remove-workspace-1'))

    expect(onRequestRemove).toHaveBeenCalledWith('workspace-1')
  })

  it('renders enable action for archived projects', () => {
    const onToggleArchive = vi.fn()

    render(
      <ProjectContextMenu
        workspaceId="workspace-1"
        x={120}
        y={80}
        availableOpeners={[]}
        isLoadingOpeners={false}
        isArchived={true}
        onOpenPath={() => undefined}
        onToggleArchive={onToggleArchive}
        onRequestRemove={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('workspace-project-enable-workspace-1'))

    expect(onToggleArchive).toHaveBeenCalledWith('workspace-1')
  })
})
