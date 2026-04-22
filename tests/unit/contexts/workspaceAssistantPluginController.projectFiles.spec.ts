import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

import { WorkspaceAssistantPluginController } from '../../../src/plugins/workspaceAssistant/presentation/main/WorkspaceAssistantPluginController'
import { DEFAULT_WORKSPACE_ASSISTANT_SETTINGS } from '../../../src/contexts/plugins/domain/workspaceAssistantSettings'

describe('WorkspaceAssistantPluginController project file safety', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not crash when the workspace snapshot arrives without projectFiles', async () => {
    const encoder = new TextEncoder()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-type': 'text/event-stream',
      }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"type":"response.output_text.delta","delta":"真实 AI 回复：当前快照可用。"}\n\n'),
          )
          controller.enqueue(
            encoder.encode(
              'data: {"type":"response.completed","response":{"output_text":"真实 AI 回复：当前快照可用。"}}\n\n',
            ),
          )
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      }),
    } satisfies Pick<Response, 'ok' | 'headers' | 'body'>)
    vi.stubGlobal('fetch', fetchMock)

    const controller = new WorkspaceAssistantPluginController()
    controller.syncSettings({
      ...DEFAULT_WORKSPACE_ASSISTANT_SETTINGS,
      enabled: true,
      apiBaseUrl: 'https://model.example.test/v1',
      apiKey: 'sk-test',
      modelName: 'gpt-4.1-mini',
    })

    await expect(
      controller.prompt({
        prompt: '总结当前进度',
        workspaceId: 'workspace_1',
        workspaceSnapshot: {
          id: 'workspace_1',
          name: 'FreeCli',
          path: 'D:\\Project\\FreeCli',
          activeSpaceId: null,
          spaceCount: 1,
          nodeCount: 2,
          taskCount: 0,
          agentCount: 0,
          noteCount: 0,
          terminalCount: 0,
          projectSummary: null,
          projectFiles: undefined as never,
          tasks: [],
          agents: [],
          notes: [],
          spaces: [],
        },
      }),
    ).resolves.toMatchObject({
      reply: expect.stringContaining('真实 AI 回复'),
    })
  })
})
