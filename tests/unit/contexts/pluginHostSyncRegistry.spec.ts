import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'
import {
  buildPluginHostSyncTasks,
  resolvePersistedPluginChangeIds,
} from '../../../src/contexts/plugins/presentation/renderer/pluginHostSyncRegistry'

describe('pluginHostSyncRegistry', () => {
  it('builds sync tasks only for available plugin bridge APIs', () => {
    const api = {
      plugins: {
        syncRuntimeState: vi.fn(),
        quotaMonitor: {
          syncSettings: vi.fn(),
        },
      },
    } as unknown as typeof window.freecliApi

    const tasks = buildPluginHostSyncTasks({
      settings: DEFAULT_AGENT_SETTINGS,
      workspaces: [
        {
          id: 'workspace_1',
          name: 'Workspace 1',
          path: 'D:\\Project\\Workspace1',
        },
      ],
      workspaceAssistantSnapshot: null,
      api,
    })

    expect(tasks.map(task => task.code)).toEqual(['runtime_sync', 'quota_monitor_sync'])
    expect(tasks[0]?.signature).toContain('[]')
  })

  it('adds workspace assistant snapshot sync when the bridge is available', () => {
    const api = {
      plugins: {
        workspaceAssistant: {
          syncWorkspaceSnapshot: vi.fn(),
        },
      },
    } as unknown as typeof window.freecliApi

    const tasks = buildPluginHostSyncTasks({
      settings: DEFAULT_AGENT_SETTINGS,
      workspaces: [],
      workspaceAssistantSnapshot: {
        id: 'workspace_1',
        name: 'Workspace 1',
        path: 'D:\\Project\\Workspace1',
        activeSpaceId: 'space_1',
        spaceCount: 1,
        nodeCount: 3,
        taskCount: 1,
        agentCount: 1,
        noteCount: 1,
        terminalCount: 0,
        projectSummary: null,
        projectFiles: [],
        tasks: [],
        agents: [],
        notes: [],
        spaces: [],
      },
      api,
    })

    expect(tasks.map(task => task.code)).toEqual(['workspace_assistant_workspace_sync'])
    expect(tasks[0]?.signature).toContain('Workspace 1')
  })

  it('treats enabled plugin changes as persisted plugin changes', () => {
    const changedPluginIds = resolvePersistedPluginChangeIds(
      DEFAULT_AGENT_SETTINGS.plugins,
      {
        ...DEFAULT_AGENT_SETTINGS.plugins,
        enabledIds: ['quota-monitor'],
      },
    )

    expect(changedPluginIds).toEqual(['quota-monitor'])
  })

  it('detects plugin setting changes from the unified manifest metadata', () => {
    const changedPluginIds = resolvePersistedPluginChangeIds(
      DEFAULT_AGENT_SETTINGS.plugins,
      {
        ...DEFAULT_AGENT_SETTINGS.plugins,
        gitWorklog: {
          ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
          authorFilter: 'Aiden',
        },
      },
    )

    expect(changedPluginIds).toEqual(['git-worklog'])
  })
})
