import React, { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'
import type { WorkspaceState } from '../../../src/contexts/workspace/presentation/renderer/types'
import { installMockStorage } from '../../support/persistenceTestStorage'

describe('useHydrateAppState hosted Codex/Claude terminal restore', () => {
  it('rehydrates a hosted codex terminal by spawning the shell and injecting a resume command', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify({
        activeWorkspaceId: 'workspace-1',
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Workspace 1',
            path: '/tmp/workspace-1',
            viewport: { x: 0, y: 0, zoom: 1 },
            isMinimapVisible: true,
            spaces: [],
            activeSpaceId: null,
            nodes: [
              {
                id: 'terminal-node-1',
                title: 'codex',
                position: { x: 0, y: 0 },
                width: 520,
                height: 360,
                kind: 'terminal',
                profileId: 'powershell',
                runtimeKind: 'windows',
                credentialProfileId: 'codex-default',
                status: 'running',
                startedAt: '2026-03-31T10:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
                scrollback: null,
                executionDirectory: '/tmp/workspace-1',
                expectedDirectory: '/tmp/workspace-1',
                agent: null,
                hostedAgent: {
                  bindingId: 'hosted-binding-1',
                  provider: 'codex',
                  launchMode: 'new',
                  resumeSessionId: null,
                  resumeSessionIdVerified: false,
                  cwd: '/tmp/workspace-1',
                  command: 'codex',
                  startedAt: '2026-03-31T10:00:00.000Z',
                  restoreIntent: true,
                  state: 'active',
                },
                task: null,
              },
            ],
          },
        ],
        settings: {
          defaultTerminalProfileId: 'powershell',
          terminalCredentials: {
            profiles: [
              {
                id: 'codex-default',
                label: 'Codex Main',
                provider: 'codex',
                apiKey: 'sk-test-codex',
                baseUrl: 'https://api.openai.example',
                enabled: true,
              },
            ],
            defaultProfileIdByProvider: {
              codex: 'codex-default',
              'claude-code': null,
            },
          },
        },
      }),
    )

    const spawn = vi.fn(async () => ({
      sessionId: 'terminal-session-1',
      profileId: 'powershell',
      runtimeKind: 'windows' as const,
    }))
    const write = vi.fn(async () => undefined)
    const trackHostedAgent = vi.fn(async () => undefined)
    const launch = vi.fn()
    const resolveResumeSessionId = vi.fn(async () => ({
      resumeSessionId: 'resolved-codex-session',
    }))

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          spawn,
          write,
          trackHostedAgent,
          onData: vi.fn(() => () => undefined),
          onExit: vi.fn(() => () => undefined),
        },
        agent: {
          launch,
          resolveResumeSessionId,
        },
      },
    })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    function Harness() {
      const [_agentSettings, setAgentSettings] = useState(DEFAULT_AGENT_SETTINGS)
      const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
      const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

      const { isHydrated } = useHydrateAppState({
        agentSettings: _agentSettings,
        workspaces,
        activeWorkspaceId,
        setAgentSettings,
        setWorkspaces,
        setActiveWorkspaceId,
      })

      const workspace = workspaces.find(item => item.id === 'workspace-1') ?? null
      const terminalNode = workspace?.nodes.find(node => node.id === 'terminal-node-1') ?? null

      return (
        <div>
          <div data-testid="hydrated">{String(isHydrated)}</div>
          <div data-testid="terminal-session-id">{terminalNode?.data.sessionId ?? 'none'}</div>
          <div data-testid="terminal-status">{terminalNode?.data.status ?? 'none'}</div>
          <div data-testid="terminal-active-credential-profile-id">
            {terminalNode?.data.activeCredentialProfileId ?? 'none'}
          </div>
          <div data-testid="hosted-resume-session-id">
            {terminalNode?.data.hostedAgent?.resumeSessionId ?? 'none'}
          </div>
          <div data-testid="hosted-restore-intent">
            {String(terminalNode?.data.hostedAgent?.restoreIntent ?? false)}
          </div>
        </div>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })

    expect(resolveResumeSessionId).toHaveBeenCalledWith({
      provider: 'codex',
      cwd: '/tmp/workspace-1',
      startedAt: '2026-03-31T10:00:00.000Z',
    })
    expect(spawn).toHaveBeenCalledWith({
      cwd: '/tmp/workspace-1',
      profileId: 'powershell',
      credential: {
        provider: 'codex',
        apiKey: 'sk-test-codex',
        baseUrl: 'https://api.openai.example',
      },
      cols: 80,
      rows: 24,
    })
    expect(write).toHaveBeenCalledWith({
      sessionId: 'terminal-session-1',
      data: 'codex resume resolved-codex-session\r',
    })
    expect(trackHostedAgent).toHaveBeenCalledWith({
      sessionId: 'terminal-session-1',
      bindingId: 'hosted-binding-1',
      provider: 'codex',
      cwd: '/tmp/workspace-1',
      launchMode: 'resume',
      resumeSessionId: 'resolved-codex-session',
      startedAt: '2026-03-31T10:00:00.000Z',
    })
    expect(launch).not.toHaveBeenCalled()
    expect(screen.getByTestId('terminal-session-id')).toHaveTextContent('terminal-session-1')
    expect(screen.getByTestId('terminal-status')).toHaveTextContent('restoring')
    expect(screen.getByTestId('terminal-active-credential-profile-id')).toHaveTextContent(
      'codex-default',
    )
    expect(screen.getByTestId('hosted-resume-session-id')).toHaveTextContent(
      'resolved-codex-session',
    )
    expect(screen.getByTestId('hosted-restore-intent')).toHaveTextContent('true')
  })

  it('keeps hosted terminal restore intent when resume session cannot be resolved yet', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify({
        activeWorkspaceId: 'workspace-1',
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Workspace 1',
            path: '/tmp/workspace-1',
            viewport: { x: 0, y: 0, zoom: 1 },
            isMinimapVisible: true,
            spaces: [],
            activeSpaceId: null,
            nodes: [
              {
                id: 'terminal-node-1',
                title: 'codex',
                position: { x: 0, y: 0 },
                width: 520,
                height: 360,
                kind: 'terminal',
                profileId: 'powershell',
                runtimeKind: 'windows',
                credentialProfileId: 'codex-default',
                status: 'running',
                startedAt: '2026-03-31T10:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
                scrollback: null,
                executionDirectory: '/tmp/workspace-1',
                expectedDirectory: '/tmp/workspace-1',
                agent: null,
                hostedAgent: {
                  bindingId: 'hosted-binding-1',
                  provider: 'codex',
                  launchMode: 'new',
                  resumeSessionId: null,
                  resumeSessionIdVerified: false,
                  cwd: '/tmp/workspace-1',
                  command: 'codex',
                  startedAt: '2026-03-31T10:00:00.000Z',
                  restoreIntent: true,
                  state: 'active',
                },
                task: null,
              },
            ],
          },
        ],
        settings: {
          defaultTerminalProfileId: 'powershell',
          terminalCredentials: {
            profiles: [
              {
                id: 'codex-default',
                label: 'Codex Main',
                provider: 'codex',
                apiKey: 'sk-test-codex',
                baseUrl: 'https://api.openai.example',
                enabled: true,
              },
            ],
            defaultProfileIdByProvider: {
              codex: 'codex-default',
              'claude-code': null,
            },
          },
        },
      }),
    )

    const spawn = vi.fn(async () => ({
      sessionId: 'terminal-session-1',
      profileId: 'powershell',
      runtimeKind: 'windows' as const,
    }))
    const write = vi.fn(async () => undefined)
    const trackHostedAgent = vi.fn(async () => undefined)
    const launch = vi.fn()
    const resolveResumeSessionId = vi.fn(async () => ({
      resumeSessionId: null,
    }))

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          spawn,
          write,
          trackHostedAgent,
          onData: vi.fn(() => () => undefined),
          onExit: vi.fn(() => () => undefined),
        },
        agent: {
          launch,
          resolveResumeSessionId,
        },
      },
    })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    function Harness() {
      const [_agentSettings, setAgentSettings] = useState(DEFAULT_AGENT_SETTINGS)
      const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
      const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

      const { isHydrated } = useHydrateAppState({
        agentSettings: _agentSettings,
        workspaces,
        activeWorkspaceId,
        setAgentSettings,
        setWorkspaces,
        setActiveWorkspaceId,
      })

      const workspace = workspaces.find(item => item.id === 'workspace-1') ?? null
      const terminalNode = workspace?.nodes.find(node => node.id === 'terminal-node-1') ?? null

      return (
        <div>
          <div data-testid="hydrated">{String(isHydrated)}</div>
          <div data-testid="terminal-session-id">{terminalNode?.data.sessionId ?? 'none'}</div>
          <div data-testid="terminal-status">{terminalNode?.data.status ?? 'none'}</div>
          <div data-testid="terminal-last-error">{terminalNode?.data.lastError ?? 'none'}</div>
          <div data-testid="hosted-state">{terminalNode?.data.hostedAgent?.state ?? 'none'}</div>
          <div data-testid="hosted-restore-intent">
            {String(terminalNode?.data.hostedAgent?.restoreIntent ?? false)}
          </div>
        </div>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })

    expect(resolveResumeSessionId).toHaveBeenCalledWith({
      provider: 'codex',
      cwd: '/tmp/workspace-1',
      startedAt: '2026-03-31T10:00:00.000Z',
    })
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(write).not.toHaveBeenCalled()
    expect(trackHostedAgent).not.toHaveBeenCalled()
    expect(launch).not.toHaveBeenCalled()
    expect(screen.getByTestId('terminal-session-id')).toHaveTextContent('terminal-session-1')
    expect(screen.getByTestId('terminal-status')).toHaveTextContent('none')
    expect(screen.getByTestId('hosted-state')).toHaveTextContent('inactive')
    expect(screen.getByTestId('hosted-restore-intent')).toHaveTextContent('true')
  })

  it('rehydrates legacy hosted terminal payloads without command and startedAt fields', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify({
        activeWorkspaceId: 'workspace-1',
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Workspace 1',
            path: '/tmp/workspace-1',
            viewport: { x: 0, y: 0, zoom: 1 },
            isMinimapVisible: true,
            spaces: [],
            activeSpaceId: null,
            nodes: [
              {
                id: 'terminal-node-1',
                title: 'codex',
                position: { x: 0, y: 0 },
                width: 520,
                height: 360,
                kind: 'terminal',
                profileId: 'powershell',
                runtimeKind: 'windows',
                credentialProfileId: 'codex-default',
                status: 'running',
                startedAt: '2026-03-31T10:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
                scrollback: null,
                executionDirectory: '/tmp/workspace-1',
                expectedDirectory: '/tmp/workspace-1',
                agent: null,
                hostedAgent: {
                  provider: 'codex',
                  launchMode: 'resume',
                  resumeSessionId: 'persisted-codex-session',
                  resumeSessionIdVerified: true,
                  cwd: '/tmp/workspace-1',
                  restoreIntent: true,
                  state: 'active',
                },
                task: null,
              },
            ],
          },
        ],
        settings: {
          defaultTerminalProfileId: 'powershell',
          terminalCredentials: {
            profiles: [
              {
                id: 'codex-default',
                label: 'Codex Main',
                provider: 'codex',
                apiKey: 'sk-test-codex',
                baseUrl: 'https://api.openai.example',
                enabled: true,
              },
            ],
            defaultProfileIdByProvider: {
              codex: 'codex-default',
              'claude-code': null,
            },
          },
        },
      }),
    )

    const spawn = vi.fn(async () => ({
      sessionId: 'terminal-session-legacy',
      profileId: 'powershell',
      runtimeKind: 'windows' as const,
    }))
    const write = vi.fn(async () => undefined)
    const trackHostedAgent = vi.fn(async () => undefined)
    const launch = vi.fn()
    const resolveResumeSessionId = vi.fn(async () => ({
      resumeSessionId: null,
    }))

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          spawn,
          write,
          trackHostedAgent,
          onData: vi.fn(() => () => undefined),
          onExit: vi.fn(() => () => undefined),
        },
        agent: {
          launch,
          resolveResumeSessionId,
        },
      },
    })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    function Harness() {
      const [_agentSettings, setAgentSettings] = useState(DEFAULT_AGENT_SETTINGS)
      const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
      const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

      const { isHydrated } = useHydrateAppState({
        agentSettings: _agentSettings,
        workspaces,
        activeWorkspaceId,
        setAgentSettings,
        setWorkspaces,
        setActiveWorkspaceId,
      })

      const workspace = workspaces.find(item => item.id === 'workspace-1') ?? null
      const terminalNode = workspace?.nodes.find(node => node.id === 'terminal-node-1') ?? null

      return (
        <div>
          <div data-testid="hydrated">{String(isHydrated)}</div>
          <div data-testid="terminal-session-id">{terminalNode?.data.sessionId ?? 'none'}</div>
          <div data-testid="terminal-status">{terminalNode?.data.status ?? 'none'}</div>
          <div data-testid="hosted-resume-session-id">
            {terminalNode?.data.hostedAgent?.resumeSessionId ?? 'none'}
          </div>
          <div data-testid="hosted-restore-intent">
            {String(terminalNode?.data.hostedAgent?.restoreIntent ?? false)}
          </div>
        </div>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })

    expect(spawn).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith({
      sessionId: 'terminal-session-legacy',
      data: 'codex resume persisted-codex-session\r',
    })
    expect(trackHostedAgent).toHaveBeenCalledWith({
      sessionId: 'terminal-session-legacy',
      bindingId: 'hosted-terminal:codex:/tmp/workspace-1:persisted:codex',
      provider: 'codex',
      cwd: '/tmp/workspace-1',
      launchMode: 'resume',
      resumeSessionId: 'persisted-codex-session',
      startedAt: 'persisted',
    })
    expect(screen.getByTestId('terminal-session-id')).toHaveTextContent('terminal-session-legacy')
    expect(screen.getByTestId('terminal-status')).toHaveTextContent('restoring')
    expect(screen.getByTestId('hosted-resume-session-id')).toHaveTextContent(
      'persisted-codex-session',
    )
    expect(screen.getByTestId('hosted-restore-intent')).toHaveTextContent('true')
  })

  it('does not re-resume a hosted terminal when its live session survives workspace switching', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify({
        activeWorkspaceId: 'workspace-1',
        workspaces: [
          {
            id: 'workspace-1',
            name: 'Workspace 1',
            path: '/tmp/workspace-1',
            viewport: { x: 0, y: 0, zoom: 1 },
            isMinimapVisible: false,
            spaces: [],
            activeSpaceId: null,
            nodes: [
              {
                id: 'terminal-node-1',
                title: 'codex',
                position: { x: 0, y: 0 },
                width: 520,
                height: 360,
                kind: 'terminal',
                status: 'running',
                startedAt: '2026-03-31T10:00:00.000Z',
                endedAt: null,
                exitCode: null,
                lastError: null,
                scrollback: null,
                persistenceMode: 'persistent',
                executionDirectory: '/tmp/workspace-1',
                expectedDirectory: '/tmp/workspace-1',
                agent: null,
                hostedAgent: {
                  bindingId: 'hosted-binding-1',
                  provider: 'codex',
                  launchMode: 'resume',
                  resumeSessionId: 'resolved-codex-session',
                  resumeSessionIdVerified: true,
                  cwd: '/tmp/workspace-1',
                  command: 'codex resume resolved-codex-session',
                  startedAt: '2026-03-31T10:00:00.000Z',
                  restoreIntent: true,
                  state: 'active',
                },
                task: null,
              },
            ],
          },
          {
            id: 'workspace-2',
            name: 'Workspace 2',
            path: '/tmp/workspace-2',
            viewport: { x: 0, y: 0, zoom: 1 },
            isMinimapVisible: false,
            spaces: [],
            activeSpaceId: null,
            nodes: [],
          },
        ],
        settings: {
          defaultTerminalProfileId: 'powershell',
          terminalCredentials: {
            profiles: [
              {
                id: 'codex-default',
                label: 'Codex Main',
                provider: 'codex',
                apiKey: 'sk-test-codex',
                baseUrl: 'https://api.openai.example',
                enabled: true,
              },
            ],
            defaultProfileIdByProvider: {
              codex: 'codex-default',
              'claude-code': null,
            },
          },
        },
      }),
    )

    const spawn = vi
      .fn()
      .mockResolvedValueOnce({
        sessionId: 'terminal-session-1',
        profileId: 'powershell',
        runtimeKind: 'windows' as const,
      })
      .mockResolvedValueOnce({
        sessionId: 'terminal-session-2',
        profileId: 'powershell',
        runtimeKind: 'windows' as const,
      })
    const write = vi.fn(async () => undefined)
    const trackHostedAgent = vi.fn(async () => undefined)
    const launch = vi.fn()
    const resolveResumeSessionId = vi.fn(async () => ({
      resumeSessionId: 'resolved-codex-session',
    }))

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: {
        pty: {
          spawn,
          write,
          trackHostedAgent,
          onData: vi.fn(() => () => undefined),
          onExit: vi.fn(() => () => undefined),
        },
        agent: {
          launch,
          resolveResumeSessionId,
        },
      },
    })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    function Harness() {
      const [_agentSettings, setAgentSettings] = useState(DEFAULT_AGENT_SETTINGS)
      const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
      const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

      const { isHydrated } = useHydrateAppState({
        agentSettings: _agentSettings,
        workspaces,
        activeWorkspaceId,
        setAgentSettings,
        setWorkspaces,
        setActiveWorkspaceId,
      })

      const workspace1 =
        workspaces.find(workspace => workspace.id === 'workspace-1')?.nodes[0] ?? null

      return (
        <div>
          <div data-testid="hydrated">{String(isHydrated)}</div>
          <div data-testid="active-workspace">{activeWorkspaceId ?? 'none'}</div>
          <div data-testid="workspace-1-session">{workspace1?.data.sessionId ?? 'none'}</div>
          <div data-testid="workspace-1-status">{workspace1?.data.status ?? 'none'}</div>
          <button type="button" onClick={() => setActiveWorkspaceId('workspace-1')}>
            Select workspace 1
          </button>
          <button type="button" onClick={() => setActiveWorkspaceId('workspace-2')}>
            Select workspace 2
          </button>
        </div>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('workspace-1-session')).toHaveTextContent('terminal-session-1')
    expect(screen.getByTestId('workspace-1-status')).toHaveTextContent('restoring')
    expect(write).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Select workspace 2' }))
    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-2')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select workspace 1' }))
    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-1')
    })

    expect(screen.getByTestId('workspace-1-session')).toHaveTextContent('terminal-session-1')
    expect(screen.getByTestId('workspace-1-status')).toHaveTextContent('restoring')
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(trackHostedAgent).toHaveBeenCalledTimes(1)
    expect(resolveResumeSessionId).not.toHaveBeenCalled()
    expect(launch).not.toHaveBeenCalled()
  })
})
