import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppUpdateState } from '../../../src/shared/contracts/dto'
import { AppHeader } from '../../../src/app/renderer/shell/components/AppHeader'

function createUpdateState(overrides: Partial<AppUpdateState>): AppUpdateState {
  return {
    policy: 'prompt',
    channel: 'stable',
    currentVersion: '0.2.0',
    status: 'idle',
    latestVersion: null,
    releaseName: null,
    releaseDate: null,
    releaseNotesUrl: null,
    downloadPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    checkedAt: null,
    message: null,
    ...overrides,
  }
}

afterEach(() => {
  delete (window as Window & { freecliApi?: unknown }).freecliApi
})

describe('AppHeader update indicator', () => {
  it('shows a download action when an update is available', () => {
    const onDownloadUpdate = vi.fn()

    render(
      <AppHeader
        activeWorkspaceName="Workspace"
        activeWorkspacePath="/tmp/workspace"
        isSidebarCollapsed={false}
        isControlCenterOpen={false}
        isCommandCenterOpen={false}
        commandCenterShortcutHint="Ctrl+P"
        updateState={createUpdateState({ status: 'available', latestVersion: '0.2.1' })}
        onToggleSidebar={() => undefined}
        onToggleControlCenter={() => undefined}
        onToggleCommandCenter={() => undefined}
        onOpenPlugins={() => undefined}
        onOpenSettings={() => undefined}
        onCheckForUpdates={() => undefined}
        onDownloadUpdate={onDownloadUpdate}
        onInstallUpdate={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('app-header-update'))
    expect(onDownloadUpdate).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('app-header-update')).toHaveTextContent(/更新|Update/)
  })

  it('shows a restart action when the update is ready to install', () => {
    const onInstallUpdate = vi.fn()

    render(
      <AppHeader
        activeWorkspaceName="Workspace"
        activeWorkspacePath="/tmp/workspace"
        isSidebarCollapsed={false}
        isControlCenterOpen={false}
        isCommandCenterOpen={false}
        commandCenterShortcutHint="Ctrl+P"
        updateState={createUpdateState({ status: 'downloaded', latestVersion: '0.2.1' })}
        onToggleSidebar={() => undefined}
        onToggleControlCenter={() => undefined}
        onToggleCommandCenter={() => undefined}
        onOpenPlugins={() => undefined}
        onOpenSettings={() => undefined}
        onCheckForUpdates={() => undefined}
        onDownloadUpdate={() => undefined}
        onInstallUpdate={onInstallUpdate}
      />,
    )

    fireEvent.click(screen.getByTestId('app-header-update'))
    expect(onInstallUpdate).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('app-header-update')).toHaveTextContent(/重启|Restart/)
  })

  it('uses a red logo accent in development mode', () => {
    ;(window as Window & { freecliApi?: unknown }).freecliApi = {
      meta: {
        isDev: true,
        isTest: false,
        allowWhatsNewInTests: false,
        platform: 'win32',
      },
    }

    render(
      <AppHeader
        activeWorkspaceName="Workspace"
        activeWorkspacePath="/tmp/workspace"
        isSidebarCollapsed={false}
        isControlCenterOpen={false}
        isCommandCenterOpen={false}
        commandCenterShortcutHint="Ctrl+P"
        updateState={null}
        onToggleSidebar={() => undefined}
        onToggleControlCenter={() => undefined}
        onToggleCommandCenter={() => undefined}
        onOpenPlugins={() => undefined}
        onOpenSettings={() => undefined}
        onCheckForUpdates={() => undefined}
        onDownloadUpdate={() => undefined}
        onInstallUpdate={() => undefined}
      />,
    )

    const accentElements = screen
      .getByTestId('app-header-brand-mark')
      .querySelectorAll('[fill="#E5484D"]')

    expect(accentElements).toHaveLength(2)
    for (const element of accentElements) {
      expect(element).toHaveAttribute('fill', '#E5484D')
    }
  })
})
