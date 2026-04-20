import React, { useCallback, useEffect, useState, type JSX } from 'react'
import { useTranslation } from '@app/renderer/i18n'
import { Check, ChevronDown, Copy, KeyRound, LoaderCircle, PencilLine } from 'lucide-react'
import type { AgentRuntimeStatus, TerminalPersistenceMode, WorkspaceNodeKind } from '../../types'
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
  credentialProfileId?: string | null
  activeCredentialProfileId?: string | null
  terminalCredentialProfiles?: Array<{
    id: string
    label: string
    provider: 'codex' | 'claude-code'
  }>
  activeCredentialProvider?: 'codex' | 'claude-code' | null
  persistenceMode?: TerminalPersistenceMode
  onTitleCommit?: (title: string) => void
  onCredentialProfileChange?: (credentialProfileId: string | null) => void
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
  credentialProfileId,
  activeCredentialProfileId,
  terminalCredentialProfiles,
  activeCredentialProvider,
  persistenceMode,
  onTitleCommit,
  onCredentialProfileChange,
  onPersistenceModeChange,
  onClose,
  onCopyLastMessage,
}: TerminalNodeHeaderProps): JSX.Element {
  const { t } = useTranslation()
  const [isTitleEditing, setIsTitleEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(title)
  const [isCopyingLastMessage, setIsCopyingLastMessage] = useState(false)
  const [isCredentialMenuOpen, setIsCredentialMenuOpen] = useState(false)

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
  const codexCredentialProfiles = (terminalCredentialProfiles ?? []).filter(
    profile => profile.provider === 'codex',
  )
  const shouldRenderCredentialCapsule =
    isTerminalNode &&
    activeCredentialProvider === 'codex' &&
    typeof onCredentialProfileChange === 'function'
  const activeCredentialProfile =
    codexCredentialProfiles.find(profile => profile.id === activeCredentialProfileId) ?? null
  const selectedCredentialProfile =
    codexCredentialProfiles.find(profile => profile.id === credentialProfileId) ?? null
  const hasPendingCredentialChange =
    (credentialProfileId ?? null) !== (activeCredentialProfileId ?? null)
  const activeCredentialLabel =
    activeCredentialProfile?.label ?? t('terminalNodeHeader.noCredentialProfile')
  const selectedCredentialLabel =
    selectedCredentialProfile?.label ?? t('terminalNodeHeader.noCredentialProfile')
  const credentialCapsuleLabel = activeCredentialProfile?.label ?? null
  const shouldRenderPersistenceToggle =
    isTerminalNode && persistenceMode && typeof onPersistenceModeChange === 'function'

  useEffect(() => {
    if (isTitleEditing) {
      return
    }

    setTitleDraft(title)
  }, [isTitleEditing, title])

  useEffect(() => {
    if (!isCredentialMenuOpen) {
      return
    }

    const closeMenu = (event: MouseEvent): void => {
      if (
        event.target instanceof Element &&
        event.target.closest('.terminal-node__credential-picker')
      ) {
        return
      }

      setIsCredentialMenuOpen(false)
    }

    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsCredentialMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', closeMenu)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', closeMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [isCredentialMenuOpen])

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

  const startTitleEdit = useCallback(() => {
    if (!isTitleEditable || isTitleEditing) {
      return
    }

    setTitleDraft(title)
    setIsTitleEditing(true)
  }, [isTitleEditable, isTitleEditing, title])

  const finishTitleEdit = useCallback(() => {
    commitTitleEdit()
    setIsTitleEditing(false)
  }, [commitTitleEdit])

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
      startTitleEdit()
    },
    [isTitleEditable, isTitleEditing, startTitleEdit],
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
                finishTitleEdit()
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
                  finishTitleEdit()
                }
              }}
            />
            <button
              type="button"
              className="terminal-node__action terminal-node__action--icon terminal-node__title-confirm nodrag"
              data-testid="terminal-node-title-confirm"
              aria-label={t('terminalNodeHeader.finishEditingTitle')}
              title={t('terminalNodeHeader.finishEditingTitle')}
              onMouseDown={event => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={event => {
                event.stopPropagation()
                finishTitleEdit()
              }}
            >
              <Check className="terminal-node__action-icon" />
            </button>
          </>
        ) : (
          <>
            <span className="terminal-node__title">{titleDraft}</span>
            <button
              type="button"
              className="terminal-node__action terminal-node__action--icon terminal-node__title-edit nodrag"
              data-testid="terminal-node-title-edit"
              aria-label={t('terminalNodeHeader.editTitle')}
              title={t('terminalNodeHeader.editTitle')}
              onClick={event => {
                event.stopPropagation()
                startTitleEdit()
              }}
            >
              <PencilLine className="terminal-node__action-icon" />
            </button>
          </>
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

      {shouldRenderCredentialCapsule ? (
        <div className="terminal-node__credential-picker nodrag">
          <button
            type="button"
            className={`terminal-node__credential-capsule ${
              hasPendingCredentialChange ? 'terminal-node__credential-capsule--pending' : ''
            }`.trim()}
            data-testid="terminal-node-credential-capsule"
            aria-haspopup="menu"
            aria-expanded={isCredentialMenuOpen}
            title={
              hasPendingCredentialChange
                ? t('terminalNodeHeader.credentialPendingTitle', {
                    activeProfile: activeCredentialLabel,
                    nextProfile: selectedCredentialLabel,
                  })
                : t('terminalNodeHeader.credentialActiveTitle', {
                    activeProfile: activeCredentialLabel,
                  })
            }
            onClick={event => {
              event.stopPropagation()
              setIsCredentialMenuOpen(open => !open)
            }}
          >
            <KeyRound className="terminal-node__credential-icon" aria-hidden="true" />
            <span className="terminal-node__credential-provider">
              {t('terminalNodeHeader.providerCodex')}
            </span>
            {credentialCapsuleLabel ? (
              <span className="terminal-node__credential-name">{credentialCapsuleLabel}</span>
            ) : null}
            {hasPendingCredentialChange ? (
              <span className="terminal-node__credential-pending">
                {t('terminalNodeHeader.credentialPending')}
              </span>
            ) : null}
            <ChevronDown
              className={`terminal-node__credential-chevron ${
                isCredentialMenuOpen ? 'terminal-node__credential-chevron--open' : ''
              }`.trim()}
              aria-hidden="true"
            />
          </button>

          {isCredentialMenuOpen ? (
            <div
              className="workspace-context-menu terminal-node__credential-menu"
              data-testid="terminal-node-credential-menu"
              role="menu"
              onMouseDown={event => {
                event.stopPropagation()
              }}
              onClick={event => {
                event.stopPropagation()
              }}
            >
              <div className="workspace-context-menu__section-title">
                {t('terminalNodeHeader.credentialMenuTitle')}
              </div>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={(credentialProfileId ?? null) === null}
                data-testid="terminal-node-credential-option-none"
                onClick={() => {
                  onCredentialProfileChange?.(null)
                  setIsCredentialMenuOpen(false)
                }}
              >
                {(credentialProfileId ?? null) === null ? (
                  <Check className="workspace-context-menu__mark" aria-hidden="true" />
                ) : (
                  <span className="workspace-context-menu__mark" aria-hidden="true" />
                )}
                <span className="workspace-context-menu__label">
                  {t('terminalNodeHeader.noCredentialProfile')}
                </span>
              </button>
              {codexCredentialProfiles.map(profile => (
                <button
                  key={profile.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={credentialProfileId === profile.id}
                  data-testid={`terminal-node-credential-option-${profile.id}`}
                  onClick={() => {
                    onCredentialProfileChange?.(profile.id)
                    setIsCredentialMenuOpen(false)
                  }}
                >
                  {credentialProfileId === profile.id ? (
                    <Check className="workspace-context-menu__mark" aria-hidden="true" />
                  ) : (
                    <span className="workspace-context-menu__mark" aria-hidden="true" />
                  )}
                  <span className="workspace-context-menu__label">{profile.label}</span>
                </button>
              ))}
            </div>
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
            onPersistenceModeChange(persistenceMode === 'persistent' ? 'ephemeral' : 'persistent')
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
