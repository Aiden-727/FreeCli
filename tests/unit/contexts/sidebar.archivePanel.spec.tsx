import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../src/app/renderer/i18n'
import { Sidebar } from '../../../src/app/renderer/shell/components/Sidebar'
import type { WorkspaceState } from '../../../src/contexts/workspace/presentation/renderer/types'

function createWorkspace(
  id: string,
  lifecycleState: WorkspaceState['lifecycleState'] = 'active',
): WorkspaceState {
  return {
    id,
    name: id,
    path: `D:/workspace/${id}`,
    worktreesRoot: '',
    lifecycleState,
    archivedAt: lifecycleState === 'archived' ? '2026-04-24T10:00:00.000Z' : null,
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    isMinimapVisible: true,
    spaces: [],
    activeSpaceId: null,
    spaceArchiveRecords: [],
  }
}

describe('Sidebar archive drawer', () => {
  it('opens the archive drawer from the archive card', () => {
    render(
      <I18nProvider>
        <Sidebar
          workspaces={[createWorkspace('workspace-a'), createWorkspace('workspace-z', 'archived')]}
          activeWorkspaceId="workspace-a"
          persistNotice={null}
          onAddWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onMoveWorkspace={() => undefined}
          onOpenProjectContextMenu={() => undefined}
          onSelectAgentNode={() => undefined}
        />
      </I18nProvider>,
    )

    expect(screen.queryByTestId('workspace-sidebar-archive-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('workspace-sidebar-archive-card'))

    expect(screen.getByTestId('workspace-sidebar-archive-panel')).toBeInTheDocument()
    expect(screen.getByText('workspace-z')).toBeInTheDocument()
  })

  it('keeps the archive drawer open even when there are no archived projects yet', () => {
    render(
      <I18nProvider>
        <Sidebar
          workspaces={[createWorkspace('workspace-a'), createWorkspace('workspace-b')]}
          activeWorkspaceId="workspace-a"
          persistNotice={null}
          onAddWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onMoveWorkspace={() => undefined}
          onOpenProjectContextMenu={() => undefined}
          onSelectAgentNode={() => undefined}
        />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByTestId('workspace-sidebar-archive-card'))

    expect(screen.getByTestId('workspace-sidebar-archive-panel')).toBeInTheDocument()
    expect(screen.getByText(/还没有归档项目|No archived projects/)).toBeInTheDocument()
  })

  it('moves a workspace into the archive group when dropped on the archive card', () => {
    const handleMoveWorkspace = vi.fn()

    render(
      <I18nProvider>
        <Sidebar
          workspaces={[createWorkspace('workspace-a'), createWorkspace('workspace-b')]}
          activeWorkspaceId="workspace-a"
          persistNotice={null}
          onAddWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onMoveWorkspace={handleMoveWorkspace}
          onOpenProjectContextMenu={() => undefined}
          onSelectAgentNode={() => undefined}
        />
      </I18nProvider>,
    )

    const activeList = document.querySelector('.workspace-sidebar__list') as HTMLDivElement | null
    const archiveCard = screen.getByTestId('workspace-sidebar-archive-card')
    const sourceGroup = screen.getByTestId('workspace-item-group-workspace-b')
    const sourceItem = screen.getByTestId('workspace-item-workspace-b')

    if (!activeList) {
      throw new Error('active workspace list not found')
    }

    activeList.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 200,
        top: 100,
        bottom: 500,
        width: 200,
        height: 400,
        x: 0,
        y: 100,
        toJSON: () => undefined,
      }) as DOMRect

    archiveCard.getBoundingClientRect = () =>
      ({
        left: 260,
        right: 460,
        top: 120,
        bottom: 220,
        width: 200,
        height: 100,
        x: 260,
        y: 120,
        toJSON: () => undefined,
      }) as DOMRect

    sourceGroup.getBoundingClientRect = () =>
      ({
        left: 20,
        right: 180,
        top: 260,
        bottom: 320,
        width: 160,
        height: 60,
        x: 20,
        y: 260,
        toJSON: () => undefined,
      }) as DOMRect

    fireEvent.mouseDown(sourceItem, {
      button: 0,
      clientX: 80,
      clientY: 290,
    })

    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 92,
      clientY: 302,
    })

    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 360,
      clientY: 170,
    })

    fireEvent.mouseUp(window, {
      button: 0,
      clientX: 360,
      clientY: 170,
    })

    expect(handleMoveWorkspace).toHaveBeenCalledWith({
      workspaceId: 'workspace-b',
      targetList: 'archived',
      anchorWorkspaceId: null,
      placement: 'after',
    })
  })

  it('renders the drag preview in a body-level drag layer so archive overlays cannot cover it', () => {
    render(
      <I18nProvider>
        <Sidebar
          workspaces={[createWorkspace('workspace-a'), createWorkspace('workspace-b')]}
          activeWorkspaceId="workspace-a"
          persistNotice={null}
          onAddWorkspace={() => undefined}
          onSelectWorkspace={() => undefined}
          onMoveWorkspace={() => undefined}
          onOpenProjectContextMenu={() => undefined}
          onSelectAgentNode={() => undefined}
        />
      </I18nProvider>,
    )

    const activeList = document.querySelector('.workspace-sidebar__list') as HTMLDivElement | null
    const sourceGroup = screen.getByTestId('workspace-item-group-workspace-b')
    const sourceItem = screen.getByTestId('workspace-item-workspace-b')

    if (!activeList) {
      throw new Error('active workspace list not found')
    }

    activeList.getBoundingClientRect = () =>
      ({
        left: 0,
        right: 240,
        top: 100,
        bottom: 520,
        width: 240,
        height: 420,
        x: 0,
        y: 100,
        toJSON: () => undefined,
      }) as DOMRect

    sourceGroup.getBoundingClientRect = () =>
      ({
        left: 16,
        right: 224,
        top: 220,
        bottom: 284,
        width: 208,
        height: 64,
        x: 16,
        y: 220,
        toJSON: () => undefined,
      }) as DOMRect

    fireEvent.mouseDown(sourceItem, {
      button: 0,
      clientX: 92,
      clientY: 248,
    })

    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 108,
      clientY: 266,
    })

    const dragLayer = screen.getByTestId('workspace-sidebar-drag-layer')
    const dragPreview = screen.getByTestId('workspace-sidebar-drag-preview')
    const sidebar = document.querySelector('.workspace-sidebar')

    expect(dragLayer.parentElement).toBe(document.body)
    expect(dragPreview.parentElement).toBe(dragLayer)
    expect(sidebar?.contains(dragPreview)).toBe(false)

    fireEvent.mouseUp(window, {
      button: 0,
      clientX: 108,
      clientY: 266,
    })
  })
})
