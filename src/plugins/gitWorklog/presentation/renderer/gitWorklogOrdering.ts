import type { GitWorklogRepositoryDto, GitWorklogSettingsDto } from '@shared/contracts/dto'
import {
  moveGitWorklogEntityAfterAnchor,
  reconcileGitWorklogEntityOrder,
  reorderGitWorklogEntityOrder,
} from '@contexts/plugins/domain/gitWorklogSettings'

export function normalizeRepoPathForCompare(value: string): string {
  return value.trim().replaceAll('\\', '/').replaceAll(/\/+/g, '/').toLowerCase()
}

export function inferAssignedWorkspaceId(
  pathValue: string,
  candidates: Array<{ id: string; path: string }>,
): string | null {
  const normalizedPath = normalizeRepoPathForCompare(pathValue)
  let bestMatch: { id: string; length: number } | null = null

  for (const candidate of candidates) {
    const normalizedWorkspacePath = normalizeRepoPathForCompare(candidate.path)
    if (
      normalizedPath !== normalizedWorkspacePath &&
      !normalizedPath.startsWith(`${normalizedWorkspacePath}/`)
    ) {
      continue
    }

    if (!bestMatch || normalizedWorkspacePath.length > bestMatch.length) {
      bestMatch = {
        id: candidate.id,
        length: normalizedWorkspacePath.length,
      }
    }
  }

  return bestMatch?.id ?? null
}

export function reconcileGitWorklogSettingsOrdering(
  settings: GitWorklogSettingsDto,
): GitWorklogSettingsDto {
  return {
    ...settings,
    repositoryOrder: reconcileGitWorklogEntityOrder(
      settings.repositoryOrder,
      settings.repositories.map(repository => repository.id),
    ),
  }
}

export function appendRepositoryWithOrdering(
  settings: GitWorklogSettingsDto,
  repository: GitWorklogRepositoryDto,
): GitWorklogSettingsDto {
  return reconcileGitWorklogSettingsOrdering({
    ...settings,
    repositories: [...settings.repositories, repository],
    repositoryOrder: [...settings.repositoryOrder, repository.id],
  })
}

export function removeRepositoryWithOrdering(
  settings: GitWorklogSettingsDto,
  repositoryId: string,
): GitWorklogSettingsDto {
  return reconcileGitWorklogSettingsOrdering({
    ...settings,
    repositories: settings.repositories.filter(repository => repository.id !== repositoryId),
    repositoryOrder: settings.repositoryOrder.filter(id => id !== repositoryId),
  })
}

export function updateRepositoryWithOrdering(
  settings: GitWorklogSettingsDto,
  repositoryId: string,
  updater: (current: GitWorklogRepositoryDto) => GitWorklogRepositoryDto,
): GitWorklogSettingsDto {
  return reconcileGitWorklogSettingsOrdering({
    ...settings,
    repositories: settings.repositories.map(repository =>
      repository.id === repositoryId ? updater(repository) : repository,
    ),
  })
}

export function reorderWorkspaceGroups(
  workspaceOrder: readonly string[],
  activeWorkspaceId: string,
  overWorkspaceId: string,
): string[] {
  return reorderGitWorklogEntityOrder(workspaceOrder, activeWorkspaceId, overWorkspaceId)
}

export function reorderRepositoriesWithinOrder(
  repositoryOrder: readonly string[],
  activeRepositoryId: string,
  overRepositoryId: string,
): string[] {
  return reorderGitWorklogEntityOrder(repositoryOrder, activeRepositoryId, overRepositoryId)
}

export function moveRepositoryToWorkspaceGroup(options: {
  settings: GitWorklogSettingsDto
  repositoryId: string
  targetWorkspaceId: string | null
  anchorRepositoryId: string | null
}): GitWorklogSettingsDto {
  const { settings, repositoryId, targetWorkspaceId, anchorRepositoryId } = options
  const nextRepositories = settings.repositories.map(repository =>
    repository.id === repositoryId
      ? {
          ...repository,
          assignedWorkspaceId: targetWorkspaceId,
        }
      : repository,
  )

  return reconcileGitWorklogSettingsOrdering({
    ...settings,
    repositories: nextRepositories,
    repositoryOrder: moveGitWorklogEntityAfterAnchor(
      settings.repositoryOrder,
      repositoryId,
      anchorRepositoryId,
    ),
  })
}
