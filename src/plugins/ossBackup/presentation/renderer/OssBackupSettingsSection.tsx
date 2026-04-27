import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import type {
  OssBackupSettingsDto,
  OssSyncComparisonDto,
  OssSyncFileInfoDto,
  OssSyncDatasetId,
  OssSyncDecision,
} from '@shared/contracts/dto'
import {
  type BuiltinPluginId,
  isBuiltinPluginId,
  getBuiltinPluginManifest,
  listBuiltinPluginCloudBackupParticipantIds,
} from '@contexts/plugins/domain/pluginManifest'
import { mergeRestoredPluginSettings } from '@contexts/plugins/domain/pluginBackupSnapshot'
import type { SettingsPluginSectionProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { PluginSectionCard } from '../../../../contexts/plugins/presentation/renderer/PluginSectionCard'
import { OssBackupConnectionDialog } from './OssBackupConnectionDialog'
import { OssBackupOverview } from './OssBackupOverview'
import { useOssBackupState } from './useOssBackupState'

function normalizeAutoBackupIntervalMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return 1
  }
  return Math.min(1440, Math.max(1, Math.round(value)))
}

type PendingSyncDecision = {
  conflictedDatasetIds: OssSyncDatasetId[]
  reason: 'conflict' | 'suggestion'
  suggested: OssSyncDecision | null
  comparison: OssSyncComparisonDto
}

function formatDateTime(value: string | null): string {
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

function formatSizeBytes(value: number | null): string {
  if (!Number.isFinite(value) || value === null || value < 0) {
    return '--'
  }
  if (value < 1024) {
    return `${value} B`
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function formatFileVersion(file: OssSyncFileInfoDto): string {
  if (file.version === null) {
    return '--'
  }
  return `v${file.version}`
}

function resolveDiffDatasetIds(comparison: OssSyncComparisonDto): OssSyncDatasetId[] {
  const datasetIds: OssSyncDatasetId[] = [
    'plugin-settings',
    'input-stats-history',
    'quota-monitor-history',
    'git-worklog-history',
  ]
  return datasetIds.filter(datasetId => {
    const local = comparison.local.files[datasetId]
    const remote = comparison.remote.files[datasetId]
    if (!local || !remote) {
      return false
    }
    if (local.exists !== remote.exists) {
      return true
    }
    if (local.checksum && remote.checksum) {
      return local.checksum !== remote.checksum
    }
    return local.version !== remote.version
  })
}

export default function OssBackupSettingsSection({
  settings,
  onChange,
  onFlushPersistNow,
}: SettingsPluginSectionProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state, testConnection, backup, getSyncComparison, restore } = useOssBackupState()
  const backupSettings = settings.plugins.ossBackup
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = React.useState(false)
  const [pendingSyncDecision, setPendingSyncDecision] = React.useState<PendingSyncDecision | null>(
    null,
  )
  const participantPluginIds = React.useMemo(() => listBuiltinPluginCloudBackupParticipantIds(), [])
  const participantPlugins = React.useMemo(
    () =>
      participantPluginIds.map(pluginId => ({
        id: pluginId,
        label: t(getBuiltinPluginManifest(pluginId).titleKey),
      })),
    [participantPluginIds, t],
  )
  const includedPluginLabels = React.useMemo(
    () =>
      participantPlugins
        .filter(plugin => backupSettings.includedPluginIds.includes(plugin.id))
        .map(plugin => plugin.label),
    [backupSettings.includedPluginIds, participantPlugins],
  )

  const updateSettings = React.useCallback(
    (updater: (current: OssBackupSettingsDto) => OssBackupSettingsDto) => {
      onChange({
        ...settings,
        plugins: {
          ...settings.plugins,
          ossBackup: updater(settings.plugins.ossBackup),
        },
      })
    },
    [onChange, settings],
  )

  const toggleScopePlugin = React.useCallback(
    (pluginId: string, checked: boolean) => {
      if (!isBuiltinPluginId(pluginId)) {
        return
      }

      updateSettings(current => {
        const participantSet = new Set<BuiltinPluginId>(participantPluginIds)
        const filtered = current.includedPluginIds.filter(
          (id): id is BuiltinPluginId =>
            isBuiltinPluginId(id) && participantSet.has(id) && id !== pluginId,
        )
        return {
          ...current,
          includedPluginIds: checked ? [...filtered, pluginId] : filtered,
        }
      })
    },
    [participantPluginIds, updateSettings],
  )

  const executeBackup = React.useCallback(() => {
    void Promise.resolve(onFlushPersistNow?.()).then(() => {
      return backup().then(nextState => {
        updateSettings(current => ({
          ...current,
          lastBackupAt: nextState.lastBackupAt,
          lastError: nextState.lastError,
        }))
      })
    })
  }, [backup, onFlushPersistNow, updateSettings])

  const executeRestore = React.useCallback(() => {
    void restore().then(payload => {
      if (!payload) {
        return
      }

      const mergedPlugins = mergeRestoredPluginSettings(settings.plugins, payload.result.snapshot)
      onChange({
        ...settings,
        plugins: {
          ...mergedPlugins,
          ossBackup: {
            ...mergedPlugins.ossBackup,
            lastRestoreAt: payload.state.lastRestoreAt,
            lastError: payload.state.lastError,
          },
        },
      })
    })
  }, [onChange, restore, settings])

  const guardManualSyncByConflict = React.useCallback(
    (preferred: OssSyncDecision, onProceed: () => void) => {
      void getSyncComparison()
        .then(comparison => {
          if (!comparison) {
            onProceed()
            return
          }

          const shouldOpenDecisionDialog =
            comparison.hasConflict ||
            (comparison.suggested !== null && comparison.suggested !== preferred)
          if (!shouldOpenDecisionDialog) {
            onProceed()
            return
          }

          setPendingSyncDecision({
            conflictedDatasetIds: comparison.hasConflict
              ? comparison.conflictedDatasetIds
              : resolveDiffDatasetIds(comparison),
            reason: comparison.hasConflict ? 'conflict' : 'suggestion',
            suggested: comparison.suggested,
            comparison,
          })
        })
        .catch(() => {
          onProceed()
        })
    },
    [getSyncComparison],
  )

  const handleBackup = React.useCallback(() => {
    guardManualSyncByConflict('use_local', executeBackup)
  }, [executeBackup, guardManualSyncByConflict])

  const handleRestore = React.useCallback(() => {
    guardManualSyncByConflict('use_remote', executeRestore)
  }, [executeRestore, guardManualSyncByConflict])

  const handleTestConnection = React.useCallback(() => {
    void testConnection().then(nextState => {
      updateSettings(current => ({
        ...current,
        lastError: nextState.lastError,
      }))
    })
  }, [testConnection, updateSettings])

  const conflictedDatasetLabels = React.useMemo(() => {
    if (!pendingSyncDecision) {
      return []
    }
    return pendingSyncDecision.conflictedDatasetIds.map(datasetId => {
      if (datasetId === 'plugin-settings') {
        return t('pluginManager.plugins.ossBackup.datasets.pluginSettings')
      }
      if (datasetId === 'input-stats-history') {
        return t('pluginManager.plugins.ossBackup.datasets.inputStatsHistory')
      }
      if (datasetId === 'git-worklog-history') {
        return t('pluginManager.plugins.ossBackup.datasets.gitWorklogHistory')
      }
      return t('pluginManager.plugins.ossBackup.datasets.quotaMonitorHistory')
    })
  }, [pendingSyncDecision, t])
  const suggestedDecisionLabel = React.useMemo(() => {
    if (!pendingSyncDecision?.suggested) {
      return null
    }
    return pendingSyncDecision.suggested === 'use_local'
      ? t('pluginManager.plugins.ossBackup.syncDecisionSuggestedLocal')
      : t('pluginManager.plugins.ossBackup.syncDecisionSuggestedRemote')
  }, [pendingSyncDecision, t])
  const syncDecisionDetails = React.useMemo(() => {
    if (!pendingSyncDecision) {
      return []
    }
    return pendingSyncDecision.conflictedDatasetIds.map(datasetId => {
      const localFile = pendingSyncDecision.comparison.local.files[datasetId]
      const remoteFile = pendingSyncDecision.comparison.remote.files[datasetId]
      return {
        datasetId,
        label:
          datasetId === 'plugin-settings'
            ? t('pluginManager.plugins.ossBackup.datasets.pluginSettings')
            : datasetId === 'input-stats-history'
              ? t('pluginManager.plugins.ossBackup.datasets.inputStatsHistory')
              : datasetId === 'git-worklog-history'
                ? t('pluginManager.plugins.ossBackup.datasets.gitWorklogHistory')
              : t('pluginManager.plugins.ossBackup.datasets.quotaMonitorHistory'),
        localFile,
        remoteFile,
      }
    })
  }, [pendingSyncDecision, t])

  return (
    <section
      className="plugin-manager-panel__plugin-section oss-backup-config"
      data-testid="plugin-manager-plugin-oss-backup-section"
    >
      <OssBackupOverview
        state={state}
        includedPluginCount={includedPluginLabels.length}
        participantCount={participantPlugins.length}
        autoBackupEnabled={backupSettings.autoBackupEnabled}
        onTestConnection={handleTestConnection}
        onBackup={handleBackup}
        onRestore={handleRestore}
      />

      <div className="plugin-manager-panel__section-grid plugin-manager-panel__section-grid--stack">
        <PluginSectionCard
          className="oss-backup-config__scope-card"
          title={t('pluginManager.plugins.ossBackup.scopeTitle')}
          description={t('pluginManager.plugins.ossBackup.scopeSummary')}
          actions={
            <button
              type="button"
              className="cove-window__action cove-window__action--secondary oss-backup-config__open-connection-button"
              data-testid="oss-backup-open-connection-dialog"
              onClick={() => {
                setIsConnectionDialogOpen(true)
              }}
            >
              {t('pluginManager.plugins.ossBackup.connectionTitle')}
            </button>
          }
        >
          <div className="oss-backup-config__group">
            <div className="oss-backup-config__section">
              <div className="settings-panel__row">
                <div className="settings-panel__row-label">
                  <strong>{t('pluginManager.plugins.ossBackup.scopeUnifiedTitle')}</strong>
                  <span>{t('pluginManager.plugins.ossBackup.scopeUnifiedSummary')}</span>
                </div>
                <div className="settings-panel__control settings-panel__control--stack plugin-manager-panel__control-wide">
                  <div className="oss-backup-config__scope-subhead">
                    {t('pluginManager.plugins.ossBackup.scopePluginsTitle')}
                  </div>
                  <div className="oss-backup-config__scope-toggle-grid">
                    {participantPlugins.map(plugin => (
                      <label
                        key={plugin.id}
                        className="plugin-manager-panel__toggle-row oss-backup-config__toggle-row"
                      >
                        <span>{plugin.label}</span>
                        <span className="cove-toggle">
                          <input
                            type="checkbox"
                            data-testid={`oss-backup-scope-${plugin.id}`}
                            checked={backupSettings.includedPluginIds.includes(plugin.id)}
                            onChange={event => {
                              toggleScopePlugin(plugin.id, event.target.checked)
                            }}
                          />
                          <span className="cove-toggle__slider"></span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="oss-backup-config__scope-subhead">
                    {t('pluginManager.plugins.ossBackup.historySyncTitle')}
                  </div>
                  <div className="oss-backup-config__history-toggle-grid">
                    <label className="plugin-manager-panel__toggle-row oss-backup-config__toggle-row">
                      <span>{t('pluginManager.plugins.ossBackup.syncInputStatsHistoryLabel')}</span>
                      <span className="cove-toggle">
                        <input
                          type="checkbox"
                          data-testid="oss-backup-sync-input-stats-history"
                          checked={backupSettings.syncInputStatsHistoryEnabled}
                          onChange={event => {
                            updateSettings(current => ({
                              ...current,
                              syncInputStatsHistoryEnabled: event.target.checked,
                            }))
                          }}
                        />
                        <span className="cove-toggle__slider"></span>
                      </span>
                    </label>

                    <label className="plugin-manager-panel__toggle-row oss-backup-config__toggle-row">
                      <span>{t('pluginManager.plugins.ossBackup.syncQuotaHistoryLabel')}</span>
                      <span className="cove-toggle">
                        <input
                          type="checkbox"
                          data-testid="oss-backup-sync-quota-history"
                          checked={backupSettings.syncQuotaMonitorHistoryEnabled}
                          onChange={event => {
                            updateSettings(current => ({
                              ...current,
                              syncQuotaMonitorHistoryEnabled: event.target.checked,
                            }))
                          }}
                        />
                        <span className="cove-toggle__slider"></span>
                      </span>
                    </label>

                    <label className="plugin-manager-panel__toggle-row oss-backup-config__toggle-row">
                      <span>{t('pluginManager.plugins.ossBackup.syncGitWorklogHistoryLabel')}</span>
                      <span className="cove-toggle">
                        <input
                          type="checkbox"
                          data-testid="oss-backup-sync-git-worklog-history"
                          checked={backupSettings.syncGitWorklogHistoryEnabled}
                          onChange={event => {
                            updateSettings(current => ({
                              ...current,
                              syncGitWorklogHistoryEnabled: event.target.checked,
                            }))
                          }}
                        />
                        <span className="cove-toggle__slider"></span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="oss-backup-config__section">
              <div className="oss-backup-config__scope-head">
                <span>{t('pluginManager.plugins.ossBackup.overviewMetrics.includedPlugins')}</span>
              </div>
              <div className="oss-backup-config__scope-list">
                {includedPluginLabels.length > 0 ? (
                  includedPluginLabels.map(label => (
                    <span key={label} className="oss-backup-config__scope-pill">
                      {label}
                    </span>
                  ))
                ) : (
                  <span className="plugin-manager-panel__hint">
                    {t('pluginManager.plugins.ossBackup.scopeEmpty')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </PluginSectionCard>
      </div>

      {isConnectionDialogOpen ? (
        <OssBackupConnectionDialog
          onClose={() => {
            setIsConnectionDialogOpen(false)
          }}
        >
          <div className="oss-backup-config__dialog-board">
            <section className="oss-backup-config__section oss-backup-config__section--policy">
              <div className="settings-panel__row">
                <div className="settings-panel__row-label">
                  <strong>{t('pluginManager.plugins.ossBackup.enableLabel')}</strong>
                  <span>{t('pluginManager.plugins.ossBackup.enableHelp')}</span>
                </div>
                <div className="settings-panel__control settings-panel__control--stack plugin-manager-panel__control-wide">
                  <label className="plugin-manager-panel__toggle-row oss-backup-config__toggle-row">
                    <span>{t('pluginManager.plugins.ossBackup.enableLabel')}</span>
                    <span className="cove-toggle">
                      <input
                        type="checkbox"
                        data-testid="oss-backup-enabled"
                        checked={backupSettings.enabled}
                        onChange={event => {
                          updateSettings(current => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }}
                      />
                      <span className="cove-toggle__slider"></span>
                    </span>
                  </label>

                  <label className="plugin-manager-panel__toggle-row oss-backup-config__toggle-row">
                    <span>{t('pluginManager.plugins.ossBackup.autoBackupLabel')}</span>
                    <span className="cove-toggle">
                      <input
                        type="checkbox"
                        data-testid="oss-backup-auto-backup"
                        checked={backupSettings.autoBackupEnabled}
                        onChange={event => {
                          updateSettings(current => ({
                            ...current,
                            autoBackupEnabled: event.target.checked,
                          }))
                        }}
                      />
                      <span className="cove-toggle__slider"></span>
                    </span>
                  </label>

                  <div className="plugin-manager-panel__field-stack">
                    <label htmlFor="oss-backup-auto-backup-interval">
                      {t('pluginManager.plugins.ossBackup.autoBackupIntervalMinutesLabel')}
                    </label>
                    <input
                      id="oss-backup-auto-backup-interval"
                      className="cove-field"
                      data-testid="oss-backup-auto-backup-interval"
                      type="number"
                      min={1}
                      max={1440}
                      step={1}
                      inputMode="numeric"
                      disabled={!backupSettings.autoBackupEnabled}
                      value={Math.max(1, Math.round(backupSettings.autoBackupMinIntervalSeconds / 60))}
                      onChange={event => {
                        const minutes = normalizeAutoBackupIntervalMinutes(Number(event.target.value))
                        updateSettings(current => ({
                          ...current,
                          autoBackupMinIntervalSeconds: minutes * 60,
                        }))
                      }}
                    />
                    <span className="plugin-manager-panel__hint">
                      {t('pluginManager.plugins.ossBackup.autoBackupIntervalMinutesHelp')}
                    </span>
                  </div>

                  <div className="plugin-manager-panel__field-stack">
                    <label className="plugin-manager-panel__toggle-row oss-backup-config__toggle-row">
                      <span>{t('pluginManager.plugins.ossBackup.restoreOnStartupLabel')}</span>
                      <span className="cove-toggle">
                        <input
                          type="checkbox"
                          data-testid="oss-backup-restore-on-startup"
                          checked={backupSettings.restoreOnStartupEnabled}
                          onChange={event => {
                            updateSettings(current => ({
                              ...current,
                              restoreOnStartupEnabled: event.target.checked,
                            }))
                          }}
                        />
                        <span className="cove-toggle__slider"></span>
                      </span>
                    </label>
                  </div>

                  <div className="plugin-manager-panel__field-stack">
                    <label className="plugin-manager-panel__toggle-row oss-backup-config__toggle-row">
                      <span>{t('pluginManager.plugins.ossBackup.backupOnExitLabel')}</span>
                      <span className="cove-toggle">
                        <input
                          type="checkbox"
                          data-testid="oss-backup-backup-on-exit"
                          checked={backupSettings.backupOnExitEnabled}
                          onChange={event => {
                            updateSettings(current => ({
                              ...current,
                              backupOnExitEnabled: event.target.checked,
                            }))
                          }}
                        />
                        <span className="cove-toggle__slider"></span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            <section className="oss-backup-config__section oss-backup-config__section--connection">
              <div className="plugin-manager-panel__field-grid plugin-manager-panel__field-grid--double">
                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="oss-backup-endpoint">
                    {t('pluginManager.plugins.ossBackup.endpointLabel')}
                  </label>
                  <input
                    id="oss-backup-endpoint"
                    className="cove-field"
                    data-testid="oss-backup-endpoint"
                    type="text"
                    value={backupSettings.endpoint}
                    placeholder="https://oss-cn-hangzhou.aliyuncs.com"
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        endpoint: event.target.value,
                      }))
                    }}
                  />
                </div>

                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="oss-backup-region">
                    {t('pluginManager.plugins.ossBackup.regionLabel')}
                  </label>
                  <input
                    id="oss-backup-region"
                    className="cove-field"
                    data-testid="oss-backup-region"
                    type="text"
                    value={backupSettings.region}
                    placeholder="oss-cn-hangzhou"
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        region: event.target.value,
                      }))
                    }}
                  />
                </div>
              </div>

              <div className="plugin-manager-panel__field-grid plugin-manager-panel__field-grid--double">
                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="oss-backup-bucket">
                    {t('pluginManager.plugins.ossBackup.bucketLabel')}
                  </label>
                  <input
                    id="oss-backup-bucket"
                    className="cove-field"
                    data-testid="oss-backup-bucket"
                    type="text"
                    value={backupSettings.bucket}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        bucket: event.target.value,
                      }))
                    }}
                  />
                </div>

                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="oss-backup-object-key">
                    {t('pluginManager.plugins.ossBackup.objectKeyLabel')}
                  </label>
                  <input
                    id="oss-backup-object-key"
                    className="cove-field"
                    data-testid="oss-backup-object-key"
                    type="text"
                    value={backupSettings.objectKey}
                    placeholder="freecli/plugin-settings"
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        objectKey: event.target.value,
                      }))
                    }}
                  />
                  <span className="plugin-manager-panel__hint">
                    {t('pluginManager.plugins.ossBackup.objectKeyHelp')}
                  </span>
                </div>
              </div>

              <div className="plugin-manager-panel__field-grid plugin-manager-panel__field-grid--double">
                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="oss-backup-access-key-id">
                    {t('pluginManager.plugins.ossBackup.accessKeyIdLabel')}
                  </label>
                  <input
                    id="oss-backup-access-key-id"
                    className="cove-field"
                    data-testid="oss-backup-access-key-id"
                    type="text"
                    value={backupSettings.accessKeyId}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        accessKeyId: event.target.value,
                      }))
                    }}
                  />
                </div>

                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="oss-backup-access-key-secret">
                    {t('pluginManager.plugins.ossBackup.accessKeySecretLabel')}
                  </label>
                  <input
                    id="oss-backup-access-key-secret"
                    className="cove-field"
                    data-testid="oss-backup-access-key-secret"
                    type="password"
                    value={backupSettings.accessKeySecret}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        accessKeySecret: event.target.value,
                      }))
                    }}
                  />
                </div>
              </div>
            </section>
          </div>
        </OssBackupConnectionDialog>
      ) : null}

      {pendingSyncDecision ? (
        <div
          className="cove-window-backdrop oss-backup-config__dialog-backdrop"
          data-testid="oss-backup-sync-decision-dialog"
          onClick={() => {
            setPendingSyncDecision(null)
          }}
        >
          <section
            className="cove-window oss-backup-config__settings-dialog oss-backup-config__decision-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t('pluginManager.plugins.ossBackup.syncDecisionTitle')}
            onClick={event => {
              event.stopPropagation()
            }}
          >
            <div className="oss-backup-config__dialog-header">
              <div className="oss-backup-config__dialog-copy">
                <h3>{t('pluginManager.plugins.ossBackup.syncDecisionTitle')}</h3>
                <p>
                  {pendingSyncDecision.reason === 'conflict'
                    ? t('pluginManager.plugins.ossBackup.syncDecisionSummary')
                    : t('pluginManager.plugins.ossBackup.syncDecisionSuggestionSummary', {
                        suggested:
                          suggestedDecisionLabel ??
                          t('pluginManager.plugins.ossBackup.syncDecisionSuggestedRemote'),
                      })}
                </p>
              </div>
            </div>

            <div className="oss-backup-config__settings-dialog-body">
              <div className="oss-backup-config__scope-list">
                {conflictedDatasetLabels.map(label => (
                  <span key={label} className="oss-backup-config__scope-pill">
                    {label}
                  </span>
                ))}
              </div>
              <div className="oss-backup-config__sync-detail-list">
                <strong>{t('pluginManager.plugins.ossBackup.syncDecisionDetailTitle')}</strong>
                {syncDecisionDetails.map(detail => (
                  <article key={detail.datasetId} className="oss-backup-config__sync-detail-item">
                    <div className="oss-backup-config__sync-detail-head">{detail.label}</div>
                    <div className="oss-backup-config__sync-detail-grid">
                      <div className="oss-backup-config__sync-detail-column">
                        <span>{t('pluginManager.plugins.ossBackup.syncDecisionDetailLocal')}</span>
                        <code>
                          {t('pluginManager.plugins.ossBackup.syncDecisionDetailVersion')}:&nbsp;
                          {formatFileVersion(detail.localFile)}
                        </code>
                        <code>
                          {t('pluginManager.plugins.ossBackup.syncDecisionDetailUpdatedAt')}:&nbsp;
                          {formatDateTime(detail.localFile.modifiedAt)}
                        </code>
                        <code>
                          {t('pluginManager.plugins.ossBackup.syncDecisionDetailSize')}:&nbsp;
                          {formatSizeBytes(detail.localFile.sizeBytes)}
                        </code>
                      </div>
                      <div className="oss-backup-config__sync-detail-column">
                        <span>{t('pluginManager.plugins.ossBackup.syncDecisionDetailRemote')}</span>
                        <code>
                          {t('pluginManager.plugins.ossBackup.syncDecisionDetailVersion')}:&nbsp;
                          {formatFileVersion(detail.remoteFile)}
                        </code>
                        <code>
                          {t('pluginManager.plugins.ossBackup.syncDecisionDetailUpdatedAt')}:&nbsp;
                          {formatDateTime(detail.remoteFile.modifiedAt)}
                        </code>
                        <code>
                          {t('pluginManager.plugins.ossBackup.syncDecisionDetailSize')}:&nbsp;
                          {formatSizeBytes(detail.remoteFile.sizeBytes)}
                        </code>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="cove-window__actions">
              <button
                type="button"
                className="cove-window__action cove-window__action--secondary"
                onClick={() => {
                  setPendingSyncDecision(null)
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="cove-window__action cove-window__action--secondary"
                data-testid="oss-backup-sync-decision-use-remote"
                onClick={() => {
                  setPendingSyncDecision(null)
                  executeRestore()
                }}
              >
                {t('pluginManager.plugins.ossBackup.syncDecisionUseRemote')}
              </button>
              <button
                type="button"
                className="cove-window__action cove-window__action--primary"
                data-testid="oss-backup-sync-decision-use-local"
                onClick={() => {
                  setPendingSyncDecision(null)
                  executeBackup()
                }}
              >
                {t('pluginManager.plugins.ossBackup.syncDecisionUseLocal')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
