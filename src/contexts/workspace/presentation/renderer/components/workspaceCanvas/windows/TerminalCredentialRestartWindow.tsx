import React from 'react'
import { WarningDialog } from '@app/renderer/components/WarningDialog'
import { useTranslation } from '@app/renderer/i18n'
import type { TerminalCredentialRestartDialogState } from '../types'

export function TerminalCredentialRestartWindow({
  dialog,
  isRestarting,
  onCancel,
  onConfirm,
}: {
  dialog: TerminalCredentialRestartDialogState | null
  isRestarting: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}): React.JSX.Element | null {
  const { t } = useTranslation()

  if (!dialog) {
    return null
  }

  return (
    <WarningDialog
      dataTestId="terminal-credential-restart-dialog"
      title={t('terminalNodeHeader.restartDialogTitle')}
      summary={t('terminalNodeHeader.restartDialogSummary', { title: dialog.title })}
      statusLabel={t('common.warning')}
      lead={
        <>
          <p>
            {t('terminalNodeHeader.restartDialogCurrentProfile', {
              profile: dialog.currentProfileLabel,
            })}
          </p>
          <p>
            {t('terminalNodeHeader.restartDialogNextProfile', {
              profile: dialog.nextProfileLabel,
            })}
          </p>
          <p>
            {dialog.willResumeConversation
              ? t('terminalNodeHeader.restartDialogResumeHint')
              : t('terminalNodeHeader.restartDialogManualHint')}
          </p>
        </>
      }
      actions={
        <>
          <button
            type="button"
            className="cove-window__action cove-window__action--ghost"
            onClick={onCancel}
            disabled={isRestarting}
          >
            {t('terminalNodeHeader.restartDialogKeepRunning')}
          </button>
          <button
            type="button"
            className="cove-window__action cove-window__action--primary"
            data-testid="terminal-credential-restart-dialog-confirm"
            onClick={() => {
              void onConfirm()
            }}
            disabled={isRestarting}
          >
            {isRestarting
              ? t('terminalNodeHeader.restartDialogRestarting')
              : t('terminalNodeHeader.restartDialogRestartNow')}
          </button>
        </>
      }
      onBackdropClick={() => {
        if (!isRestarting) {
          onCancel()
        }
      }}
      disableBackdropDismiss={isRestarting}
      dialogClassName="workspace-warning-dialog--compact"
    />
  )
}
