import React from 'react'
import { Bot, CircleAlert, TerminalSquare, X } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { TerminalSessionAttentionReason } from '@shared/contracts/dto'

export type AgentStandbyNotificationGitContext =
  | { kind: 'branch'; name: string }
  | { kind: 'detached'; head: string; shortHead: string }

export type AgentStandbyNotificationPullRequest = {
  number: number
  title: string
  url: string | null
}

export type AgentStandbyNotification = {
  kind: 'agent-attention'
  id: string
  sessionId: string
  bindingId: string | null
  attentionReason: TerminalSessionAttentionReason
  workspaceId: string
  workspaceName: string
  workspacePath: string
  nodeId: string
  title: string
  taskId: string | null
  taskTitle: string | null
  spaceId: string | null
  spaceName: string | null
  spaceDirectoryPath: string | null
  executionDirectory: string
  gitContext: AgentStandbyNotificationGitContext | null
  pullRequest: AgentStandbyNotificationPullRequest | null
  createdAt: number
}

export type RecoveryNotification = {
  kind: 'agent-recovery'
  id: string
  sessionId: string
  bindingId: string | null
  attentionReason: 'recovery'
  workspaceId: string
  workspaceName: string
  workspacePath: string
  nodeId: string
  title: string
  taskId: string | null
  taskTitle: string | null
  spaceId: string | null
  spaceName: string | null
  spaceDirectoryPath: string | null
  executionDirectory: string
  message: string
  gitContext: AgentStandbyNotificationGitContext | null
  pullRequest: AgentStandbyNotificationPullRequest | null
  createdAt: number
}

export type AppNotification = AgentStandbyNotification | RecoveryNotification

export function AppNotifications({
  notifications,
  onActivate,
  onDismiss,
  contextVisibility = {
    showTask: true,
    showSpace: true,
    showBranch: true,
    showPullRequest: true,
  },
}: {
  notifications: AppNotification[]
  onActivate: (notification: AppNotification) => void
  onDismiss: (id: string) => void
  contextVisibility?: {
    showTask: boolean
    showSpace: boolean
    showBranch: boolean
    showPullRequest: boolean
  }
}): React.JSX.Element | null {
  const { t } = useTranslation()

  if (notifications.length === 0) {
    return null
  }

  return (
    <div className="app-notifications" data-testid="app-notifications" role="status">
      {notifications.map(notification => {
        const status =
          notification.attentionReason === 'approval'
            ? t('notifications.agentAttention.reasonApproval')
            : notification.attentionReason === 'recovery'
              ? t('notifications.agentAttention.reasonRecovery')
              : t('notifications.agentAttention.reasonInput')
        const subtitle = notification.workspaceName
          ? `${status} · ${notification.workspaceName}`
          : status
        const taskKindLabel = t('settingsPanel.nav.tasks')
        const spaceKindLabel = t('commandCenter.sections.spaces')
        const branchKindLabel = t('worktree.branch')
        const detachedKindLabel = t('worktree.detached')

        const icon =
          notification.attentionReason === 'recovery' ? (
            <TerminalSquare size={18} />
          ) : notification.attentionReason === 'approval' ? (
            <CircleAlert size={18} />
          ) : (
            <Bot size={18} />
          )

        return (
          <div
            key={notification.id}
            className="app-notification"
            role="button"
            tabIndex={0}
            aria-label={`${notification.title} (${subtitle})`}
            data-testid={`app-notification-${notification.id}`}
            onClick={() => {
              onActivate(notification)
            }}
            onKeyDown={event => {
              if (event.key !== 'Enter' && event.key !== ' ') {
                return
              }

              event.preventDefault()
              onActivate(notification)
            }}
          >
            <span className="app-notification__icon" aria-hidden="true">
              {icon}
            </span>
            <span className="app-notification__content">
              <span className="app-notification__title">{notification.title}</span>
              <span className="app-notification__subtitle">{subtitle}</span>
              {notification.kind === 'agent-recovery' ? (
                <span className="app-notification__message">{notification.message}</span>
              ) : null}
              {contextVisibility.showTask ||
              contextVisibility.showSpace ||
              contextVisibility.showBranch ||
              contextVisibility.showPullRequest ? (
                <span className="app-notification__context">
                  {contextVisibility.showTask && notification.taskTitle ? (
                    <span
                      className="app-notification__chip"
                      data-testid="app-notification-chip-task"
                      title={notification.taskTitle}
                    >
                      <span className="app-notification__chip-kind">{taskKindLabel}</span>
                      <span className="app-notification__chip-value">{notification.taskTitle}</span>
                    </span>
                  ) : null}

                  {contextVisibility.showSpace && notification.spaceName ? (
                    <span
                      className="app-notification__chip"
                      data-testid="app-notification-chip-space"
                      title={notification.spaceName}
                    >
                      <span className="app-notification__chip-kind">{spaceKindLabel}</span>
                      <span className="app-notification__chip-value">{notification.spaceName}</span>
                    </span>
                  ) : null}

                  {contextVisibility.showBranch && notification.gitContext ? (
                    <span
                      className="app-notification__chip"
                      data-testid="app-notification-chip-branch"
                      title={
                        notification.gitContext.kind === 'branch'
                          ? notification.gitContext.name
                          : notification.gitContext.head
                      }
                    >
                      <span className="app-notification__chip-kind">
                        {notification.gitContext.kind === 'branch'
                          ? branchKindLabel
                          : detachedKindLabel}
                      </span>
                      <span className="app-notification__chip-value">
                        {notification.gitContext.kind === 'branch'
                          ? notification.gitContext.name
                          : notification.gitContext.shortHead}
                      </span>
                    </span>
                  ) : null}

                  {contextVisibility.showPullRequest && notification.pullRequest ? (
                    <span
                      className="app-notification__chip"
                      data-testid="app-notification-chip-pr"
                      title={`${notification.pullRequest.title} (#${notification.pullRequest.number})`}
                    >
                      <span className="app-notification__chip-kind">PR</span>
                      <span className="app-notification__chip-value">
                        {`#${notification.pullRequest.number}`}
                      </span>
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              className="app-notification__close"
              data-testid={`app-notification-close-${notification.id}`}
              aria-label={t('common.close')}
              title={t('common.close')}
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                onDismiss(notification.id)
              }}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
