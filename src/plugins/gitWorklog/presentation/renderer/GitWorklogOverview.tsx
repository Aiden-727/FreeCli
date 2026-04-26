import React from 'react'
import type {
  GitWorklogAutoCandidateDto,
  GitWorklogRepositoryDto,
  GitWorklogStateDto,
  GitWorklogWorkspaceDto,
} from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import { GitWorklogHeatmap } from './GitWorklogHeatmap'
import { GitWorklogMiniTrend } from './GitWorklogMiniTrend'
import { GitWorklogSummaryTrend } from './GitWorklogSummaryTrend'
import { formatGitWorklogCount } from './gitWorklogFormatting'
import {
  GIT_WORKLOG_EXTERNAL_WORKSPACE_ID,
  normalizeRepoPathForCompare,
  reconcileGitWorklogSettingsOrdering,
  reorderRepositoriesWithinOrder,
  reorderWorkspaceGroups,
} from './gitWorklogOrdering'

const REPO_DRAG_START_DISTANCE_PX = 8

function formatDisplayPath(value: string): string {
  return value.trim().replaceAll('\\', '/').replaceAll(/\/+/g, '/')
}

function getRelativeRepoPath(repoPath: string, workspacePath: string | null): string | null {
  if (!workspacePath) {
    return null
  }

  const normalizedRepoPath = normalizeRepoPathForCompare(repoPath)
  const normalizedWorkspacePath = normalizeRepoPathForCompare(workspacePath)
  if (normalizedRepoPath === normalizedWorkspacePath) {
    return null
  }

  const prefix = `${normalizedWorkspacePath}/`
  if (!normalizedRepoPath.startsWith(prefix)) {
    return null
  }

  const displayRepoPath = formatDisplayPath(repoPath)
  const displayWorkspacePath = formatDisplayPath(workspacePath)
  const relativePath = displayRepoPath.slice(displayWorkspacePath.length).replace(/^\/+/, '')
  return relativePath.length > 0 ? relativePath : null
}

function inferPresentationWorkspace(
  repoPath: string,
  availableWorkspaces: GitWorklogWorkspaceDto[],
): GitWorklogWorkspaceDto | null {
  const normalizedRepoPath = normalizeRepoPathForCompare(repoPath)
  let bestMatch: GitWorklogWorkspaceDto | null = null
  let bestLength = -1

  for (const workspace of availableWorkspaces) {
    const normalizedWorkspacePath = normalizeRepoPathForCompare(workspace.path)
    if (
      normalizedRepoPath !== normalizedWorkspacePath &&
      !normalizedRepoPath.startsWith(`${normalizedWorkspacePath}/`)
    ) {
      continue
    }

    if (normalizedWorkspacePath.length > bestLength) {
      bestMatch = workspace
      bestLength = normalizedWorkspacePath.length
    }
  }

  return bestMatch
}

function formatLastUpdated(value: string | null): string {
  if (!value) {
    return '--'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function MetricCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'positive' | 'negative'
}): React.JSX.Element {
  return (
    <div className={`git-worklog-overview__metric git-worklog-overview__metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function RepoStat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="git-worklog-overview__repo-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatRepoMetricValue(
  value: number,
  options: { hasError: boolean; hasRuntimeData: boolean },
): string {
  if (options.hasError || !options.hasRuntimeData) {
    return '--'
  }

  return formatGitWorklogCount(value)
}

type RuntimeRepo = GitWorklogStateDto['repos'][number]

type DisplayRepo = RuntimeRepo & {
  configuredRepositoryId: string | null
  isConfiguredEnabled: boolean | null
  hasRuntimeData: boolean
  isWorkspaceRootRepo: boolean
  relativeWorkspacePath: string | null
  workspaceDepth: number
}

type DisplayGroup = {
  id: string
  name: string
  path: string | null
  repos: DisplayRepo[]
}

type WorkspaceDropPlacement = 'before' | 'after'

type DragEntity =
  | {
      kind: 'workspace'
      id: string
      groupId: string
    }
  | {
      kind: 'repo'
      id: string
      groupId: string
    }

type DragTarget =
  | {
      kind: 'workspace'
      id: string
      placement: WorkspaceDropPlacement
    }
  | {
      kind: 'repo'
      id: string
      groupId: string
    }
  | {
      kind: 'workspace-body'
      groupId: string
    }

type RectLike = {
  left: number
  right: number
  top: number
  bottom: number
}

type RepoDragGroupSnapshot = {
  id: string
  workspaceRect: RectLike | null
  bodyRect: RectLike | null
  repos: Array<{
    id: string
    rect: RectLike | null
  }>
}

function isPointWithinRect(rect: RectLike, clientX: number, clientY: number): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  )
}

export function buildGitWorklogOverviewGroups(options: {
  configuredRepositories: GitWorklogRepositoryDto[]
  runtimeRepos: GitWorklogStateDto['repos']
  availableWorkspaces: GitWorklogWorkspaceDto[]
  effectiveRepositoryOrder: string[]
  effectiveWorkspaceOrder: string[]
  externalWorkspaceGroupTitle: string
}): DisplayGroup[] {
  const {
    configuredRepositories,
    runtimeRepos,
    availableWorkspaces,
    effectiveRepositoryOrder,
    effectiveWorkspaceOrder,
    externalWorkspaceGroupTitle,
  } = options
  const runtimeRepoByPath = new Map(
    runtimeRepos.map(repo => [normalizeRepoPathForCompare(repo.path), repo] as const),
  )
  const workspaceById = new Map(
    availableWorkspaces.map(workspace => [workspace.id, workspace] as const),
  )
  const mergedRepos: DisplayRepo[] = configuredRepositories.map(repository => {
    const normalizedPath = normalizeRepoPathForCompare(repository.path)
    const runtimeRepo = runtimeRepoByPath.get(normalizedPath)
    const label = repository.label.trim().length > 0 ? repository.label : repository.id
    const explicitlyExternal =
      repository.assignedWorkspaceId === GIT_WORKLOG_EXTERNAL_WORKSPACE_ID
    const assignedWorkspace =
      !explicitlyExternal &&
      repository.assignedWorkspaceId &&
      workspaceById.has(repository.assignedWorkspaceId)
        ? workspaceById.get(repository.assignedWorkspaceId) ?? null
        : null
    const presentationWorkspace =
      explicitlyExternal
        ? null
        : assignedWorkspace ?? inferPresentationWorkspace(repository.path, availableWorkspaces)

    return {
      ...(runtimeRepo ?? {
        repoId: repository.id,
        label,
        path: repository.path,
        origin: 'manual' as const,
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
        lastScannedAt: null,
        error: null,
      }),
      repoId: repository.id,
      label,
      path: repository.path,
      parentWorkspaceId: presentationWorkspace?.id ?? null,
      parentWorkspaceName: presentationWorkspace?.name ?? null,
      parentWorkspacePath: presentationWorkspace?.path ?? null,
      configuredRepositoryId: repository.id,
      isConfiguredEnabled: repository.enabled,
      hasRuntimeData: runtimeRepo !== undefined,
      isWorkspaceRootRepo: false,
      relativeWorkspacePath: null,
      workspaceDepth: 0,
    }
  })

  const groups = new Map<string, DisplayGroup>()
  for (const repo of mergedRepos) {
    const key = repo.parentWorkspaceId ?? GIT_WORKLOG_EXTERNAL_WORKSPACE_ID
    const current = groups.get(key)
    if (current) {
      current.repos.push(repo)
      continue
    }

    groups.set(key, {
      id: key,
      name: repo.parentWorkspaceName ?? externalWorkspaceGroupTitle,
      path: repo.parentWorkspacePath,
      repos: [repo],
    })
  }

  if (!groups.has(GIT_WORKLOG_EXTERNAL_WORKSPACE_ID)) {
    groups.set(GIT_WORKLOG_EXTERNAL_WORKSPACE_ID, {
      id: GIT_WORKLOG_EXTERNAL_WORKSPACE_ID,
      name: externalWorkspaceGroupTitle,
      path: null,
      repos: [],
    })
  }

  const groupRepositoryOrder = new Map<string, string[]>()
  for (const group of groups.values()) {
    groupRepositoryOrder.set(
      group.id,
      effectiveRepositoryOrder.filter(repoId => group.repos.some(repo => repo.repoId === repoId)),
    )
  }

  const normalizedGroups = [...groups.values()].map(group => {
    const preparedRepos = group.repos.map(repo => {
      const relativeWorkspacePath = getRelativeRepoPath(repo.path, group.path)
      const workspaceDepth =
        relativeWorkspacePath?.split('/').filter(segment => segment.length > 0).length ?? 0

      return {
        ...repo,
        relativeWorkspacePath,
        workspaceDepth,
        isWorkspaceRootRepo: group.path
          ? normalizeRepoPathForCompare(repo.path) === normalizeRepoPathForCompare(group.path)
          : false,
      }
    })

    const fallbackRepos = [...preparedRepos].sort((left, right) => {
      const rootRank = Number(right.isWorkspaceRootRepo) - Number(left.isWorkspaceRootRepo)
      if (rootRank !== 0) {
        return rootRank
      }

      if (left.workspaceDepth !== right.workspaceDepth) {
        return left.workspaceDepth - right.workspaceDepth
      }

      const enabledRank =
        Number(right.isConfiguredEnabled ?? false) - Number(left.isConfiguredEnabled ?? false)
      if (enabledRank !== 0) {
        return enabledRank
      }

      if (left.origin !== right.origin) {
        return left.origin === 'manual' ? -1 : 1
      }

      return left.label.localeCompare(right.label, undefined, {
        sensitivity: 'base',
      })
    })

    const orderedRepoIds = groupRepositoryOrder.get(group.id) ?? []
    const preparedRepoById = new Map(preparedRepos.map(repo => [repo.repoId, repo] as const))
    const repos: DisplayRepo[] = []
    const seenRepoIds = new Set<string>()

    for (const repoId of orderedRepoIds) {
      const repo = preparedRepoById.get(repoId)
      if (!repo || seenRepoIds.has(repoId)) {
        continue
      }

      seenRepoIds.add(repoId)
      repos.push(repo)
    }

    for (const repo of fallbackRepos) {
      if (seenRepoIds.has(repo.repoId)) {
        continue
      }

      seenRepoIds.add(repo.repoId)
      repos.push(repo)
    }

    return {
      ...group,
      repos,
    }
  })

  const fallbackGroups = [...normalizedGroups].sort((left, right) => {
    if (left.path === null && right.path !== null) {
      return 1
    }
    if (left.path !== null && right.path === null) {
      return -1
    }

    return left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
    })
  })

  const groupById = new Map(normalizedGroups.map(group => [group.id, group] as const))
  const orderedGroups: DisplayGroup[] = []
  const seenGroupIds = new Set<string>()

  for (const groupId of effectiveWorkspaceOrder) {
    const group = groupById.get(groupId)
    if (!group || seenGroupIds.has(groupId)) {
      continue
    }

    seenGroupIds.add(groupId)
    orderedGroups.push(group)
  }

  for (const group of fallbackGroups) {
    if (seenGroupIds.has(group.id)) {
      continue
    }

    seenGroupIds.add(group.id)
    orderedGroups.push(group)
  }

  return orderedGroups
}

export function resolveRepoDragTargetFromSnapshots(options: {
  activeRepoId: string
  clientX: number
  clientY: number
  groups: RepoDragGroupSnapshot[]
}): DragTarget | null {
  const { activeRepoId, clientX, clientY, groups } = options

  for (const group of groups) {
    for (const repo of group.repos) {
      if (repo.id === activeRepoId || !repo.rect) {
        continue
      }

      if (isPointWithinRect(repo.rect, clientX, clientY)) {
        return {
          kind: 'repo',
          id: repo.id,
          groupId: group.id,
        }
      }
    }
  }

  for (const group of groups) {
    if (group.bodyRect && isPointWithinRect(group.bodyRect, clientX, clientY)) {
      return {
        kind: 'workspace-body',
        groupId: group.id,
      }
    }
  }

  for (const group of groups) {
    if (group.workspaceRect && isPointWithinRect(group.workspaceRect, clientX, clientY)) {
      return {
        kind: 'workspace-body',
        groupId: group.id,
      }
    }
  }

  return null
}

export function GitWorklogOverview({
  isPluginEnabled,
  state,
  onRefresh,
  configuredRepositories,
  repositoryOrder,
  workspaceOrder,
  availableWorkspaces,
  onAddRepository,
  onManageRepository,
  onConvertAutoRepoToManual,
  onIgnoreAutoRepo,
  onChangeWorkspaceOrder,
  onChangeRepositoryOrder,
  onMoveRepositoryToWorkspaceGroup,
}: {
  isPluginEnabled: boolean
  state: GitWorklogStateDto
  onRefresh: () => void
  configuredRepositories: GitWorklogRepositoryDto[]
  repositoryOrder: string[]
  workspaceOrder: string[]
  availableWorkspaces?: GitWorklogWorkspaceDto[]
  onAddRepository?: () => void
  onManageRepository?: (repositoryId: string) => void
  onConvertAutoRepoToManual?: (repo: GitWorklogAutoCandidateDto) => void
  onIgnoreAutoRepo?: (repo: { label: string; path: string }) => void
  onChangeWorkspaceOrder?: (workspaceOrder: string[]) => void
  onChangeRepositoryOrder?: (repositoryOrder: string[]) => void
  onMoveRepositoryToWorkspaceGroup?: (
    repositoryId: string,
    workspaceId: string | null,
    anchorRepositoryId: string | null,
  ) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const statusText = t(`pluginManager.plugins.gitWorklog.runtimeStatus.${state.status}`)
  const normalizedOrdering = React.useMemo(
    () =>
      reconcileGitWorklogSettingsOrdering({
        repositories: configuredRepositories,
        repositoryOrder,
        workspaceOrder,
        ignoredAutoRepositoryPaths: [],
        autoImportedWorkspacePaths: [],
        dismissedWorkspacePaths: [],
        authorFilter: '',
        rangeMode: 'recent_days',
        recentDays: 7,
        rangeStartDay: '',
        rangeEndDay: '',
        autoRefreshEnabled: false,
        refreshIntervalMs: 60_000,
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 3,
      }),
    [configuredRepositories, repositoryOrder, workspaceOrder],
  )
  const effectiveRepositoryOrder = normalizedOrdering.repositoryOrder
  const effectiveWorkspaceOrder = normalizedOrdering.workspaceOrder

  const groupedRepos = React.useMemo<DisplayGroup[]>(() => {
    return buildGitWorklogOverviewGroups({
      configuredRepositories,
      runtimeRepos: state.repos,
      availableWorkspaces: availableWorkspaces ?? [],
      effectiveRepositoryOrder,
      effectiveWorkspaceOrder,
      externalWorkspaceGroupTitle: t(
        'pluginManager.plugins.gitWorklog.externalWorkspaceGroupTitle',
      ),
    })
  }, [
    availableWorkspaces,
    configuredRepositories,
    effectiveRepositoryOrder,
    effectiveWorkspaceOrder,
    state.repos,
    t,
  ])

  const totalMonitoredRepositories = React.useMemo(
    () => groupedRepos.reduce((sum, group) => sum + group.repos.length, 0),
    [groupedRepos],
  )

  const [draggedEntity, setDraggedEntity] = React.useState<DragEntity | null>(null)
  const [dragTarget, setDragTarget] = React.useState<DragTarget | null>(null)
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 })
  const pendingPointerDownRef = React.useRef<{
    entity: DragEntity
    startX: number
    startY: number
    startedDragging: boolean
  } | null>(null)
  const draggedEntityRef = React.useRef<DragEntity | null>(null)
  const dragTargetRef = React.useRef<DragTarget | null>(null)
  const suppressClickRef = React.useRef(false)
  const workspaceRefs = React.useRef(new Map<string, HTMLElement>())
  const workspaceBodyRefs = React.useRef(new Map<string, HTMLElement>())
  const repoRefs = React.useRef(new Map<string, HTMLElement>())

  const setDraggedEntityState = React.useCallback((entity: DragEntity | null) => {
    draggedEntityRef.current = entity
    setDraggedEntity(entity)
  }, [])

  const setDragTargetState = React.useCallback((target: DragTarget | null) => {
    dragTargetRef.current = target
    setDragTarget(target)
  }, [])

  const registerWorkspaceRef = React.useCallback((groupId: string, node: HTMLElement | null) => {
    if (node) {
      workspaceRefs.current.set(groupId, node)
      return
    }

    workspaceRefs.current.delete(groupId)
  }, [])

  const registerWorkspaceBodyRef = React.useCallback(
    (groupId: string, node: HTMLElement | null) => {
      if (node) {
        workspaceBodyRefs.current.set(groupId, node)
        return
      }

      workspaceBodyRefs.current.delete(groupId)
    },
    [],
  )

  const registerRepoRef = React.useCallback((repoId: string, node: HTMLElement | null) => {
    if (node) {
      repoRefs.current.set(repoId, node)
      return
    }

    repoRefs.current.delete(repoId)
  }, [])

  const resolveDragTarget = React.useCallback(
    (clientX: number, clientY: number): DragTarget | null => {
      const activeDrag = draggedEntityRef.current
      if (!activeDrag) {
        return null
      }

      if (activeDrag.kind === 'workspace') {
        let nearest: DragTarget | null = null
        let nearestDistance = Number.POSITIVE_INFINITY

        for (const group of groupedRepos) {
          const element = workspaceRefs.current.get(group.id)
          if (!element) {
            continue
          }

          const rect = element.getBoundingClientRect()
          const midY = rect.top + rect.height / 2
          const placement: WorkspaceDropPlacement = clientY < midY ? 'before' : 'after'
          const distance =
            clientY >= rect.top && clientY <= rect.bottom
              ? 0
              : Math.abs(clientY - midY)

          if (distance < nearestDistance) {
            nearestDistance = distance
            nearest = {
              kind: 'workspace',
              id: group.id,
              placement,
            }
          }
        }

        return nearest
      }

      return resolveRepoDragTargetFromSnapshots({
        activeRepoId: activeDrag.id,
        clientX,
        clientY,
        groups: groupedRepos.map(group => ({
          id: group.id,
          workspaceRect: workspaceRefs.current.get(group.id)?.getBoundingClientRect() ?? null,
          bodyRect: workspaceBodyRefs.current.get(group.id)?.getBoundingClientRect() ?? null,
          repos: group.repos.map(repo => ({
            id: repo.repoId,
            rect: repoRefs.current.get(repo.repoId)?.getBoundingClientRect() ?? null,
          })),
        })),
      })
    },
    [groupedRepos],
  )

  const resetDragState = React.useCallback(() => {
    pendingPointerDownRef.current = null
    setDraggedEntityState(null)
    setDragTargetState(null)
    setDragOffset({ x: 0, y: 0 })
  }, [setDragTargetState, setDraggedEntityState])

  const finishDrag = React.useCallback(() => {
    const pending = pendingPointerDownRef.current
    const activeDrag = draggedEntityRef.current
    const currentTarget = dragTargetRef.current

    resetDragState()

    if (!pending?.startedDragging || !activeDrag || !currentTarget) {
      return
    }

    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)

    if (activeDrag.kind === 'workspace' && currentTarget.kind === 'workspace') {
      if (!onChangeWorkspaceOrder || activeDrag.id === currentTarget.id) {
        return
      }

      const nextOrder = reorderWorkspaceGroups(
        groupedRepos.map(group => group.id),
        activeDrag.id,
        currentTarget.id,
      )
      onChangeWorkspaceOrder(nextOrder)
      return
    }

    if (activeDrag.kind !== 'repo') {
      return
    }

    if (currentTarget.kind === 'repo') {
      if (currentTarget.id !== activeDrag.id && onChangeRepositoryOrder) {
        const nextOrder = reorderRepositoriesWithinOrder(
          groupedRepos.flatMap(group => group.repos.map(repo => repo.repoId)),
          activeDrag.id,
          currentTarget.id,
        )
        onChangeRepositoryOrder(nextOrder)
      }

      if (
        onMoveRepositoryToWorkspaceGroup &&
        currentTarget.groupId !== activeDrag.groupId
      ) {
        onMoveRepositoryToWorkspaceGroup(
          activeDrag.id,
          currentTarget.groupId === GIT_WORKLOG_EXTERNAL_WORKSPACE_ID
            ? null
            : currentTarget.groupId,
          currentTarget.id,
        )
      }
      return
    }

    if (currentTarget.kind === 'workspace-body' && onMoveRepositoryToWorkspaceGroup) {
      const targetGroup = groupedRepos.find(group => group.id === currentTarget.groupId) ?? null
      const anchorRepositoryId = targetGroup?.repos.at(-1)?.repoId ?? null
      onMoveRepositoryToWorkspaceGroup(
        activeDrag.id,
        currentTarget.groupId === GIT_WORKLOG_EXTERNAL_WORKSPACE_ID
          ? null
          : currentTarget.groupId,
        anchorRepositoryId,
      )
    }
  }, [
    groupedRepos,
    onChangeRepositoryOrder,
    onChangeWorkspaceOrder,
    onMoveRepositoryToWorkspaceGroup,
    resetDragState,
  ])

  React.useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const pending = pendingPointerDownRef.current
      if (!pending) {
        return
      }

      const movedDistance = Math.hypot(
        event.clientX - pending.startX,
        event.clientY - pending.startY,
      )
      if (!pending.startedDragging && movedDistance < REPO_DRAG_START_DISTANCE_PX) {
        return
      }

      if (!pending.startedDragging) {
        pending.startedDragging = true
        setDraggedEntityState(pending.entity)
      }

      setDragOffset({
        x: event.clientX - pending.startX,
        y: event.clientY - pending.startY,
      })
      setDragTargetState(resolveDragTarget(event.clientX, event.clientY))
    }

    const handleWindowMouseUp = () => {
      finishDrag()
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [finishDrag, resolveDragTarget, setDragTargetState, setDraggedEntityState])

  const handlePointerDown = React.useCallback(
    (entity: DragEntity, event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return
      }

      pendingPointerDownRef.current = {
        entity,
        startX: event.clientX,
        startY: event.clientY,
        startedDragging: false,
      }
      setDragTargetState(null)
    },
    [setDragTargetState],
  )

  return (
    <div className="git-worklog-overview-layout">
      <section className="git-worklog-overview" data-testid="git-worklog-overview">
        <div className="git-worklog-overview__header">
          <div className="git-worklog-overview__headline">
            <h4>{t('pluginManager.plugins.gitWorklog.overviewTitle')}</h4>
          </div>

          <div className="git-worklog-overview__toolbar">
            <span
              className={`git-worklog-overview__status-pill git-worklog-overview__status-pill--${state.status}`}
            >
              {statusText}
            </span>
            <span className="git-worklog-overview__meta-pill">
              {t('pluginManager.plugins.gitWorklog.lastUpdated', {
                value: formatLastUpdated(state.lastUpdatedAt),
              })}
            </span>
            <button
              type="button"
              className="cove-window__action cove-window__action--secondary git-worklog-overview__refresh"
              data-testid="git-worklog-add-repository"
              onClick={onAddRepository}
            >
              {t('pluginManager.plugins.gitWorklog.addRepository')}
            </button>
            <button
              type="button"
              className="cove-window__action cove-window__action--secondary git-worklog-overview__refresh"
              data-testid="git-worklog-refresh"
              onClick={onRefresh}
              disabled={!isPluginEnabled || state.isRefreshing}
            >
              {state.isRefreshing
                ? t('pluginManager.plugins.gitWorklog.refreshing')
                : t('pluginManager.plugins.gitWorklog.refreshNow')}
            </button>
          </div>
        </div>

        {state.lastError ? (
          <div className="git-worklog-overview__banner git-worklog-overview__banner--error">
            <strong>{t('pluginManager.plugins.gitWorklog.lastErrorTitle')}</strong>
            <span>{state.lastError.message}</span>
          </div>
        ) : null}

        <div className="git-worklog-overview__metrics">
          <MetricCard
            label={t('pluginManager.plugins.gitWorklog.metrics.additionsToday')}
            value={formatGitWorklogCount(state.overview.additionsToday)}
            tone="positive"
          />
          <MetricCard
            label={t('pluginManager.plugins.gitWorklog.metrics.deletionsToday')}
            value={formatGitWorklogCount(state.overview.deletionsToday)}
            tone="negative"
          />
          <MetricCard
            label={t('pluginManager.plugins.gitWorklog.metrics.changedLinesInRange')}
            value={formatGitWorklogCount(state.overview.changedLinesInRange)}
          />
          <MetricCard
            label={t('pluginManager.plugins.gitWorklog.metrics.totalCodeLines')}
            value={formatGitWorklogCount(state.overview.totalCodeLines)}
          />
        </div>
        <div className="git-worklog-overview__insights">
          <GitWorklogSummaryTrend points={state.overview.dailyPoints} />
        </div>

        <div className="git-worklog-overview__heatmap-row">
          <GitWorklogHeatmap points={state.overview.heatmapDailyPoints} />
        </div>
      </section>

      <section
        className="git-worklog-overview__repo-monitor"
        data-testid="git-worklog-overview-repos"
      >
        <div className="git-worklog-overview__repo-monitor-head">
          <strong>{t('pluginManager.plugins.gitWorklog.repositoriesTitle')}</strong>
          <span>
            {t('pluginManager.plugins.gitWorklog.repositoriesTotalSummary', {
              count: totalMonitoredRepositories,
            })}
          </span>
        </div>

        {groupedRepos.length > 0 ? (
          <div className="git-worklog-overview__workspace-list">
            {groupedRepos.map(group => {
              const healthyRepos = group.repos.filter(
                repo => repo.error === null && repo.hasRuntimeData,
              )
              const commitCount = healthyRepos.reduce((sum, repo) => sum + repo.commitCountToday, 0)
              const changedLines = healthyRepos.reduce(
                (sum, repo) => sum + repo.changedLinesToday,
                0,
              )

              return (
                <article
                  key={group.id}
                  ref={node => {
                    registerWorkspaceRef(group.id, node)
                  }}
                  className={`git-worklog-overview__workspace-card${
                    draggedEntity?.kind === 'workspace' && draggedEntity.id === group.id
                      ? ' git-worklog-overview__workspace-card--dragging'
                      : ''
                  }${
                    dragTarget?.kind === 'workspace' && dragTarget.id === group.id
                      ? ' git-worklog-overview__workspace-card--drop-target'
                      : ''
                  }${
                    draggedEntity?.kind === 'repo' &&
                    dragTarget?.kind === 'workspace-body' &&
                    dragTarget.groupId === group.id
                      ? ' git-worklog-overview__workspace-card--repo-drop-target'
                      : ''
                  }${
                    group.id === GIT_WORKLOG_EXTERNAL_WORKSPACE_ID
                      ? ' git-worklog-overview__workspace-card--external'
                      : ''
                  }`}
                  data-testid={`git-worklog-workspace-card-${group.id}`}
                  data-group-kind={
                    group.id === GIT_WORKLOG_EXTERNAL_WORKSPACE_ID ? 'external' : 'workspace'
                  }
                  data-drop-placement={
                    dragTarget?.kind === 'workspace' && dragTarget.id === group.id
                      ? dragTarget.placement
                      : undefined
                  }
                  style={
                    draggedEntity?.kind === 'workspace' && draggedEntity.id === group.id
                      ? ({
                          '--git-worklog-drag-offset-x': `${dragOffset.x}px`,
                          '--git-worklog-drag-offset-y': `${dragOffset.y}px`,
                        } as React.CSSProperties)
                      : undefined
                  }
                  onMouseDown={event => {
                    handlePointerDown(
                      {
                        kind: 'workspace',
                        id: group.id,
                        groupId: group.id,
                      },
                      event,
                    )
                  }}
                >
                  <div className="git-worklog-overview__workspace-head">
                    <div className="git-worklog-overview__workspace-copy">
                      {group.path ? (
                        <span className="git-worklog-overview__workspace-eyebrow">
                          {t('pluginManager.plugins.gitWorklog.workspaceGroupLabel')}
                        </span>
                      ) : null}
                      <strong>{group.name}</strong>
                      <span title={group.path ?? undefined}>
                        {group.path ??
                          t('pluginManager.plugins.gitWorklog.externalWorkspaceGroupSummary', {
                            count: group.repos.length,
                          })}
                      </span>
                    </div>
                    <div className="git-worklog-overview__workspace-metrics">
                      <span>
                        {t('pluginManager.plugins.gitWorklog.workspaceMetrics.repos', {
                          count: group.repos.length,
                        })}
                      </span>
                      <span>
                        {t('pluginManager.plugins.gitWorklog.workspaceMetrics.commits', {
                          count: commitCount,
                        })}
                      </span>
                      <span>
                        {t('pluginManager.plugins.gitWorklog.workspaceMetrics.changedLines', {
                          count: changedLines,
                        })}
                      </span>
                    </div>
                  </div>

                  <div
                    ref={node => {
                      registerWorkspaceBodyRef(group.id, node)
                    }}
                    className={`git-worklog-overview__repo-list${
                      dragTarget?.kind === 'workspace-body' && dragTarget.groupId === group.id
                        ? ' git-worklog-overview__repo-list--drop-target'
                        : ''
                    }`}
                  >
                    {group.repos.length > 0 ? (
                      group.repos.map(repo => {
                        const hasError = repo.error !== null
                        const errorMessage = repo.error?.message ?? ''
                        const configuredRepositoryId = repo.configuredRepositoryId
                        const repoOriginLabel =
                          repo.origin === 'auto'
                            ? t('pluginManager.plugins.gitWorklog.repoOriginAuto')
                            : t('pluginManager.plugins.gitWorklog.repoOriginManual')

                        return (
                          <article
                            ref={node => {
                              registerRepoRef(repo.repoId, node)
                            }}
                            key={repo.repoId}
                            className={`git-worklog-overview__repo-row${hasError ? ' git-worklog-overview__repo-row--error' : ''}${repo.isWorkspaceRootRepo ? ' git-worklog-overview__repo-row--root' : ''}${
                              draggedEntity?.kind === 'repo' && draggedEntity.id === repo.repoId
                                ? ' git-worklog-overview__repo-row--dragging'
                                : ''
                            }${
                              dragTarget?.kind === 'repo' && dragTarget.id === repo.repoId
                                ? ' git-worklog-overview__repo-row--drop-target'
                                : ''
                            }`}
                            data-testid={`git-worklog-repo-card-${repo.repoId}`}
                            onMouseDown={event => {
                              event.stopPropagation()
                              handlePointerDown(
                                {
                                  kind: 'repo',
                                  id: repo.repoId,
                                  groupId: group.id,
                                },
                                event,
                              )
                            }}
                            style={
                              draggedEntity?.kind === 'repo' && draggedEntity.id === repo.repoId
                                ? ({
                                    '--git-worklog-drag-offset-x': `${dragOffset.x}px`,
                                    '--git-worklog-drag-offset-y': `${dragOffset.y}px`,
                                  } as React.CSSProperties)
                                : undefined
                            }
                          >
                            <div className="git-worklog-overview__repo-top">
                              <div className="git-worklog-overview__repo-main">
                                <div className="git-worklog-overview__repo-copy">
                                  <div className="git-worklog-overview__repo-title-row">
                                    <strong>{repo.label}</strong>
                                    <span
                                      className={`git-worklog-overview__role-pill${repo.isWorkspaceRootRepo ? ' git-worklog-overview__role-pill--root' : ''}`}
                                    >
                                      {repo.isWorkspaceRootRepo
                                        ? t('pluginManager.plugins.gitWorklog.repoRoleRoot')
                                        : t('pluginManager.plugins.gitWorklog.repoRoleChild')}
                                    </span>
                                  </div>
                                  <span title={repo.path}>{repo.path}</span>
                                </div>

                                <div className="git-worklog-overview__repo-meta-row">
                                  <span
                                    className={`git-worklog-overview__origin-pill${repo.origin === 'manual' ? ' git-worklog-overview__origin-pill--manual' : ''}`}
                                  >
                                    {repoOriginLabel}
                                  </span>
                                  {repo.isConfiguredEnabled !== null ? (
                                    <span
                                      className={`git-worklog-overview__config-pill${repo.isConfiguredEnabled ? '' : ' git-worklog-overview__config-pill--muted'}`}
                                    >
                                      {repo.isConfiguredEnabled
                                        ? t(
                                            'pluginManager.plugins.gitWorklog.repositoryStatusEnabled',
                                          )
                                        : t(
                                            'pluginManager.plugins.gitWorklog.repositoryStatusDisabled',
                                          )}
                                    </span>
                                  ) : null}
                                  {repo.relativeWorkspacePath ? (
                                    <span className="git-worklog-overview__repo-meta-pill">
                                      {t('pluginManager.plugins.gitWorklog.repoRelativePathLabel', {
                                        path: repo.relativeWorkspacePath,
                                      })}
                                    </span>
                                  ) : null}
                                  <span className="git-worklog-overview__repo-meta-pill">
                                    {t(
                                      'pluginManager.plugins.gitWorklog.overviewColumns.lastScanned',
                                    )}
                                    {': '}
                                    {formatLastUpdated(repo.lastScannedAt)}
                                  </span>
                                </div>
                              </div>

                              {configuredRepositoryId && onManageRepository ? (
                                <div className="git-worklog-overview__repo-actions-panel">
                                  <div className="git-worklog-overview__repo-actions">
                                    <button
                                      type="button"
                                      className="cove-window__action cove-window__action--secondary"
                                      data-testid={`git-worklog-manage-repository-${configuredRepositoryId}`}
                                      onMouseDown={event => {
                                        event.stopPropagation()
                                      }}
                                      onClick={() => {
                                        if (suppressClickRef.current) {
                                          return
                                        }
                                        onManageRepository(configuredRepositoryId)
                                      }}
                                    >
                                      {t('pluginManager.plugins.gitWorklog.manageRepositoryAction')}
                                    </button>
                                  </div>
                                </div>
                              ) : repo.origin === 'auto' &&
                                (onConvertAutoRepoToManual || onIgnoreAutoRepo) ? (
                                <div className="git-worklog-overview__repo-actions-panel">
                                  <div className="git-worklog-overview__repo-actions">
                                    {onConvertAutoRepoToManual ? (
                                      <button
                                        type="button"
                                        className="cove-window__action cove-window__action--secondary"
                                        data-testid={`git-worklog-repo-convert-${repo.repoId}`}
                                        onMouseDown={event => {
                                          event.stopPropagation()
                                        }}
                                        onClick={() => {
                                          if (suppressClickRef.current) {
                                            return
                                          }
                                          onConvertAutoRepoToManual({
                                            id: repo.repoId,
                                            label: repo.label,
                                            path: repo.path,
                                            parentWorkspaceId:
                                              group.id === GIT_WORKLOG_EXTERNAL_WORKSPACE_ID
                                                ? null
                                                : group.id,
                                          parentWorkspaceName:
                                              group.id === GIT_WORKLOG_EXTERNAL_WORKSPACE_ID
                                                ? null
                                                : group.name,
                                            parentWorkspacePath: group.path,
                                            detectedAt: repo.lastScannedAt,
                                          })
                                        }}
                                      >
                                        {t(
                                          'pluginManager.plugins.gitWorklog.convertAutoRepoAction',
                                        )}
                                      </button>
                                    ) : null}
                                    {onIgnoreAutoRepo ? (
                                      <button
                                        type="button"
                                        className="cove-window__action cove-window__action--secondary"
                                        data-testid={`git-worklog-repo-ignore-${repo.repoId}`}
                                        onMouseDown={event => {
                                          event.stopPropagation()
                                        }}
                                        onClick={() => {
                                          if (suppressClickRef.current) {
                                            return
                                          }
                                          onIgnoreAutoRepo({
                                            label: repo.label,
                                            path: repo.path,
                                          })
                                        }}
                                      >
                                        {t('pluginManager.plugins.gitWorklog.ignoreAutoRepoAction')}
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="git-worklog-overview__repo-body">
                              <div className="git-worklog-overview__repo-stats">
                                <RepoStat
                                  label={t(
                                    'pluginManager.plugins.gitWorklog.repoMetrics.additionsToday',
                                  )}
                                  value={formatRepoMetricValue(repo.additionsToday, {
                                    hasError,
                                    hasRuntimeData: repo.hasRuntimeData,
                                  })}
                                />
                                <RepoStat
                                  label={t(
                                    'pluginManager.plugins.gitWorklog.repoMetrics.deletionsToday',
                                  )}
                                  value={formatRepoMetricValue(repo.deletionsToday, {
                                    hasError,
                                    hasRuntimeData: repo.hasRuntimeData,
                                  })}
                                />
                                <RepoStat
                                  label={t(
                                    'pluginManager.plugins.gitWorklog.repoMetrics.changedLinesInRange',
                                  )}
                                  value={formatRepoMetricValue(repo.changedLinesInRange, {
                                    hasError,
                                    hasRuntimeData: repo.hasRuntimeData,
                                  })}
                                />
                              </div>

                              <GitWorklogMiniTrend points={repo.dailyPoints} repoId={repo.repoId} />
                            </div>

                            {hasError ? (
                              <div className="git-worklog-overview__repo-row-detail">
                                <p className="git-worklog-overview__repo-error">{errorMessage}</p>
                              </div>
                            ) : null}
                          </article>
                        )
                      })
                    ) : (
                      <div
                        className="git-worklog-overview__repo-placeholder"
                        data-testid={`git-worklog-empty-group-${group.id}`}
                      >
                        <strong>
                          {t('pluginManager.plugins.gitWorklog.emptyGroupPlaceholderTitle')}
                        </strong>
                        <span>
                          {t('pluginManager.plugins.gitWorklog.emptyGroupPlaceholderBody')}
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="git-worklog-overview__banner">
            <strong>{t('pluginManager.plugins.gitWorklog.overviewEmptyTitle')}</strong>
            <span>{t('pluginManager.plugins.gitWorklog.overviewEmptyBody')}</span>
          </div>
        )}
      </section>
    </div>
  )
}
