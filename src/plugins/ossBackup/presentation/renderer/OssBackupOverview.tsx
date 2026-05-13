import React from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { OssBackupStateDto } from '@shared/contracts/dto'

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

function formatCountdown(targetIso: string | null, now: number): string {
  if (!targetIso) {
    return '--'
  }

  const target = new Date(targetIso).getTime()
  if (!Number.isFinite(target)) {
    return '--'
  }

  const remainingMs = Math.max(0, target - now)
  const totalSeconds = Math.floor(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function formatNextAutoBackupValue(
  targetIso: string | null,
  now: number,
  autoBackupEnabled: boolean,
  isRetrying: boolean,
  t: (key: string, params?: Record<string, string>) => string,
): string {
  if (!autoBackupEnabled) {
    return t('pluginManager.plugins.ossBackup.nextAutoBackupDisabled')
  }

  if (!targetIso) {
    return t('pluginManager.plugins.ossBackup.nextAutoBackupWaiting')
  }

  if (isRetrying) {
    return t('pluginManager.plugins.ossBackup.nextAutoBackupRetry', {
      countdown: formatCountdown(targetIso, now),
    })
  }

  return formatCountdown(targetIso, now)
}

function OverviewMetric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <article className="oss-backup-overview__summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

export function OssBackupOverview({
  state,
  includedPluginCount,
  participantCount,
  autoBackupEnabled,
  onTestConnection,
  onBackup,
  onRestore,
}: {
  state: OssBackupStateDto
  includedPluginCount: number
  participantCount: number
  autoBackupEnabled: boolean
  onTestConnection: () => void
  onBackup: () => void
  onRestore: () => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [nowTs, setNowTs] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!state.nextAutoBackupDueAt) {
      return
    }

    const timer = window.setInterval(() => {
      setNowTs(Date.now())
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [state.nextAutoBackupDueAt])

  const lastSnapshotLabel = t('pluginManager.plugins.ossBackup.lastSnapshotAt', {
    value: formatDateTime(state.lastSnapshotAt),
  })
  const autoBackupValue = formatNextAutoBackupValue(
    state.nextAutoBackupDueAt,
    nowTs,
    autoBackupEnabled,
    state.status === 'error',
    t,
  )

  return (
    <section className="oss-backup-overview" data-testid="oss-backup-overview">
      <div className="oss-backup-overview__header">
        <div className="oss-backup-overview__headline">
          <span className="oss-backup-overview__kicker">
            {t('pluginManager.plugins.ossBackup.overviewEyebrow')}
          </span>
          <h4>{t('pluginManager.plugins.ossBackup.summaryTitle')}</h4>
          <p>{t('pluginManager.plugins.ossBackup.summaryBody')}</p>
        </div>

        <div className="oss-backup-overview__toolbar">
          <span
            className={`oss-backup-overview__status-pill oss-backup-overview__status-pill--${state.status}`}
          >
            {t(`pluginManager.plugins.ossBackup.runtimeStatus.${state.status}`)}
          </span>
          <span className="oss-backup-overview__meta-pill">{lastSnapshotLabel}</span>
          <button
            type="button"
            className="cove-window__action cove-window__action--secondary oss-backup-overview__action oss-backup-overview__action--neutral"
            data-testid="oss-backup-test-connection"
            onClick={onTestConnection}
            disabled={state.isTestingConnection}
          >
            <RefreshCw size={14} />
            <span>
              {state.isTestingConnection
                ? t('pluginManager.plugins.ossBackup.testingConnection')
                : t('pluginManager.plugins.ossBackup.testConnection')}
            </span>
          </button>
          <button
            type="button"
            className="cove-window__action cove-window__action--secondary oss-backup-overview__action oss-backup-overview__action--primary"
            data-testid="oss-backup-run-backup"
            onClick={onBackup}
            disabled={state.isBackingUp}
          >
            {state.isBackingUp
              ? t('pluginManager.plugins.ossBackup.backingUp')
              : t('pluginManager.plugins.ossBackup.runBackup')}
          </button>
          <button
            type="button"
            className="cove-window__action cove-window__action--secondary oss-backup-overview__action oss-backup-overview__action--accent"
            data-testid="oss-backup-run-restore"
            onClick={onRestore}
            disabled={state.isRestoring}
          >
            {state.isRestoring
              ? t('pluginManager.plugins.ossBackup.restoring')
              : t('pluginManager.plugins.ossBackup.runRestore')}
          </button>
        </div>
      </div>

      {state.lastError ? (
        <div className="oss-backup-overview__banner oss-backup-overview__banner--error">
          <strong>{t('pluginManager.plugins.ossBackup.statusTitle')}</strong>
          <span>
            {t('pluginManager.plugins.ossBackup.lastError', {
              message: state.lastError.message,
            })}
          </span>
        </div>
      ) : null}

      <div className="oss-backup-overview__summary-grid">
        <OverviewMetric
          label={t('pluginManager.plugins.ossBackup.overviewMetrics.scope')}
          value={`${includedPluginCount}/${participantCount}`}
        />
        <OverviewMetric
          label={t('pluginManager.plugins.ossBackup.overviewMetrics.lastBackup')}
          value={formatDateTime(state.lastBackupAt)}
        />
        <OverviewMetric
          label={t('pluginManager.plugins.ossBackup.overviewMetrics.lastRestore')}
          value={formatDateTime(state.lastRestoreAt)}
        />
        <OverviewMetric
          label={t('pluginManager.plugins.ossBackup.overviewMetrics.lastSnapshot')}
          value={formatDateTime(state.lastSnapshotAt)}
        />
        <OverviewMetric
          label={t('pluginManager.plugins.ossBackup.overviewMetrics.nextAutoBackup')}
          value={autoBackupValue}
        />
      </div>
    </section>
  )
}
