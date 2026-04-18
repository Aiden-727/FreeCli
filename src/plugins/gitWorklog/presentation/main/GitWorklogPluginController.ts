import { BrowserWindow } from 'electron'
import { basename, relative, resolve, sep } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  GitWorklogDailyPointDto,
  GitWorklogErrorDto,
  GitWorklogOverviewDto,
  GitWorklogRepoStateDto,
  GitWorklogRepositoryDto,
  GitWorklogSettingsDto,
  GitWorklogStateDto,
  GitWorklogWorkspaceDto,
} from '@shared/contracts/dto'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import {
  DEFAULT_GIT_WORKLOG_SETTINGS,
  GIT_WORKLOG_DEFAULT_AUTO_DISCOVER_DEPTH,
  GIT_WORKLOG_MAX_AUTO_DISCOVER_DEPTH,
  getConfiguredGitWorklogRepositories,
} from '@contexts/plugins/domain/gitWorklogSettings'
import {
  hasVisibleFocusedWindow,
  type MainWindowActivityProbe,
} from '../../../shared/presentation/main/windowActivity'
import type {
  MainPluginRuntime,
  MainPluginRuntimeFactory,
} from '../../../../contexts/plugins/application/MainPluginRuntimeHost'
import type { ApprovedWorkspaceStore } from '../../../../contexts/workspace/infrastructure/approval/ApprovedWorkspaceStore'
import { GitWorklogScanner } from './GitWorklogScanner'

const CONFIG_REFRESH_DEBOUNCE_MS = 400
const BACKGROUND_REFRESH_RETRY_MS = 5_000
const AUTO_DISCOVER_MAX_REPOS = 160
const AUTO_DISCOVER_SKIPPED_DIR_NAMES = new Set([
  '.git',
  '.uv-cache',
  'node_modules',
  '.pnpm-store',
  '.turbo',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.cache',
  '.idea',
  '.vscode',
  'dist',
  'build',
  'target',
  'out',
  'coverage',
  '.dart_tool',
  '.gradle',
  '.venv',
  'vendor',
  'Pods',
  '.terraform',
])

interface ResolvedGitWorklogRepository extends GitWorklogRepositoryDto {
  origin: 'manual' | 'auto'
  parentWorkspaceId: string | null
  parentWorkspaceName: string | null
  parentWorkspacePath: string | null
}

function normalizePathForComparison(pathValue: string): string {
  const normalized = resolve(pathValue)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function createIgnoredAutoRepositoryPathSet(settings: GitWorklogSettingsDto): Set<string> {
  return new Set(
    settings.ignoredAutoRepositoryPaths.map(pathValue => normalizePathForComparison(pathValue)),
  )
}

function createImportedWorkspacePathSet(settings: GitWorklogSettingsDto): Set<string> {
  return new Set(
    settings.autoImportedWorkspacePaths.map(pathValue => normalizePathForComparison(pathValue)),
  )
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath)

  if (relativePath === '') {
    return true
  }

  if (relativePath === '..') {
    return false
  }

  if (relativePath.startsWith(`..${sep}`)) {
    return false
  }

  if (relativePath.includes(':')) {
    return false
  }

  return true
}

function toAutoRepositoryId(workspaceId: string, repoPath: string, workspaceRoot: string): string {
  const relativePath = relative(workspaceRoot, repoPath)
  const normalizedRelative = relativePath.length === 0 ? 'root' : relativePath
  const safeRelative = normalizedRelative
    .replaceAll(/[\\/]/g, '__')
    .replaceAll(/[^a-zA-Z0-9_.-]/g, '_')
  return `auto_${workspaceId}_${safeRelative}`
}

function inferParentWorkspace(
  pathValue: string,
  workspaces: GitWorklogWorkspaceDto[],
): { id: string; name: string; path: string } | null {
  const normalizedPath = normalizePathForComparison(pathValue)
  let bestMatch: { id: string; name: string; path: string; pathLength: number } | null = null

  for (const workspace of workspaces) {
    const normalizedWorkspacePath = normalizePathForComparison(workspace.path)
    if (!isPathWithinRoot(normalizedWorkspacePath, normalizedPath)) {
      continue
    }

    if (!bestMatch || normalizedWorkspacePath.length > bestMatch.pathLength) {
      bestMatch = {
        id: workspace.id,
        name: workspace.name,
        path: workspace.path,
        pathLength: normalizedWorkspacePath.length,
      }
    }
  }

  if (!bestMatch) {
    return null
  }

  return { id: bestMatch.id, name: bestMatch.name, path: bestMatch.path }
}

function createEmptyOverview(): GitWorklogOverviewDto {
  return {
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
  }
}

function createDefaultState(
  settings: GitWorklogSettingsDto,
  isEnabled: boolean,
): GitWorklogStateDto {
  return {
    isEnabled,
    isRefreshing: false,
    status: isEnabled ? 'needs_config' : 'disabled',
    lastUpdatedAt: null,
    configuredRepoCount: getConfiguredGitWorklogRepositories(settings).length,
    activeRepoCount: settings.repositories.filter(repo => repo.enabled).length,
    successfulRepoCount: 0,
    overview: createEmptyOverview(),
    repos: [],
    lastError: null,
  }
}

function createErrorState(
  repo: ResolvedGitWorklogRepository,
  error: GitWorklogErrorDto,
  lastScannedAt: string | null = null,
): GitWorklogRepoStateDto {
  return {
    repoId: repo.id,
    label: repo.label,
    path: repo.path,
    origin: repo.origin,
    parentWorkspaceId: repo.parentWorkspaceId,
    parentWorkspaceName: repo.parentWorkspaceName,
    parentWorkspacePath: repo.parentWorkspacePath,
    commitCountToday: 0,
    filesChangedToday: 0,
    additionsToday: 0,
    deletionsToday: 0,
    changedLinesToday: 0,
    netLinesToday: 0,
    commitCountInRange: 0,
    filesChangedInRange: 0,
    additionsInRange: 0,
    deletionsInRange: 0,
    changedLinesInRange: 0,
    totalCodeFiles: 0,
    totalCodeLines: 0,
    dailyPoints: [],
    lastScannedAt,
    error,
  }
}

function aggregateDailyPoints(repos: GitWorklogRepoStateDto[]): GitWorklogDailyPointDto[] {
  const aggregated = new Map<string, GitWorklogDailyPointDto>()

  for (const repo of repos) {
    for (const point of repo.dailyPoints) {
      const current = aggregated.get(point.day)
      if (current) {
        current.commitCount += point.commitCount
        current.filesChanged += point.filesChanged
        current.additions += point.additions
        current.deletions += point.deletions
        current.changedLines += point.changedLines
        continue
      }

      aggregated.set(point.day, { ...point })
    }
  }

  return [...aggregated.values()].sort((left, right) => left.day.localeCompare(right.day))
}

function reconcileRepos(
  previous: GitWorklogRepoStateDto[],
  repositories: ResolvedGitWorklogRepository[],
): GitWorklogRepoStateDto[] {
  const previousById = new Map(previous.map(repo => [repo.repoId, repo]))
  return repositories.map(repo => {
    const existing = previousById.get(repo.id)
    return existing
      ? {
          ...existing,
          label: repo.label,
          path: repo.path,
          origin: repo.origin,
          parentWorkspaceId: repo.parentWorkspaceId,
          parentWorkspaceName: repo.parentWorkspaceName,
          parentWorkspacePath: repo.parentWorkspacePath,
        }
      : createErrorState(
          repo,
          {
            type: 'unknown',
            message: '尚未扫描',
            detail: null,
          },
          null,
        )
  })
}

function buildOverview(repos: GitWorklogRepoStateDto[]): GitWorklogOverviewDto {
  const healthyRepos = repos.filter(repo => repo.error === null)
  const dailyPoints = aggregateDailyPoints(healthyRepos)
  return {
    monitoredRepoCount: repos.length,
    activeRepoCount: repos.length,
    healthyRepoCount: healthyRepos.length,
    commitCountToday: healthyRepos.reduce((sum, repo) => sum + repo.commitCountToday, 0),
    filesChangedToday: healthyRepos.reduce((sum, repo) => sum + repo.filesChangedToday, 0),
    additionsToday: healthyRepos.reduce((sum, repo) => sum + repo.additionsToday, 0),
    deletionsToday: healthyRepos.reduce((sum, repo) => sum + repo.deletionsToday, 0),
    changedLinesToday: healthyRepos.reduce((sum, repo) => sum + repo.changedLinesToday, 0),
    commitCountInRange: healthyRepos.reduce((sum, repo) => sum + repo.commitCountInRange, 0),
    filesChangedInRange: healthyRepos.reduce((sum, repo) => sum + repo.filesChangedInRange, 0),
    additionsInRange: healthyRepos.reduce((sum, repo) => sum + repo.additionsInRange, 0),
    deletionsInRange: healthyRepos.reduce((sum, repo) => sum + repo.deletionsInRange, 0),
    changedLinesInRange: healthyRepos.reduce((sum, repo) => sum + repo.changedLinesInRange, 0),
    totalCodeFiles: healthyRepos.reduce((sum, repo) => sum + repo.totalCodeFiles, 0),
    totalCodeLines: healthyRepos.reduce((sum, repo) => sum + repo.totalCodeLines, 0),
    dailyPoints,
  }
}

export class GitWorklogPluginController {
  private readonly approvedWorkspaces: ApprovedWorkspaceStore
  private readonly scanner: GitWorklogScanner
  private readonly emitState: (state: GitWorklogStateDto) => void
  private readonly hasFocusedWindow: MainWindowActivityProbe
  private settings: GitWorklogSettingsDto = DEFAULT_GIT_WORKLOG_SETTINGS
  private workspaces: GitWorklogWorkspaceDto[] = []
  private state: GitWorklogStateDto = createDefaultState(DEFAULT_GIT_WORKLOG_SETTINGS, false)
  private isEnabled = false
  private disposed = false
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private configRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private currentRefreshPromise: Promise<GitWorklogStateDto> | null = null
  private pendingRefreshAfterCurrent = false
  private refreshVersion = 0

  public constructor(options: {
    approvedWorkspaces: ApprovedWorkspaceStore
    scanner?: GitWorklogScanner
    emitState?: (state: GitWorklogStateDto) => void
    hasFocusedWindow?: MainWindowActivityProbe
  }) {
    this.approvedWorkspaces = options.approvedWorkspaces
    this.scanner = options.scanner ?? new GitWorklogScanner()
    this.emitState = options.emitState ?? this.broadcastState
    this.hasFocusedWindow = options.hasFocusedWindow ?? hasVisibleFocusedWindow
  }

  public createRuntimeFactory(): MainPluginRuntimeFactory {
    return () =>
      ({
        activate: async () => {
          await this.activate()
        },
        deactivate: async () => {
          await this.deactivate()
        },
      }) satisfies MainPluginRuntime
  }

  public syncSettings(settings: GitWorklogSettingsDto): GitWorklogStateDto {
    this.settings = settings
    const repositories = this.resolveManualRepositories()
    const repos = reconcileRepos(this.state.repos, repositories)
    this.applyState({
      ...this.state,
      isEnabled: this.isEnabled,
      status: this.resolveStatus(this.state, this.isEnabled),
      configuredRepoCount: repositories.length,
      activeRepoCount: repositories.length,
      repos,
      lastError: null,
      overview: buildOverview(repos),
    })

    if (this.isEnabled) {
      this.restartRefreshTimer()
      this.scheduleConfigRefresh()
    }

    return this.state
  }

  public syncWorkspaces(workspaces: GitWorklogWorkspaceDto[]): GitWorklogStateDto {
    this.workspaces = workspaces
      .map(workspace => ({
        id: workspace.id.trim(),
        name: workspace.name.trim(),
        path: workspace.path.trim(),
      }))
      .filter(
        workspace =>
          workspace.id.length > 0 && workspace.name.length > 0 && workspace.path.length > 0,
      )

    if (this.isEnabled) {
      this.applyState({
        ...this.state,
        lastError: null,
      })
      this.scheduleConfigRefresh()
    }

    return this.state
  }

  public getState(): GitWorklogStateDto {
    return this.state
  }

  public async refreshNow(): Promise<GitWorklogStateDto> {
    if (this.disposed) {
      return this.state
    }

    if (!this.isEnabled) {
      this.applyState({
        ...this.state,
        isEnabled: false,
        isRefreshing: false,
        status: 'disabled',
      })
      return this.state
    }

    const configuredRepos = await this.resolveEffectiveRepositories()
    if (configuredRepos.length === 0) {
      const scannedAt = new Date().toISOString()
      this.applyState({
        ...this.state,
        isEnabled: true,
        isRefreshing: false,
        status: 'needs_config',
        lastUpdatedAt: scannedAt,
        configuredRepoCount: 0,
        activeRepoCount: 0,
        successfulRepoCount: 0,
        lastError: null,
        overview: buildOverview([]),
      })
      this.restartRefreshTimer()
      return this.state
    }

    if (this.currentRefreshPromise) {
      this.pendingRefreshAfterCurrent = true
      return await this.currentRefreshPromise
    }

    const refreshVersion = ++this.refreshVersion
    this.applyState({
      ...this.state,
      isEnabled: true,
      isRefreshing: true,
      status: 'loading',
      lastError: null,
      configuredRepoCount: configuredRepos.length,
      activeRepoCount: configuredRepos.length,
      repos: reconcileRepos(this.state.repos, configuredRepos),
    })

    const refreshPromise = this.performRefresh(refreshVersion, configuredRepos).finally(() => {
      if (this.currentRefreshPromise === refreshPromise) {
        this.currentRefreshPromise = null
        const shouldRefreshAgain = this.pendingRefreshAfterCurrent
        this.pendingRefreshAfterCurrent = false
        if (shouldRefreshAgain && !this.disposed && this.isEnabled) {
          queueMicrotask(() => {
            void this.refreshNow()
          })
        }
      }
    })

    this.currentRefreshPromise = refreshPromise
    return await refreshPromise
  }

  public async dispose(): Promise<void> {
    this.disposed = true
    await this.deactivate()
  }

  private async activate(): Promise<void> {
    if (this.disposed || this.isEnabled) {
      return
    }

    this.isEnabled = true
    this.applyState({
      ...this.state,
      isEnabled: true,
      status: this.resolveStatus(this.state, true),
    })
    await this.refreshNow()
  }

  private async deactivate(): Promise<void> {
    this.isEnabled = false
    this.refreshVersion += 1
    this.pendingRefreshAfterCurrent = false
    this.clearRefreshTimer()
    this.clearConfigRefreshTimer()
    this.applyState({
      ...this.state,
      isEnabled: false,
      isRefreshing: false,
      status: 'disabled',
    })
  }

  private async performRefresh(
    refreshVersion: number,
    configuredRepos: ResolvedGitWorklogRepository[],
  ): Promise<GitWorklogStateDto> {
    const approvedRepos: ResolvedGitWorklogRepository[] = []
    const unapprovedRepoStates: GitWorklogRepoStateDto[] = []
    const scannedAt = new Date().toISOString()

    for (const repo of configuredRepos) {
      const isApproved = await this.approvedWorkspaces.isPathApproved(repo.path)
      if (!isApproved) {
        unapprovedRepoStates.push(
          createErrorState(
            repo,
            {
              type: 'unapproved_path',
              message: '仓库路径未通过 FreeCli 工作区授权',
              detail: '请通过“选择文件夹”方式添加仓库，或确认该路径位于已批准 workspace 下。',
            },
            scannedAt,
          ),
        )
        continue
      }

      approvedRepos.push(repo)
    }

    const scannedRepoStates = await this.scanner.scan(
      this.settings,
      approvedRepos.map(repo => ({
        id: repo.id,
        label: repo.label,
        path: repo.path,
        enabled: true,
      })),
    )
    if (this.disposed || refreshVersion !== this.refreshVersion) {
      return this.state
    }

    const approvedRepoById = new Map(approvedRepos.map(repo => [repo.id, repo]))
    const normalizedScannedRepoStates = scannedRepoStates.map(repo => {
      const matchedRepo = approvedRepoById.get(repo.repoId)
      if (!matchedRepo) {
        return repo
      }

      return {
        ...repo,
        origin: matchedRepo.origin,
        parentWorkspaceId: matchedRepo.parentWorkspaceId,
        parentWorkspaceName: matchedRepo.parentWorkspaceName,
        parentWorkspacePath: matchedRepo.parentWorkspacePath,
      }
    })

    const repos = [...normalizedScannedRepoStates, ...unapprovedRepoStates].sort((left, right) =>
      left.label.localeCompare(right.label),
    )
    const healthyRepos = repos.filter(repo => repo.error === null)
    const failedRepos = repos.filter(repo => repo.error !== null)
    const nextState: GitWorklogStateDto = {
      isEnabled: this.isEnabled,
      isRefreshing: false,
      status:
        failedRepos.length === 0 ? 'ready' : healthyRepos.length > 0 ? 'partial_error' : 'error',
      lastUpdatedAt: scannedAt,
      configuredRepoCount: configuredRepos.length,
      activeRepoCount: configuredRepos.length,
      successfulRepoCount: healthyRepos.length,
      overview: buildOverview(repos),
      repos,
      lastError: failedRepos[0]?.error ?? null,
    }

    this.applyState(nextState)
    this.restartRefreshTimer()
    return this.state
  }

  private resolveStatus(
    state: GitWorklogStateDto,
    isEnabled: boolean,
  ): GitWorklogStateDto['status'] {
    if (!isEnabled) {
      return 'disabled'
    }

    if (state.isRefreshing) {
      return 'loading'
    }

    if (
      getConfiguredGitWorklogRepositories(this.settings).length === 0 &&
      !this.settings.autoDiscoverEnabled
    ) {
      return 'needs_config'
    }

    return state.lastUpdatedAt ? state.status : 'idle'
  }

  private scheduleConfigRefresh(delayMs = CONFIG_REFRESH_DEBOUNCE_MS): void {
    this.clearConfigRefreshTimer()
    this.configRefreshTimer = setTimeout(() => {
      if (this.shouldDeferBackgroundRefresh()) {
        this.scheduleConfigRefresh(BACKGROUND_REFRESH_RETRY_MS)
        return
      }

      void this.refreshNow()
    }, delayMs)
  }

  private restartRefreshTimer(delayMs = this.settings.refreshIntervalMs): void {
    this.clearRefreshTimer()
    if (!this.isEnabled || this.disposed || !this.settings.autoRefreshEnabled) {
      return
    }

    this.refreshTimer = setTimeout(() => {
      if (this.shouldDeferBackgroundRefresh()) {
        this.restartRefreshTimer(BACKGROUND_REFRESH_RETRY_MS)
        return
      }

      void this.refreshNow()
    }, delayMs)
  }

  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
  }

  private clearConfigRefreshTimer(): void {
    if (this.configRefreshTimer) {
      clearTimeout(this.configRefreshTimer)
      this.configRefreshTimer = null
    }
  }

  private shouldDeferBackgroundRefresh(): boolean {
    return this.isEnabled && !this.disposed && !this.hasFocusedWindow()
  }

  private applyState(nextState: GitWorklogStateDto): void {
    this.state = nextState
    this.emitState(this.state)
  }

  private broadcastState = (state: GitWorklogStateDto): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.pluginsGitWorklogState, state)
    }
  }

  private resolveManualRepositories(): ResolvedGitWorklogRepository[] {
    return getConfiguredGitWorklogRepositories(this.settings).map(repo => {
      const parentWorkspace = inferParentWorkspace(repo.path, this.workspaces)
      return {
        ...repo,
        origin: 'manual',
        parentWorkspaceId: parentWorkspace?.id ?? null,
        parentWorkspaceName: parentWorkspace?.name ?? null,
        parentWorkspacePath: parentWorkspace?.path ?? null,
      }
    })
  }

  private async resolveEffectiveRepositories(): Promise<ResolvedGitWorklogRepository[]> {
    const manualRepositories = this.resolveManualRepositories()
    const ignoredAutoRepositoryPaths = createIgnoredAutoRepositoryPathSet(this.settings)
    const importedWorkspacePaths = createImportedWorkspacePathSet(this.settings)
    const discoveredRepositories = this.settings.autoDiscoverEnabled
      ? (await this.discoverWorkspaceRepositories(importedWorkspacePaths)).filter(
          repository =>
            !ignoredAutoRepositoryPaths.has(normalizePathForComparison(repository.path)),
        )
      : []

    const dedupedRepositories = new Map<string, ResolvedGitWorklogRepository>()
    for (const repository of manualRepositories) {
      dedupedRepositories.set(normalizePathForComparison(repository.path), repository)
    }

    for (const repository of discoveredRepositories) {
      const key = normalizePathForComparison(repository.path)
      if (!dedupedRepositories.has(key)) {
        dedupedRepositories.set(key, repository)
      }
    }

    return [...dedupedRepositories.values()].sort((left, right) =>
      left.label.localeCompare(right.label),
    )
  }

  private async discoverWorkspaceRepositories(
    importedWorkspacePaths: Set<string>,
  ): Promise<ResolvedGitWorklogRepository[]> {
    const results: ResolvedGitWorklogRepository[] = []
    const visitedDirectories = new Set<string>()
    const maxDepth = Number.isFinite(this.settings.autoDiscoverDepth)
      ? Math.max(1, Math.min(GIT_WORKLOG_MAX_AUTO_DISCOVER_DEPTH, this.settings.autoDiscoverDepth))
      : GIT_WORKLOG_DEFAULT_AUTO_DISCOVER_DEPTH

    for (const workspace of this.workspaces) {
      const rootPath = workspace.path.trim()
      if (rootPath.length === 0) {
        continue
      }

      if (importedWorkspacePaths.has(normalizePathForComparison(rootPath))) {
        continue
      }

      const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }]
      while (queue.length > 0 && results.length < AUTO_DISCOVER_MAX_REPOS) {
        const current = queue.shift()
        if (!current) {
          continue
        }

        const normalizedCurrentPath = normalizePathForComparison(current.path)
        if (visitedDirectories.has(normalizedCurrentPath)) {
          continue
        }

        visitedDirectories.add(normalizedCurrentPath)
        const isGitRepository = await this.isGitRepositoryRoot(current.path)
        if (isGitRepository) {
          results.push({
            id: toAutoRepositoryId(workspace.id, current.path, rootPath),
            label: current.depth === 0 ? workspace.name : basename(current.path),
            path: current.path,
            enabled: true,
            origin: 'auto',
            parentWorkspaceId: workspace.id,
            parentWorkspaceName: workspace.name,
            parentWorkspacePath: workspace.path,
          })
        }

        if (current.depth >= maxDepth) {
          continue
        }

        const nextDirectories = await this.readCandidateSubDirectories(current.path)
        for (const nextDirectory of nextDirectories) {
          queue.push({
            path: nextDirectory,
            depth: current.depth + 1,
          })
        }
      }
    }

    return results
  }

  private async isGitRepositoryRoot(candidatePath: string): Promise<boolean> {
    const gitPath = resolve(candidatePath, '.git')
    try {
      const stat = await fs.stat(gitPath)
      return stat.isDirectory() || stat.isFile()
    } catch {
      return false
    }
  }

  private async readCandidateSubDirectories(parentPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(parentPath, { withFileTypes: true })
      return entries
        .filter(entry => entry.isDirectory())
        .filter(entry => !AUTO_DISCOVER_SKIPPED_DIR_NAMES.has(entry.name.toLowerCase()))
        .map(entry => resolve(parentPath, entry.name))
    } catch {
      return []
    }
  }
}
