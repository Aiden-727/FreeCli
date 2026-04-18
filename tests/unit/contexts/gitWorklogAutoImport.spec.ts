import { describe, expect, it } from 'vitest'
import type { GitWorklogStateDto } from '../../../src/shared/contracts/dto'
import { DEFAULT_GIT_WORKLOG_SETTINGS } from '../../../src/contexts/plugins/domain/gitWorklogSettings'
import { resolveGitWorklogAutoImport } from '../../../src/plugins/gitWorklog/presentation/renderer/gitWorklogAutoImport'

function createState(overrides: Partial<GitWorklogStateDto> = {}): GitWorklogStateDto {
  return {
    isEnabled: true,
    isRefreshing: false,
    status: 'ready',
    lastUpdatedAt: '2026-04-04T08:00:00.000Z',
    configuredRepoCount: 1,
    activeRepoCount: 1,
    successfulRepoCount: 1,
    overview: {
      monitoredRepoCount: 1,
      activeRepoCount: 1,
      healthyRepoCount: 1,
      commitCountToday: 2,
      filesChangedToday: 4,
      additionsToday: 10,
      deletionsToday: 3,
      changedLinesToday: 13,
      commitCountInRange: 2,
      filesChangedInRange: 4,
      additionsInRange: 10,
      deletionsInRange: 3,
      changedLinesInRange: 13,
      totalCodeFiles: 20,
      totalCodeLines: 500,
      dailyPoints: [],
    },
    repos: [],
    lastError: null,
    ...overrides,
  }
}

describe('resolveGitWorklogAutoImport', () => {
  it('imports auto-discovered repositories once and marks the workspace as imported', () => {
    const resolution = resolveGitWorklogAutoImport({
      settings: {
        ...DEFAULT_GIT_WORKLOG_SETTINGS,
        repositories: [],
      },
      workspaces: [
        {
          id: 'workspace_root',
          name: 'Drone',
          path: 'D:\\Project\\Drone',
        },
      ],
      state: createState({
        repos: [
          {
            repoId: 'auto_workspace_root_root',
            label: 'Drone',
            path: 'D:\\Project\\Drone',
            origin: 'auto',
            parentWorkspaceId: 'workspace_root',
            parentWorkspaceName: 'Drone',
            parentWorkspacePath: 'D:\\Project\\Drone',
            commitCountToday: 2,
            filesChangedToday: 4,
            additionsToday: 10,
            deletionsToday: 3,
            changedLinesToday: 13,
            netLinesToday: 7,
            commitCountInRange: 2,
            filesChangedInRange: 4,
            additionsInRange: 10,
            deletionsInRange: 3,
            changedLinesInRange: 13,
            totalCodeFiles: 20,
            totalCodeLines: 500,
            dailyPoints: [],
            lastScannedAt: '2026-04-04T08:00:00.000Z',
            error: null,
          },
        ],
      }),
      scanBaselineLastUpdatedAt: '2026-04-04T08:00:00.000Z',
    })

    expect(resolution.nextSettings).not.toBeNull()
    expect(resolution.nextSettings?.repositories).toEqual([
      {
        id: 'auto_workspace_root_root',
        label: 'Drone',
        path: 'D:\\Project\\Drone',
        enabled: true,
      },
    ])
    expect(resolution.nextSettings?.autoImportedWorkspacePaths).toEqual(['D:\\Project\\Drone'])
  })

  it('marks a workspace as imported after an empty scan completes', () => {
    const resolution = resolveGitWorklogAutoImport({
      settings: {
        ...DEFAULT_GIT_WORKLOG_SETTINGS,
        repositories: [],
      },
      workspaces: [
        {
          id: 'workspace_root',
          name: 'Drone',
          path: 'D:\\Project\\Drone',
        },
      ],
      state: createState({
        status: 'needs_config',
        configuredRepoCount: 0,
        activeRepoCount: 0,
        successfulRepoCount: 0,
        repos: [],
        overview: {
          monitoredRepoCount: 0,
          activeRepoCount: 0,
          healthyRepoCount: 0,
          commitCountToday: 0,
          filesChangedToday: 0,
          additionsToday: 0,
          deletionsToday: 0,
          changedLinesToday: 0,
          commitCountInRange: 0,
          filesChangedInRange: 0,
          additionsInRange: 0,
          deletionsInRange: 0,
          changedLinesInRange: 0,
          totalCodeFiles: 0,
          totalCodeLines: 0,
          dailyPoints: [],
        },
        lastUpdatedAt: '2026-04-04T08:05:00.000Z',
      }),
      scanBaselineLastUpdatedAt: '2026-04-04T08:00:00.000Z',
    })

    expect(resolution.nextSettings).not.toBeNull()
    expect(resolution.nextSettings?.repositories).toEqual([])
    expect(resolution.nextSettings?.autoImportedWorkspacePaths).toEqual(['D:\\Project\\Drone'])
  })
})
