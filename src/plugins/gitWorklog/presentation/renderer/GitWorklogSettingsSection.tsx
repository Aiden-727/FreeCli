import React from 'react'
import type {
  GitWorklogAutoCandidateDto,
  GitWorklogRepositoryDto,
  GitWorklogSettingsDto,
} from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { SettingsPluginSectionProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { PluginSectionCard } from '../../../../contexts/plugins/presentation/renderer/PluginSectionCard'
import { createDefaultGitWorklogRepository } from '../../../../contexts/plugins/domain/gitWorklogSettings'
import { GitWorklogConfigurationDialog } from './GitWorklogConfigurationDialog'
import { GitWorklogOverview } from './GitWorklogOverview'
import { GitWorklogRepositoryDialog } from './GitWorklogRepositoryDialog'
import {
  appendRepositoryWithOrdering,
  inferAssignedWorkspaceId,
  moveRepositoryToWorkspaceGroup,
  normalizeRepoPathForCompare,
  reconcileGitWorklogSettingsOrdering,
  removeRepositoryWithOrdering,
  updateRepositoryWithOrdering,
} from './gitWorklogOrdering'
import { useGitWorklogState } from './useGitWorklogState'

function nextRepoId(existing: GitWorklogRepositoryDto[]): string {
  return `repo_${existing.length + 1}`
}

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
  const { state, refresh } = useGitWorklogState()
  const worklogSettings = settings.plugins.gitWorklog
  const isPluginEnabled = settings.plugins.enabledIds.includes('git-worklog')
  const [editingRepositoryId, setEditingRepositoryId] = React.useState<string | null>(null)
  const [isConfigurationDialogOpen, setIsConfigurationDialogOpen] = React.useState(false)
  const totalRepositoryCount = worklogSettings.repositories.length
  const enabledRepositoryCount = worklogSettings.repositories.filter(
    repository => repository.enabled,
  ).length

  const updateSettings = React.useCallback(
    (updater: (current: GitWorklogSettingsDto) => GitWorklogSettingsDto) => {
      updateGitWorklogSettings(settings, onChange, updater)
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
        const assignedWorkspaceId =
          repo.parentWorkspaceId ??
          inferAssignedWorkspaceId(resolved.path, availableWorkspaceOptions)

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
          id: nextRepoId(current.repositories),
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
    const nextId = nextRepoId(worklogSettings.repositories)
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

  const configurationContent = (
    <>
      <div className="git-worklog-config__board" data-testid="git-worklog-config-board">
        <section className="git-worklog-config__panel" data-testid="git-worklog-config-scan-panel">
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
        </section>

        <section
          className="git-worklog-config__panel"
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
        </section>
      </div>

      {(state.autoCandidates?.length ?? 0) > 0 ||
      worklogSettings.ignoredAutoRepositoryPaths.length > 0 ? (
        <div className="git-worklog-config__status-grid">
          {(state.autoCandidates?.length ?? 0) > 0 ? (
            <section
              className="git-worklog-config__panel git-worklog-config__panel--state"
              data-testid="git-worklog-auto-candidates"
            >
              <div className="git-worklog-config__panel-head">
                <strong>{t('pluginManager.plugins.gitWorklog.importedWorkspacesLabel')}</strong>
                <p>{t('pluginManager.plugins.gitWorklog.importedWorkspacesHelp')}</p>
              </div>
              <div className="git-worklog-config__imported-header">
                <span className="git-worklog-config__state-count">
                  {t('pluginManager.plugins.gitWorklog.repositoriesImportedSummary', {
                    count: state.autoCandidates?.length ?? 0,
                  })}
                </span>
              </div>
              <div className="git-worklog-config__ignored-list">
                {(state.autoCandidates ?? []).map(candidate => (
                  <div
                    key={candidate.id}
                    className="git-worklog-config__ignored-item"
                    data-testid={`git-worklog-auto-candidate-${candidate.id}`}
                  >
                    <span className="git-worklog-config__ignored-path">{candidate.path}</span>
                    <div className="git-worklog-overview__repo-actions">
                      <button
                        type="button"
                        className="cove-window__action cove-window__action--ghost"
                        data-testid={`git-worklog-confirm-auto-candidate-${candidate.id}`}
                        onClick={() => {
                          void convertAutoRepoToManual(candidate)
                        }}
                      >
                        {t('pluginManager.plugins.gitWorklog.convertAutoRepoAction')}
                      </button>
                      <button
                        type="button"
                        className="cove-window__action cove-window__action--ghost"
                        data-testid={`git-worklog-ignore-auto-candidate-${candidate.id}`}
                        onClick={() => {
                          ignoreAutoRepo({ path: candidate.path })
                        }}
                      >
                        {t('pluginManager.plugins.gitWorklog.ignoreAutoRepoAction')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {worklogSettings.ignoredAutoRepositoryPaths.length > 0 ? (
            <section
              className="git-worklog-config__panel git-worklog-config__panel--state"
              data-testid="git-worklog-ignored-auto-repositories"
            >
              <div className="git-worklog-config__panel-head">
                <strong>
                  {t('pluginManager.plugins.gitWorklog.ignoredAutoRepositoriesLabel')}
                </strong>
                <p>{t('pluginManager.plugins.gitWorklog.ignoredAutoRepositoriesHelp')}</p>
              </div>
              <div className="git-worklog-config__ignored-list">
                {worklogSettings.ignoredAutoRepositoryPaths.map(path => (
                  <div
                    key={path}
                    className="git-worklog-config__ignored-item"
                    data-testid={`git-worklog-ignored-auto-repository-${normalizeRepoPathForCompare(path)}`}
                  >
                    <span className="git-worklog-config__ignored-path">{path}</span>
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
      ) : null}
    </>
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
              {t('pluginManager.plugins.gitWorklog.repositoriesImportedSummary', {
                count: state.autoCandidates?.length ?? 0,
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
