import type {
  GitWorklogRepoStateDto,
  GitWorklogSettingsDto,
  GitWorklogStateDto,
  GitWorklogWorkspaceDto,
} from '@shared/contracts/dto'

interface ResolveGitWorklogAutoImportParams {
  settings: GitWorklogSettingsDto
  workspaces: GitWorklogWorkspaceDto[]
  state: GitWorklogStateDto
  scanBaselineLastUpdatedAt: string | null
}

function normalizePathForCompare(value: string): string {
  return value.trim().replaceAll('\\', '/').replaceAll(/\/+/g, '/').toLowerCase()
}

function matchesWorkspacePath(candidatePath: string, workspacePath: string): boolean {
  return normalizePathForCompare(candidatePath) === normalizePathForCompare(workspacePath)
}

function createPendingWorkspaceList(
  settings: GitWorklogSettingsDto,
  workspaces: GitWorklogWorkspaceDto[],
): GitWorklogWorkspaceDto[] {
  const importedWorkspacePaths = new Set(
    settings.autoImportedWorkspacePaths.map(pathValue => normalizePathForCompare(pathValue)),
  )

  return workspaces.filter(workspace => {
    const normalizedPath = normalizePathForCompare(workspace.path)
    return normalizedPath.length > 0 && !importedWorkspacePaths.has(normalizedPath)
  })
}

function collectAutoRepositoriesForPendingWorkspaces(
  pendingWorkspaces: GitWorklogWorkspaceDto[],
  repos: GitWorklogRepoStateDto[],
): GitWorklogRepoStateDto[] {
  if (pendingWorkspaces.length === 0) {
    return []
  }

  return repos.filter(repo => {
    if (repo.origin !== 'auto' || !repo.parentWorkspacePath) {
      return false
    }

    return pendingWorkspaces.some(workspace =>
      matchesWorkspacePath(repo.parentWorkspacePath ?? '', workspace.path),
    )
  })
}

function mergeImportedRepositories(
  settings: GitWorklogSettingsDto,
  autoRepositories: GitWorklogRepoStateDto[],
): GitWorklogSettingsDto['repositories'] {
  const repositories = [...settings.repositories]
  const existingRepoPaths = new Set(
    repositories
      .map(repository => normalizePathForCompare(repository.path))
      .filter(pathValue => pathValue.length > 0),
  )

  for (const autoRepository of autoRepositories) {
    const normalizedPath = normalizePathForCompare(autoRepository.path)
    if (normalizedPath.length === 0 || existingRepoPaths.has(normalizedPath)) {
      continue
    }

    existingRepoPaths.add(normalizedPath)
    repositories.push({
      id: autoRepository.repoId,
      label: autoRepository.label,
      path: autoRepository.path,
      enabled: true,
    })
  }

  return repositories
}

export interface GitWorklogAutoImportResolution {
  pendingWorkspacePaths: string[]
  nextSettings: GitWorklogSettingsDto | null
}

export function resolveGitWorklogAutoImport(
  params: ResolveGitWorklogAutoImportParams,
): GitWorklogAutoImportResolution {
  const pendingWorkspaces = createPendingWorkspaceList(params.settings, params.workspaces)
  if (pendingWorkspaces.length === 0) {
    return {
      pendingWorkspacePaths: [],
      nextSettings: null,
    }
  }

  if (params.state.isRefreshing || params.state.status === 'loading') {
    return {
      pendingWorkspacePaths: pendingWorkspaces.map(workspace => workspace.path),
      nextSettings: null,
    }
  }

  const autoRepositories = collectAutoRepositoriesForPendingWorkspaces(
    pendingWorkspaces,
    params.state.repos,
  )
  const scanFinishedWithoutRepositories =
    params.state.lastUpdatedAt !== null && params.state.lastUpdatedAt !== params.scanBaselineLastUpdatedAt

  if (autoRepositories.length === 0 && !scanFinishedWithoutRepositories) {
    return {
      pendingWorkspacePaths: pendingWorkspaces.map(workspace => workspace.path),
      nextSettings: null,
    }
  }

  const nextImportedWorkspacePaths = [...settingsUniquePaths(params.settings.autoImportedWorkspacePaths)]
  for (const workspace of pendingWorkspaces) {
    if (!nextImportedWorkspacePaths.some(pathValue => matchesWorkspacePath(pathValue, workspace.path))) {
      nextImportedWorkspacePaths.push(workspace.path)
    }
  }

  return {
    pendingWorkspacePaths: pendingWorkspaces.map(workspace => workspace.path),
    nextSettings: {
      ...params.settings,
      repositories: mergeImportedRepositories(params.settings, autoRepositories),
      autoImportedWorkspacePaths: nextImportedWorkspacePaths,
    },
  }
}

function settingsUniquePaths(paths: string[]): string[] {
  const normalized = new Set<string>()
  const result: string[] = []

  for (const pathValue of paths) {
    const comparable = normalizePathForCompare(pathValue)
    if (comparable.length === 0 || normalized.has(comparable)) {
      continue
    }

    normalized.add(comparable)
    result.push(pathValue)
  }

  return result
}
