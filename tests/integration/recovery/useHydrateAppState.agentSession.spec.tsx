import React, { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'
import type { WorkspaceState } from '../../../src/contexts/workspace/presentation/renderer/types'
import { installMockStorage } from '../../support/persistenceTestStorage'

function createPersistedState({
  title = 'codex · gpt-5.2-codex',
  titlePinnedByUser = false,
  prompt,
  status,
  startedAt,
  resumeSessionId = null,
  resumeSessionIdVerified = false,
}: {
  title?: string
  titlePinnedByUser?: boolean
  prompt: string
  status: 'running' | 'standby'
  startedAt: string
  resumeSessionId?: string | null
  resumeSessionIdVerified?: boolean
}) {
  return {
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
            id: 'agent-node-1',
            title,
            titlePinnedByUser,
            position: { x: 0, y: 0 },
            width: 520,
            height: 360,
            kind: 'agent',
            status,
            startedAt,
            endedAt: null,
            exitCode: null,
            lastError: null,
            scrollback: null,
            agent: {
              provider: 'codex',
              prompt,
              model: 'gpt-5.2-codex',
              effectiveModel: 'gpt-5.2-codex',
              launchMode: 'new',
              resumeSessionId,
              resumeSessionIdVerified,
              executionDirectory: '/tmp/workspace-1/agent',
              expectedDirectory: '/tmp/workspace-1/agent',
              directoryMode: 'workspace',
              customDirectory: null,
              shouldCreateDirectory: false,
              taskId: null,
            },
            task: null,
          },
        ],
      },
    ],
    settings: {},
  }
}

function installMockApi({
  spawn,
  launch,
  resolveResumeSessionId = vi.fn(async () => ({ resumeSessionId: null })),
}: {
  spawn: ReturnType<typeof vi.fn>
  launch: ReturnType<typeof vi.fn>
  resolveResumeSessionId?: ReturnType<typeof vi.fn>
}) {
  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    writable: true,
    value: {
      pty: {
        spawn,
      },
      agent: {
        launch,
        resolveResumeSessionId,
      },
    },
  })

  return { resolveResumeSessionId }
}

function createHarness(
  useHydrateAppStateHook: typeof import('../../../src/app/renderer/shell/hooks/useHydrateAppState').useHydrateAppState,
) {
  return function Harness() {
    const [_agentSettings, setAgentSettings] = useState(DEFAULT_AGENT_SETTINGS)
    const [workspaces, setWorkspaces] = useState<WorkspaceState[]>([])
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

    const { isHydrated } = useHydrateAppStateHook({
      workspaces,
      activeWorkspaceId,
      setAgentSettings,
      setWorkspaces,
      setActiveWorkspaceId,
    })

    const hydratedAgent = workspaces.find(workspace => workspace.id === 'workspace-1')?.nodes[0]

    return (
      <div>
        <div data-testid="active-workspace">{activeWorkspaceId ?? 'none'}</div>
        <div data-testid="hydrated">{String(isHydrated)}</div>
        <div data-testid="agent-session-id">{hydratedAgent?.data.sessionId ?? ''}</div>
        <div data-testid="agent-title">{hydratedAgent?.data.title ?? 'none'}</div>
        <div data-testid="agent-status">{hydratedAgent?.data.status ?? 'none'}</div>
        <div data-testid="agent-started-at">{hydratedAgent?.data.startedAt ?? 'none'}</div>
        <div data-testid="agent-resume-session-id">
          {hydratedAgent?.data.agent?.resumeSessionId ?? 'none'}
        </div>
        <div data-testid="agent-resume-session-verified">
          {String(hydratedAgent?.data.agent?.resumeSessionIdVerified ?? false)}
        </div>
        <div data-testid="agent-last-error">{hydratedAgent?.data.lastError ?? 'none'}</div>
      </div>
    )
  }
}

describe('useHydrateAppState agent session restore', () => {
  it('relaunches a blank persisted codex agent without a resume binding as a new session', async () => {
    const storage = installMockStorage()
    const originalStartedAt = '2026-03-08T09:00:00.000Z'

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify(
        createPersistedState({
          prompt: '',
          status: 'standby',
          startedAt: originalStartedAt,
          resumeSessionId: null,
        }),
      ),
    )

    const spawn = vi.fn(async () => {
      throw new Error('should not fallback to shell for blank agent relaunch')
    })
    const launch = vi.fn(async () => ({
      sessionId: 'relaunched-agent-session',
      provider: 'codex',
      command: 'codex',
      args: [],
      launchMode: 'new' as const,
      effectiveModel: 'gpt-5.2-codex',
      resumeSessionId: null,
    }))

    installMockApi({ spawn, launch })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    render(React.createElement(createHarness(useHydrateAppState)))

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-1')
    })

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })

    expect(launch).toHaveBeenCalledWith({
      bindingId: 'agent-node:codex:/tmp/workspace-1/agent:persisted',
      provider: 'codex',
      cwd: '/tmp/workspace-1/agent',
      prompt: '',
      mode: 'new',
      model: 'gpt-5.2-codex',
      agentFullAccess: true,
      cols: 80,
      rows: 24,
    })
    expect(spawn).not.toHaveBeenCalled()
    expect(screen.getByTestId('agent-session-id')).toHaveTextContent('relaunched-agent-session')
    expect(screen.getByTestId('agent-status')).toHaveTextContent('standby')
    expect(screen.getByTestId('agent-started-at').textContent).not.toBe(originalStartedAt)
    expect(screen.getByTestId('agent-resume-session-id')).toHaveTextContent('none')
    expect(screen.getByTestId('agent-resume-session-verified')).toHaveTextContent('false')
  })

  it('marks a prompted codex agent as failed when no recoverable binding can be resolved', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify(
        createPersistedState({
          prompt: 'implement login flow',
          status: 'running',
          startedAt: '2026-03-08T09:00:00.000Z',
          resumeSessionId: null,
        }),
      ),
    )

    const spawn = vi.fn(async () => ({ sessionId: 'spawned-agent-session' }))
    const launch = vi.fn(async () => {
      throw new Error('should not relaunch a prompted agent without a binding')
    })
    const resolveResumeSessionId = vi.fn(async () => ({ resumeSessionId: null }))

    installMockApi({ spawn, launch, resolveResumeSessionId })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    render(React.createElement(createHarness(useHydrateAppState)))

    await waitFor(() => {
      expect(screen.getByTestId('active-workspace')).toHaveTextContent('workspace-1')
    })

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })

    expect(resolveResumeSessionId).toHaveBeenCalledWith({
      provider: 'codex',
      cwd: '/tmp/workspace-1/agent',
      startedAt: '2026-03-08T09:00:00.000Z',
    })
    expect(launch).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledWith({
      cwd: '/tmp/workspace-1/agent',
      cols: 80,
      rows: 24,
    })
    expect(screen.getByTestId('agent-session-id')).toHaveTextContent('spawned-agent-session')
    expect(screen.getByTestId('agent-status')).toHaveTextContent('failed')
    expect(screen.getByTestId('agent-resume-session-id')).toHaveTextContent('none')
    expect(screen.getByTestId('agent-resume-session-verified')).toHaveTextContent('false')
    expect(screen.getByTestId('agent-last-error')).toHaveTextContent('none')
  })

  it('resumes a prompted codex agent when a pending binding can be resolved during hydration', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify(
        createPersistedState({
          prompt: 'implement login flow',
          status: 'running',
          startedAt: '2026-03-08T09:00:00.000Z',
          resumeSessionId: null,
        }),
      ),
    )

    const spawn = vi.fn(async () => {
      throw new Error('should not fallback to shell when resume binding resolves')
    })
    const launch = vi.fn(async () => ({
      sessionId: 'resumed-agent-session',
      provider: 'codex',
      command: 'codex',
      args: ['resume'],
      launchMode: 'resume' as const,
      effectiveModel: 'gpt-5.2-codex',
      resumeSessionId: 'resolved-codex-session',
    }))
    const resolveResumeSessionId = vi.fn(async () => ({
      resumeSessionId: 'resolved-codex-session',
    }))

    installMockApi({ spawn, launch, resolveResumeSessionId })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    render(React.createElement(createHarness(useHydrateAppState)))

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })

    expect(resolveResumeSessionId).toHaveBeenCalledWith({
      provider: 'codex',
      cwd: '/tmp/workspace-1/agent',
      startedAt: '2026-03-08T09:00:00.000Z',
    })
    expect(launch).toHaveBeenCalledWith({
      bindingId: 'agent-node:codex:/tmp/workspace-1/agent:persisted',
      provider: 'codex',
      cwd: '/tmp/workspace-1/agent',
      prompt: 'implement login flow',
      mode: 'resume',
      model: 'gpt-5.2-codex',
      resumeSessionId: 'resolved-codex-session',
      agentFullAccess: true,
      cols: 80,
      rows: 24,
    })
    expect(spawn).not.toHaveBeenCalled()
    expect(screen.getByTestId('agent-session-id')).toHaveTextContent('resumed-agent-session')
    expect(screen.getByTestId('agent-status')).toHaveTextContent('standby')
    expect(screen.getByTestId('agent-resume-session-id')).toHaveTextContent(
      'resolved-codex-session',
    )
    expect(screen.getByTestId('agent-resume-session-verified')).toHaveTextContent('true')
  })

  it('resumes a prompted codex agent directly from a persisted unverified binding', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify(
        createPersistedState({
          prompt: 'implement login flow',
          status: 'running',
          startedAt: '2026-03-08T09:00:00.000Z',
          resumeSessionId: 'persisted-codex-session',
          resumeSessionIdVerified: false,
        }),
      ),
    )

    const spawn = vi.fn(async () => {
      throw new Error('should not fallback to shell when persisted binding exists')
    })
    const launch = vi.fn(async () => ({
      sessionId: 'resumed-agent-session',
      provider: 'codex',
      command: 'codex',
      args: ['resume'],
      launchMode: 'resume' as const,
      effectiveModel: 'gpt-5.2-codex',
      resumeSessionId: 'persisted-codex-session',
    }))
    const resolveResumeSessionId = vi.fn(async () => ({
      resumeSessionId: 'should-not-be-used',
    }))

    installMockApi({ spawn, launch, resolveResumeSessionId })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    render(React.createElement(createHarness(useHydrateAppState)))

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })

    expect(resolveResumeSessionId).not.toHaveBeenCalled()
    expect(launch).toHaveBeenCalledWith({
      bindingId: 'agent-node:codex:/tmp/workspace-1/agent:persisted',
      provider: 'codex',
      cwd: '/tmp/workspace-1/agent',
      prompt: 'implement login flow',
      mode: 'resume',
      model: 'gpt-5.2-codex',
      resumeSessionId: 'persisted-codex-session',
      agentFullAccess: true,
      cols: 80,
      rows: 24,
    })
    expect(spawn).not.toHaveBeenCalled()
    expect(screen.getByTestId('agent-session-id')).toHaveTextContent('resumed-agent-session')
    expect(screen.getByTestId('agent-status')).toHaveTextContent('standby')
    expect(screen.getByTestId('agent-resume-session-id')).toHaveTextContent(
      'persisted-codex-session',
    )
    expect(screen.getByTestId('agent-resume-session-verified')).toHaveTextContent('true')
  })

  it('preserves a user-pinned agent title during hydration resume', async () => {
    const storage = installMockStorage()

    storage.setItem(
      'freecli:m0:workspace-state',
      JSON.stringify(
        createPersistedState({
          title: '我的 Codex 任务',
          titlePinnedByUser: true,
          prompt: 'implement login flow',
          status: 'running',
          startedAt: '2026-03-08T09:00:00.000Z',
          resumeSessionId: 'persisted-codex-session',
          resumeSessionIdVerified: false,
        }),
      ),
    )

    const spawn = vi.fn(async () => {
      throw new Error('should not fallback to shell when persisted binding exists')
    })
    const launch = vi.fn(async () => ({
      sessionId: 'resumed-agent-session',
      provider: 'codex',
      command: 'codex',
      args: ['resume'],
      launchMode: 'resume' as const,
      effectiveModel: 'gpt-5.2-codex',
      resumeSessionId: 'persisted-codex-session',
    }))

    installMockApi({ spawn, launch })

    const { useHydrateAppState } =
      await import('../../../src/app/renderer/shell/hooks/useHydrateAppState')

    render(React.createElement(createHarness(useHydrateAppState)))

    await waitFor(() => {
      expect(screen.getByTestId('hydrated')).toHaveTextContent('true')
    })

    expect(screen.getByTestId('agent-title')).toHaveTextContent('我的 Codex 任务')
  })
})
