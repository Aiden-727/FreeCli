import React, { useCallback, useEffect, useState, type JSX } from 'react'
import { useTranslation } from '@app/renderer/i18n'
import { Copy, LoaderCircle } from 'lucide-react'
import type {
  AgentRuntimeStatus,
  TerminalPersistenceMode,
  WorkspaceNodeKind,
} from '../../types'
import type { LabelColor } from '@shared/types/labelColor'
import { getStatusClassName } from './status'

interface TerminalNodeHeaderProps {
  title: string
  modelLabel?: string | null
  kind: WorkspaceNodeKind
  isAgentLike?: boolean
  status: AgentRuntimeStatus | null
  labelColor?: LabelColor | null
  directoryMismatch?: { executionDirectory: string; expectedDirectory: string } | null
  persistenceMode?: TerminalPersistenceMode
  onTitleCommit?: (title: string) => void
  onPersistenceModeChange?: (mode: TerminalPersistenceMode) => void
  onClose: () => void
  onCopyLastMessage?: () => Promise<void>
}

export function TerminalNodeHeader({
  title,
  modelLabel,
  kind,
  isAgentLike = false,
  status,
  labelColor,
  directoryMismatch,
  persistenceMode,
  onTitleCommit,
  onPersistenceModeChange,
  onClose,
  onCopyLastMessage,
}: TerminalNodeHeaderProps): JSX.Element {
  const { t } = useTranslation()
  const [isTitleEditing, setIsTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const [isCopyingLastMessage, setIsCopyingLastMessage] = useState(false)

  const isTitleEditable = typeof onTitleCommit === 'function'
  const isAgentNode = kind === 'agent'
  const showAgentChrome = isAgentNode || isAgentLike
  const shouldRenderStatusBadge = showAgentChrome && status !== null
  const normalizedModelLabel = typeof modelLabel === 'string' ? modelLabel.trim() : ''
  const shouldRenderModelBadge = showAgentChrome && normalizedModelLabel.length > 0
  const shouldRenderCopyLastMessageButton =
    showAgentChrome &&
    (status === 'standby' || status === 'running') &&
    typeof onCopyLastMessage === 'function'
  const isCopyLastMessageDisabled = isCopyingLastMessage || status !== 'standby'
  const isTerminalNode = kind === 'terminal'
  const shouldRenderPersistenceToggle =
    isTerminalNode && persistenceMode && typeof onPersistenceModeChange === 'function'

  useEffect(() => {
    if (isTitleEditing) {
      return
    }

    setTitleDraft(title)
  }, [isTitleEditing, title])

  const commitTitleEdit = useCallback(() => {
    if (!isTitleEditable) {
      return
    }

    const normalizedTitle = titleDraft.trim()
    if (normalizedTitle.length === 0) {
      setTitleDraft(title)
      return
    }

    if (normalizedTitle !== title) {
      onTitleCommit(normalizedTitle)
    }
  }, [isTitleEditable, onTitleCommit, title, titleDraft])

  const cancelTitleEdit = useCallback(() => {
    setTitleDraft(title)
  }, [title])

  const handleHeaderClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        event.detail !== 2 ||
        !isTitleEditable ||
        isTitleEditing ||
        !(event.target instanceof Element) ||
        event.target.closest('.nodrag')
      ) {
        return
      }

      event.stopPropagation()
      setIsTitleEditing(true)
    },
    [isTitleEditable, isTitleEditing],
  )

  const statusLabel = (() => {
    switch (status) {
      case 'standby':
        return t('agentRuntime.standby')
      case 'exited':
        return t('agentRuntime.exited')
      case 'failed':
        return t('agentRuntime.failed')
      case 'stopped':
        return t('agentRuntime.stopped')
      case 'restoring':
        return t('agentRuntime.restoring')
      case 'running':
      default:
        return t('agentRuntime.working')
    }
  })()

  return (
    <div className="terminal-node__header" data-node-drag-handle="true" onClick={handleHeaderClick}>
      {labelColor ? (
        <span
          className="cove-label-dot cove-label-dot--solid"
          data-cove-label-color={labelColor}
          aria-hidden="true"
        />
      ) : null}
      {isTitleEditable ? (
        isTitleEditing ? (
          <>
            <span className="terminal-node__title terminal-node__title-proxy" aria-hidden="true">
              {titleDraft}
            </span>
            <input
              className="terminal-node__title-input nodrag nowheel"
              data-testid="terminal-node-inline-title-input"
              value={titleDraft}
              autoFocus
              onFocus={() => {
                setIsTitleEditing(true)
              }}
              onPointerDown={event => {
                event.stopPropagation()
              }}
              onClick={event => {
                event.stopPropagation()
              }}
              onChange={event => {
                setTitleDraft(event.target.value)
              }}
              onBlur={() => {
                commitTitleEdit()
                setIsTitleEditing(false)
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelTitleEdit()
                  event.currentTarget.blur()
                  return
                }

                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
            />
          </>
        ) : (
          <span className="terminal-node__title">{titleDraft}</span>
        )
      ) : (
        <span className="terminal-node__title">{title}</span>
      )}

      {directoryMismatch || shouldRenderModelBadge || shouldRenderStatusBadge ? (
        <div className="terminal-node__header-badges nodrag">
          {directoryMismatch ? (
            <span
              className="terminal-node__badge terminal-node__badge--warning"
              title={t('terminalNodeHeader.directoryMismatchTitle', {
                executionDirectory: directoryMismatch.executionDirectory,
                expectedDirectory: directoryMismatch.expectedDirectory,
              })}
            >
              {t('terminalNodeHeader.directoryMismatch')}
            </span>
          ) : null}
          {shouldRenderModelBadge ? (
            <span
              className="terminal-node__badge terminal-node__badge--model"
              data-testid="terminal-node-model-badge"
              title={normalizedModelLabel}
            >
              {normalizedModelLabel}
            </span>
          ) : null}
          {shouldRenderStatusBadge ? (
            <span className={`terminal-node__status ${getStatusClassName(status)}`}>
              {statusLabel}
            </span>
          ) : null}
        </div>
      ) : null}

      {shouldRenderPersistenceToggle ? (
        <button
          type="button"
          role="switch"
          className={`terminal-node__switch terminal-node__switch--header nodrag ${
            persistenceMode === 'persistent' ? 'terminal-node__switch--on' : ''
          }`.trim()}
          data-testid="terminal-node-persistence-switch"
          aria-checked={persistenceMode === 'persistent'}
          aria-label={
            persistenceMode === 'persistent'
              ? t('terminalNodeHeader.persistenceModePersistent')
              : t('terminalNodeHeader.persistenceModeEphemeral')
          }
          title={
            persistenceMode === 'persistent'
              ? t('terminalNodeHeader.persistenceModePersistentHint')
              : t('terminalNodeHeader.persistenceModeEphemeralHint')
          }
          onClick={event => {
            event.stopPropagation()
            onPersistenceModeChange(
              persistenceMode === 'persistent' ? 'ephemeral' : 'persistent',
            )
          }}
        >
          <span className="terminal-node__switch-track" aria-hidden="true">
            <span className="terminal-node__switch-thumb" />
          </span>
          <span className="terminal-node__switch-text">
            {persistenceMode === 'persistent'
              ? t('terminalNodeHeader.persistenceModePersistent')
              : t('terminalNodeHeader.persistenceModeEphemeral')}
          </span>
        </button>
      ) : null}

      {shouldRenderCopyLastMessageButton ? (
        <button
          type="button"
          className="terminal-node__action terminal-node__action--icon nodrag"
          data-testid="terminal-node-copy-last-message"
          aria-label={t('terminalNodeHeader.copyLastMessage')}
          title={
            isCopyingLastMessage
              ? t('terminalNodeHeader.copyingLastMessage')
              : t('terminalNodeHeader.copyLastMessage')
          }
          disabled={isCopyLastMessageDisabled}
          onClick={async event => {
            event.stopPropagation()
            if (isCopyLastMessageDisabled || !onCopyLastMessage) {
              return
            }

            setIsCopyingLastMessage(true)

            try {
              await onCopyLastMessage()
            } finally {
              setIsCopyingLastMessage(false)
            }
          }}
        >
          {isCopyingLastMessage ? (
            <LoaderCircle className="terminal-node__action-icon terminal-node__action-icon--spinning" />
          ) : (
            <Copy className="terminal-node__action-icon" />
          )}
        </button>
      ) : null}

      <button
        type="button"
        className="terminal-node__close nodrag"
        onClick={event => {
          event.stopPropagation()
          onClose()
        }}
      >
        ×
      </button>
    </div>
  )
}
