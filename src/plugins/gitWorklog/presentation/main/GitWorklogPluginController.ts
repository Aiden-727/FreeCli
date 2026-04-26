import { BrowserWindow } from 'electron'
import { relative, resolve, sep } from 'node:path'
import { promises as fs } from 'node:fs'
import type {
  GitWorklogAutoCandidateDto,
  GitWorklogDailyPointDto,
  GitWorklogErrorDto,
  GitWorklogOverviewDto,
  GitWorklogPendingImportDto,
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
import { GitWorklogDiscoveryStore } from '../../infrastructure/main/GitWorklogDiscoveryStore'
import { GitWorklogScanner } from './GitWorklogScanner'
import { createAppError } from '../../../../shared/errors/appError'

const CONFIG_REFRESH_DEBOUNCE_MS = 400
const WORKSPACE_PROJECTION_REFRESH_DEBOUNCE_MS = 120
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

function hasConfiguredRepositoryWithinWorkspace(
  workspacePath: string,
  repositories: readonly ResolvedGitWorklogRepository[],
): boolean {
  const normalizedWorkspacePath = normalizePathForComparison(workspacePath)
  return repositories.some(repository =>
    isPathWithinRoot(normalizedWorkspacePath, normalizePathForComparison(repository.path)),
  )
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
    heatmapDailyPoints: [],
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
    autoCandidates: [],
    pendingImports: [],
    dismissedImports: [],
    availableWorkspaces: [],
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
    parentWorkspaceId: null,
    parentWorkspaceName: null,
    parentWorkspacePath: null,
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
    heatmapDailyPoints: [],
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

function aggregateHeatmapDailyPoints(repos: GitWorklogRepoStateDto[]): GitWorklogDailyPointDto[] {
  const aggregated = new Map<string, GitWorklogDailyPointDto>()

  for (const repo of repos) {
    for (const point of repo.heatmapDailyPoints) {
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
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
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

function filterAutoCandidatesForSettings(
  autoCandidates: GitWorklogAutoCandidateDto[],
  settings: GitWorklogSettingsDto,
  repositories: readonly ResolvedGitWorklogRepository[],
): GitWorklogAutoCandidateDto[] {
  const configuredRepositoryPaths = new Set(
    repositories.map(repository => normalizePathForComparison(repository.path)),
  )
  const ignoredAutoRepositoryPaths = createIgnoredAutoRepositoryPathSet(settings)

  return autoCandidates.filter(candidate => {
    const normalizedPath = normalizePathForComparison(candidate.path)
    return (
      !configuredRepositoryPaths.has(normalizedPath) &&
      !ignoredAutoRepositoryPaths.has(normalizedPath)
    )
  })
}

function filterPendingImportsForSettings(
  pendingImports: GitWorklogPendingImportDto[],
  settings: GitWorklogSettingsDto,
  repositories: readonly ResolvedGitWorklogRepository[],
): GitWorklogPendingImportDto[] {
  const configuredRepositoryPaths = new Set(
    repositories.map(repository => normalizePathForComparison(repository.path)),
  )
  const ignoredAutoRepositoryPaths = createIgnoredAutoRepositoryPathSet(settings)

  return pendingImports.flatMap(pendingImport => {
    const repositories = pendingImport.repositories.filter(repository => {
      const normalizedPath = normalizePathForComparison(repository.path)
      return (
        !configuredRepositoryPaths.has(normalizedPath) &&
        !ignoredAutoRepositoryPaths.has(normalizedPath)
      )
    })

    if (repositories.length === 0 && !pendingImport.error) {
      return []
    }

    return [
      {
        ...pendingImport,
        repositories,
      },
    ]
  })
}

function buildOverview(repos: GitWorklogRepoStateDto[]): GitWorklogOverviewDto {
  const healthyRepos = repos.filter(repo => repo.error === null)
  const dailyPoints = aggregateDailyPoints(healthyRepos)
  const heatmapDailyPoints = aggregateHeatmapDailyPoints(healthyRepos)
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
    heatmapDailyPoints,
  }
}

function buildGitWorklogScanInputSignature(settings: GitWorklogSettingsDto): string {
  return JSON.stringify({
    repositories: getConfiguredGitWorklogRepositories(settings).map(repository => ({
      path: normalizePathForComparison(repository.path),
      enabled: repository.enabled,
    })),
    authorFilter: settings.authorFilter.trim(),
    rangeMode: settings.rangeMode,
    recentDays: settings.recentDays,
    rangeStartDay: settings.rangeStartDay,
    rangeEndDay: settings.rangeEndDay,
    autoDiscoverEnabled: settings.autoDiscoverEnabled,
    autoDiscoverDepth: settings.autoDiscoverDepth,
    ignoredAutoRepositoryPaths: settings.ignoredAutoRepositoryPaths.map(pathValue =>
      normalizePathForComparison(pathValue),
    ),
  })
}

function buildGitWorklogWorkspaceProjectionSignature(
  settings: GitWorklogSettingsDto,
  workspaces: GitWorklogWorkspaceDto[],
): string {
  return JSON.stringify({
    repositories: settings.repositories.map(repository => ({
      id: repository.id,
      path: normalizePathForComparison(repository.path),
      enabled: repository.enabled,
      origin: repository.origin ?? 'manual',
    })),
    autoDiscoverEnabled: settings.autoDiscoverEnabled,
    autoDiscoverDepth: settings.autoDiscoverDepth,
    ignoredAutoRepositoryPaths: settings.ignoredAutoRepositoryPaths.map(pathValue =>
      normalizePathForComparison(pathValue),
    ),
    workspaces: workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      path: normalizePathForComparison(workspace.path),
    })),
  })
}

export class GitWorklogPluginController {
  private readonly approvedWorkspaces: ApprovedWorkspaceStore
  private readonly discoveryStore: GitWorklogDiscoveryStore
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
  private workspaceProjectionRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private currentRefreshPromise: Promise<GitWorklogStateDto> | null = null
  private pendingRefreshAfterCurrent = false
  private refreshVersion = 0
  private lastScanInputSignature = buildGitWorklogScanInputSignature(DEFAULT_GIT_WORKLOG_SETTINGS)
  private lastWorkspaceProjectionSignature = buildGitWorklogWorkspaceProjectionSignature(
    DEFAULT_GIT_WORKLOG_SETTINGS,
    [],
  )
  public constructor(options: {
    approvedWorkspaces: ApprovedWorkspaceStore
    discoveryStore?: GitWorklogDiscoveryStore
    scanner?: GitWorklogScanner
    emitState?: (state: GitWorklogStateDto) => void
    hasFocusedWindow?: MainWindowActivityProbe
  }) {
    this.approvedWorkspaces = options.approvedWorkspaces
    this.discoveryStore =
      options.discoveryStore ??
      new GitWorklogDiscoveryStore(
        resolve(process.cwd(), '.freecli', 'tmp', 'git-worklog-discovery.json'),
      )
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
    const previousScanInputSignature = this.lastScanInputSignature
    const previousWorkspaceProjectionSignature = this.lastWorkspaceProjectionSignature
    this.settings = settings
    this.lastScanInputSignature = buildGitWorklogScanInputSignature(settings)
    this.lastWorkspaceProjectionSignature = buildGitWorklogWorkspaceProjectionSignature(
      settings,
      this.workspaces,
    )
    const repositories = this.resolveManualRepositories()
    const repos = reconcileRepos(this.state.repos, repositories)
    this.applyState({
      ...this.state,
      isEnabled: this.isEnabled,
      status: this.resolveStatus(this.state, this.isEnabled),
      configuredRepoCount: repositories.length,
      activeRepoCount: repositories.length,
      repos,
      autoCandidates: filterAutoCandidatesForSettings(
        this.state.autoCandidates ?? [],
        settings,
        repositories,
      ),
      pendingImports: this.state.pendingImports ?? [],
      dismissedImports: this.state.dismissedImports ?? [],
      availableWorkspaces: this.workspaces,
      lastError: null,
      overview: buildOverview(repos),
    })

    if (this.isEnabled) {
      this.restartRefreshTimer()
      if (previousScanInputSignature !== this.lastScanInputSignature) {
        this.scheduleConfigRefresh()
      }
      if (previousWorkspaceProjectionSignature !== this.lastWorkspaceProjectionSignature) {
        this.scheduleWorkspaceProjectionRefresh()
      }
    }

    return this.state
  }

  public syncWorkspaces(workspaces: GitWorklogWorkspaceDto[]): GitWorklogStateDto {
    const previousWorkspaceSignature = JSON.stringify(
      this.workspaces.map(workspace => ({
        id: workspace.id,
        name: workspace.name,
        path: workspace.path,
      })),
    )
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
    this.lastWorkspaceProjectionSignature = buildGitWorklogWorkspaceProjectionSignature(
      this.settings,
      this.workspaces,
    )

    if (this.isEnabled) {
      this.applyState({
        ...this.state,
        availableWorkspaces: this.workspaces,
        lastError: null,
      })
      const nextWorkspaceSignature = JSON.stringify(
        this.workspaces.map(workspace => ({
          id: workspace.id,
          name: workspace.name,
          path: workspace.path,
        })),
      )

      // Importing a workspace should stay responsive. Discovery can wait for a
      // dedicated projection refresh instead of coupling to a full repo scan.
      if (previousWorkspaceSignature !== nextWorkspaceSignature) {
        this.scheduleWorkspaceProjectionRefresh()
        void this.refreshWorkspaceProjectionNow()
      }
    } else {
      this.applyState({
        ...this.state,
        availableWorkspaces: this.workspaces,
      })
    }

    return this.state
  }

  public getState(): GitWorklogStateDto {
    return this.state
  }

  public async resolveRepository(pathValue: string): Promise<{ path: string; label: string }> {
    const resolved = await this.scanner.resolveRepositoryRoot(pathValue)
    if (!resolved.ok) {
      throw createAppError('common.invalid_input', {
        debugMessage: resolved.error.detail ?? resolved.error.message,
      })
    }

    return {
      path: resolved.path,
      label: resolved.label,
    }
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
      await this.syncWorkspaceDiscoverySnapshots([])
      let autoCandidates: GitWorklogAutoCandidateDto[] = []
      try {
        autoCandidates = await this.resolveAutoCandidates([])
      } catch {
        autoCandidates = []
      }
      const pendingImports = filterPendingImportsForSettings(
        await this.discoveryStore.listPendingImports(this.workspaces),
        this.settings,
        [],
      )
      const dismissedImports = await this.discoveryStore.listDismissedImports(this.workspaces)
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
        autoCandidates,
        pendingImports,
        dismissedImports,
        availableWorkspaces: this.workspaces,
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

  public async refreshWorkspace(workspacePath: string): Promise<GitWorklogStateDto> {
    await this.refreshWorkspaceProjectionNow(workspacePath)
    return this.state
  }

  public async acceptPendingImport(workspacePath: string): Promise<GitWorklogStateDto> {
    const pendingImport = (this.state.pendingImports ?? []).find(
      entry =>
        normalizePathForComparison(entry.workspacePath) === normalizePathForComparison(workspacePath),
    )
    if (!pendingImport) {
      return this.state
    }

    await this.discoveryStore.clearPendingImport(pendingImport.workspacePath)
    const refreshed = await this.refreshWorkspaceProjectionNow(pendingImport.workspacePath)
    if (!this.isEnabled) {
      return this.state
    }

    if (refreshed) {
      await this.refreshNow()
    }

    return this.state
  }

  public async dismissPendingImport(workspacePath: string): Promise<GitWorklogStateDto> {
    const pendingImport = (this.state.pendingImports ?? []).find(
      entry =>
        normalizePathForComparison(entry.workspacePath) === normalizePathForComparison(workspacePath),
    )
    if (!pendingImport) {
      return this.state
    }

    await this.discoveryStore.dismissWorkspace({
      workspaceId: pendingImport.workspaceId,
      workspaceName: pendingImport.workspaceName,
      workspacePath: pendingImport.workspacePath,
      dismissedAt: new Date().toISOString(),
    })
    await this.refreshWorkspaceProjectionNow()
    return this.state
  }

  public async restoreDismissedImport(workspacePath: string): Promise<GitWorklogStateDto> {
    await this.discoveryStore.restoreWorkspace(workspacePath)
    await this.refreshWorkspaceProjectionNow(workspacePath)
    return this.state
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
    this.clearWorkspaceProjectionRefreshTimer()
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
    await this.syncWorkspaceDiscoverySnapshots(configuredRepos)
    if (this.disposed || refreshVersion !== this.refreshVersion) {
      return this.state
    }

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
        parentWorkspaceId: null,
        parentWorkspaceName: null,
        parentWorkspacePath: null,
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
      autoCandidates: await this.resolveAutoCandidates(configuredRepos),
      pendingImports: filterPendingImportsForSettings(
        await this.discoveryStore.listPendingImports(this.workspaces),
        this.settings,
        configuredRepos,
      ),
      dismissedImports: await this.discoveryStore.listDismissedImports(this.workspaces),
      availableWorkspaces: this.workspaces,
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

  private scheduleWorkspaceProjectionRefresh(
    delayMs = WORKSPACE_PROJECTION_REFRESH_DEBOUNCE_MS,
  ): void {
    this.clearWorkspaceProjectionRefreshTimer()
    this.workspaceProjectionRefreshTimer = setTimeout(() => {
      void this.refreshWorkspaceProjectionNow()
    }, delayMs)
  }

  private clearWorkspaceProjectionRefreshTimer(): void {
    if (this.workspaceProjectionRefreshTimer) {
      clearTimeout(this.workspaceProjectionRefreshTimer)
      this.workspaceProjectionRefreshTimer = null
    }
  }

  private async refreshWorkspaceProjectionNow(workspacePath?: string): Promise<boolean> {
    if (this.disposed || !this.isEnabled) {
      return false
    }

    const projectionSignature = this.lastWorkspaceProjectionSignature
    const configuredRepos = await this.resolveEffectiveRepositories()
    await this.syncWorkspaceDiscoverySnapshots(configuredRepos, workspacePath)
    let autoCandidates: GitWorklogAutoCandidateDto[] = []
    try {
      autoCandidates = await this.resolveAutoCandidates(configuredRepos)
    } catch {
      // Keep projection refresh resilient. Pending imports carry the diagnosable
      // workspace-level error state, so auto candidates should not tear down the
      // whole projection update.
      autoCandidates = []
    }
    const pendingImports = filterPendingImportsForSettings(
      await this.discoveryStore.listPendingImports(this.workspaces),
      this.settings,
      configuredRepos,
    )
    const dismissedImports = await this.discoveryStore.listDismissedImports(this.workspaces)

    if (
      this.disposed ||
      !this.isEnabled ||
      projectionSignature !== this.lastWorkspaceProjectionSignature
    ) {
      return false
    }

    this.applyState({
      ...this.state,
      configuredRepoCount: configuredRepos.length,
      activeRepoCount: configuredRepos.length,
      repos: reconcileRepos(this.state.repos, configuredRepos),
      autoCandidates,
      pendingImports,
      dismissedImports,
      availableWorkspaces: this.workspaces,
      lastError: null,
    })
    return pendingImports.length > 0
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
    return this.resolveManualRepositories().sort((left, right) =>
      left.label.localeCompare(right.label),
    )
  }

  private async discoverWorkspaceRepositories(): Promise<ResolvedGitWorklogRepository[]> {
    const discoveredRepositories = await this.discoverWorkspaceRepositoriesCore(this.workspaces)
    return discoveredRepositories.map(({ repository, depth }) => ({
      ...repository,
      label: depth === 0 ? repository.parentWorkspaceName ?? repository.label : repository.label,
    }))
  }

  private async resolveAutoCandidates(
    configuredRepositories: ResolvedGitWorklogRepository[],
  ): Promise<GitWorklogAutoCandidateDto[]> {
    if (!this.settings.autoDiscoverEnabled) {
      return []
    }

    const configuredRepositoryPaths = new Set(
      configuredRepositories.map(repository => normalizePathForComparison(repository.path)),
    )
    const ignoredAutoRepositoryPaths = createIgnoredAutoRepositoryPathSet(this.settings)
    const discoveredRepositories = await this.discoverWorkspaceRepositories()

    return discoveredRepositories
      .filter(repository => {
        const normalizedPath = normalizePathForComparison(repository.path)
        return (
          !configuredRepositoryPaths.has(normalizedPath) &&
          !ignoredAutoRepositoryPaths.has(normalizedPath)
        )
      })
      .map(repository => ({
        id: repository.id,
        label: repository.label,
        path: repository.path,
        parentWorkspaceId: repository.parentWorkspaceId,
        parentWorkspaceName: repository.parentWorkspaceName,
        parentWorkspacePath: repository.parentWorkspacePath,
        detectedAt: this.state.lastUpdatedAt,
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  }

  private async discoverRepositoriesWithinWorkspace(
    workspace: GitWorklogWorkspaceDto,
  ): Promise<ResolvedGitWorklogRepository[]> {
    const discoveredRepositories = await this.discoverWorkspaceRepositoriesCore([workspace])
    return discoveredRepositories.map(({ repository }) => repository)
  }

  private async syncWorkspaceDiscoverySnapshots(
    configuredRepositories: ResolvedGitWorklogRepository[],
    workspacePath?: string,
  ): Promise<void> {
    if (!this.settings.autoDiscoverEnabled) {
      for (const workspace of this.workspaces) {
        await this.discoveryStore.removeWorkspace(workspace.path)
      }
      await this.discoveryStore.flush()
      return
    }

    const targetWorkspaces = workspacePath
      ? this.workspaces.filter(
          workspace =>
            normalizePathForComparison(workspace.path) === normalizePathForComparison(workspacePath),
        )
      : this.workspaces

    const configuredRepositoryPaths = new Set(
      configuredRepositories.map(repository => normalizePathForComparison(repository.path)),
    )
    const ignoredAutoRepositoryPaths = createIgnoredAutoRepositoryPathSet(this.settings)

    for (const workspace of targetWorkspaces) {
      const hasManagedRepository = hasConfiguredRepositoryWithinWorkspace(
        workspace.path,
        configuredRepositories,
      )
      const scannedAt = new Date().toISOString()
      try {
        const discoveredRepositories = await this.discoverRepositoriesWithinWorkspace(workspace)
        const filteredRepositories = discoveredRepositories
          .filter(repository => {
            const normalizedPath = normalizePathForComparison(repository.path)
            return (
              !configuredRepositoryPaths.has(normalizedPath) &&
              !ignoredAutoRepositoryPaths.has(normalizedPath)
            )
          })
          .map(repository => ({
            id: repository.id,
            label: repository.label,
            path: repository.path,
            parentWorkspaceId: repository.parentWorkspaceId,
            parentWorkspaceName: repository.parentWorkspaceName,
            parentWorkspacePath: repository.parentWorkspacePath,
            detectedAt: scannedAt,
          }))
          .sort((left, right) => left.path.localeCompare(right.path))

        if (filteredRepositories.length === 0 && hasManagedRepository) {
          await this.discoveryStore.clearPendingImport(workspace.path)
          continue
        }

        await this.discoveryStore.upsertScanResult({
          workspace,
          repositories: filteredRepositories,
          error: null,
          scannedAt,
        })
      } catch (error) {
        const discoveryError =
          error && typeof error === 'object' && 'message' in error
            ? {
                type: 'command_failed' as const,
                message: '工作区 Git 扫描失败',
                detail:
                  error instanceof Error
                    ? error.message
                    : `${(error as { message?: unknown }).message ?? ''}` || null,
              }
            : {
                type: 'command_failed' as const,
                message: '工作区 Git 扫描失败',
                detail: error instanceof Error ? error.message : null,
              }
        await this.discoveryStore.upsertScanResult({
          workspace,
          repositories: [],
          error: discoveryError,
          scannedAt,
        })
        this.scheduleConfigRefresh(BACKGROUND_REFRESH_RETRY_MS)
      }
    }

    await this.discoveryStore.pruneToWorkspaceSet(this.workspaces)
    await this.discoveryStore.flush()
  }

  private async discoverWorkspaceRepositoriesCore(
    workspaces: readonly GitWorklogWorkspaceDto[],
  ): Promise<Array<{ repository: ResolvedGitWorklogRepository; depth: number }>> {
    const results: Array<{ repository: ResolvedGitWorklogRepository; depth: number }> = []
    const visitedDirectories = new Set<string>()
    const discoveredRepositoryPaths = new Set<string>()
    const maxDepth = Number.isFinite(this.settings.autoDiscoverDepth)
      ? Math.max(1, Math.min(GIT_WORKLOG_MAX_AUTO_DISCOVER_DEPTH, this.settings.autoDiscoverDepth))
      : GIT_WORKLOG_DEFAULT_AUTO_DISCOVER_DEPTH

    for (const workspace of workspaces) {
      const rootPath = workspace.path.trim()
      if (rootPath.length === 0) {
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

        const resolvedRepository = await this.scanner.resolveRepositoryRoot(current.path)
        if (resolvedRepository.ok) {
          const normalizedRepoPath = normalizePathForComparison(resolvedRepository.path)
          if (!discoveredRepositoryPaths.has(normalizedRepoPath)) {
            discoveredRepositoryPaths.add(normalizedRepoPath)
            results.push({
              repository: {
                id: toAutoRepositoryId(workspace.id, resolvedRepository.path, workspace.path),
                label: resolvedRepository.label,
                path: resolvedRepository.path,
                enabled: true,
                origin: 'auto',
                assignedWorkspaceId: workspace.id,
                parentWorkspaceId: workspace.id,
                parentWorkspaceName: workspace.name,
                parentWorkspacePath: workspace.path,
              },
              depth: current.depth,
            })
          }
        }

        if (current.depth >= maxDepth) {
          continue
        }

        // Even when the current directory is already a Git repository, continue
        // traversing within the configured depth so nested independent repos can
        // still be surfaced for user confirmation.
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
