import { describe, expect, it } from 'vitest'
import {
  buildGitWorklogOverviewGroups,
  resolveRepoDragTargetFromSnapshots,
} from '../../../src/plugins/gitWorklog/presentation/renderer/GitWorklogOverview'

describe('GitWorklogOverview drag targeting', () => {
  it('ignores the actively dragged repository card and allows dropping into another group body', () => {
    const target = resolveRepoDragTargetFromSnapshots({
      activeRepoId: 'repo_a',
      clientX: 340,
      clientY: 80,
      groups: [
        {
          id: 'workspace_a',
          workspaceRect: {
            left: 0,
            right: 220,
            top: 0,
            bottom: 160,
          },
          bodyRect: {
            left: 0,
            right: 220,
            top: 40,
            bottom: 160,
          },
          repos: [
            {
              id: 'repo_a',
              rect: {
                left: 10,
                right: 210,
                top: 50,
                bottom: 110,
              },
            },
          ],
        },
        {
          id: '__external__',
          workspaceRect: {
            left: 240,
            right: 460,
            top: 0,
            bottom: 160,
          },
          bodyRect: {
            left: 240,
            right: 460,
            top: 40,
            bottom: 160,
          },
          repos: [
            {
              id: 'repo_b',
              rect: {
                left: 250,
                right: 450,
                top: 120,
                bottom: 150,
              },
            },
          ],
        },
      ],
    })

    expect(target).toEqual({
      kind: 'workspace-body',
      groupId: '__external__',
    })
  })

  it('falls back to the whole workspace card when the pointer is over the card header area', () => {
    const target = resolveRepoDragTargetFromSnapshots({
      activeRepoId: 'repo_a',
      clientX: 320,
      clientY: 24,
      groups: [
        {
          id: '__external__',
          workspaceRect: {
            left: 240,
            right: 460,
            top: 0,
            bottom: 160,
          },
          bodyRect: {
            left: 240,
            right: 460,
            top: 40,
            bottom: 160,
          },
          repos: [
            {
              id: 'repo_b',
              rect: {
                left: 250,
                right: 450,
                top: 120,
                bottom: 150,
              },
            },
          ],
        },
      ],
    })

    expect(target).toEqual({
      kind: 'workspace-body',
      groupId: '__external__',
    })
  })
})

describe('buildGitWorklogOverviewGroups', () => {
  it('only renders configured repositories in the monitor groups', () => {
    const groups = buildGitWorklogOverviewGroups({
      configuredRepositories: [
        {
          id: 'repo_freecli',
          label: 'FreeCli',
          path: 'D:\\Project\\FreeCli',
          enabled: true,
          origin: 'manual',
          assignedWorkspaceId: 'workspace_freecli',
        },
      ],
      runtimeRepos: [
        {
          repoId: 'repo_freecli',
          label: 'FreeCli',
          path: 'D:\\Project\\FreeCli',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 1,
          filesChangedToday: 1,
          additionsToday: 10,
          deletionsToday: 0,
          changedLinesToday: 10,
          netLinesToday: 10,
          commitCountInRange: 3,
          filesChangedInRange: 3,
          additionsInRange: 30,
          deletionsInRange: 0,
          changedLinesInRange: 30,
          totalCodeFiles: 1,
          totalCodeLines: 10,
          dailyPoints: [],
          heatmapDailyPoints: [],
          lastScannedAt: null,
          error: null,
        },
        {
          repoId: 'repo_fastwrite_runtime_only',
          label: 'FastWrite',
          path: 'D:\\Project\\FastWrite',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 2,
          filesChangedToday: 2,
          additionsToday: 20,
          deletionsToday: 0,
          changedLinesToday: 20,
          netLinesToday: 20,
          commitCountInRange: 5,
          filesChangedInRange: 5,
          additionsInRange: 50,
          deletionsInRange: 0,
          changedLinesInRange: 50,
          totalCodeFiles: 2,
          totalCodeLines: 20,
          dailyPoints: [],
          heatmapDailyPoints: [],
          lastScannedAt: null,
          error: null,
        },
      ],
      availableWorkspaces: [
        {
          id: 'workspace_freecli',
          name: 'FreeCli',
          path: 'D:\\Project\\FreeCli',
        },
      ],
      effectiveRepositoryOrder: ['repo_freecli'],
      effectiveWorkspaceOrder: ['workspace_freecli'],
      externalWorkspaceGroupTitle: '基础仓库',
    })

    expect(groups.flatMap(group => group.repos.map(repo => repo.repoId))).toEqual(['repo_freecli'])
    expect(
      groups.some(group => group.repos.some(repo => repo.repoId === 'repo_fastwrite_runtime_only')),
    ).toBe(false)
  })
})
