import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  WorkspaceAssistantConversationMessageDto,
  WorkspaceAssistantStateDto,
  WorkspaceAssistantWorkspaceSnapshotDto,
} from '../../../src/shared/contracts/dto'

const useAppStoreMock = vi.fn()
const useWorkspaceAssistantStateMock = vi.fn()

vi.mock('@app/renderer/shell/store/useAppStore', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => useAppStoreMock(selector),
}))

vi.mock('@app/renderer/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dictionary: Record<string, string> = {
        'pluginManager.plugins.workspaceAssistant.dockTitle': 'AI 工作流助手',
        'pluginManager.plugins.workspaceAssistant.openDetailAction': '打开详情',
        'pluginManager.plugins.workspaceAssistant.controlCenterEmpty': '当前没有活动项目',
        'pluginManager.plugins.workspaceAssistant.emptyWorkspaceHelp': '可以问我项目问题',
        'pluginManager.plugins.workspaceAssistant.thinking': '正在生成回答...',
        'pluginManager.plugins.workspaceAssistant.promptPlaceholder': '请输入问题',
        'pluginManager.plugins.workspaceAssistant.stopAction': '停止回复',
        'pluginManager.plugins.workspaceAssistant.askAction': '提问',
        'common.close': '关闭',
      }

      return dictionary[key] ?? key
    },
  }),
}))

vi.mock(
  '../../../src/plugins/workspaceAssistant/presentation/renderer/useWorkspaceAssistantState',
  () => ({
    useWorkspaceAssistantState: () => useWorkspaceAssistantStateMock(),
  }),
)

import WorkspaceAssistantOverlay from '../../../src/plugins/workspaceAssistant/presentation/renderer/WorkspaceAssistantOverlay'

function createWorkspaceSnapshot(): WorkspaceAssistantWorkspaceSnapshotDto {
  return {
    id: 'workspace-1',
    name: 'Demo Workspace',
    path: 'D:/Project/Demo',
    activeSpaceId: null,
    spaceCount: 1,
    nodeCount: 2,
    taskCount: 1,
    agentCount: 1,
    noteCount: 0,
    terminalCount: 0,
    projectSummary: '示例项目摘要',
    projectFiles: [],
    tasks: [],
    agents: [],
    notes: [],
    spaces: [],
  }
}

function createState(
  overrides: Partial<WorkspaceAssistantStateDto> = {},
): WorkspaceAssistantStateDto {
  return {
    isEnabled: true,
    isDockCollapsed: false,
    isAutoOpenOnStartup: true,
    status: 'ready',
    lastUpdatedAt: '2026-04-22T10:00:00.000Z',
    unreadInsights: 0,
    currentWorkspace: createWorkspaceSnapshot(),
    insights: [],
    conversation: [],
    settings: {
      enabled: true,
      dockCollapsed: false,
      autoOpenOnStartup: true,
      proactiveRemindersEnabled: true,
      proactiveReminderIntervalMinutes: 10,
      modelProvider: 'openai-compatible',
      aiEnabled: true,
      apiBaseUrl: 'https://example.com/v1',
      apiKey: 'sk-test',
      modelName: 'gpt-4.1-mini',
      allowProjectScan: true,
      allowWorkspaceSummary: true,
      allowTaskInsight: true,
      allowFollowUpQuestions: true,
      allowSuggestionToasts: true,
      assistantNotes: '',
    },
    ...overrides,
  }
}

function createConversationMessage(
  overrides: Partial<WorkspaceAssistantConversationMessageDto>,
): WorkspaceAssistantConversationMessageDto {
  return {
    id: overrides.id ?? 'message-id',
    role: overrides.role ?? 'assistant',
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? '2026-04-22T10:00:00.000Z',
  }
}

describe('WorkspaceAssistantOverlay', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('在首个 token 到达前只显示加载气泡，不显示空白 assistant 气泡', () => {
    const state = createState({
      status: 'thinking',
      conversation: [
        createConversationMessage({
          id: 'user-1',
          role: 'user',
          content: '请帮我分析当前项目结构',
        }),
        createConversationMessage({
          id: 'assistant-1',
          role: 'assistant',
          content: '',
        }),
      ],
    })

    useAppStoreMock.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        agentSettings: {
          plugins: {
            enabledIds: ['workspace-assistant'],
            workspaceAssistant: state.settings,
          },
        },
        setAgentSettings: vi.fn(),
      }),
    )
    useWorkspaceAssistantStateMock.mockReturnValue({
      state,
      snapshot: state.currentWorkspace,
      sendPrompt: vi.fn(),
      stopPrompt: vi.fn(),
    })

    render(
      <WorkspaceAssistantOverlay
        onOpenPluginManager={() => undefined}
        onShowMessage={() => undefined}
      />,
    )

    const messageRows = document.querySelectorAll('.workspace-assistant-dock__message-row')
    expect(messageRows).toHaveLength(2)
    expect(screen.getByText('请帮我分析当前项目结构')).toBeInTheDocument()
    expect(screen.getByText('正在生成回答...')).toBeInTheDocument()
    expect(document.querySelector('.workspace-assistant-markdown')).toBeNull()
  })
})
