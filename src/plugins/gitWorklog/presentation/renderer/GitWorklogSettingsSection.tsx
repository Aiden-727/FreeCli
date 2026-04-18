import React from 'react'
import type { GitWorklogRepositoryDto, GitWorklogSettingsDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { SettingsPluginSectionProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { PluginSectionCard } from '../../../../contexts/plugins/presentation/renderer/PluginSectionCard'
import { createDefaultGitWorklogRepository } from '../../../../contexts/plugins/domain/gitWorklogSettings'
import { GitWorklogConfigurationDialog } from './GitWorklogConfigurationDialog'
import { GitWorklogOverview } from './GitWorklogOverview'
import { GitWorklogRepositoryDialog } from './GitWorklogRepositoryDialog'
import { useGitWorklogState } from './useGitWorklogState'

function nextRepoId(existing: GitWorklogRepositoryDto[]): string {
  return `repo_${existing.length + 1}`
}

function normalizeRepoPathForCompare(value: string): string {
  return value.trim().replaceAll('\\', '/').replaceAll(/\/+/g, '/').toLowerCase()
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

function updateRepository(
  repositories: GitWorklogRepositoryDto[],
  repoId: string,
  updater: (current: GitWorklogRepositoryDto) => GitWorklogRepositoryDto,
): GitWorklogRepositoryDto[] {
  return repositories.map(repo => (repo.id === repoId ? updater(repo) : repo))
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

      updateSettings(current => ({
        ...current,
        repositories: updateRepository(current.repositories, repoId, repo => ({
          ...repo,
          path: selected.path,
          label:
            repo.label.trim().length === 0 ||
            repo.label === repo.id ||
            repo.label.startsWith('Repository ')
              ? selected.name
              : repo.label,
        })),
      }))
    },
    [updateSettings],
  )

  const convertAutoRepoToManual = React.useCallback(
    (repo: { label: string; path: string }) => {
      updateSettings(current => {
        const normalizedTargetPath = normalizeRepoPathForCompare(repo.path)
        const existingIndex = current.repositories.findIndex(
          candidate => normalizeRepoPathForCompare(candidate.path) === normalizedTargetPath,
        )

        if (existingIndex >= 0) {
          return {
            ...current,
            repositories: current.repositories.map((candidate, index) =>
              index === existingIndex
                ? {
                    ...candidate,
                    enabled: true,
                    path: repo.path,
                    label:
                      candidate.label.trim().length === 0 ||
                      candidate.label === candidate.id ||
                      candidate.label.startsWith('Repository ')
                        ? repo.label
                        : candidate.label,
                  }
                : candidate,
            ),
          }
        }

        return {
          ...current,
          repositories: [
            ...current.repositories,
            {
              ...createDefaultGitWorklogRepository(current.repositories.length),
              id: nextRepoId(current.repositories),
              label: repo.label,
              path: repo.path,
              enabled: true,
            },
          ],
        }
      })
    },
    [updateSettings],
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

  const resetImportedWorkspace = React.useCallback(
    (path: string) => {
      updateSettings(current => ({
        ...current,
        autoImportedWorkspacePaths: current.autoImportedWorkspacePaths.filter(
          candidate => normalizeRepoPathForCompare(candidate) !== normalizeRepoPathForCompare(path),
        ),
      }))
    },
    [updateSettings],
  )

  const resetAllImportedWorkspaces = React.useCallback(() => {
    updateSettings(current => ({
      ...current,
      autoImportedWorkspacePaths: [],
    }))
  }, [updateSettings])

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
    updateSettings(current => ({
      ...current,
      repositories: [
        ...current.repositories,
        {
          ...createDefaultGitWorklogRepository(current.repositories.length),
          id: nextId,
        },
      ],
    }))
  }, [updateSettings, worklogSettings.repositories])

  const removeRepository = React.useCallback(
    (repoId: string) => {
      setEditingRepositoryId(current => (current === repoId ? null : current))
      updateSettings(current => ({
        ...current,
        repositories:
          current.repositories.length > 1
            ? current.repositories.filter(candidate => candidate.id !== repoId)
            : current.repositories,
      }))
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

      {worklogSettings.autoImportedWorkspacePaths.length > 0 ||
      worklogSettings.ignoredAutoRepositoryPaths.length > 0 ? (
        <div className="git-worklog-config__status-grid">
          {worklogSettings.autoImportedWorkspacePaths.length > 0 ? (
            <section
              className="git-worklog-config__panel git-worklog-config__panel--state"
              data-testid="git-worklog-imported-workspaces"
            >
              <div className="git-worklog-config__panel-head">
                <strong>{t('pluginManager.plugins.gitWorklog.importedWorkspacesLabel')}</strong>
                <p>{t('pluginManager.plugins.gitWorklog.importedWorkspacesHelp')}</p>
              </div>
              <div className="git-worklog-config__imported-header">
                <span className="git-worklog-config__state-count">
                  {t('pluginManager.plugins.gitWorklog.repositoriesImportedSummary', {
                    count: worklogSettings.autoImportedWorkspacePaths.length,
                  })}
                </span>
                <button
                  type="button"
                  className="cove-window__action cove-window__action--ghost"
                  data-testid="git-worklog-reset-all-imported-workspaces"
                  onClick={resetAllImportedWorkspaces}
                >
                  {t('pluginManager.plugins.gitWorklog.resetAllImportedWorkspacesAction')}
                </button>
              </div>
              <div className="git-worklog-config__ignored-list">
                {worklogSettings.autoImportedWorkspacePaths.map(path => (
                  <div
                    key={path}
                    className="git-worklog-config__ignored-item"
                    data-testid={`git-worklog-imported-workspace-${normalizeRepoPathForCompare(path)}`}
                  >
                    <span className="git-worklog-config__ignored-path">{path}</span>
                    <button
                      type="button"
                      className="cove-window__action cove-window__action--ghost"
                      data-testid={`git-worklog-reset-imported-workspace-${normalizeRepoPathForCompare(path)}`}
                      onClick={() => {
                        resetImportedWorkspace(path)
                      }}
                    >
                      {t('pluginManager.plugins.gitWorklog.resetImportedWorkspaceAction')}
                    </button>
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
        onRefresh={() => {
          void refresh()
        }}
        onAddRepository={createRepository}
        onManageRepository={repoId => {
          setEditingRepositoryId(repoId)
        }}
        onConvertAutoRepoToManual={convertAutoRepoToManual}
        onIgnoreAutoRepo={ignoreAutoRepo}
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
                count: worklogSettings.autoImportedWorkspacePaths.length,
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
          onClose={() => {
            setEditingRepositoryId(null)
          }}
          onToggleEnabled={enabled => {
            updateSettings(current => ({
              ...current,
              repositories: updateRepository(
                current.repositories,
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
              ...current,
              repositories: updateRepository(
                current.repositories,
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
              ...current,
              repositories: updateRepository(
                current.repositories,
                editingRepository.id,
                candidate => ({
                  ...candidate,
                  path,
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
