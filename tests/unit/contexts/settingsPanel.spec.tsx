import React from 'react'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_PROVIDERS,
  DEFAULT_AGENT_SETTINGS,
  type AgentProvider,
} from '../../../src/contexts/settings/domain/agentSettings'
import type { AppUpdateState } from '../../../src/shared/contracts/dto'
import * as terminalProfilesHook from '../../../src/app/renderer/shell/hooks/useTerminalProfiles'
import { SettingsPanel } from '../../../src/contexts/settings/presentation/renderer/SettingsPanel'

const agentExtensionsApi = {
  getState: vi.fn(),
  addMcpServer: vi.fn(),
  removeMcpServer: vi.fn(),
  createSkill: vi.fn(),
}

Object.defineProperty(window, 'freecliApi', {
  value: {
    agentExtensions: agentExtensionsApi,
  },
  configurable: true,
})

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

function renderSettingsPanel(
  overrides: Partial<React.ComponentProps<typeof SettingsPanel>> = {},
) {
  return render(
    <SettingsPanel
      settings={DEFAULT_AGENT_SETTINGS}
      appliedGraphicsMode={DEFAULT_AGENT_SETTINGS.graphicsMode}
      updateState={createUpdateState()}
      userDataPath={null}
      isClearingUserData={false}
      modelCatalogByProvider={createModelCatalog()}
      workspaces={[]}
      onWorkspaceWorktreesRootChange={() => undefined}
      isFocusNodeTargetZoomPreviewing={false}
      onFocusNodeTargetZoomPreviewChange={() => undefined}
      onChange={() => undefined}
      onCheckForUpdates={() => undefined}
      onDownloadUpdate={() => undefined}
      onInstallUpdate={() => undefined}
      onRestartApp={() => undefined}
      onRequestClearUserData={() => undefined}
      onClose={() => undefined}
      {...overrides}
    />,
  )
}

describe('SettingsPanel', () => {
  const baseAgentExtensionsState = {
    summary: {
      provider: 'codex' as const,
      scope: 'global' as const,
      skillsDirectoryPath: 'C:/Users/Aiden/.codex/skills',
      configPath: 'C:/Users/Aiden/.codex/config.toml',
      cliAvailable: true,
      supportsMcpWrite: true,
      supportsSkillWrite: true,
    },
    mcpServers: [
      {
        name: 'openaiDeveloperDocs',
        enabled: true,
        transport: 'http' as const,
        command: null,
        args: [],
        url: 'https://developers.openai.com/mcp',
        env: {},
        source: 'cli' as const,
      },
    ],
    skills: [
      {
        name: 'openai-docs',
        path: 'C:/Users/Aiden/.codex/skills/openai-docs',
        hasSkillManifest: true,
      },
    ],
  }

  beforeEach(() => {
    agentExtensionsApi.getState.mockReset()
    agentExtensionsApi.addMcpServer.mockReset()
    agentExtensionsApi.removeMcpServer.mockReset()
    agentExtensionsApi.createSkill.mockReset()

    agentExtensionsApi.getState.mockImplementation(async payload => {
      if (payload.provider === 'claude-code') {
        return {
          summary: {
            provider: 'claude-code',
            scope: 'global',
            skillsDirectoryPath: 'C:/Users/Aiden/.claude/skills',
            configPath: 'C:/Users/Aiden/.claude.json',
            cliAvailable: false,
            supportsMcpWrite: true,
            supportsSkillWrite: true,
          },
          mcpServers: [],
          skills: [],
        }
      }

      return baseAgentExtensionsState
    })
    agentExtensionsApi.addMcpServer.mockResolvedValue(undefined)
    agentExtensionsApi.removeMcpServer.mockResolvedValue(undefined)
    agentExtensionsApi.createSkill.mockResolvedValue({
      skill: {
        name: 'new-skill',
        path: 'C:/Users/Aiden/.codex/skills/new-skill',
        hasSkillManifest: true,
      },
    })
  })

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

    renderSettingsPanel({ onChange })

    fireEvent.click(screen.getByTestId('settings-section-nav-canvas'))
    fireEvent.click(screen.getByTestId('settings-terminal-profile-trigger'))
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

    renderSettingsPanel({ onChange })

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

    renderSettingsPanel({ onChange })

    fireEvent.click(screen.getByTestId('settings-section-nav-canvas'))
    fireEvent.click(screen.getByTestId('settings-standard-window-size-trigger'))
    fireEvent.click(screen.getByRole('option', { name: '大' }))

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      standardWindowSizeBucket: 'large',
    })
  })

  it('adds and edits terminal credential profiles from AI settings', () => {
    const onChange = vi.fn()
    vi.spyOn(terminalProfilesHook, 'useTerminalProfiles').mockReturnValue({
      terminalProfiles: [],
      detectedDefaultTerminalProfileId: null,
      refreshTerminalProfiles: async () => undefined,
    })

    function Harness() {
      const [settings, setSettings] = useState(DEFAULT_AGENT_SETTINGS)

      return (
        <SettingsPanel
          settings={settings}
          appliedGraphicsMode={settings.graphicsMode}
          updateState={createUpdateState()}
          userDataPath={null}
          isClearingUserData={false}
          modelCatalogByProvider={createModelCatalog()}
          workspaces={[]}
          onWorkspaceWorktreesRootChange={() => undefined}
          isFocusNodeTargetZoomPreviewing={false}
          onFocusNodeTargetZoomPreviewChange={() => undefined}
          onChange={next => {
            onChange(next)
            setSettings(next)
          }}
          onCheckForUpdates={() => undefined}
          onDownloadUpdate={() => undefined}
          onInstallUpdate={() => undefined}
          onRestartApp={() => undefined}
          onRequestClearUserData={() => undefined}
          onClose={() => undefined}
        />
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByTestId('settings-section-nav-ai'))
    fireEvent.click(screen.getByTestId('settings-terminal-credentials-add-codex'))

    const addedSettings = onChange.mock.calls.at(-1)?.[0]
    expect(addedSettings.terminalCredentials.profiles).toHaveLength(1)

    const addedProfile = addedSettings.terminalCredentials.profiles[0]

    fireEvent.change(screen.getByTestId(`settings-terminal-credentials-label-${addedProfile.id}`), {
      target: { value: 'Main Codex' },
    })
    expect(onChange.mock.calls.at(-1)?.[0].terminalCredentials.profiles[0].label).toBe('Main Codex')

    fireEvent.change(
      screen.getByTestId(`settings-terminal-credentials-api-key-${addedProfile.id}`),
      {
        target: { value: 'sk-codex' },
      },
    )
    expect(onChange.mock.calls.at(-1)?.[0].terminalCredentials.profiles[0].apiKey).toBe('sk-codex')

    fireEvent.change(
      screen.getByTestId(`settings-terminal-credentials-base-url-${addedProfile.id}`),
      {
        target: { value: 'https://api.openai.example' },
      },
    )
    expect(onChange.mock.calls.at(-1)?.[0].terminalCredentials.profiles[0].baseUrl).toBe(
      'https://api.openai.example',
    )
  })

  it('loads agent extensions and supports MCP/skill actions', async () => {
    const onChange = vi.fn()
    vi.spyOn(terminalProfilesHook, 'useTerminalProfiles').mockReturnValue({
      terminalProfiles: [],
      detectedDefaultTerminalProfileId: null,
      refreshTerminalProfiles: async () => undefined,
    })

    renderSettingsPanel({ onChange })

    fireEvent.click(screen.getByTestId('settings-section-nav-ai'))

    expect(await screen.findByRole('heading', { name: 'Skills 与 MCP', level: 3 })).toBeVisible()
    expect(agentExtensionsApi.getState).toHaveBeenCalledWith({
      provider: 'codex',
      scope: 'global',
    })
    expect(agentExtensionsApi.getState).toHaveBeenCalledWith({
      provider: 'claude-code',
      scope: 'global',
    })

    await screen.findByText('openaiDeveloperDocs')

    fireEvent.change(screen.getByTestId('agent-extensions-mcp-name-codex'), {
      target: { value: 'local-docs' },
    })
    fireEvent.click(screen.getByTestId('agent-extensions-mcp-transport-codex-trigger'))
    fireEvent.click(screen.getByRole('option', { name: 'http' }))
    fireEvent.change(screen.getByTestId('agent-extensions-mcp-url-codex'), {
      target: { value: 'https://example.com/mcp' },
    })
    fireEvent.click(screen.getByTestId('agent-extensions-add-mcp-codex'))

    expect(agentExtensionsApi.addMcpServer).toHaveBeenCalledWith({
      provider: 'codex',
      scope: 'global',
      name: 'local-docs',
      transport: 'http',
      command: null,
      args: [],
      url: 'https://example.com/mcp',
      env: {},
    })

    fireEvent.click(screen.getByTestId('agent-extensions-remove-mcp-codex-openaiDeveloperDocs'))
    expect(agentExtensionsApi.removeMcpServer).toHaveBeenCalledWith({
      provider: 'codex',
      scope: 'global',
      name: 'openaiDeveloperDocs',
    })

    fireEvent.change(screen.getByTestId('agent-extensions-skill-name-codex'), {
      target: { value: 'new-skill' },
    })
    fireEvent.click(screen.getByTestId('agent-extensions-create-skill-codex'))
    expect(agentExtensionsApi.createSkill).toHaveBeenCalledWith({
      provider: 'codex',
      scope: 'global',
      name: 'new-skill',
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

    renderSettingsPanel({
      onChange,
      onCheckForUpdates,
      onDownloadUpdate,
      updateState: createUpdateState({
        status: 'available',
        latestVersion: '0.2.1',
        checkedAt: '2026-03-20T00:00:00.000Z',
      }),
    })

    fireEvent.click(screen.getByTestId('settings-update-policy-trigger'))
    fireEvent.click(screen.getByRole('option', { name: '自动更新' }))
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      updatePolicy: 'auto',
    })

    fireEvent.click(screen.getByTestId('settings-update-channel-trigger'))
    fireEvent.click(screen.getByRole('option', { name: '测试版' }))
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

    renderSettingsPanel({ onChange })

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

    const { rerender } = renderSettingsPanel({ onChange, onRestartApp })

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
        userDataPath={null}
        isClearingUserData={false}
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
        onRequestClearUserData={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('settings-graphics-mode-restart'))
    expect(onRestartApp).toHaveBeenCalledTimes(1)
  })

  it('renders the clear-local-data action and forwards clicks', () => {
    const onRequestClearUserData = vi.fn()
    vi.spyOn(terminalProfilesHook, 'useTerminalProfiles').mockReturnValue({
      terminalProfiles: [],
      detectedDefaultTerminalProfileId: null,
      refreshTerminalProfiles: async () => undefined,
    })

    renderSettingsPanel({
      userDataPath: 'C:/Users/Aiden/AppData/Roaming/freecli',
      onRequestClearUserData,
    })

    expect(screen.getByTestId('settings-clear-user-data-section')).toBeVisible()
    expect(screen.getByText('将清空：C:/Users/Aiden/AppData/Roaming/freecli')).toBeVisible()
    fireEvent.click(screen.getByTestId('settings-clear-user-data'))
    expect(onRequestClearUserData).toHaveBeenCalledTimes(1)
  })
})
