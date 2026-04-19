import { describe, expect, it } from 'vitest'
import {
  appendRepositoryWithOrdering,
  moveRepositoryToWorkspaceGroup,
  reconcileGitWorklogSettingsOrdering,
  removeRepositoryWithOrdering,
  reorderRepositoriesWithinOrder,
} from '../../../src/plugins/gitWorklog/presentation/renderer/gitWorklogOrdering'
import { DEFAULT_GIT_WORKLOG_SETTINGS } from '../../../src/contexts/plugins/domain/gitWorklogSettings'

describe('gitWorklogOrdering', () => {
  it('reconciles repository order with repository ids', () => {
    const settings = reconcileGitWorklogSettingsOrdering({
      ...DEFAULT_GIT_WORKLOG_SETTINGS,
      repositories: [
        {
          id: 'repo_b',
          label: 'B',
          path: 'D:\\repo-b',
          enabled: true,
          origin: 'manual',
          assignedWorkspaceId: null,
        },
        {
          id: 'repo_a',
          label: 'A',
          path: 'D:\\repo-a',
          enabled: true,
          origin: 'manual',
          assignedWorkspaceId: null,
        },
      ],
      repositoryOrder: ['repo_missing', 'repo_a'],
    })

    expect(settings.repositoryOrder).toEqual(['repo_a', 'repo_b'])
  })

  it('appends repository ids into ordering when a new repository is added', () => {
    const result = appendRepositoryWithOrdering(
      {
        ...DEFAULT_GIT_WORKLOG_SETTINGS,
        repositories: [],
        repositoryOrder: [],
      },
      {
        id: 'repo_a',
        label: 'Repo A',
        path: 'D:\\repo-a',
        enabled: true,
        origin: 'manual',
        assignedWorkspaceId: null,
      },
    )

    expect(result.repositoryOrder).toEqual(['repo_a'])
  })

  it('removes repository ids from ordering when a repository is deleted', () => {
    const result = removeRepositoryWithOrdering(
      {
        ...DEFAULT_GIT_WORKLOG_SETTINGS,
        repositories: [
          {
            id: 'repo_a',
            label: 'Repo A',
            path: 'D:\\repo-a',
            enabled: true,
            origin: 'manual',
            assignedWorkspaceId: null,
          },
          {
            id: 'repo_b',
            label: 'Repo B',
            path: 'D:\\repo-b',
            enabled: true,
            origin: 'manual',
            assignedWorkspaceId: null,
          },
        ],
        repositoryOrder: ['repo_a', 'repo_b'],
      },
      'repo_a',
    )

    expect(result.repositoryOrder).toEqual(['repo_b'])
  })

  it('reorders repository ids inside the current order', () => {
    expect(
      reorderRepositoriesWithinOrder(['repo_a', 'repo_b', 'repo_c'], 'repo_c', 'repo_a'),
    ).toEqual(['repo_c', 'repo_a', 'repo_b'])
  })

  it('moves repository ownership and repositions it after the anchor repository', () => {
    const result = moveRepositoryToWorkspaceGroup({
      settings: {
        ...DEFAULT_GIT_WORKLOG_SETTINGS,
        repositories: [
          {
            id: 'repo_a',
            label: 'Repo A',
            path: 'D:\\repo-a',
            enabled: true,
            origin: 'manual',
            assignedWorkspaceId: 'workspace_a',
          },
          {
            id: 'repo_b',
            label: 'Repo B',
            path: 'D:\\repo-b',
            enabled: true,
            origin: 'manual',
            assignedWorkspaceId: null,
          },
          {
            id: 'repo_c',
            label: 'Repo C',
            path: 'D:\\repo-c',
            enabled: true,
            origin: 'manual',
            assignedWorkspaceId: 'workspace_b',
          },
        ],
        repositoryOrder: ['repo_a', 'repo_b', 'repo_c'],
      },
      repositoryId: 'repo_b',
      targetWorkspaceId: 'workspace_b',
      anchorRepositoryId: 'repo_c',
    })

    expect(result.repositories.find(repository => repository.id === 'repo_b')?.assignedWorkspaceId).toBe(
      'workspace_b',
    )
    expect(result.repositoryOrder).toEqual(['repo_a', 'repo_c', 'repo_b'])
  })
})
