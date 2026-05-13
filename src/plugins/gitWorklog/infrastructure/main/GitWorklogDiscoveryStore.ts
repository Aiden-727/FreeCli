import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import type {
  GitWorklogAutoCandidateDto,
  GitWorklogDismissedImportDto,
  GitWorklogErrorDto,
  GitWorklogPendingImportDto,
  GitWorklogWorkspaceDto,
} from '@shared/contracts/dto'

const STORE_FORMAT_VERSION = 1

function normalizePathForCompare(pathValue: string): string {
  const normalized = resolve(pathValue.trim()).replaceAll('\\', '/').replaceAll(/\/+/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

interface PersistedGitWorklogDiscoveryWorkspaceEntry {
  workspaceId: string
  workspaceName: string
  workspacePath: string
  detectedAt: string | null
  repositories: GitWorklogAutoCandidateDto[]
  error: GitWorklogErrorDto | null
  retryCount: number
  dismissedAt: string | null
  lastScanAt: string | null
}

interface PersistedGitWorklogDiscoveryState {
  formatVersion: 1
  workspaces: PersistedGitWorklogDiscoveryWorkspaceEntry[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableText(value: unknown): string | null {
  const normalized = normalizeText(value)
  return normalized.length > 0 ? normalized : null
}

function normalizeRetryCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function normalizeError(value: unknown): GitWorklogErrorDto | null {
  if (!isRecord(value)) {
    return null
  }

  const type = normalizeText(value.type)
  const message = normalizeText(value.message)
  if (type.length === 0 || message.length === 0) {
    return null
  }

  return {
    type: type as GitWorklogErrorDto['type'],
    message,
    detail: normalizeNullableText(value.detail),
  }
}

function normalizeAutoCandidate(value: unknown): GitWorklogAutoCandidateDto | null {
  if (!isRecord(value)) {
    return null
  }

  const id = normalizeText(value.id)
  const label = normalizeText(value.label)
  const path = normalizeText(value.path)
  if (id.length === 0 || label.length === 0 || path.length === 0) {
    return null
  }

  return {
    id,
    label,
    path,
    parentWorkspaceId: normalizeNullableText(value.parentWorkspaceId),
    parentWorkspaceName: normalizeNullableText(value.parentWorkspaceName),
    parentWorkspacePath: normalizeNullableText(value.parentWorkspacePath),
    detectedAt: normalizeNullableText(value.detectedAt),
  }
}

function normalizeWorkspaceEntry(
  value: unknown,
): PersistedGitWorklogDiscoveryWorkspaceEntry | null {
  if (!isRecord(value)) {
    return null
  }

  const workspacePath = normalizeText(value.workspacePath)
  if (workspacePath.length === 0) {
    return null
  }

  const repositories = Array.isArray(value.repositories)
    ? value.repositories
        .map(normalizeAutoCandidate)
        .filter((candidate): candidate is GitWorklogAutoCandidateDto => candidate !== null)
    : []

  return {
    workspaceId: normalizeText(value.workspaceId),
    workspaceName: normalizeText(value.workspaceName),
    workspacePath,
    detectedAt: normalizeNullableText(value.detectedAt),
    repositories,
    error: normalizeError(value.error),
    retryCount: normalizeRetryCount(value.retryCount),
    dismissedAt: normalizeNullableText(value.dismissedAt),
    lastScanAt: normalizeNullableText(value.lastScanAt),
  }
}

function createEmptyState(): PersistedGitWorklogDiscoveryState {
  return {
    formatVersion: STORE_FORMAT_VERSION,
    workspaces: [],
  }
}

export class GitWorklogDiscoveryStore {
  private state: PersistedGitWorklogDiscoveryState = createEmptyState()
  private loadPromise: Promise<void> | null = null
  private flushPromise: Promise<void> = Promise.resolve()
  private dirty = false

  public constructor(private readonly filePath: string) {}

  public async dispose(): Promise<void> {
    await this.flush()
  }

  public async listPendingImports(
    workspaces: readonly GitWorklogWorkspaceDto[],
  ): Promise<GitWorklogPendingImportDto[]> {
    await this.ensureLoaded()
    const currentByPath = new Map(
      workspaces.map(workspace => [normalizePathForCompare(workspace.path), workspace] as const),
    )

    return this.state.workspaces
      .filter(entry => entry.dismissedAt === null)
      .map(entry => {
        const workspace = currentByPath.get(normalizePathForCompare(entry.workspacePath))
        return {
          workspaceId: workspace?.id ?? entry.workspaceId,
          workspaceName: workspace?.name ?? entry.workspaceName,
          workspacePath: workspace?.path ?? entry.workspacePath,
          detectedAt: entry.detectedAt,
          repositories: entry.repositories,
          error: entry.error,
          retryCount: entry.retryCount,
        }
      })
      .sort((left, right) => left.workspaceName.localeCompare(right.workspaceName))
  }

  public async listDismissedImports(
    workspaces: readonly GitWorklogWorkspaceDto[],
  ): Promise<GitWorklogDismissedImportDto[]> {
    await this.ensureLoaded()
    const currentByPath = new Map(
      workspaces.map(workspace => [normalizePathForCompare(workspace.path), workspace] as const),
    )

    return this.state.workspaces
      .filter(entry => entry.dismissedAt !== null)
      .map(entry => {
        const workspace = currentByPath.get(normalizePathForCompare(entry.workspacePath))
        return {
          workspaceId: (workspace?.id ?? entry.workspaceId) || null,
          workspaceName: workspace?.name ?? entry.workspaceName,
          workspacePath: workspace?.path ?? entry.workspacePath,
          dismissedAt: entry.dismissedAt,
        }
      })
      .sort((left, right) => left.workspaceName.localeCompare(right.workspaceName))
  }

  public async upsertScanResult(options: {
    workspace: GitWorklogWorkspaceDto
    repositories: GitWorklogAutoCandidateDto[]
    error: GitWorklogErrorDto | null
    scannedAt: string
    retryCount?: number
  }): Promise<void> {
    await this.ensureLoaded()
    const entry = this.getOrCreateWorkspace(options.workspace)
    entry.workspaceId = options.workspace.id
    entry.workspaceName = options.workspace.name
    entry.workspacePath = options.workspace.path
    entry.detectedAt = options.repositories.length > 0 ? options.scannedAt : entry.detectedAt
    entry.repositories = options.repositories
    entry.error = options.error
    entry.retryCount = options.error ? Math.max(1, options.retryCount ?? entry.retryCount + 1) : 0
    entry.lastScanAt = options.scannedAt
    this.markDirty()
  }

  public async clearPendingImport(workspacePath: string): Promise<void> {
    await this.ensureLoaded()
    const entry = this.findWorkspace(workspacePath)
    if (!entry) {
      return
    }

    entry.repositories = []
    entry.error = null
    entry.retryCount = 0
    entry.detectedAt = null
    entry.dismissedAt = null
    this.markDirty()
  }

  public async dismissWorkspace(workspace: {
    workspaceId: string | null
    workspaceName: string
    workspacePath: string
    dismissedAt: string
  }): Promise<void> {
    await this.ensureLoaded()
    const entry = this.getOrCreateWorkspace({
      id: workspace.workspaceId ?? '',
      name: workspace.workspaceName,
      path: workspace.workspacePath,
    })
    entry.workspaceId = workspace.workspaceId ?? entry.workspaceId
    entry.workspaceName = workspace.workspaceName
    entry.workspacePath = workspace.workspacePath
    entry.repositories = []
    entry.error = null
    entry.retryCount = 0
    entry.detectedAt = null
    entry.dismissedAt = workspace.dismissedAt
    this.markDirty()
  }

  public async restoreWorkspace(workspacePath: string): Promise<void> {
    await this.ensureLoaded()
    const entry = this.findWorkspace(workspacePath)
    if (!entry) {
      return
    }

    entry.dismissedAt = null
    this.markDirty()
  }

  public async removeWorkspace(workspacePath: string): Promise<void> {
    await this.ensureLoaded()
    const normalizedPath = normalizePathForCompare(workspacePath)
    const nextWorkspaces = this.state.workspaces.filter(
      entry => normalizePathForCompare(entry.workspacePath) !== normalizedPath,
    )
    if (nextWorkspaces.length === this.state.workspaces.length) {
      return
    }

    this.state.workspaces = nextWorkspaces
    this.markDirty()
  }

  public async pruneToWorkspaceSet(workspaces: readonly GitWorklogWorkspaceDto[]): Promise<void> {
    await this.ensureLoaded()
    const validPaths = new Set(workspaces.map(workspace => normalizePathForCompare(workspace.path)))
    const nextWorkspaces = this.state.workspaces.filter(entry =>
      validPaths.has(normalizePathForCompare(entry.workspacePath)),
    )
    if (nextWorkspaces.length === this.state.workspaces.length) {
      return
    }

    this.state.workspaces = nextWorkspaces
    this.markDirty()
  }

  public async flush(): Promise<void> {
    await this.ensureLoaded()
    if (!this.dirty) {
      return
    }

    this.flushPromise = this.flushPromise.then(async () => {
      if (!this.dirty) {
        return
      }

      const payload = {
        formatVersion: STORE_FORMAT_VERSION,
        workspaces: this.state.workspaces,
      } satisfies PersistedGitWorklogDiscoveryState
      const directory = dirname(this.filePath)
      const tempPath = `${this.filePath}.tmp`
      await mkdir(directory, { recursive: true })
      await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      try {
        await stat(this.filePath)
        await rm(this.filePath, { force: true })
      } catch {
        // ignore missing target
      }
      await rename(tempPath, this.filePath)
      this.dirty = false
    })

    await this.flushPromise
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadState()
    }

    await this.loadPromise
  }

  private async loadState(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(content) as unknown
      if (!isRecord(parsed) || parsed.formatVersion !== STORE_FORMAT_VERSION) {
        this.state = createEmptyState()
        return
      }

      this.state = {
        formatVersion: STORE_FORMAT_VERSION,
        workspaces: Array.isArray(parsed.workspaces)
          ? parsed.workspaces
              .map(normalizeWorkspaceEntry)
              .filter(
                (entry): entry is PersistedGitWorklogDiscoveryWorkspaceEntry => entry !== null,
              )
          : [],
      }
    } catch {
      this.state = createEmptyState()
    }
  }

  private getOrCreateWorkspace(workspace: {
    id: string
    name: string
    path: string
  }): PersistedGitWorklogDiscoveryWorkspaceEntry {
    const existing = this.findWorkspace(workspace.path)
    if (existing) {
      return existing
    }

    const next: PersistedGitWorklogDiscoveryWorkspaceEntry = {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspacePath: workspace.path,
      detectedAt: null,
      repositories: [],
      error: null,
      retryCount: 0,
      dismissedAt: null,
      lastScanAt: null,
    }
    this.state.workspaces.push(next)
    return next
  }

  private findWorkspace(workspacePath: string): PersistedGitWorklogDiscoveryWorkspaceEntry | null {
    const normalizedPath = normalizePathForCompare(workspacePath)
    return (
      this.state.workspaces.find(
        entry => normalizePathForCompare(entry.workspacePath) === normalizedPath,
      ) ?? null
    )
  }

  private markDirty(): void {
    this.dirty = true
  }
}
