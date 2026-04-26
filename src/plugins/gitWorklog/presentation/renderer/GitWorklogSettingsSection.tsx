import React from 'react'
import { LoaderCircle } from 'lucide-react'
import type {
  GitWorklogAutoCandidateDto,
  GitWorklogPendingImportDto,
  GitWorklogRepositoryDto,
  GitWorklogSettingsDto,
  RepairGitWorklogRepositoriesResultDto,
} from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { SettingsPluginSectionProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { PluginSectionCard } from '../../../../contexts/plugins/presentation/renderer/PluginSectionCard'
import {
  createDefaultGitWorklogRepository,
  createNextGitWorklogRepositoryId,
} from '../../../../contexts/plugins/domain/gitWorklogSettings'
import { GitWorklogConfigurationDialog } from './GitWorklogConfigurationDialog'
import { GitWorklogOverview } from './GitWorklogOverview'
import { GitWorklogRepositoryDialog } from './GitWorklogRepositoryDialog'
import {
  appendRepositoryWithOrdering,
  GIT_WORKLOG_EXTERNAL_WORKSPACE_ID,
  inferAssignedWorkspaceId,
  moveRepositoryToWorkspaceGroup,
  normalizeRepoPathForCompare,
  reconcileGitWorklogSettingsOrdering,
  removeRepositoryWithOrdering,
  updateRepositoryWithOrdering,
} from './gitWorklogOrdering'
import { useGitWorklogState } from './useGitWorklogState'

type GitWorklogWorkspaceScanStatus =
  | 'pending'
  | 'dismissed'
  | 'managed'
  | 'empty'
  | 'error'

interface GitWorklogWorkspaceScanItem {
  workspaceId: string
  workspaceName: string
  workspacePath: string
  status: GitWorklogWorkspaceScanStatus
  managedRepositories: GitWorklogRepositoryDto[]
  pendingRepositories: GitWorklogPendingImportDto['repositories']
  pendingImportError: GitWorklogPendingImportDto['error']
  retryCount: number
}

type GitWorklogWorkspaceScanRow =
  | {
      type: 'workspace'
      id: string
      workspacePath: string
      workspaceName: string
      path: string
      status: GitWorklogWorkspaceScanStatus
      managedCount: number
      pendingCount: number
      errorDetail: string | null
      retryCount: number
    }
  | {
      type: 'repository'
      id: string
      workspacePath: string
      workspaceName: string
      path: string
      repositoryId: string | null
      repositoryLabel: string
      repositoryPath: string
      repositoryState: 'managed' | 'pending'
      assignedWorkspaceId: string | null
    }

interface GitWorklogConfiguredRepositoryRow {
  id: string
  repositoryId: string
  repositoryLabel: string
  repositoryPath: string
  assignedWorkspaceId: string | null
  assignedWorkspaceName: string | null
  assignmentMode: 'workspace' | 'base' | 'unmatched'
}

type GitWorklogRefreshTarget =
  | 'config'
  | `workspace:${string}`
  | `repository:${string}`
  | null

function updateGitWorklogSettings(
  settings: AgentSettings,
  onChange: (settings: AgentSettings) => void,
  updater: (current: GitWorklogSettingsDto) => GitWorklogSettingsDto,
): void {
  onChange({
    ...settings,
    plugins: {
      ...settings.plugins,
      gitWorklog: updater(settings.plugins.gitWorklog),
    },
  })
}

export default function GitWorklogSettingsSection({
  settings,
  onChange,
}: SettingsPluginSectionProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state, refresh, setState } = useGitWorklogState()
  const worklogSettings = settings.plugins.gitWorklog
  const isPluginEnabled = settings.plugins.enabledIds.includes('git-worklog')
  const [editingRepositoryId, setEditingRepositoryId] = React.useState<string | null>(null)
  const [isConfigurationDialogOpen, setIsConfigurationDialogOpen] = React.useState(false)
  const [refreshTarget, setRefreshTarget] = React.useState<GitWorklogRefreshTarget>(null)
  const [isRepairingRepositories, setIsRepairingRepositories] = React.useState(false)
  const [isUndoingRepositoryRepair, setIsUndoingRepositoryRepair] = React.useState(false)
  const [repairFeedback, setRepairFeedback] = React.useState<{
    tone: 'info' | 'error'
    text: string
  } | null>(null)
  const totalRepositoryCount = worklogSettings.repositories.length
  const enabledRepositoryCount = worklogSettings.repositories.filter(
    repository => repository.enabled,
  ).length

  const triggerRefresh = React.useCallback(
    async (target: Exclude<GitWorklogRefreshTarget, null>) => {
      setRefreshTarget(target)
      try {
        if (target.startsWith('workspace:')) {
          const workspacePath = target.slice('workspace:'.length)
          const api = window.freecliApi?.plugins?.gitWorklog
          if (typeof api?.refreshWorkspace === 'function') {
            const nextState = await api.refreshWorkspace({ workspacePath })
            setState(nextState)
          } else {
            await refresh()
          }
        } else {
          const nextState = await refresh()
          setState(nextState)
        }
      } catch {
        // Keep the renderer responsive and allow the user to retry immediately after a failed refresh.
      } finally {
        setRefreshTarget(current => (current === target ? null : current))
      }
    },
    [refresh],
  )

  const isRefreshBusy = React.useCallback(
    (target: Exclude<GitWorklogRefreshTarget, null>) =>
      state.isRefreshing || refreshTarget === target,
    [refreshTarget, state.isRefreshing],
  )

  const updateSettings = React.useCallback(
    (updater: (current: GitWorklogSettingsDto) => GitWorklogSettingsDto) => {
      updateGitWorklogSettings(settings, onChange, updater)
    },
    [onChange, settings],
  )

  const applyGitWorklogSettings = React.useCallback(
    (nextSettings: GitWorklogSettingsDto) => {
      onChange({
        ...settings,
        plugins: {
          ...settings.plugins,
          gitWorklog: nextSettings,
        },
      })
    },
    [onChange, settings],
  )

  const availableWorkspaceOptions = React.useMemo(
    () =>
      (state.availableWorkspaces ?? []).map(workspace => ({
        id: workspace.id,
        path: workspace.path,
      })),
    [state.availableWorkspaces],
  )

  const scanWorkspaceIdByRepositoryId = React.useMemo(() => {
    const mapping = new Map<string, string | null>()
    for (const repository of worklogSettings.repositories) {
      if (repository.assignedWorkspaceId === GIT_WORKLOG_EXTERNAL_WORKSPACE_ID) {
        mapping.set(repository.id, null)
        continue
      }

      if (repository.assignedWorkspaceId && repository.assignedWorkspaceId.trim().length > 0) {
        mapping.set(repository.id, repository.assignedWorkspaceId)
        continue
      }

      mapping.set(repository.id, inferAssignedWorkspaceId(repository.path, availableWorkspaceOptions))
    }
    return mapping
  }, [availableWorkspaceOptions, worklogSettings.repositories])

  const workspaceScanItems = React.useMemo<GitWorklogWorkspaceScanItem[]>(() => {
    const pendingImportsByWorkspacePath = new Map(
      (state.pendingImports ?? []).map(item => [
        normalizeRepoPathForCompare(item.workspacePath),
        item,
      ]),
    )
    const dismissedWorkspacePathSet = new Set(
      (state.dismissedImports ?? []).map(item => normalizeRepoPathForCompare(item.workspacePath)),
    )
    const workspaceEntries = new Map<
      string,
      { id: string; name: string; path: string }
    >()

    for (const workspace of state.availableWorkspaces ?? []) {
      workspaceEntries.set(normalizeRepoPathForCompare(workspace.path), {
        id: workspace.id,
        name: workspace.name,
        path: workspace.path,
      })
    }

    for (const pendingImport of state.pendingImports ?? []) {
      const normalizedWorkspacePath = normalizeRepoPathForCompare(pendingImport.workspacePath)
      if (!workspaceEntries.has(normalizedWorkspacePath)) {
        workspaceEntries.set(normalizedWorkspacePath, {
          id: pendingImport.workspaceId,
          name: pendingImport.workspaceName,
          path: pendingImport.workspacePath,
        })
      }
    }

    for (const dismissedImport of state.dismissedImports ?? []) {
      const normalizedWorkspacePath = normalizeRepoPathForCompare(dismissedImport.workspacePath)
      if (!workspaceEntries.has(normalizedWorkspacePath)) {
        workspaceEntries.set(normalizedWorkspacePath, {
          id: dismissedImport.workspaceId ?? normalizedWorkspacePath,
          name: dismissedImport.workspaceName,
          path: dismissedImport.workspacePath,
        })
      }
    }

    return [...workspaceEntries.values()]
      .map(workspace => {
        const normalizedWorkspacePath = normalizeRepoPathForCompare(workspace.path)
        const managedRepositories = worklogSettings.repositories.filter(
          repository =>
            repository.assignedWorkspaceId !== null &&
            repository.assignedWorkspaceId !== undefined &&
            repository.assignedWorkspaceId === workspace.id,
        )
        const pendingImport = pendingImportsByWorkspacePath.get(normalizedWorkspacePath)
        const dismissed = dismissedWorkspacePathSet.has(normalizedWorkspacePath)
        const status: GitWorklogWorkspaceScanStatus = pendingImport?.error
          ? 'error'
          : pendingImport
            ? 'pending'
          : dismissed
            ? 'dismissed'
            : managedRepositories.length > 0
              ? 'managed'
              : 'empty'

        return {
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          workspacePath: workspace.path,
          status,
          managedRepositories,
          pendingRepositories: pendingImport?.repositories ?? [],
          pendingImportError: pendingImport?.error ?? null,
          retryCount: pendingImport?.retryCount ?? 0,
        }
      })
      .sort((left, right) => left.workspaceName.localeCompare(right.workspaceName))
  }, [
    scanWorkspaceIdByRepositoryId,
    state.availableWorkspaces,
    state.dismissedImports,
    state.pendingImports,
    worklogSettings.repositories,
  ])

  const workspaceScanRows = React.useMemo<GitWorklogWorkspaceScanRow[]>(() => {
    return workspaceScanItems.flatMap(item => {
      const workspaceRow: GitWorklogWorkspaceScanRow = {
        type: 'workspace',
        id: `workspace:${item.workspaceId}`,
        workspacePath: item.workspacePath,
        workspaceName: item.workspaceName,
        path: item.workspacePath,
        status: item.status,
        managedCount: item.managedRepositories.length,
        pendingCount: item.pendingRepositories.length,
        errorDetail: item.pendingImportError?.detail ?? item.pendingImportError?.message ?? null,
        retryCount: item.retryCount,
      }

      const repositoryRows: GitWorklogWorkspaceScanRow[] = item.pendingRepositories
        .map(repository => ({
          type: 'repository' as const,
          id: `pending:${repository.id}`,
          workspacePath: item.workspacePath,
          workspaceName: item.workspaceName,
          path: repository.path,
          repositoryId: null,
          repositoryLabel: repository.label,
          repositoryPath: repository.path,
          repositoryState: 'pending' as const,
          assignedWorkspaceId: repository.parentWorkspaceId,
        }))
        .sort((left, right) => left.path.localeCompare(right.path))

      return [workspaceRow, ...repositoryRows]
    })
  }, [workspaceScanItems])

  const configuredRepositoryRows = React.useMemo<GitWorklogConfiguredRepositoryRow[]>(() => {
    const workspaceNameById = new Map(
      (state.availableWorkspaces ?? []).map(workspace => [workspace.id, workspace.name] as const),
    )

    return worklogSettings.repositories
      .map(repository => {
        const normalizedPath = normalizeRepoPathForCompare(repository.path)
        const explicitlyBase = repository.assignedWorkspaceId === '__external__'
        const matchedWorkspaceId = explicitlyBase
          ? null
          : repository.assignedWorkspaceId ?? scanWorkspaceIdByRepositoryId.get(repository.id) ?? null
        const assignedWorkspaceName = matchedWorkspaceId
          ? workspaceNameById.get(matchedWorkspaceId) ?? null
          : null
        const assignmentMode: GitWorklogConfiguredRepositoryRow['assignmentMode'] = explicitlyBase
          ? 'base'
          : matchedWorkspaceId
            ? 'workspace'
            : 'unmatched'

        return {
          id: `configured:${repository.id}:${normalizedPath}`,
          repositoryId: repository.id,
          repositoryLabel: repository.label,
          repositoryPath: repository.path,
          assignedWorkspaceId: matchedWorkspaceId,
          assignedWorkspaceName,
          assignmentMode,
        }
      })
      .sort((left, right) => left.repositoryPath.localeCompare(right.repositoryPath))
  }, [scanWorkspaceIdByRepositoryId, state.availableWorkspaces, worklogSettings.repositories])

  const handleRepairRepositories = React.useCallback(async () => {
    const api = window.freecliApi?.plugins?.gitWorklog
    if (typeof api?.repairRepositories !== 'function') {
      return
    }

    setIsRepairingRepositories(true)
    setRepairFeedback(null)
    try {
      const result = await api.repairRepositories({
        settings: worklogSettings,
        availableWorkspaces: state.availableWorkspaces ?? [],
      })
      applyGitWorklogSettings(result.repairedSettings)
      const changedCount = result.changedRepositories.length
      setRepairFeedback({
        tone: 'info',
        text:
          changedCount > 0
            ? t('pluginManager.plugins.gitWorklog.repairRepositoriesSuccess', {
                count: changedCount,
              })
            : t('pluginManager.plugins.gitWorklog.repairRepositoriesNoop'),
      })
    } catch {
      setRepairFeedback({
        tone: 'error',
        text: t('pluginManager.plugins.gitWorklog.repairRepositoriesFailed'),
      })
    } finally {
      setIsRepairingRepositories(false)
    }
  }, [applyGitWorklogSettings, state.availableWorkspaces, t, worklogSettings])

  const handleUndoRepositoryRepair = React.useCallback(async () => {
    const api = window.freecliApi?.plugins?.gitWorklog
    if (typeof api?.undoRepositoryRepair !== 'function') {
      return
    }

    setIsUndoingRepositoryRepair(true)
    setRepairFeedback(null)
    try {
      const result = await api.undoRepositoryRepair({
        settings: worklogSettings,
      })
      if (result.restored) {
        applyGitWorklogSettings(result.restoredSettings)
        setRepairFeedback({
          tone: 'info',
          text: t('pluginManager.plugins.gitWorklog.undoRepairRepositoriesSuccess'),
        })
      } else {
        setRepairFeedback({
          tone: 'error',
          text: t('pluginManager.plugins.gitWorklog.undoRepairRepositoriesUnavailable'),
        })
      }
    } catch {
      setRepairFeedback({
        tone: 'error',
        text: t('pluginManager.plugins.gitWorklog.undoRepairRepositoriesFailed'),
      })
    } finally {
      setIsUndoingRepositoryRepair(false)
    }
  }, [applyGitWorklogSettings, t, worklogSettings])

  const resolveRepositoryPath = React.useCallback(async (pathValue: string) => {
    const resolver = window.freecliApi?.plugins?.gitWorklog?.resolveRepository
    if (typeof resolver !== 'function') {
      return null
    }

    try {
      return await resolver({ path: pathValue })
    } catch {
      return null
    }
  }, [])

  const selectRepositoryDirectory = React.useCallback(
    async (repoId: string) => {
      const picker = window.freecliApi?.workspace?.selectDirectory
      if (typeof picker !== 'function') {
        return
      }

      const selected = await picker()
      if (!selected) {
        return
      }

      const resolved = await resolveRepositoryPath(selected.path)
      if (!resolved) {
        return
      }

      const assignedWorkspaceId = inferAssignedWorkspaceId(
        resolved.path,
        availableWorkspaceOptions,
      )

      updateSettings(current => ({
        ...updateRepositoryWithOrdering(current, repoId, repo => ({
          ...repo,
          path: resolved.path,
          origin: 'manual',
          assignedWorkspaceId,
          label:
            repo.label.trim().length === 0 ||
            repo.label === repo.id ||
            repo.label.startsWith('Repository ')
              ? resolved.label
              : repo.label,
        })),
      }))
    },
    [availableWorkspaceOptions, resolveRepositoryPath, updateSettings],
  )

  const convertAutoRepoToManual = React.useCallback(
    async (repo: GitWorklogAutoCandidateDto) => {
      const resolved = await resolveRepositoryPath(repo.path)
      if (!resolved) {
        return
      }

      updateSettings(current => {
        const normalizedTargetPath = normalizeRepoPathForCompare(resolved.path)
        const existingIndex = current.repositories.findIndex(
          candidate => normalizeRepoPathForCompare(candidate.path) === normalizedTargetPath,
        )
        const assignedWorkspaceId = inferAssignedWorkspaceId(
          resolved.path,
          availableWorkspaceOptions,
        )

        if (existingIndex >= 0) {
          return {
            ...updateRepositoryWithOrdering(
              current,
              current.repositories[existingIndex].id,
              candidate => ({
                ...candidate,
                enabled: true,
                path: resolved.path,
                origin: 'manual',
                assignedWorkspaceId,
                label:
                  candidate.label.trim().length === 0 ||
                  candidate.label === candidate.id ||
                  candidate.label.startsWith('Repository ')
                    ? resolved.label
                    : candidate.label,
              }),
            ),
          }
        }

        return appendRepositoryWithOrdering(current, {
          ...createDefaultGitWorklogRepository(current.repositories.length),
          id: createNextGitWorklogRepositoryId(current.repositories.map(repository => repository.id)),
          label: resolved.label,
          path: resolved.path,
          enabled: true,
          origin: 'manual',
          assignedWorkspaceId,
        })
      })
    },
    [availableWorkspaceOptions, resolveRepositoryPath, updateSettings],
  )

  const ignoreAutoRepo = React.useCallback(
    (repo: { path: string }) => {
      updateSettings(current => {
        const normalizedTargetPath = normalizeRepoPathForCompare(repo.path)
        const alreadyIgnored = current.ignoredAutoRepositoryPaths.some(
          candidate => normalizeRepoPathForCompare(candidate) === normalizedTargetPath,
        )

        if (alreadyIgnored) {
          return current
        }

        return {
          ...current,
          ignoredAutoRepositoryPaths: [...current.ignoredAutoRepositoryPaths, repo.path],
        }
      })
    },
    [updateSettings],
  )

  const confirmPendingImport = React.useCallback(
    async (pendingImport: GitWorklogPendingImportDto) => {
      const resolvedRepositories = await Promise.all(
        pendingImport.repositories.map(async repository => ({
          repository,
          resolved: await resolveRepositoryPath(repository.path),
        })),
      )

      updateSettings(current => {
        let nextSettings = current
        for (const entry of resolvedRepositories) {
          if (!entry.resolved) {
            continue
          }

          const normalizedTargetPath = normalizeRepoPathForCompare(entry.resolved.path)
          const existingIndex = nextSettings.repositories.findIndex(
            candidate => normalizeRepoPathForCompare(candidate.path) === normalizedTargetPath,
          )
          const assignedWorkspaceId = inferAssignedWorkspaceId(
            entry.resolved.path,
            availableWorkspaceOptions,
          )

          if (existingIndex >= 0) {
            nextSettings = {
              ...updateRepositoryWithOrdering(
                nextSettings,
                nextSettings.repositories[existingIndex].id,
                candidate => ({
                  ...candidate,
                  enabled: true,
                  path: entry.resolved.path,
                  origin: 'manual',
                  assignedWorkspaceId,
                  label:
                    candidate.label.trim().length === 0 ||
                    candidate.label === candidate.id ||
                    candidate.label.startsWith('Repository ')
                      ? entry.resolved.label
                      : candidate.label,
                }),
              ),
            }
            continue
          }

          nextSettings = appendRepositoryWithOrdering(nextSettings, {
            ...createDefaultGitWorklogRepository(nextSettings.repositories.length),
            id: createNextGitWorklogRepositoryId(
              nextSettings.repositories.map(repository => repository.id),
            ),
            label: entry.resolved.label,
            path: entry.resolved.path,
            enabled: true,
            origin: 'manual',
            assignedWorkspaceId,
          })
        }

        return nextSettings
      })
      const api = window.freecliApi?.plugins?.gitWorklog
      if (typeof api?.acceptPendingImport === 'function') {
        const nextState = await api.acceptPendingImport({ workspacePath: pendingImport.workspacePath })
        setState(nextState)
      } else {
        const nextState = await refresh()
        setState(nextState)
      }
    },
    [availableWorkspaceOptions, refresh, resolveRepositoryPath, setState, updateSettings],
  )

  const dismissPendingImport = React.useCallback(
    async (pendingImport: GitWorklogPendingImportDto) => {
      const api = window.freecliApi?.plugins?.gitWorklog
      if (typeof api?.dismissPendingImport === 'function') {
        const nextState = await api.dismissPendingImport({ workspacePath: pendingImport.workspacePath })
        setState(nextState)
      } else {
        const nextState = await refresh()
        setState(nextState)
      }
    },
    [refresh, setState],
  )

  const restoreDismissedImport = React.useCallback(
    async (workspacePath: string) => {
      const api = window.freecliApi?.plugins?.gitWorklog
      if (typeof api?.restoreDismissedImport === 'function') {
        const nextState = await api.restoreDismissedImport({ workspacePath })
        setState(nextState)
      } else {
        const nextState = await refresh()
        setState(nextState)
      }
    },
    [refresh, setState],
  )

  const restoreIgnoredAutoRepo = React.useCallback(
    (path: string) => {
      updateSettings(current => ({
        ...current,
        ignoredAutoRepositoryPaths: current.ignoredAutoRepositoryPaths.filter(
          candidate => normalizeRepoPathForCompare(candidate) !== normalizeRepoPathForCompare(path),
        ),
      }))
    },
    [updateSettings],
  )

  const editingRepository =
    worklogSettings.repositories.find(repository => repository.id === editingRepositoryId) ?? null

  React.useEffect(() => {
    if (
      editingRepositoryId &&
      !worklogSettings.repositories.some(repository => repository.id === editingRepositoryId)
    ) {
      setEditingRepositoryId(null)
    }
  }, [editingRepositoryId, worklogSettings.repositories])

  const createRepository = React.useCallback(() => {
    const nextId = createNextGitWorklogRepositoryId(
      worklogSettings.repositories.map(repository => repository.id),
    )
    setEditingRepositoryId(nextId)
    updateSettings(current =>
      appendRepositoryWithOrdering(current, {
        ...createDefaultGitWorklogRepository(current.repositories.length),
        id: nextId,
      }),
    )
  }, [updateSettings, worklogSettings.repositories])

  const removeRepository = React.useCallback(
    (repoId: string) => {
      setEditingRepositoryId(current => (current === repoId ? null : current))
      updateSettings(current =>
        current.repositories.length > 1
          ? removeRepositoryWithOrdering(current, repoId)
          : reconcileGitWorklogSettingsOrdering(current),
      )
    },
    [updateSettings],
  )

  const resolvePendingImportByWorkspacePath = React.useCallback(
    (workspacePath: string) =>
      (state.pendingImports ?? []).find(
        entry =>
          normalizeRepoPathForCompare(entry.workspacePath) ===
          normalizeRepoPathForCompare(workspacePath),
      ) ?? null,
    [state.pendingImports],
  )

  const hasExceptionEntries =
    (state.dismissedImports?.length ?? 0) > 0 ||
    worklogSettings.ignoredAutoRepositoryPaths.length > 0

  const configurationContent = (
    <div className="git-worklog-config__workspace" data-testid="git-worklog-config-board">
      <section className="git-worklog-config__panel git-worklog-config__workbench">
        <div className="git-worklog-config__workbench-head">
          <div className="git-worklog-config__panel-head">
            <strong>{t('pluginManager.plugins.gitWorklog.configurationTitle')}</strong>
            <p>{t('pluginManager.plugins.gitWorklog.configurationDialogSummary')}</p>
          </div>
          <div className="git-worklog-config__workbench-actions">
            {(() => {
              const isBusy = isRefreshBusy('config')
              return (
                <button
                  type="button"
                  className="cove-window__action cove-window__action--ghost git-worklog-config__refresh-action"
                  data-testid="git-worklog-config-refresh-now"
                  aria-busy={isBusy}
                  disabled={isBusy}
                  onClick={() => {
                    void triggerRefresh('config')
                  }}
                >
                  {isBusy ? (
                    <LoaderCircle
                      className="git-worklog-config__action-icon git-worklog-config__action-icon--spinning"
                      aria-hidden="true"
                    />
                  ) : null}
                  <span>
                    {isBusy
                      ? t('pluginManager.plugins.gitWorklog.refreshing')
                      : t('pluginManager.plugins.gitWorklog.refreshNow')}
                  </span>
                </button>
              )
            })()}
            <button
              type="button"
              className="cove-window__action cove-window__action--secondary"
              data-testid="git-worklog-config-add-repository"
              onClick={createRepository}
            >
              {t('pluginManager.plugins.gitWorklog.addRepository')}
            </button>
          </div>
        </div>

        <div className="git-worklog-config__summary-strip">
          <span className="git-worklog-config__summary-pill">
            {t('pluginManager.plugins.gitWorklog.repositoriesTotalSummary', {
              count: totalRepositoryCount,
            })}
          </span>
          <span className="git-worklog-config__summary-pill">
            {t('pluginManager.plugins.gitWorklog.repositoriesEnabledSummary', {
              count: enabledRepositoryCount,
            })}
          </span>
          <span className="git-worklog-config__summary-pill">
            {t('pluginManager.plugins.gitWorklog.pendingImportsSummary', {
              count: state.pendingImports?.length ?? 0,
            })}
          </span>
        </div>

        <div className="git-worklog-config__toolbar-grid">
          <div
            className="git-worklog-config__toolbar-card"
            data-testid="git-worklog-config-scan-panel"
          >
            <div className="git-worklog-config__panel-head">
              <strong>{t('pluginManager.plugins.gitWorklog.scanPanelTitle')}</strong>
              <p>{t('pluginManager.plugins.gitWorklog.scanPanelSummary')}</p>
            </div>

            <div className="plugin-manager-panel__field-stack">
              <label htmlFor="git-worklog-author-filter">
                {t('pluginManager.plugins.gitWorklog.authorFilterLabel')}
              </label>
              <input
                id="git-worklog-author-filter"
                className="cove-field"
                data-testid="git-worklog-author-filter"
                type="text"
                value={worklogSettings.authorFilter}
                placeholder={t('pluginManager.plugins.gitWorklog.authorFilterPlaceholder')}
                onChange={event => {
                  updateSettings(current => ({
                    ...current,
                    authorFilter: event.target.value,
                  }))
                }}
              />
            </div>

            <div className="plugin-manager-panel__field-grid plugin-manager-panel__field-grid--triple">
              <div className="plugin-manager-panel__field-stack">
                <label htmlFor="git-worklog-range-mode">
                  {t('pluginManager.plugins.gitWorklog.rangeModeLabel')}
                </label>
                <select
                  id="git-worklog-range-mode"
                  className="cove-field"
                  data-testid="git-worklog-range-mode"
                  value={worklogSettings.rangeMode}
                  onChange={event => {
                    updateSettings(current => ({
                      ...current,
                      rangeMode: event.target.value === 'date_range' ? 'date_range' : 'recent_days',
                    }))
                  }}
                >
                  <option value="recent_days">
                    {t('pluginManager.plugins.gitWorklog.rangeModeRecent')}
                  </option>
                  <option value="date_range">
                    {t('pluginManager.plugins.gitWorklog.rangeModeDate')}
                  </option>
                </select>
              </div>

              {worklogSettings.rangeMode === 'date_range' ? (
                <>
                  <div className="plugin-manager-panel__field-stack">
                    <label htmlFor="git-worklog-range-start">
                      {t('pluginManager.plugins.gitWorklog.rangeStartLabel')}
                    </label>
                    <input
                      id="git-worklog-range-start"
                      className="cove-field"
                      data-testid="git-worklog-range-start"
                      type="date"
                      value={worklogSettings.rangeStartDay}
                      onChange={event => {
                        updateSettings(current => ({
                          ...current,
                          rangeStartDay: event.target.value,
                        }))
                      }}
                    />
                  </div>

                  <div className="plugin-manager-panel__field-stack">
                    <label htmlFor="git-worklog-range-end">
                      {t('pluginManager.plugins.gitWorklog.rangeEndLabel')}
                    </label>
                    <input
                      id="git-worklog-range-end"
                      className="cove-field"
                      data-testid="git-worklog-range-end"
                      type="date"
                      value={worklogSettings.rangeEndDay}
                      onChange={event => {
                        updateSettings(current => ({
                          ...current,
                          rangeEndDay: event.target.value,
                        }))
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="git-worklog-recent-days">
                    {t('pluginManager.plugins.gitWorklog.recentDaysLabel')}
                  </label>
                  <input
                    id="git-worklog-recent-days"
                    className="cove-field"
                    data-testid="git-worklog-recent-days"
                    type="number"
                    min={1}
                    max={90}
                    step={1}
                    value={worklogSettings.recentDays}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        recentDays: Number.parseInt(event.target.value, 10) || 1,
                      }))
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div
            className="git-worklog-config__toolbar-card"
            data-testid="git-worklog-config-automation-panel"
          >
            <div className="git-worklog-config__panel-head">
              <strong>{t('pluginManager.plugins.gitWorklog.automationPanelTitle')}</strong>
              <p>{t('pluginManager.plugins.gitWorklog.automationPanelSummary')}</p>
            </div>

            <div className="git-worklog-config__toggle-panel">
              <label className="plugin-manager-panel__toggle-row">
                <span>{t('pluginManager.plugins.gitWorklog.autoRefreshLabel')}</span>
                <span className="cove-toggle">
                  <input
                    type="checkbox"
                    data-testid="git-worklog-auto-refresh"
                    checked={worklogSettings.autoRefreshEnabled}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        autoRefreshEnabled: event.target.checked,
                      }))
                    }}
                  />
                  <span className="cove-toggle__slider"></span>
                </span>
              </label>

              {worklogSettings.autoRefreshEnabled ? (
                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="git-worklog-refresh-interval">
                    {t('pluginManager.plugins.gitWorklog.refreshIntervalLabel')}
                  </label>
                  <input
                    id="git-worklog-refresh-interval"
                    className="cove-field"
                    data-testid="git-worklog-refresh-interval"
                    type="number"
                    min={60000}
                    step={60000}
                    value={worklogSettings.refreshIntervalMs}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        refreshIntervalMs: Number.parseInt(event.target.value, 10) || 60000,
                      }))
                    }}
                  />
                </div>
              ) : null}
            </div>

            <div className="git-worklog-config__toggle-panel">
              <label className="plugin-manager-panel__toggle-row">
                <span>{t('pluginManager.plugins.gitWorklog.autoDiscoverLabel')}</span>
                <span className="cove-toggle">
                  <input
                    type="checkbox"
                    data-testid="git-worklog-auto-discover"
                    checked={worklogSettings.autoDiscoverEnabled}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        autoDiscoverEnabled: event.target.checked,
                      }))
                    }}
                  />
                  <span className="cove-toggle__slider"></span>
                </span>
              </label>

              {worklogSettings.autoDiscoverEnabled ? (
                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="git-worklog-auto-discover-depth">
                    {t('pluginManager.plugins.gitWorklog.autoDiscoverDepthLabel')}
                  </label>
                  <input
                    id="git-worklog-auto-discover-depth"
                    className="cove-field"
                    data-testid="git-worklog-auto-discover-depth"
                    type="number"
                    min={1}
                    max={3}
                    step={1}
                    value={worklogSettings.autoDiscoverDepth}
                    onChange={event => {
                      const parsed = Number.parseInt(event.target.value, 10)
                      updateSettings(current => ({
                        ...current,
                        autoDiscoverDepth: Number.isFinite(parsed)
                          ? Math.max(1, Math.min(3, parsed))
                          : 3,
                      }))
                    }}
                  />
                  <p className="plugin-manager-panel__hint">
                    {t('pluginManager.plugins.gitWorklog.autoDiscoverHelp')}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section
        className="git-worklog-config__panel git-worklog-config__panel--state"
        data-testid="git-worklog-workspace-scan-list"
      >
        <div className="git-worklog-config__panel-head">
          <strong>{t('pluginManager.plugins.gitWorklog.workspaceScanListLabel')}</strong>
          <p>{t('pluginManager.plugins.gitWorklog.workspaceScanListHelp')}</p>
        </div>
        {(workspaceScanItems.length ?? 0) > 0 ? (
          <div
            className="git-worklog-config__scan-table-shell"
            data-testid="git-worklog-workspace-scan-table"
          >
            <table className="git-worklog-config__scan-grid">
              <colgroup>
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--scope" />
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--path" />
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--status" />
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--summary" />
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--actions" />
              </colgroup>
              <thead>
                <tr className="git-worklog-config__scan-grid-head-row">
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.scope')}</th>
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.path')}</th>
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.status')}</th>
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.summary')}</th>
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {workspaceScanRows.map(row => {
                  if (row.type === 'workspace') {
                    return (
                      <tr
                        key={row.id}
                        className="git-worklog-config__scan-grid-row git-worklog-config__scan-grid-row--workspace"
                        data-testid={`git-worklog-workspace-scan-item-${normalizeRepoPathForCompare(
                          row.workspacePath,
                        )}`}
                      >
                        <th scope="row" className="git-worklog-config__scan-grid-cell">
                          <div className="git-worklog-config__scan-grid-scope">
                            <span className="git-worklog-config__scope-badge git-worklog-config__scope-badge--workspace">
                              {t('pluginManager.plugins.gitWorklog.workspaceScanWorkspaceBadge')}
                            </span>
                            <strong>{row.workspaceName}</strong>
                          </div>
                        </th>
                        <td className="git-worklog-config__scan-grid-cell">
                          <span className="git-worklog-config__ignored-path">{row.path}</span>
                        </td>
                        <td className="git-worklog-config__scan-grid-cell">
                          <span
                            className={`git-worklog-config__scan-status git-worklog-config__scan-status--${row.status}`}
                          >
                            {t(`pluginManager.plugins.gitWorklog.workspaceScanStatus.${row.status}`)}
                          </span>
                        </td>
                        <td className="git-worklog-config__scan-grid-cell">
                          <span className="plugin-manager-panel__hint git-worklog-config__scan-grid-note">
                            {row.status === 'error'
                              ? t('pluginManager.plugins.gitWorklog.workspaceScanErrorSummary', {
                                  retryCount: row.retryCount,
                                  detail: row.errorDetail ?? t('common.unknownError'),
                                })
                              : t('pluginManager.plugins.gitWorklog.workspaceScanSummary', {
                                  managed: row.managedCount,
                                  pending: row.pendingCount,
                                })}
                          </span>
                        </td>
                        <td className="git-worklog-config__scan-grid-cell">
                          <div className="git-worklog-config__scan-grid-actions">
                            {(() => {
                              const normalizedWorkspacePath = normalizeRepoPathForCompare(
                                row.workspacePath,
                              )
                              const refreshKey = `workspace:${normalizedWorkspacePath}` as const
                              const isBusy = isRefreshBusy(refreshKey)

                              return (
                                <button
                                  type="button"
                                  className="cove-window__action cove-window__action--ghost git-worklog-config__table-action git-worklog-config__refresh-action"
                                  data-testid={`git-worklog-scan-refresh-workspace-${normalizedWorkspacePath}`}
                                  aria-busy={isBusy}
                                  disabled={isBusy}
                                  onClick={() => {
                                    void triggerRefresh(refreshKey)
                                  }}
                                >
                                  {isBusy ? (
                                    <LoaderCircle
                                      className="git-worklog-config__action-icon git-worklog-config__action-icon--spinning"
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  <span>
                                    {isBusy
                                      ? t('pluginManager.plugins.gitWorklog.refreshing')
                                      : t(
                                          'pluginManager.plugins.gitWorklog.workspaceScanRefreshAction',
                                        )}
                                  </span>
                                </button>
                              )
                            })()}
                            {row.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  className="cove-window__action cove-window__action--ghost git-worklog-config__table-action"
                                  data-testid={`git-worklog-scan-confirm-pending-import-${normalizeRepoPathForCompare(
                                    row.workspacePath,
                                  )}`}
                                  onClick={() => {
                                    const pendingImport = resolvePendingImportByWorkspacePath(
                                      row.workspacePath,
                                    )
                                    if (pendingImport) {
                                      void confirmPendingImport(pendingImport)
                                    }
                                  }}
                                >
                                  {t('pluginManager.plugins.gitWorklog.confirmPendingImportAction')}
                                </button>
                                <button
                                  type="button"
                                  className="cove-window__action cove-window__action--ghost git-worklog-config__table-action"
                                  data-testid={`git-worklog-scan-dismiss-pending-import-${normalizeRepoPathForCompare(
                                    row.workspacePath,
                                  )}`}
                                  onClick={() => {
                                    const pendingImport = resolvePendingImportByWorkspacePath(
                                      row.workspacePath,
                                    )
                                    if (pendingImport) {
                                      dismissPendingImport(pendingImport)
                                    }
                                  }}
                                >
                                  {t('pluginManager.plugins.gitWorklog.dismissPendingImportAction')}
                                </button>
                              </>
                            ) : null}
                            {row.status === 'dismissed' ? (
                              <button
                                type="button"
                                className="cove-window__action cove-window__action--ghost git-worklog-config__table-action"
                                data-testid={`git-worklog-scan-restore-dismissed-workspace-${normalizeRepoPathForCompare(
                                  row.workspacePath,
                                )}`}
                                onClick={() => {
                                  restoreDismissedImport(row.workspacePath)
                                }}
                              >
                                {t('pluginManager.plugins.gitWorklog.restoreDismissedImportAction')}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  }

                  const isRootRepository =
                    normalizeRepoPathForCompare(row.repositoryPath) ===
                    normalizeRepoPathForCompare(row.workspacePath)
                  const repositoryRole = isRootRepository
                    ? t('pluginManager.plugins.gitWorklog.repoRoleRoot')
                    : t('pluginManager.plugins.gitWorklog.repoRoleChild')

                  return (
                    <tr
                      key={row.id}
                      className="git-worklog-config__scan-grid-row git-worklog-config__scan-grid-row--repository"
                      data-testid={`git-worklog-workspace-scan-repository-${normalizeRepoPathForCompare(
                        row.repositoryPath,
                      )}`}
                    >
                      <th scope="row" className="git-worklog-config__scan-grid-cell">
                        <div className="git-worklog-config__scan-grid-scope git-worklog-config__scan-grid-scope--repository">
                          <span className="git-worklog-config__scope-branch" aria-hidden="true"></span>
                          <span className="git-worklog-config__scope-badge git-worklog-config__scope-badge--repository">
                            {t('pluginManager.plugins.gitWorklog.workspaceScanRepositoryBadge')}
                          </span>
                          <strong>{row.repositoryLabel}</strong>
                          <span className="plugin-manager-panel__hint git-worklog-config__scan-grid-note">
                            {`${repositoryRole} · ${t(
                              'pluginManager.plugins.gitWorklog.workspaceScanRepositoryBelongsTo',
                              {
                                workspace: row.workspaceName,
                              },
                            )}`}
                          </span>
                        </div>
                      </th>
                      <td className="git-worklog-config__scan-grid-cell">
                        <span className="git-worklog-config__ignored-path">{row.repositoryPath}</span>
                      </td>
                      <td className="git-worklog-config__scan-grid-cell">
                        <span
                          className={`git-worklog-config__scan-status git-worklog-config__scan-status--${row.repositoryState}`}
                        >
                          {t(
                            row.repositoryState === 'managed'
                              ? 'pluginManager.plugins.gitWorklog.workspaceScanRepositoryManaged'
                              : 'pluginManager.plugins.gitWorklog.workspaceScanRepositoryPending',
                          )}
                        </span>
                      </td>
                      <td className="git-worklog-config__scan-grid-cell">
                        <span className="plugin-manager-panel__hint git-worklog-config__scan-grid-note">
                          {row.repositoryState === 'managed'
                            ? t('pluginManager.plugins.gitWorklog.workspaceScanRepositoryManagedSummary')
                            : t('pluginManager.plugins.gitWorklog.workspaceScanRepositoryPendingSummary')}
                        </span>
                      </td>
                      <td className="git-worklog-config__scan-grid-cell">
                        <div className="git-worklog-config__scan-grid-actions">
                          {row.repositoryState === 'managed' && row.repositoryId ? (
                            <>
                              <button
                                type="button"
                                className="cove-window__action cove-window__action--ghost git-worklog-config__table-action"
                                data-testid={`git-worklog-scan-manage-repository-${row.repositoryId}`}
                                onClick={() => {
                                  setEditingRepositoryId(row.repositoryId)
                                }}
                              >
                                {t('pluginManager.plugins.gitWorklog.manageRepositoryAction')}
                              </button>
                              <button
                                type="button"
                                className="cove-window__action cove-window__action--ghost git-worklog-config__table-action"
                                data-testid={`git-worklog-scan-remove-repository-${row.repositoryId}`}
                                onClick={() => {
                                  removeRepository(row.repositoryId!)
                                }}
                              >
                                {t('pluginManager.plugins.gitWorklog.removeRepository')}
                              </button>
                            </>
                          ) : (
                            (() => {
                              const normalizedRepositoryPath = normalizeRepoPathForCompare(
                                row.repositoryPath,
                              )
                              const refreshKey = `repository:${normalizedRepositoryPath}` as const
                              const isBusy = isRefreshBusy(refreshKey)

                              return (
                                <button
                                  type="button"
                                  className="cove-window__action cove-window__action--ghost git-worklog-config__table-action git-worklog-config__refresh-action"
                                  data-testid={`git-worklog-scan-refresh-repository-${normalizedRepositoryPath}`}
                                  aria-busy={isBusy}
                                  disabled={isBusy}
                                  onClick={() => {
                                    void triggerRefresh(refreshKey)
                                  }}
                                >
                                  {isBusy ? (
                                    <LoaderCircle
                                      className="git-worklog-config__action-icon git-worklog-config__action-icon--spinning"
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  <span>
                                    {isBusy
                                      ? t('pluginManager.plugins.gitWorklog.refreshing')
                                      : t(
                                          'pluginManager.plugins.gitWorklog.workspaceScanRefreshAction',
                                        )}
                                  </span>
                                </button>
                              )
                            })()
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p
            className="plugin-manager-panel__hint"
            data-testid="git-worklog-workspace-scan-empty"
          >
            {t('pluginManager.plugins.gitWorklog.workspaceScanEmpty')}
          </p>
        )}
      </section>

      <section
        className="git-worklog-config__panel git-worklog-config__panel--state"
        data-testid="git-worklog-configured-repository-list"
      >
        <div className="git-worklog-config__panel-head">
          <div>
            <strong>{t('pluginManager.plugins.gitWorklog.configuredRepositoryListLabel')}</strong>
            <p>{t('pluginManager.plugins.gitWorklog.configuredRepositoryListHelp')}</p>
          </div>
          <div className="git-worklog-config__panel-actions">
            <button
              type="button"
              className="cove-window__action cove-window__action--secondary git-worklog-config__table-action"
              data-testid="git-worklog-repair-repositories"
              onClick={() => {
                void handleRepairRepositories()
              }}
              disabled={isRepairingRepositories || isUndoingRepositoryRepair}
            >
              {isRepairingRepositories ? (
                <LoaderCircle
                  className="git-worklog-config__action-icon git-worklog-config__action-icon--spinning"
                  aria-hidden="true"
                />
              ) : null}
              <span>
                {isRepairingRepositories
                  ? t('pluginManager.plugins.gitWorklog.repairRepositoriesLoading')
                  : t('pluginManager.plugins.gitWorklog.repairRepositoriesAction')}
              </span>
            </button>
            <button
              type="button"
              className="cove-window__action cove-window__action--ghost git-worklog-config__table-action"
              data-testid="git-worklog-undo-repository-repair"
              onClick={() => {
                void handleUndoRepositoryRepair()
              }}
              disabled={isRepairingRepositories || isUndoingRepositoryRepair}
            >
              {isUndoingRepositoryRepair ? (
                <LoaderCircle
                  className="git-worklog-config__action-icon git-worklog-config__action-icon--spinning"
                  aria-hidden="true"
                />
              ) : null}
              <span>
                {isUndoingRepositoryRepair
                  ? t('pluginManager.plugins.gitWorklog.undoRepairRepositoriesLoading')
                  : t('pluginManager.plugins.gitWorklog.undoRepairRepositoriesAction')}
              </span>
            </button>
          </div>
        </div>
        {repairFeedback ? (
          <div
            className={`plugin-manager-panel__hint plugin-manager-panel__hint--${repairFeedback.tone === 'error' ? 'error' : 'info'}`}
            data-testid="git-worklog-repair-feedback"
          >
            <span>{repairFeedback.text}</span>
          </div>
        ) : null}
        {configuredRepositoryRows.length > 0 ? (
          <div className="git-worklog-config__scan-table-shell">
            <table className="git-worklog-config__scan-grid">
              <colgroup>
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--scope" />
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--path" />
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--status" />
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--summary" />
                <col className="git-worklog-config__scan-grid-col git-worklog-config__scan-grid-col--actions" />
              </colgroup>
              <thead>
                <tr className="git-worklog-config__scan-grid-head-row">
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.scope')}</th>
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.path')}</th>
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.status')}</th>
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.summary')}</th>
                  <th scope="col">{t('pluginManager.plugins.gitWorklog.workspaceScanColumns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {configuredRepositoryRows.map(row => {
                  const statusKey =
                    row.assignmentMode === 'workspace'
                      ? 'workspaceScanRepositoryConfiguredWorkspace'
                      : row.assignmentMode === 'base'
                        ? 'workspaceScanRepositoryConfiguredBase'
                        : 'workspaceScanRepositoryConfiguredUnmatched'
                  const summaryKey =
                    row.assignmentMode === 'workspace'
                      ? 'workspaceScanRepositoryConfiguredWorkspaceSummary'
                      : row.assignmentMode === 'base'
                        ? 'workspaceScanRepositoryConfiguredBaseSummary'
                        : 'workspaceScanRepositoryConfiguredUnmatchedSummary'

                  return (
                    <tr
                      key={row.id}
                      className="git-worklog-config__scan-grid-row git-worklog-config__scan-grid-row--repository"
                      data-testid={`git-worklog-configured-repository-${normalizeRepoPathForCompare(
                        row.repositoryPath,
                      )}`}
                    >
                      <th scope="row" className="git-worklog-config__scan-grid-cell">
                        <div className="git-worklog-config__scan-grid-scope git-worklog-config__scan-grid-scope--repository">
                          <span className="git-worklog-config__scope-badge git-worklog-config__scope-badge--repository">
                            {t('pluginManager.plugins.gitWorklog.workspaceScanRepositoryBadge')}
                          </span>
                          <strong>{row.repositoryLabel}</strong>
                        </div>
                      </th>
                      <td className="git-worklog-config__scan-grid-cell">
                        <span className="git-worklog-config__ignored-path">{row.repositoryPath}</span>
                      </td>
                      <td className="git-worklog-config__scan-grid-cell">
                        <span className="git-worklog-config__scan-status git-worklog-config__scan-status--managed">
                          {t(`pluginManager.plugins.gitWorklog.${statusKey}`)}
                        </span>
                      </td>
                      <td className="git-worklog-config__scan-grid-cell">
                        <span className="plugin-manager-panel__hint git-worklog-config__scan-grid-note">
                          {t(`pluginManager.plugins.gitWorklog.${summaryKey}`, {
                            workspace: row.assignedWorkspaceName ?? '',
                          })}
                        </span>
                      </td>
                      <td className="git-worklog-config__scan-grid-cell">
                        <div className="git-worklog-config__scan-grid-actions">
                          <button
                            type="button"
                            className="cove-window__action cove-window__action--ghost git-worklog-config__table-action"
                            data-testid={`git-worklog-scan-manage-repository-${row.repositoryId}`}
                            onClick={() => {
                              setEditingRepositoryId(row.repositoryId)
                            }}
                          >
                            {t('pluginManager.plugins.gitWorklog.manageRepositoryAction')}
                          </button>
                          <button
                            type="button"
                            className="cove-window__action cove-window__action--ghost git-worklog-config__table-action"
                            data-testid={`git-worklog-scan-remove-repository-${row.repositoryId}`}
                            onClick={() => {
                              removeRepository(row.repositoryId)
                            }}
                          >
                            {t('pluginManager.plugins.gitWorklog.removeRepository')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p
            className="plugin-manager-panel__hint"
            data-testid="git-worklog-configured-repository-empty"
          >
            {t('pluginManager.plugins.gitWorklog.configuredRepositoryListEmpty')}
          </p>
        )}
      </section>

      {hasExceptionEntries ? (
        <section
          className="git-worklog-config__panel git-worklog-config__panel--state"
          data-testid="git-worklog-config-exception-list"
        >
          <div className="git-worklog-config__panel-head">
            <strong>{t('pluginManager.plugins.gitWorklog.workspaceExceptionListLabel')}</strong>
            <p>{t('pluginManager.plugins.gitWorklog.workspaceExceptionListHelp')}</p>
          </div>
          <div className="git-worklog-config__exception-list">
            {(state.dismissedImports ?? []).map(item => (
              <div
                key={`dismissed:${item.workspacePath}`}
                className="git-worklog-config__exception-item"
                data-testid={`git-worklog-dismissed-import-${normalizeRepoPathForCompare(
                  item.workspacePath,
                )}`}
              >
                <div className="git-worklog-config__exception-copy">
                  <div className="git-worklog-config__exception-meta">
                    <span className="git-worklog-config__scan-status git-worklog-config__scan-status--dismissed">
                      {t('pluginManager.plugins.gitWorklog.dismissedImportsLabel')}
                    </span>
                    <strong>{item.workspaceName}</strong>
                  </div>
                  <span className="git-worklog-config__ignored-path">{item.workspacePath}</span>
                  <span className="plugin-manager-panel__hint">
                    {t('pluginManager.plugins.gitWorklog.dismissedImportRowSummary')}
                  </span>
                </div>
                <button
                  type="button"
                  className="cove-window__action cove-window__action--ghost"
                  onClick={() => {
                    restoreDismissedImport(item.workspacePath)
                  }}
                >
                  {t('pluginManager.plugins.gitWorklog.restoreDismissedImportAction')}
                </button>
              </div>
            ))}

            {worklogSettings.ignoredAutoRepositoryPaths.map(path => (
              <div
                key={`ignored:${path}`}
                className="git-worklog-config__exception-item"
                data-testid={`git-worklog-ignored-auto-repository-${normalizeRepoPathForCompare(path)}`}
              >
                <div className="git-worklog-config__exception-copy">
                  <div className="git-worklog-config__exception-meta">
                    <span className="git-worklog-config__scan-status git-worklog-config__scan-status--pending">
                      {t('pluginManager.plugins.gitWorklog.ignoredAutoRepositoriesLabel')}
                    </span>
                    <strong>{t('pluginManager.plugins.gitWorklog.workspaceIgnoredRepositoryTitle')}</strong>
                  </div>
                  <span className="git-worklog-config__ignored-path">{path}</span>
                  <span className="plugin-manager-panel__hint">
                    {t('pluginManager.plugins.gitWorklog.ignoredAutoRepositorySummary')}
                  </span>
                </div>
                <button
                  type="button"
                  className="cove-window__action cove-window__action--ghost"
                  onClick={() => {
                    restoreIgnoredAutoRepo(path)
                  }}
                >
                  {t('pluginManager.plugins.gitWorklog.restoreIgnoredAutoRepoAction')}
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )

  return (
    <section
      className="plugin-manager-panel__plugin-section git-worklog-config"
      data-testid="plugin-manager-plugin-git-worklog-section"
    >
      <GitWorklogOverview
        isPluginEnabled={isPluginEnabled}
        state={state}
        configuredRepositories={worklogSettings.repositories}
        availableWorkspaces={state.availableWorkspaces}
        onRefresh={() => {
          void refresh()
        }}
        onAddRepository={createRepository}
        onManageRepository={repoId => {
          setEditingRepositoryId(repoId)
        }}
        onConvertAutoRepoToManual={repo => {
          void convertAutoRepoToManual(repo)
        }}
        onIgnoreAutoRepo={ignoreAutoRepo}
        repositoryOrder={worklogSettings.repositoryOrder}
        workspaceOrder={worklogSettings.workspaceOrder}
        onChangeWorkspaceOrder={workspaceOrder => {
          updateSettings(current => ({
            ...current,
            workspaceOrder,
          }))
        }}
        onChangeRepositoryOrder={repositoryOrder => {
          updateSettings(current => ({
            ...current,
            repositoryOrder,
          }))
        }}
        onMoveRepositoryToWorkspaceGroup={(repositoryId, workspaceId, anchorRepositoryId) => {
          updateSettings(current =>
            moveRepositoryToWorkspaceGroup({
              settings: reconcileGitWorklogSettingsOrdering(current),
              repositoryId,
              targetWorkspaceId: workspaceId,
              anchorRepositoryId,
            }),
          )
        }}
      />

      <div className="plugin-manager-panel__section-grid plugin-manager-panel__section-grid--stack">
        <PluginSectionCard
          title={t('pluginManager.plugins.gitWorklog.configurationTitle')}
          description={t('pluginManager.plugins.gitWorklog.configurationSummary')}
          actions={
            <button
              type="button"
              className="cove-window__action cove-window__action--secondary"
              data-testid="git-worklog-open-config-dialog"
              onClick={() => {
                setIsConfigurationDialogOpen(true)
              }}
            >
              {t('pluginManager.plugins.gitWorklog.configurationDialogOpenAction')}
            </button>
          }
        >
          <div
            className="git-worklog-config__summary-strip"
            data-testid="git-worklog-config-summary"
          >
            <span className="git-worklog-config__summary-pill">
              {t('pluginManager.plugins.gitWorklog.repositoriesTotalSummary', {
                count: totalRepositoryCount,
              })}
            </span>
            <span className="git-worklog-config__summary-pill">
              {t('pluginManager.plugins.gitWorklog.repositoriesEnabledSummary', {
                count: enabledRepositoryCount,
              })}
            </span>
            <span className="git-worklog-config__summary-pill">
              {t('pluginManager.plugins.gitWorklog.pendingImportsSummary', {
                count: state.pendingImports?.length ?? 0,
              })}
            </span>
          </div>
        </PluginSectionCard>
      </div>

      {isConfigurationDialogOpen ? (
        <GitWorklogConfigurationDialog
          onClose={() => {
            setIsConfigurationDialogOpen(false)
          }}
        >
          {configurationContent}
        </GitWorklogConfigurationDialog>
      ) : null}

      {editingRepository ? (
        <GitWorklogRepositoryDialog
          repository={editingRepository}
          canRemove={worklogSettings.repositories.length > 1}
          availableWorkspaces={state.availableWorkspaces ?? []}
          onClose={() => {
            setEditingRepositoryId(null)
          }}
          onToggleEnabled={enabled => {
            updateSettings(current => ({
              ...updateRepositoryWithOrdering(
                current,
                editingRepository.id,
                candidate => ({
                  ...candidate,
                  enabled,
                }),
              ),
            }))
          }}
          onRemove={() => {
            removeRepository(editingRepository.id)
          }}
          onChangeLabel={label => {
            updateSettings(current => ({
              ...updateRepositoryWithOrdering(
                current,
                editingRepository.id,
                candidate => ({
                  ...candidate,
                  label,
                }),
              ),
            }))
          }}
          onChangePath={path => {
            updateSettings(current => ({
              ...updateRepositoryWithOrdering(
                current,
                editingRepository.id,
                candidate => ({
                  ...candidate,
                  path,
                  origin: 'manual',
                }),
              ),
            }))
          }}
          onChangeAssignedWorkspaceId={assignedWorkspaceId => {
            updateSettings(current => ({
              ...updateRepositoryWithOrdering(
                current,
                editingRepository.id,
                candidate => ({
                  ...candidate,
                  assignedWorkspaceId,
                }),
              ),
            }))
          }}
          onPickDirectory={() => {
            void selectRepositoryDirectory(editingRepository.id)
          }}
        />
      ) : null}
    </section>
  )
}
