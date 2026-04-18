import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  AGENT_PROVIDERS,
  DEFAULT_AGENT_SETTINGS,
  type AgentProvider,
} from '../../../src/contexts/settings/domain/agentSettings'
import type { AppUpdateState } from '../../../src/shared/contracts/dto'
import * as terminalProfilesHook from '../../../src/app/renderer/shell/hooks/useTerminalProfiles'
import { SettingsPanel } from '../../../src/contexts/settings/presentation/renderer/SettingsPanel'

function createModelCatalog() {
  return AGENT_PROVIDERS.reduce<
    Record<
      AgentProvider,
      {
        models: string[]
        source: string | null
        fetchedAt: string | null
        isLoading: boolean
        error: string | null
      }
    >
  >(
    (acc, provider) => {
      acc[provider] = {
        models: [],
        source: null,
        fetchedAt: null,
        isLoading: false,
        error: null,
      }
      return acc
    },
    {} as Record<
      AgentProvider,
      {
        models: string[]
        source: string | null
        fetchedAt: string | null
        isLoading: boolean
        error: string | null
      }
    >,
  )
}

function createUpdateState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    policy: DEFAULT_AGENT_SETTINGS.updatePolicy,
    channel: DEFAULT_AGENT_SETTINGS.updateChannel,
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

describe('SettingsPanel', () => {
  it('persists the selected default profile', () => {
    const onChange = vi.fn()
    vi.spyOn(terminalProfilesHook, 'useTerminalProfiles').mockReturnValue({
      terminalProfiles: [
        { id: 'powershell', label: 'PowerShell', runtimeKind: 'windows' },
        { id: 'wsl:Ubuntu', label: 'WSL (Ubuntu)', runtimeKind: 'wsl' },
      ],
      detectedDefaultTerminalProfileId: 'powershell',
      refreshTerminalProfiles: async () => undefined,
    })

    const { rerender } = render(
      <SettingsPanel
        settings={DEFAULT_AGENT_SETTINGS}
        appliedGraphicsMode={DEFAULT_AGENT_SETTINGS.graphicsMode}
        updateState={createUpdateState()}
        modelCatalogByProvider={createModelCatalog()}
        workspaces={[]}
        onWorkspaceWorktreesRootChange={() => undefined}
        isFocusNodeTargetZoomPreviewing={false}
        onFocusNodeTargetZoomPreviewChange={() => undefined}
        onChange={onChange}
        onCheckForUpdates={() => undefined}
        onDownloadUpdate={() => undefined}
        onInstallUpdate={() => undefined}
        onRestartApp={() => undefined}
        onClose={() => undefined}
      />,
    )

    const canvasNav = screen.getByTestId('settings-section-nav-canvas')
    fireEvent.click(canvasNav)

    const trigger = screen.getByTestId('settings-terminal-profile-trigger')
    expect(trigger).toBeVisible()
    expect(screen.getByText('自动（PowerShell）')).toBeVisible()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('option', { name: 'WSL (Ubuntu)' }))

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      defaultTerminalProfileId: 'wsl:Ubuntu',
    })
  })

  it('allows reordering agent providers', () => {
    const onChange = vi.fn()
    vi.spyOn(terminalProfilesHook, 'useTerminalProfiles').mockReturnValue({
      terminalProfiles: [],
      detectedDefaultTerminalProfileId: null,
      refreshTerminalProfiles: async () => undefined,
    })

    const { rerender } = render(
      <SettingsPanel
        settings={DEFAULT_AGENT_SETTINGS}
        appliedGraphicsMode={DEFAULT_AGENT_SETTINGS.graphicsMode}
        updateState={createUpdateState()}
        modelCatalogByProvider={createModelCatalog()}
        workspaces={[]}
        onWorkspaceWorktreesRootChange={() => undefined}
        isFocusNodeTargetZoomPreviewing={false}
        onFocusNodeTargetZoomPreviewChange={() => undefined}
        onChange={onChange}
        onCheckForUpdates={() => undefined}
        onDownloadUpdate={() => undefined}
        onInstallUpdate={() => undefined}
        onRestartApp={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('settings-section-nav-agent'))
    fireEvent.click(screen.getByTestId('settings-agent-order-move-down-claude-code'))

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      agentProviderOrder: ['codex', 'claude-code', 'opencode', 'gemini'],
    })
  })

  it('updates the standard window size bucket from canvas settings', () => {
    const onChange = vi.fn()
    vi.spyOn(terminalProfilesHook, 'useTerminalProfiles').mockReturnValue({
      terminalProfiles: [],
      detectedDefaultTerminalProfileId: null,
      refreshTerminalProfiles: async () => undefined,
    })

    const { rerender } = render(
      <SettingsPanel
        settings={DEFAULT_AGENT_SETTINGS}
        appliedGraphicsMode={DEFAULT_AGENT_SETTINGS.graphicsMode}
        updateState={createUpdateState()}
        modelCatalogByProvider={createModelCatalog()}
        workspaces={[]}
        onWorkspaceWorktreesRootChange={() => undefined}
        isFocusNodeTargetZoomPreviewing={false}
        onFocusNodeTargetZoomPreviewChange={() => undefined}
        onChange={onChange}
        onCheckForUpdates={() => undefined}
        onDownloadUpdate={() => undefined}
        onInstallUpdate={() => undefined}
        onRestartApp={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('settings-section-nav-canvas'))
    fireEvent.click(screen.getByTestId('settings-standard-window-size-trigger'))
    fireEvent.click(screen.getByRole('option', { name: '大' }))

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      standardWindowSizeBucket: 'large',
    })
  })

  it('updates release channel settings and exposes update actions', () => {
    const onChange = vi.fn()
    const onCheckForUpdates = vi.fn()
    const onDownloadUpdate = vi.fn()
    vi.spyOn(terminalProfilesHook, 'useTerminalProfiles').mockReturnValue({
      terminalProfiles: [],
      detectedDefaultTerminalProfileId: null,
      refreshTerminalProfiles: async () => undefined,
    })

    render(
      <SettingsPanel
        settings={DEFAULT_AGENT_SETTINGS}
        appliedGraphicsMode={DEFAULT_AGENT_SETTINGS.graphicsMode}
        updateState={createUpdateState({
          status: 'available',
          latestVersion: '0.2.1',
          checkedAt: '2026-03-20T00:00:00.000Z',
        })}
        modelCatalogByProvider={createModelCatalog()}
        workspaces={[]}
        onWorkspaceWorktreesRootChange={() => undefined}
        isFocusNodeTargetZoomPreviewing={false}
        onFocusNodeTargetZoomPreviewChange={() => undefined}
        onChange={onChange}
        onCheckForUpdates={onCheckForUpdates}
        onDownloadUpdate={onDownloadUpdate}
        onInstallUpdate={() => undefined}
        onRestartApp={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('settings-update-policy-trigger'))
    fireEvent.click(screen.getByRole('option', { name: '自动更新' }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      updatePolicy: 'auto',
    })

    fireEvent.click(screen.getByTestId('settings-update-channel-trigger'))
    fireEvent.click(screen.getByRole('option', { name: '夜间版' }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      updateChannel: 'nightly',
      updatePolicy: 'prompt',
    })

    fireEvent.click(screen.getByTestId('settings-update-check'))
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('settings-update-download'))
    expect(onDownloadUpdate).toHaveBeenCalledTimes(1)
  })

  it('toggles GitHub pull request links from integrations settings', () => {
    const onChange = vi.fn()
    vi.spyOn(terminalProfilesHook, 'useTerminalProfiles').mockReturnValue({
      terminalProfiles: [],
      detectedDefaultTerminalProfileId: null,
      refreshTerminalProfiles: async () => undefined,
    })

    const { rerender } = render(
      <SettingsPanel
        settings={DEFAULT_AGENT_SETTINGS}
        appliedGraphicsMode={DEFAULT_AGENT_SETTINGS.graphicsMode}
        updateState={createUpdateState()}
        modelCatalogByProvider={createModelCatalog()}
        workspaces={[]}
        onWorkspaceWorktreesRootChange={() => undefined}
        isFocusNodeTargetZoomPreviewing={false}
        onFocusNodeTargetZoomPreviewChange={() => undefined}
        onChange={onChange}
        onCheckForUpdates={() => undefined}
        onDownloadUpdate={() => undefined}
        onInstallUpdate={() => undefined}
        onRestartApp={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('settings-section-nav-integrations'))
    fireEvent.click(screen.getByTestId('settings-github-pull-requests-enabled'))

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      githubPullRequestsEnabled: false,
    })
  })

  it('shows a restart action after switching to power-saving graphics mode', () => {
    const onChange = vi.fn()
    const onRestartApp = vi.fn()
    vi.spyOn(terminalProfilesHook, 'useTerminalProfiles').mockReturnValue({
      terminalProfiles: [],
      detectedDefaultTerminalProfileId: null,
      refreshTerminalProfiles: async () => undefined,
    })

    const { rerender } = render(
      <SettingsPanel
        settings={DEFAULT_AGENT_SETTINGS}
        appliedGraphicsMode={DEFAULT_AGENT_SETTINGS.graphicsMode}
        updateState={createUpdateState()}
        modelCatalogByProvider={createModelCatalog()}
        workspaces={[]}
        onWorkspaceWorktreesRootChange={() => undefined}
        isFocusNodeTargetZoomPreviewing={false}
        onFocusNodeTargetZoomPreviewChange={() => undefined}
        onChange={onChange}
        onCheckForUpdates={() => undefined}
        onDownloadUpdate={() => undefined}
        onInstallUpdate={() => undefined}
        onRestartApp={onRestartApp}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('settings-graphics-mode-trigger'))
    fireEvent.click(screen.getByRole('option', { name: '低功耗优先' }))

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      graphicsMode: 'power-saving',
    })

    rerender(
      <SettingsPanel
        settings={{ ...DEFAULT_AGENT_SETTINGS, graphicsMode: 'power-saving' }}
        appliedGraphicsMode="system-default"
        updateState={createUpdateState()}
        modelCatalogByProvider={createModelCatalog()}
        workspaces={[]}
        onWorkspaceWorktreesRootChange={() => undefined}
        isFocusNodeTargetZoomPreviewing={false}
        onFocusNodeTargetZoomPreviewChange={() => undefined}
        onChange={onChange}
        onCheckForUpdates={() => undefined}
        onDownloadUpdate={() => undefined}
        onInstallUpdate={() => undefined}
        onRestartApp={onRestartApp}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('settings-graphics-mode-restart'))
    expect(onRestartApp).toHaveBeenCalledTimes(1)
  })
})
