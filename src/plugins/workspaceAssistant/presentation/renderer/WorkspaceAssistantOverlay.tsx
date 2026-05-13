import React from 'react'
import { Bot, Settings2, Send, Square, X } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import { useAppStore } from '@app/renderer/shell/store/useAppStore'
import type { WorkspaceOverlayPluginWidgetProps } from '@contexts/plugins/presentation/renderer/types'
import {
  FreeCliAppError,
  getAppErrorDebugMessage,
  toAppErrorDescriptor,
} from '@shared/errors/appError'
import { useWorkspaceAssistantState } from './useWorkspaceAssistantState'
import WorkspaceAssistantMarkdown from './WorkspaceAssistantMarkdown'

function formatWorkspaceAssistantError(error: unknown): string {
  const debugMessage = getAppErrorDebugMessage(toAppErrorDescriptor(error))
  if (typeof debugMessage === 'string' && debugMessage.trim().length > 0) {
    return debugMessage
  }

  if (error instanceof FreeCliAppError) {
    if (error.code === 'common.unexpected') {
      return '工作流助手请求失败：主进程返回了未分类异常，但当前没有附带更具体的调试信息。请重启应用后重试；如果仍失败，请继续反馈当前项目和提问内容。'
    }

    return `${error.code}: ${error.message}`
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return '工作流助手请求失败，请稍后重试。'
}

export default function WorkspaceAssistantOverlay({
  onOpenPluginManager,
  onShowMessage,
}: WorkspaceOverlayPluginWidgetProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const assistantSettings = useAppStore(state => state.agentSettings.plugins.workspaceAssistant)
  const isPluginEnabled = useAppStore(state =>
    state.agentSettings.plugins.enabledIds.includes('workspace-assistant'),
  )
  const setAgentSettings = useAppStore(state => state.setAgentSettings)
  const { state, sendPrompt, stopPrompt } = useWorkspaceAssistantState()
  const [prompt, setPrompt] = React.useState('')
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null)
  const [isSending, setIsSending] = React.useState(false)
  const reminderHistoryRef = React.useRef(new Map<string, number>())
  const messagesViewportRef = React.useRef<HTMLDivElement | null>(null)
  const isStreaming = state.status === 'thinking'
  const isCollapsed = assistantSettings.dockCollapsed
  const messages = state.conversation
  const latestAssistantMessage = [...messages]
    .reverse()
    .find(message => message.role === 'assistant') ?? null
  const canStopStreaming = isSending || isStreaming
  const modelLabel = assistantSettings.modelName.trim() || '未配置模型'
  const isStreamingReply =
    isStreaming &&
    latestAssistantMessage !== null &&
    latestAssistantMessage.content.trim().length > 0
  const shouldShowThinkingBubble =
    isStreaming &&
    (!latestAssistantMessage || latestAssistantMessage.content.trim().length === 0)
  const displayMessages = React.useMemo(
    () =>
      messages.filter(message => {
        const isStreamingPlaceholderAssistant =
          shouldShowThinkingBubble &&
          latestAssistantMessage?.id === message.id &&
          message.role === 'assistant' &&
          message.content.trim().length === 0

        return !isStreamingPlaceholderAssistant
      }),
    [latestAssistantMessage?.id, messages, shouldShowThinkingBubble],
  )

  React.useEffect(() => {
    if (!isPluginEnabled || !assistantSettings.proactiveRemindersEnabled) {
      return
    }

    const urgentInsight = state.insights.find(item => item.tone === 'urgent')
    if (!urgentInsight || !assistantSettings.allowSuggestionToasts) {
      return
    }

    const now = Date.now()
    const cooldownMs = assistantSettings.proactiveReminderIntervalMinutes * 60 * 1000
    const lastShownAt = reminderHistoryRef.current.get(urgentInsight.id) ?? 0
    if (now - lastShownAt < cooldownMs) {
      return
    }

    reminderHistoryRef.current.set(urgentInsight.id, now)
    onShowMessage(urgentInsight.title, 'warning')
  }, [
    assistantSettings.allowSuggestionToasts,
    assistantSettings.proactiveReminderIntervalMinutes,
    assistantSettings.proactiveRemindersEnabled,
    isPluginEnabled,
    onShowMessage,
    state.insights,
  ])

  React.useLayoutEffect(() => {
    const viewport = messagesViewportRef.current
    if (!viewport) {
      return
    }

    const distanceToBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
    if (distanceToBottom > 96 && !isStreaming) {
      return
    }

    viewport.scrollTop = viewport.scrollHeight
  }, [isStreaming, runtimeError, state.conversation])

  if (!isPluginEnabled) {
    return null
  }

  return (
    <aside
      className={`workspace-assistant-dock${isCollapsed ? ' workspace-assistant-dock--collapsed' : ' workspace-assistant-dock--open'}`}
      data-testid="workspace-assistant-dock"
      aria-hidden={isCollapsed}
    >
      <div className="workspace-assistant-dock__panel">
        <header className="workspace-assistant-dock__header">
          <span className="workspace-assistant-dock__title">
            <Bot size={16} aria-hidden="true" />
            <span>{t('pluginManager.plugins.workspaceAssistant.dockTitle')}</span>
          </span>
          <span className="workspace-assistant-dock__header-actions">
            <button
              type="button"
              className="workspace-assistant-dock__icon-action"
              aria-label={t('pluginManager.plugins.workspaceAssistant.openDetailAction')}
              title={t('pluginManager.plugins.workspaceAssistant.openDetailAction')}
              onClick={() => onOpenPluginManager('workspace-assistant')}
              tabIndex={isCollapsed ? -1 : 0}
            >
              <Settings2 size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="workspace-assistant-dock__icon-action"
              aria-label={t('common.close')}
              title={t('common.close')}
              onClick={() => {
                setAgentSettings(prev => ({
                  ...prev,
                  plugins: {
                    ...prev.plugins,
                    workspaceAssistant: {
                      ...prev.plugins.workspaceAssistant,
                      dockCollapsed: true,
                    },
                  },
                }))
              }}
              tabIndex={isCollapsed ? -1 : 0}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </span>
        </header>

        <div className="workspace-assistant-dock__context">
          <strong>
            {state.currentWorkspace?.name ??
              t('pluginManager.plugins.workspaceAssistant.controlCenterEmpty')}
          </strong>
          <span>
            {state.currentWorkspace?.projectSummary ??
              state.insights[0]?.body ??
              t('pluginManager.plugins.workspaceAssistant.emptyWorkspaceHelp')}
          </span>
        </div>

        <div
          ref={messagesViewportRef}
          className="workspace-assistant-dock__messages"
          data-testid="workspace-assistant-messages"
        >
          {displayMessages.length === 0 && !shouldShowThinkingBubble ? (
            <div className="workspace-assistant-dock__empty">
              {t('pluginManager.plugins.workspaceAssistant.emptyWorkspaceHelp')}
            </div>
          ) : null}
          {displayMessages.map(message => (
            <div
              key={message.id}
              className={`workspace-assistant-dock__message-row workspace-assistant-dock__message-row--${message.role === 'user' ? 'user' : 'assistant'}`}
            >
              <div
                className={`workspace-assistant-dock__bubble workspace-assistant-dock__bubble--${message.role === 'user' ? 'user' : 'assistant'}${
                  isStreamingReply && latestAssistantMessage?.id === message.id
                    ? ' workspace-assistant-dock__bubble--streaming'
                    : ''
                }`}
              >
                {message.role === 'assistant' ? (
                  <WorkspaceAssistantMarkdown content={message.content} />
                ) : (
                  <span className="workspace-assistant-dock__bubble-content">{message.content}</span>
                )}
              </div>
            </div>
          ))}
          {shouldShowThinkingBubble ? (
            <div className="workspace-assistant-dock__message-row workspace-assistant-dock__message-row--assistant">
              <div className="workspace-assistant-dock__bubble workspace-assistant-dock__bubble--assistant workspace-assistant-dock__bubble--thinking">
                <span className="workspace-assistant-dock__thinking" aria-hidden="true">
                  <span className="workspace-assistant-dock__thinking-dot"></span>
                  <span className="workspace-assistant-dock__thinking-dot"></span>
                  <span className="workspace-assistant-dock__thinking-dot"></span>
                </span>
                <span className="workspace-assistant-dock__thinking-label">
                  {t('pluginManager.plugins.workspaceAssistant.thinking')}
                </span>
              </div>
            </div>
          ) : null}
          {runtimeError ? (
            <div className="workspace-assistant-dock__message-row workspace-assistant-dock__message-row--assistant">
              <div className="workspace-assistant-dock__bubble workspace-assistant-dock__bubble--error">
                {runtimeError}
              </div>
            </div>
          ) : null}
        </div>

        <form
          className="workspace-assistant-dock__composer"
          onSubmit={async event => {
            event.preventDefault()
            if (prompt.trim().length === 0 || canStopStreaming) {
              return
            }

            const nextPrompt = prompt.trim()
            setRuntimeError(null)
            setPrompt('')
            setIsSending(true)
            try {
              await sendPrompt(nextPrompt)
            } catch (error) {
              setPrompt(previousPrompt => (previousPrompt.length > 0 ? previousPrompt : nextPrompt))
              setRuntimeError(formatWorkspaceAssistantError(error))
            } finally {
              setIsSending(false)
            }
          }}
        >
          <textarea
            className="cove-field workspace-assistant-dock__input"
            value={prompt}
            placeholder={t('pluginManager.plugins.workspaceAssistant.promptPlaceholder')}
            onChange={event => setPrompt(event.target.value)}
            tabIndex={isCollapsed ? -1 : 0}
          />
          <div className="workspace-assistant-dock__actions">
            <div className="workspace-assistant-dock__status-group">
              <span className="workspace-assistant-dock__model-chip" title={modelLabel}>
                <Bot size={13} aria-hidden="true" />
                <span className="workspace-assistant-dock__model-chip-label">{modelLabel}</span>
              </span>
              {canStopStreaming ? (
                <button
                  type="button"
                  className="workspace-assistant-dock__stop"
                  onClick={async () => {
                    try {
                      await stopPrompt()
                      setRuntimeError(null)
                    } catch (error) {
                      setRuntimeError(formatWorkspaceAssistantError(error))
                    } finally {
                      setIsSending(false)
                    }
                  }}
                  tabIndex={isCollapsed ? -1 : 0}
                >
                  <Square size={13} aria-hidden="true" />
                  <span>{t('pluginManager.plugins.workspaceAssistant.stopAction')}</span>
                </button>
              ) : null}
            </div>
            <div className="workspace-assistant-dock__primary-actions">
              <button
                type="submit"
                className="cove-window__action cove-window__action--secondary workspace-assistant-dock__submit"
                disabled={canStopStreaming || prompt.trim().length === 0}
                tabIndex={isCollapsed ? -1 : 0}
              >
                <Send size={14} aria-hidden="true" />
                <span>{t('pluginManager.plugins.workspaceAssistant.askAction')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </aside>
  )
}
