import React from 'react'
import { X } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'

export function GitWorklogConfigurationDialog({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className="cove-window-backdrop git-worklog-config__dialog-backdrop"
      data-testid="git-worklog-config-dialog"
      onClick={onClose}
    >
      <section
        className="cove-window git-worklog-config__settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('pluginManager.plugins.gitWorklog.configurationTitle')}
        onClick={event => {
          event.stopPropagation()
        }}
      >
        <div className="git-worklog-config__dialog-header">
          <div className="git-worklog-config__dialog-copy">
            <h3>{t('pluginManager.plugins.gitWorklog.configurationTitle')}</h3>
            <p>{t('pluginManager.plugins.gitWorklog.configurationDialogSummary')}</p>
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

        <div className="git-worklog-config__settings-dialog-body">{children}</div>

        <div className="cove-window__actions">
          <button
            type="button"
            className="cove-window__action cove-window__action--primary"
            data-testid="git-worklog-config-dialog-close"
            onClick={onClose}
          >
            {t('common.close')}
          </button>
        </div>
      </section>
    </div>
  )
}
