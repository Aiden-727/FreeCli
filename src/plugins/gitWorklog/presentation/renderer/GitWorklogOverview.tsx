import React from 'react'
import type { GitWorklogRepositoryDto, GitWorklogStateDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import { GitWorklogHeatmap } from './GitWorklogHeatmap'
import { GitWorklogMiniTrend } from './GitWorklogMiniTrend'
import { GitWorklogSummaryTrend } from './GitWorklogSummaryTrend'
import { formatGitWorklogCount } from './gitWorklogFormatting'

function normalizeRepoPathForCompare(value: string): string {
  return value.trim().replaceAll('\\', '/').replaceAll(/\/+/g, '/').toLowerCase()
}

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

export function GitWorklogOverview({
  isPluginEnabled,
  state,
  onRefresh,
  configuredRepositories,
  onAddRepository,
  onManageRepository,
  onConvertAutoRepoToManual,
  onIgnoreAutoRepo,
}: {
  isPluginEnabled: boolean
  state: GitWorklogStateDto
  onRefresh: () => void
  configuredRepositories: GitWorklogRepositoryDto[]
  onAddRepository?: () => void
  onManageRepository?: (repositoryId: string) => void
  onConvertAutoRepoToManual?: (repo: { label: string; path: string }) => void
  onIgnoreAutoRepo?: (repo: { label: string; path: string }) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const statusText = t(`pluginManager.plugins.gitWorklog.runtimeStatus.${state.status}`)
  const configuredRepositoryIdByPath = React.useMemo(() => {
    const mapping = new Map<string, string>()
    for (const repository of configuredRepositories) {
      mapping.set(normalizeRepoPathForCompare(repository.path), repository.id)
    }
    return mapping
  }, [configuredRepositories])

  const groupedRepos = React.useMemo(() => {
    const runtimeRepoByPath = new Map(
      state.repos.map(repo => [normalizeRepoPathForCompare(repo.path), repo] as const),
    )
    const mergedRepos: DisplayRepo[] = configuredRepositories.map(repository => {
      const normalizedPath = normalizeRepoPathForCompare(repository.path)
      const runtimeRepo = runtimeRepoByPath.get(normalizedPath)
      const label = repository.label.trim().length > 0 ? repository.label : repository.id
      runtimeRepoByPath.delete(normalizedPath)

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
          lastScannedAt: null,
          error: null,
        }),
        repoId: repository.id,
        label,
        path: repository.path,
        configuredRepositoryId: repository.id,
        isConfiguredEnabled: repository.enabled,
        hasRuntimeData: runtimeRepo !== undefined,
        isWorkspaceRootRepo: false,
        relativeWorkspacePath: null,
        workspaceDepth: 0,
      }
    })

    const residualRuntimeRepos: DisplayRepo[] = [...runtimeRepoByPath.values()].map(repo => ({
      ...repo,
      configuredRepositoryId: null,
      isConfiguredEnabled: null,
      hasRuntimeData: true,
      isWorkspaceRootRepo: false,
      relativeWorkspacePath: null,
      workspaceDepth: 0,
    }))

    const groups = new Map<
      string,
      {
        id: string
        name: string
        path: string | null
        repos: DisplayRepo[]
      }
    >()

    for (const repo of [...mergedRepos, ...residualRuntimeRepos]) {
      const key = repo.parentWorkspaceId ?? '__external__'
      const current = groups.get(key)
      if (current) {
        current.repos.push(repo)
        continue
      }

      groups.set(key, {
        id: key,
        name:
          repo.parentWorkspaceName ??
          t('pluginManager.plugins.gitWorklog.externalWorkspaceGroupTitle'),
        path: repo.parentWorkspacePath,
        repos: [repo],
      })
    }

    return [...groups.values()]
      .map(group => {
        const repos = group.repos
          .map(repo => {
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
          .sort((left, right) => {
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

        return {
          ...group,
          repos,
        }
      })
      .sort((left, right) => {
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
  }, [configuredRepositories, state.repos, t])

  const totalMonitoredRepositories = React.useMemo(
    () => groupedRepos.reduce((sum, group) => sum + group.repos.length, 0),
    [groupedRepos],
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
          <GitWorklogHeatmap points={state.overview.dailyPoints} />
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
                  className="git-worklog-overview__workspace-card"
                  data-testid={`git-worklog-workspace-card-${group.id}`}
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

                  <div className="git-worklog-overview__repo-list">
                    {group.repos.map(repo => {
                      const hasError = repo.error !== null
                      const errorMessage = repo.error?.message ?? ''
                      const configuredRepositoryId =
                        repo.configuredRepositoryId ??
                        configuredRepositoryIdByPath.get(normalizeRepoPathForCompare(repo.path)) ??
                        null
                      const repoOriginLabel =
                        repo.origin === 'auto'
                          ? t('pluginManager.plugins.gitWorklog.repoOriginAuto')
                          : t('pluginManager.plugins.gitWorklog.repoOriginManual')

                      return (
                        <article
                          key={repo.repoId}
                          className={`git-worklog-overview__repo-row${hasError ? ' git-worklog-overview__repo-row--error' : ''}${repo.isWorkspaceRootRepo ? ' git-worklog-overview__repo-row--root' : ''}`}
                          data-testid={`git-worklog-repo-card-${repo.repoId}`}
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
                                    onClick={() => {
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
                                      onClick={() => {
                                        onConvertAutoRepoToManual({
                                          label: repo.label,
                                          path: repo.path,
                                        })
                                      }}
                                    >
                                      {t('pluginManager.plugins.gitWorklog.convertAutoRepoAction')}
                                    </button>
                                  ) : null}
                                  {onIgnoreAutoRepo ? (
                                    <button
                                      type="button"
                                      className="cove-window__action cove-window__action--secondary"
                                      data-testid={`git-worklog-repo-ignore-${repo.repoId}`}
                                      onClick={() => {
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
                                  'pluginManager.plugins.gitWorklog.repoMetrics.changedLinesToday',
                                )}
                                value={formatRepoMetricValue(repo.changedLinesToday, {
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
                    })}
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
