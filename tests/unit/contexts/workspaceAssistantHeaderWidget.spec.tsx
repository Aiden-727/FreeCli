import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceAssistantStateDto } from '../../../src/shared/contracts/dto'
import WorkspaceAssistantHeaderWidget from '../../../src/plugins/workspaceAssistant/presentation/renderer/WorkspaceAssistantHeaderWidget'

function installWorkspaceAssistantApiMock(state: WorkspaceAssistantStateDto) {
  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        workspaceAssistant: {
          getState: vi.fn().mockResolvedValue(state),
          onState: vi.fn().mockImplementation(() => () => undefined),
        },
      },
    },
  })
}

describe('WorkspaceAssistantHeaderWidget', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('prefers toggling the assistant dock from the header button', async () => {
    installWorkspaceAssistantApiMock({
      isEnabled: true,
      isDockCollapsed: true,
      isAutoOpenOnStartup: true,
      status: 'ready',
      lastUpdatedAt: '2026-04-21T08:00:00.000Z',
      unreadInsights: 1,
      currentWorkspace: null,
      insights: [
        {
          id: 'urgent-1',
          tone: 'urgent',
          title: '需要处理的任务',
          body: '当前存在一个未绑定 Agent 的高优先级任务。',
          source: 'rules',
          createdAt: '2026-04-21T08:00:00.000Z',
          actionLabel: null,
        },
      ],
      conversation: [],
      settings: {
        enabled: true,
        dockCollapsed: true,
        autoOpenOnStartup: true,
        proactiveRemindersEnabled: true,
        proactiveReminderIntervalMinutes: 12,
        modelProvider: 'local',
        aiEnabled: false,
        apiBaseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        modelName: 'gpt-4.1-mini',
        allowProjectScan: true,
        allowWorkspaceSummary: true,
        allowTaskInsight: true,
        allowFollowUpQuestions: true,
        allowSuggestionToasts: true,
        assistantNotes: '',
      },
    })

    const onToggleWorkspaceAssistant = vi.fn()
    const onOpenPluginManager = vi.fn()

    render(
      <WorkspaceAssistantHeaderWidget
        onOpenPluginManager={onOpenPluginManager}
        onToggleWorkspaceAssistant={onToggleWorkspaceAssistant}
      />,
    )

    const button = await screen.findByTestId('app-header-workspace-assistant')
    expect(button).toHaveAttribute('aria-label', '工作流助手已就绪')

    fireEvent.click(button)

    expect(onToggleWorkspaceAssistant).toHaveBeenCalledTimes(1)
    expect(onOpenPluginManager).not.toHaveBeenCalled()
  })
})
