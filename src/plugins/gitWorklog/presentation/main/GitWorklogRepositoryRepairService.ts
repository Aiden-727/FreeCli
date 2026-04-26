import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import type {
  GitWorklogRepositoryDto,
  GitWorklogSettingsDto,
  GitWorklogWorkspaceDto,
  RepairGitWorklogRepositoriesResultDto,
  UndoGitWorklogRepositoriesRepairResultDto,
} from '@shared/contracts/dto'
import {
  createNextGitWorklogRepositoryId,
  normalizeGitWorklogSettings,
  reconcileGitWorklogEntityOrder,
} from '@contexts/plugins/domain/gitWorklogSettings'

const GIT_WORKLOG_EXTERNAL_WORKSPACE_ID = '__external__'

type ResolveRepositoryResult =
  | { ok: true; path: string; label: string }
  | { ok: false }

interface RepairBackupPayload {
  formatVersion: 1
  settings: GitWorklogSettingsDto
}

function normalizePathForCompare(pathValue: string): string {
  const normalized = resolve(pathValue.trim()).replaceAll('\\', '/').replaceAll(/\/+/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function inferAssignedWorkspaceId(
  pathValue: string,
  workspaces: readonly GitWorklogWorkspaceDto[],
): string | null {
  const normalizedPath = normalizePathForCompare(pathValue)
  let bestMatch: { id: string; length: number } | null = null

  for (const workspace of workspaces) {
    const normalizedWorkspacePath = normalizePathForCompare(workspace.path)
    if (
      normalizedPath !== normalizedWorkspacePath &&
      !normalizedPath.startsWith(`${normalizedWorkspacePath}/`)
    ) {
      continue
    }

    if (!bestMatch || normalizedWorkspacePath.length > bestMatch.length) {
      bestMatch = {
        id: workspace.id,
        length: normalizedWorkspacePath.length,
      }
    }
  }

  return bestMatch?.id ?? null
}

function isDefaultRepositoryLabel(label: string): boolean {
  return /^Repository \d+$/i.test(label.trim())
}

export class GitWorklogRepositoryRepairService {
  public constructor(
    private readonly backupFilePath: string,
    private readonly resolveRepository: (path: string) => Promise<ResolveRepositoryResult>,
  ) {}

  public async repair(options: {
    settings: GitWorklogSettingsDto
    availableWorkspaces: GitWorklogWorkspaceDto[]
  }): Promise<RepairGitWorklogRepositoriesResultDto> {
    const currentSettings = normalizeGitWorklogSettings(options.settings)
    await this.writeBackup(currentSettings)

    const changedRepositories: RepairGitWorklogRepositoriesResultDto['changedRepositories'] = []
    const summary = {
      duplicateIdsFixed: 0,
      duplicatePathsFixed: 0,
      pathsNormalized: 0,
      workspaceAssignmentsFixed: 0,
      labelsFixed: 0,
    }

    const usedIds = new Set<string>()
    const seenResolvedPaths = new Set<string>()
    const nextRepositories: GitWorklogRepositoryDto[] = []

    for (const repository of currentSettings.repositories) {
      const changes: string[] = []
      let nextRepository: GitWorklogRepositoryDto = { ...repository }

      if (usedIds.has(nextRepository.id)) {
        nextRepository = {
          ...nextRepository,
          id: createNextGitWorklogRepositoryId([...usedIds]),
        }
        usedIds.add(nextRepository.id)
        summary.duplicateIdsFixed += 1
        changes.push('仓库 ID 重复，已重新分配唯一 ID')
      } else {
        usedIds.add(nextRepository.id)
      }

      const pathValue = nextRepository.path.trim()
      let resolvedPathKey = pathValue.length > 0 ? normalizePathForCompare(pathValue) : ''
      let resolvedLabel = nextRepository.label
      if (pathValue.length > 0) {
        const resolved = await this.resolveRepository(pathValue)
        if (resolved.ok) {
          const normalizedResolvedPath = normalizePathForCompare(resolved.path)
          if (normalizedResolvedPath !== normalizePathForCompare(pathValue)) {
            nextRepository = {
              ...nextRepository,
              path: resolved.path,
            }
            summary.pathsNormalized += 1
            changes.push('仓库路径已归一到真实 Git 根目录')
          }
          resolvedPathKey = normalizedResolvedPath
          resolvedLabel = resolved.label
        }
      }

      if (resolvedPathKey.length > 0) {
        if (seenResolvedPaths.has(resolvedPathKey)) {
          summary.duplicatePathsFixed += 1
          changes.push('真实 Git 根目录重复，已移除重复仓库条目')
          changedRepositories.push({
            repositoryId: nextRepository.id,
            path: nextRepository.path,
            changes,
          })
          continue
        }
        seenResolvedPaths.add(resolvedPathKey)
      }

      const inferredWorkspaceId = pathValue.length > 0
        ? inferAssignedWorkspaceId(nextRepository.path, options.availableWorkspaces)
        : null
      const hasValidAssignedWorkspace =
        nextRepository.assignedWorkspaceId === GIT_WORKLOG_EXTERNAL_WORKSPACE_ID ||
        nextRepository.assignedWorkspaceId === null ||
        options.availableWorkspaces.some(
          workspace => workspace.id === nextRepository.assignedWorkspaceId,
        )
      if (!hasValidAssignedWorkspace) {
        nextRepository = {
          ...nextRepository,
          assignedWorkspaceId: inferredWorkspaceId,
        }
        summary.workspaceAssignmentsFixed += 1
        changes.push('仓库分组指向失效，已按当前路径重新匹配')
      }

      const labelLooksMismatched =
        nextRepository.label.trim().length === 0 ||
        isDefaultRepositoryLabel(nextRepository.label) ||
        (resolvedLabel.trim().length > 0 &&
          nextRepository.label.trim() !== resolvedLabel.trim() &&
          currentSettings.repositories.some(
            candidate =>
              candidate.id !== repository.id &&
              candidate.label.trim() === nextRepository.label.trim(),
          ))
      if (labelLooksMismatched && resolvedLabel.trim().length > 0) {
        nextRepository = {
          ...nextRepository,
          label: resolvedLabel,
        }
        summary.labelsFixed += 1
        changes.push('仓库名称与真实仓库不一致，已回正为 Git 根目录名称')
      }

      if (changes.length > 0) {
        changedRepositories.push({
          repositoryId: nextRepository.id,
          path: nextRepository.path,
          changes,
        })
      }
      nextRepositories.push(nextRepository)
    }

    const repairedSettings = normalizeGitWorklogSettings({
      ...currentSettings,
      repositories: nextRepositories,
      repositoryOrder: reconcileGitWorklogEntityOrder(
        currentSettings.repositoryOrder.filter(repositoryId =>
          nextRepositories.some(repository => repository.id === repositoryId),
        ),
        nextRepositories.map(repository => repository.id),
      ),
      workspaceOrder: reconcileGitWorklogEntityOrder(
        currentSettings.workspaceOrder,
        Array.from(
          new Set(
            nextRepositories
              .map(repository => repository.assignedWorkspaceId)
              .filter(
                (workspaceId): workspaceId is string =>
                  typeof workspaceId === 'string' && workspaceId.trim().length > 0,
              ),
          ),
        ),
      ),
    })

    return {
      repairedSettings,
      summary,
      changedRepositories,
      backupAvailable: true,
    }
  }

  public async undo(options: {
    settings: GitWorklogSettingsDto
  }): Promise<UndoGitWorklogRepositoriesRepairResultDto> {
    const backup = await this.readBackup()
    if (!backup) {
      return {
        restoredSettings: normalizeGitWorklogSettings(options.settings),
        restored: false,
      }
    }

    await this.removeBackup()
    return {
      restoredSettings: normalizeGitWorklogSettings(backup.settings),
      restored: true,
    }
  }

  private async writeBackup(settings: GitWorklogSettingsDto): Promise<void> {
    const payload: RepairBackupPayload = {
      formatVersion: 1,
      settings,
    }
    const directory = dirname(this.backupFilePath)
    const tempPath = `${this.backupFilePath}.tmp`
    await mkdir(directory, { recursive: true })
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    try {
      await stat(this.backupFilePath)
      await rm(this.backupFilePath, { force: true })
    } catch {
      // ignore
    }
    await rename(tempPath, this.backupFilePath)
  }

  private async readBackup(): Promise<RepairBackupPayload | null> {
    try {
      const content = await readFile(this.backupFilePath, 'utf8')
      const parsed = JSON.parse(content) as Partial<RepairBackupPayload> | null
      if (!parsed || parsed.formatVersion !== 1 || !parsed.settings) {
        return null
      }
      return {
        formatVersion: 1,
        settings: normalizeGitWorklogSettings(parsed.settings),
      }
    } catch {
      return null
    }
  }

  private async removeBackup(): Promise<void> {
    try {
      await rm(this.backupFilePath, { force: true })
    } catch {
      // ignore
    }
  }
}
