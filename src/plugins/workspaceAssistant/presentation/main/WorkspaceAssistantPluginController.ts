import { BrowserWindow } from 'electron'
import type {
  WorkspaceAssistantConnectionTestResult,
  WorkspaceAssistantConversationMessageDto,
  WorkspaceAssistantPromptInput,
  WorkspaceAssistantPromptResult,
  WorkspaceAssistantStopPromptResult,
  WorkspaceAssistantStateDto,
  WorkspaceAssistantWorkspaceSnapshotDto,
} from '@shared/contracts/dto'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import {
  DEFAULT_WORKSPACE_ASSISTANT_SETTINGS,
  type WorkspaceAssistantSettingsDto,
} from '@contexts/plugins/domain/workspaceAssistantSettings'
import type {
  MainPluginRuntime,
  MainPluginRuntimeFactory,
} from '@contexts/plugins/application/MainPluginRuntimeHost'

function createEmptyState(settings: WorkspaceAssistantSettingsDto): WorkspaceAssistantStateDto {
  return {
    isEnabled: false,
    isDockCollapsed: settings.dockCollapsed,
    isAutoOpenOnStartup: settings.autoOpenOnStartup,
    status: 'disabled',
    lastUpdatedAt: null,
    unreadInsights: 0,
    currentWorkspace: null,
    insights: [],
    conversation: [],
    settings,
  }
}

function createConversationMessage(
  role: WorkspaceAssistantConversationMessageDto['role'],
  content: string,
): WorkspaceAssistantConversationMessageDto {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  }
}

function limitConversation(
  conversation: WorkspaceAssistantConversationMessageDto[],
): WorkspaceAssistantConversationMessageDto[] {
  return conversation.slice(-12)
}

function replaceConversationMessageContent(
  conversation: WorkspaceAssistantConversationMessageDto[],
  messageId: string,
  content: string,
): WorkspaceAssistantConversationMessageDto[] {
  return conversation.map(message =>
    message.id === messageId
      ? {
          ...message,
          content,
        }
      : message,
  )
}

function removeConversationMessage(
  conversation: WorkspaceAssistantConversationMessageDto[],
  messageId: string,
): WorkspaceAssistantConversationMessageDto[] {
  return conversation.filter(message => message.id !== messageId)
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function getSafeProjectFiles(
  workspace: WorkspaceAssistantWorkspaceSnapshotDto | null,
): WorkspaceAssistantWorkspaceSnapshotDto['projectFiles'] {
  if (!workspace || !Array.isArray(workspace.projectFiles)) {
    return []
  }

  return workspace.projectFiles
}

function buildWorkspaceContextPrompt(
  workspace: WorkspaceAssistantWorkspaceSnapshotDto | null,
): string {
  if (!workspace) {
    return '当前没有打开项目。请提醒用户先打开项目，然后再给出更具体建议。'
  }

  const taskSummary = workspace.tasks
    .slice(0, 8)
    .map(task => `- ${task.title}：${task.status} / ${task.priority}`)
    .join('\n')
  const agentSummary = workspace.agents
    .slice(0, 6)
    .map(agent => `- ${agent.title}：${agent.status ?? 'unknown'}${agent.lastError ? `，错误：${agent.lastError}` : ''}`)
    .join('\n')
  const fileSummary = getSafeProjectFiles(workspace)
    .slice(0, 6)
    .map(file => `- ${file.name}：${file.summary}`)
    .join('\n')

  return [
    `项目名称：${workspace.name}`,
    `项目路径：${workspace.path}`,
    `画布统计：${workspace.taskCount} 个任务，${workspace.agentCount} 个 Agent，${workspace.noteCount} 条笔记，${workspace.terminalCount} 个终端，${workspace.spaceCount} 个空间。`,
    workspace.projectSummary ? `项目摘要：${workspace.projectSummary}` : '',
    taskSummary ? `任务摘要：\n${taskSummary}` : '',
    agentSummary ? `Agent 摘要：\n${agentSummary}` : '',
    fileSummary ? `关键文件：\n${fileSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

function extractResponsesText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const record = payload as Record<string, unknown>
  if (typeof record.output_text === 'string') {
    return record.output_text.trim()
  }

  const choices = record.choices
  if (Array.isArray(choices)) {
    const parts: string[] = []
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') {
        continue
      }

      const message = (choice as Record<string, unknown>).message
      if (!message || typeof message !== 'object') {
        continue
      }

      const content = (message as Record<string, unknown>).content
      if (typeof content === 'string' && content.trim().length > 0) {
        parts.push(content.trim())
        continue
      }

      if (!Array.isArray(content)) {
        continue
      }

      for (const contentItem of content) {
        if (!contentItem || typeof contentItem !== 'object') {
          continue
        }
        const text = (contentItem as Record<string, unknown>).text
        if (typeof text === 'string' && text.trim().length > 0) {
          parts.push(text.trim())
        }
      }
    }

    if (parts.length > 0) {
      return parts.join('\n').trim()
    }
  }

  const output = record.output
  if (!Array.isArray(output)) {
    return ''
  }

  const parts: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const content = (item as Record<string, unknown>).content
    if (!Array.isArray(content)) {
      continue
    }
    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== 'object') {
        continue
      }
      const text = (contentItem as Record<string, unknown>).text
      if (typeof text === 'string') {
        parts.push(text)
      }
    }
  }

  return parts.join('\n').trim()
}

function extractStreamingEventError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  const error = record.error

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim()
  }

  if (error && typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>
    if (typeof errorRecord.message === 'string' && errorRecord.message.trim().length > 0) {
      return errorRecord.message.trim()
    }
  }

  if (typeof record.message === 'string' && record.message.trim().length > 0) {
    return record.message.trim()
  }

  return null
}

function extractStreamingEventText(payload: unknown): {
  delta: string
  completed: boolean
  replacementText: string | null
} {
  if (!payload || typeof payload !== 'object') {
    return {
      delta: '',
      completed: false,
      replacementText: null,
    }
  }

  const record = payload as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type : ''

  if (typeof record.delta === 'string' && type.endsWith('.delta')) {
    return {
      delta: record.delta,
      completed: false,
      replacementText: null,
    }
  }

  if (type === 'response.output_text.done' && typeof record.text === 'string') {
    return {
      delta: '',
      completed: false,
      replacementText: record.text,
    }
  }

  if (type === 'response.completed') {
    const replacementText = extractResponsesText(record.response)
    return {
      delta: '',
      completed: true,
      replacementText: replacementText.length > 0 ? replacementText : null,
    }
  }

  return {
    delta: '',
    completed: false,
    replacementText: null,
  }
}

function hasUsableAiConfiguration(settings: WorkspaceAssistantSettingsDto): boolean {
  return (
    settings.apiBaseUrl.trim().length > 0 &&
    settings.apiKey.trim().length > 0 &&
    settings.modelName.trim().length > 0
  )
}

function resolveAssistantRuntimeStatus(
  options: {
    settingsEnabled: boolean
    runtimeEnabled: boolean
    activeStatus: WorkspaceAssistantStateDto['status']
  },
): WorkspaceAssistantStateDto['status'] {
  if (!options.settingsEnabled) {
    return 'disabled'
  }

  return options.runtimeEnabled ? options.activeStatus : 'ready'
}

export class WorkspaceAssistantPluginController {
  private settings: WorkspaceAssistantSettingsDto = DEFAULT_WORKSPACE_ASSISTANT_SETTINGS
  private state: WorkspaceAssistantStateDto = createEmptyState(DEFAULT_WORKSPACE_ASSISTANT_SETTINGS)
  private isEnabled = false
  private activePromptAbortController: AbortController | null = null
  private activePromptMessageId: string | null = null

  public createRuntimeFactory(): MainPluginRuntimeFactory {
    return () =>
      ({
        activate: async () => {
          this.isEnabled = true
          this.applyState({
            ...this.state,
            isEnabled: true,
            status: resolveAssistantRuntimeStatus({
              settingsEnabled: this.settings.enabled,
              runtimeEnabled: true,
              activeStatus: 'ready',
            }),
            lastUpdatedAt: new Date().toISOString(),
          })
        },
        deactivate: async () => {
          this.abortActivePrompt()
          this.isEnabled = false
          this.applyState({
            ...this.state,
            isEnabled: false,
            status: resolveAssistantRuntimeStatus({
              settingsEnabled: this.settings.enabled,
              runtimeEnabled: false,
              activeStatus: 'disabled',
            }),
            lastUpdatedAt: new Date().toISOString(),
          })
        },
      }) satisfies MainPluginRuntime
  }

  public syncSettings(settings: WorkspaceAssistantSettingsDto): WorkspaceAssistantStateDto {
    this.settings = settings
    this.applyState({
      ...this.state,
      settings,
      isDockCollapsed: settings.dockCollapsed,
      isAutoOpenOnStartup: settings.autoOpenOnStartup,
      isEnabled: this.isEnabled,
      status: resolveAssistantRuntimeStatus({
        settingsEnabled: settings.enabled,
        runtimeEnabled: this.isEnabled,
        activeStatus: 'ready',
      }),
      lastUpdatedAt: new Date().toISOString(),
    })
    return this.state
  }

  public getState(): WorkspaceAssistantStateDto {
    return this.state
  }

  public async prompt(payload: WorkspaceAssistantPromptInput): Promise<WorkspaceAssistantPromptResult> {
    if (this.activePromptAbortController) {
      throw new Error('工作流助手正在回答上一条消息，请等待当前回复完成。')
    }

    const trimmedPrompt = payload.prompt.trim()
    const currentWorkspace = payload.workspaceSnapshot ?? this.state.currentWorkspace
    const userMessages =
      trimmedPrompt.length > 0 ? [createConversationMessage('user', trimmedPrompt)] : []
    const assistantMessage = createConversationMessage('assistant', '')

    this.applyState({
      ...this.state,
      currentWorkspace,
      conversation: limitConversation([...this.state.conversation, ...userMessages, assistantMessage]),
      lastUpdatedAt: new Date().toISOString(),
      status: resolveAssistantRuntimeStatus({
        settingsEnabled: this.settings.enabled,
        runtimeEnabled: this.isEnabled,
        activeStatus: 'thinking',
      }),
    })

    try {
      this.activePromptMessageId = assistantMessage.id
      const reply = await this.resolveReply(trimmedPrompt, currentWorkspace, assistantMessage.id)

      this.patchAssistantReply(assistantMessage.id, reply)
      this.applyState({
        ...this.state,
        currentWorkspace,
        lastUpdatedAt: new Date().toISOString(),
        status: resolveAssistantRuntimeStatus({
          settingsEnabled: this.settings.enabled,
          runtimeEnabled: this.isEnabled,
          activeStatus: 'ready',
        }),
      })

      return {
        reply,
        suggestions: ['当前我在做什么？', '下一步建议是什么？'],
      }
    } catch (error) {
      if (this.wasPromptStopped(error)) {
        const partialReply = this.getConversationMessageContent(assistantMessage.id)
        this.applyState({
          ...this.state,
          currentWorkspace,
          lastUpdatedAt: new Date().toISOString(),
          status: resolveAssistantRuntimeStatus({
            settingsEnabled: this.settings.enabled,
            runtimeEnabled: this.isEnabled,
            activeStatus: 'ready',
          }),
        })

        return {
          reply: partialReply,
          suggestions: ['继续展开这部分内容', '重新整理刚才的回答'],
        }
      }

      const currentAssistantMessage = this.state.conversation.find(
        message => message.id === assistantMessage.id,
      )
      if (!currentAssistantMessage || currentAssistantMessage.content.trim().length === 0) {
        this.applyState({
          ...this.state,
          conversation: limitConversation(
            removeConversationMessage(this.state.conversation, assistantMessage.id),
          ),
          currentWorkspace,
          lastUpdatedAt: new Date().toISOString(),
          status: resolveAssistantRuntimeStatus({
            settingsEnabled: this.settings.enabled,
            runtimeEnabled: this.isEnabled,
            activeStatus: 'error',
          }),
        })
      } else {
        this.applyState({
          ...this.state,
          currentWorkspace,
          lastUpdatedAt: new Date().toISOString(),
          status: resolveAssistantRuntimeStatus({
            settingsEnabled: this.settings.enabled,
            runtimeEnabled: this.isEnabled,
            activeStatus: 'error',
          }),
        })
      }

      throw error
    } finally {
      this.activePromptAbortController = null
      this.activePromptMessageId = null
    }
  }

  public stopPrompt(): WorkspaceAssistantStopPromptResult {
    const activeMessageId = this.activePromptMessageId
    if (!this.activePromptAbortController || !activeMessageId) {
      return {
        stopped: false,
        reply: null,
      }
    }

    const reply = this.getConversationMessageContent(activeMessageId)
    this.abortActivePrompt()
    this.applyState({
      ...this.state,
      conversation:
        reply.length > 0
          ? this.state.conversation
          : limitConversation(removeConversationMessage(this.state.conversation, activeMessageId)),
      lastUpdatedAt: new Date().toISOString(),
      status: resolveAssistantRuntimeStatus({
        settingsEnabled: this.settings.enabled,
        runtimeEnabled: this.isEnabled,
        activeStatus: 'ready',
      }),
    })

    return {
      stopped: true,
      reply: reply.length > 0 ? reply : null,
    }
  }

  private async resolveReply(
    trimmedPrompt: string,
    currentWorkspace: WorkspaceAssistantWorkspaceSnapshotDto | null,
    assistantMessageId: string,
  ): Promise<string> {
    if (!hasUsableAiConfiguration(this.settings)) {
      throw new Error(
        '当前还未完整配置 AI 能力。请先在工作流助手插件设置中填写 API 地址、API Key 和模型名称，然后再开始对话。',
      )
    }

    return await this.requestOpenAiCompatibleReply(trimmedPrompt, currentWorkspace, assistantMessageId)
  }

  private async requestOpenAiCompatibleReply(
    prompt: string,
    currentWorkspace: WorkspaceAssistantWorkspaceSnapshotDto | null,
    assistantMessageId: string,
  ): Promise<string> {
    const endpoint = `${trimTrailingSlash(this.settings.apiBaseUrl)}/responses`
    const systemPrompt = [
      '你是 FreeCli 内置的工作流助手。',
      '你的任务是帮助用户理解当前项目、画布内容、正在进行的工作状态，并给出规划、提醒和答疑。',
      '回答要直接、简洁、可执行。不要编造不存在的文件或状态。',
      this.settings.assistantNotes.trim()
        ? `用户额外偏好：${this.settings.assistantNotes.trim()}`
        : '',
    ]
      .filter(Boolean)
      .join('\n')

    const abortController = new AbortController()
    this.activePromptAbortController = abortController

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.settings.apiKey}`,
        'content-type': 'application/json',
      },
      signal: abortController.signal,
      body: JSON.stringify({
        model: this.settings.modelName,
        stream: true,
        input: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `当前 FreeCli 工作现场：\n${buildWorkspaceContextPrompt(currentWorkspace)}\n\n用户问题：${prompt || '请根据当前工作现场给出建议。'}`,
          },
        ],
      }),
    }).catch(error => {
      if (abortController.signal.aborted || isAbortError(error)) {
        throw new Error('工作流助手流式回答已被用户停止。')
      }

      throw error
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      const suffix = detail.trim().length > 0 ? ` - ${detail.trim()}` : ''
      throw new Error(`工作流助手 AI 请求失败（HTTP ${response.status}）${suffix}`)
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!response.body) {
      throw new Error('工作流助手 AI 没有返回可读取的流式响应体。请确认当前网关支持流式输出。')
    }

    if (contentType.includes('application/json')) {
      const detail = await response.text().catch(() => '')
      const suffix = detail.trim().length > 0 ? ` 返回内容：${detail.trim()}` : ''
      throw new Error(
        `工作流助手 AI 当前未启用流式输出（收到 ${contentType}，预期 text/event-stream）。${suffix}`,
      )
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let accumulatedText = ''

    while (true) {
      const { done, value } = await reader.read().catch(error => {
        if (abortController.signal.aborted || isAbortError(error)) {
          throw new Error('工作流助手流式回答已被用户停止。')
        }

        throw error
      })
      if (done) {
        break
      }

      if (abortController.signal.aborted) {
        throw new Error('工作流助手流式回答已被用户停止。')
      }

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/g)
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const eventLines = block.split(/\r?\n/g)
        const dataLines: string[] = []

        for (const line of eventLines) {
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart())
          }
        }

        const rawData = dataLines.join('\n').trim()
        if (rawData.length === 0) {
          continue
        }

        if (rawData === '[DONE]') {
          continue
        }

        let payload: unknown
        try {
          payload = JSON.parse(rawData)
        } catch {
          continue
        }

        const streamError = extractStreamingEventError(payload)
        if (streamError) {
          throw new Error(`工作流助手流式响应出错：${streamError}`)
        }

        const eventText = extractStreamingEventText(payload)
        if (eventText.replacementText !== null) {
          accumulatedText = eventText.replacementText
          this.patchAssistantReply(assistantMessageId, accumulatedText)
          continue
        }

        if (eventText.delta.length > 0) {
          accumulatedText += eventText.delta
          this.patchAssistantReply(assistantMessageId, accumulatedText)
          continue
        }

        if (eventText.completed) {
          this.patchAssistantReply(assistantMessageId, accumulatedText)
        }
      }
    }

    buffer += decoder.decode()
    if (buffer.trim().length > 0) {
      const trailingBlock = buffer.trim()
      if (trailingBlock.startsWith('data:')) {
        const rawData = trailingBlock
          .split(/\r?\n/g)
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart())
          .join('\n')
          .trim()

        if (rawData.length > 0 && rawData !== '[DONE]') {
          try {
            const payload = JSON.parse(rawData)
            const streamError = extractStreamingEventError(payload)
            if (streamError) {
              throw new Error(`工作流助手流式响应出错：${streamError}`)
            }

            const eventText = extractStreamingEventText(payload)
            if (eventText.replacementText !== null) {
              accumulatedText = eventText.replacementText
              this.patchAssistantReply(assistantMessageId, accumulatedText)
            } else if (eventText.delta.length > 0) {
              accumulatedText += eventText.delta
              this.patchAssistantReply(assistantMessageId, accumulatedText)
            }
          } catch (error) {
            if (error instanceof Error) {
              throw error
            }
          }
        }
      }
    }

    if (accumulatedText.trim().length === 0) {
      throw new Error('工作流助手 AI 返回成功，但没有解析到可显示的流式文本内容。请检查 R2TP 返回格式是否兼容。')
    }

    return accumulatedText.trim()
  }

  public syncWorkspaceSnapshot(
    snapshot: WorkspaceAssistantWorkspaceSnapshotDto | null,
  ): WorkspaceAssistantStateDto {
    this.applyState({
      ...this.state,
      currentWorkspace: snapshot,
      lastUpdatedAt: new Date().toISOString(),
    })
    return this.state
  }

  public async testConnection(): Promise<WorkspaceAssistantConnectionTestResult> {
    if (!hasUsableAiConfiguration(this.settings)) {
      return {
        ok: false,
        message: '请先填写 API 地址、API Key 和模型名称。',
      }
    }

    try {
      const assistantMessage = createConversationMessage('assistant', '')
      const reply = await this.requestOpenAiCompatibleReply('请回复“连接成功”。', null, assistantMessage.id)
      return {
        ok: true,
        message: reply.trim().length > 0 ? reply : '连接成功。',
      }
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : '测试连接失败。',
      }
    }
  }

  public async dispose(): Promise<void> {
    this.abortActivePrompt()
    this.isEnabled = false
  }

  private abortActivePrompt(): void {
    this.activePromptAbortController?.abort()
    this.activePromptAbortController = null
  }

  private getConversationMessageContent(messageId: string): string {
    return (
      this.state.conversation.find(message => message.id === messageId)?.content.trim() ?? ''
    )
  }

  private wasPromptStopped(error: unknown): boolean {
    return error instanceof Error && error.message === '工作流助手流式回答已被用户停止。'
  }

  private patchAssistantReply(messageId: string, content: string): void {
    this.applyState({
      ...this.state,
      conversation: limitConversation(
        replaceConversationMessageContent(this.state.conversation, messageId, content),
      ),
      lastUpdatedAt: new Date().toISOString(),
      status: resolveAssistantRuntimeStatus({
        settingsEnabled: this.settings.enabled,
        runtimeEnabled: this.isEnabled,
        activeStatus: 'thinking',
      }),
    })
  }

  private applyState(nextState: WorkspaceAssistantStateDto): void {
    this.state = nextState
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.pluginsWorkspaceAssistantState, this.state)
    }
  }
}
