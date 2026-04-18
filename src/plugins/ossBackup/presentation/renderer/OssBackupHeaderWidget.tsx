import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import type { HeaderPluginWidgetProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { useOssBackupState } from './useOssBackupState'

type OssHeaderStatus = 'success' | 'syncing' | 'error'

function resolveHeaderStatus(
  state: ReturnType<typeof useOssBackupState>['state'],
): {
  status: OssHeaderStatus
  titleKey: string
  titleParams?: Record<string, string>
} {
  if (state.isBackingUp || state.isRestoring || state.isTestingConnection) {
    return {
      status: 'syncing',
      titleKey: 'pluginManager.plugins.ossBackup.header.syncing',
    }
  }

  if (state.status === 'error' || state.lastError) {
    return {
      status: 'error',
      titleKey: 'pluginManager.plugins.ossBackup.header.error',
      titleParams: {
        message: state.lastError?.message ?? 'Unknown error',
      },
    }
  }

  return {
    status: 'success',
    titleKey: 'pluginManager.plugins.ossBackup.header.success',
  }
}

export default function OssBackupHeaderWidget({
  onOpenPluginManager,
}: HeaderPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state } = useOssBackupState()
  const summary = React.useMemo(() => resolveHeaderStatus(state), [state])

  return (
    <button
      type="button"
      className={`app-header__oss-sync-button app-header__oss-sync-button--${summary.status}`}
      data-testid="app-header-oss-backup-status"
      aria-label={t(summary.titleKey, summary.titleParams)}
      title={t(summary.titleKey, summary.titleParams)}
      onClick={() => onOpenPluginManager('oss-backup')}
    >
      <svg
        aria-hidden="true"
        className="app-header__oss-sync-cloud"
        viewBox="0 0 24 24"
        width="18"
        height="18"
      >
        <path
          d="M17.35 18.65H7.15a4.15 4.15 0 1 1 .88-8.2 5.25 5.25 0 0 1 10.3-1.55 3.55 3.55 0 0 1-.98 7.75Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span
        aria-hidden="true"
        className={`app-header__oss-sync-badge app-header__oss-sync-badge--${summary.status}`}
        data-testid="app-header-oss-backup-status-badge"
      >
        {summary.status === 'success' ? (
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path
              d="M2.25 6.1 4.72 8.45 9.75 3.35"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : summary.status === 'error' ? (
          <svg viewBox="0 0 12 12" width="12" height="12">
            <path
              d="M6 2.3V6.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="6" cy="9.15" r="0.9" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" width="12" height="12">
            <circle cx="2.15" cy="6" r="0.9" fill="currentColor" />
            <circle cx="6" cy="6" r="0.9" fill="currentColor" />
            <circle cx="9.85" cy="6" r="0.9" fill="currentColor" />
          </svg>
        )}
      </span>
    </button>
  )
}
