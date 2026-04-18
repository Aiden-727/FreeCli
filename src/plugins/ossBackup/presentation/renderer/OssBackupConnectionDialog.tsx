import React from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'

export function OssBackupConnectionDialog({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className="cove-window-backdrop oss-backup-config__dialog-backdrop"
      data-testid="oss-backup-connection-dialog"
      onClick={onClose}
    >
      <section
        className="cove-window oss-backup-config__settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('pluginManager.plugins.ossBackup.connectionTitle')}
        onClick={event => {
          event.stopPropagation()
        }}
      >
        <div className="oss-backup-config__dialog-header">
          <div className="oss-backup-config__dialog-copy">
            <h3>{t('pluginManager.plugins.ossBackup.connectionTitle')}</h3>
            <p>{t('pluginManager.plugins.ossBackup.connectionSummary')}</p>
          </div>
          <button
            type="button"
            className="cove-window__icon-button"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="oss-backup-config__settings-dialog-body">{children}</div>

        <div className="cove-window__actions">
          <button
            type="button"
            className="cove-window__action cove-window__action--primary"
            data-testid="oss-backup-connection-dialog-close"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>
      </section>
    </div>
  )
}

