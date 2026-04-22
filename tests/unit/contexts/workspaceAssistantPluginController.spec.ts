import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))
import { WorkspaceAssistantPluginController } from '../../../src/plugins/workspaceAssistant/presentation/main/WorkspaceAssistantPluginController'
import { DEFAULT_WORKSPACE_ASSISTANT_SETTINGS } from '../../../src/contexts/plugins/domain/workspaceAssistantSettings'

function createStreamingResponse(events: string[]): Pick<Response, 'ok' | 'headers' | 'body'> {
  const encoder = new TextEncoder()

  return {
    ok: true,
    headers: new Headers({
      'content-type': 'text/event-stream',
    }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(event))
        }
        controller.close()
      },
    }),
  }
}

describe('WorkspaceAssistantPluginController', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('records conversation messages when prompting with a workspace snapshot', async () => {
    const controller = new WorkspaceAssistantPluginController()
    controller.syncSettings({
      ...DEFAULT_WORKSPACE_ASSISTANT_SETTINGS,
      enabled: true,
    })

    await expect(
      controller.prompt({
        prompt: '帮我看一下 package.json',
        workspaceId: 'workspace_1',
        workspaceSnapshot: {
          id: 'workspace_1',
          name: 'FreeCli',
          path: 'D:\\Project\\FreeCli',
          activeSpaceId: 'space_1',
          spaceCount: 1,
          nodeCount: 3,
          taskCount: 1,
          agentCount: 1,
          noteCount: 0,
          terminalCount: 1,
          projectSummary: 'package.json：包名 freecli；脚本 dev, build, test。',
          projectFiles: [
            {
              kind: 'package_json',
              name: 'package.json',
              path: 'D:\\Project\\FreeCli\\package.json',
              summary: '包名 freecli；脚本 dev, build, test。',
            },
          ],
          tasks: [],
          agents: [],
          notes: [],
          spaces: [],
        },
      }),
    ).rejects.toThrow('请先在工作流助手插件设置中填写 API 地址、API Key 和模型名称')

    expect(controller.getState().conversation).toHaveLength(1)
    expect(controller.getState().conversation[0]?.role).toBe('user')
  })

  it('uses OpenAI-compatible Responses API when AI settings are configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamingResponse([
        'data: {"type":"response.output_text.delta","delta":"真实 AI 回复："}\n\n',
        'data: {"type":"response.output_text.delta","delta":"请先收口当前进行中的任务。"}\n\n',
        'data: {"type":"response.completed","response":{"output_text":"真实 AI 回复：请先收口当前进行中的任务。"}}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const controller = new WorkspaceAssistantPluginController()
    controller.syncSettings({
      ...DEFAULT_WORKSPACE_ASSISTANT_SETTINGS,
      enabled: true,
      modelProvider: 'openai-compatible',
      apiBaseUrl: 'https://model.example.test/v1/',
      apiKey: 'sk-test',
      modelName: 'gpt-4.1-mini',
    })

    const result = await controller.prompt({
      prompt: '总结当前进度',
      workspaceId: null,
      workspaceSnapshot: null,
    })

    expect(result.reply).toContain('真实 AI 回复')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://model.example.test/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer sk-test',
          'content-type': 'application/json',
        }),
      }),
    )

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>
    expect(body.model).toBe('gpt-4.1-mini')
    expect(body.stream).toBe(true)
    expect(JSON.stringify(body.input)).toContain('当前 FreeCli 工作现场')
  })

  it('asks the user to configure api base url api key and model before chatting when key is missing', async () => {
    const controller = new WorkspaceAssistantPluginController()
    controller.syncSettings({
      ...DEFAULT_WORKSPACE_ASSISTANT_SETTINGS,
      enabled: true,
      apiBaseUrl: '',
      apiKey: '',
      modelName: '',
    })

    await expect(
      controller.prompt({
        prompt: '你好，请问我在干嘛',
        workspaceId: null,
        workspaceSnapshot: null,
      }),
    ).rejects.toThrow('请先在工作流助手插件设置中填写 API 地址、API Key 和模型名称')
  })

  it('uses real ai replies directly once the ai configuration is complete', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamingResponse([
        'data: {"type":"response.output_text.delta","delta":"真实 AI 回复：当前建议先聚焦"}\n\n',
        'data: {"type":"response.output_text.delta","delta":"一个进行中的任务。"}\n\n',
        'data: {"type":"response.completed","response":{"output_text":"真实 AI 回复：当前建议先聚焦一个进行中的任务。"}}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const controller = new WorkspaceAssistantPluginController()
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    controller.syncSettings({
      ...DEFAULT_WORKSPACE_ASSISTANT_SETTINGS,
      enabled: true,
      apiBaseUrl: 'https://model.example.test/v1',
      apiKey: 'sk-test',
      modelName: 'gpt-4.1-mini',
    })

    const result = await controller.prompt({
      prompt: '你好，你能干嘛',
      workspaceId: null,
      workspaceSnapshot: null,
    })

    expect(result.reply).toContain('真实 AI 回复')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('supports chat-completions style content when the provider does not return responses output_text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamingResponse([
        'data: {"type":"response.output_text.delta","delta":"真实 AI 回复：这是通过"}\n\n',
        'data: {"type":"response.output_text.delta","delta":" choices.message.content 返回的内容。"}\n\n',
        'data: {"type":"response.completed","response":{"choices":[{"message":{"content":"真实 AI 回复：这是通过 choices.message.content 返回的内容。"}}]}}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const controller = new WorkspaceAssistantPluginController()
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    controller.syncSettings({
      ...DEFAULT_WORKSPACE_ASSISTANT_SETTINGS,
      enabled: true,
      apiBaseUrl: 'https://model.example.test/v1',
      apiKey: 'sk-test',
      modelName: 'gpt-4.1-mini',
    })

    const result = await controller.prompt({
      prompt: '解释一下当前项目',
      workspaceId: null,
      workspaceSnapshot: null,
    })

    expect(result.reply).toContain('choices.message.content')
  })

  it('throws a visible error instead of silently falling back when the provider returns no parseable text', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createStreamingResponse([
        'data: {"type":"response.created","response":{"id":"resp_123"}}\n\n',
        'data: {"type":"response.completed","response":{"id":"resp_123"}}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
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
        prompt: '解释一下当前项目',
        workspaceId: null,
        workspaceSnapshot: null,
      }),
    ).rejects.toThrow('没有解析到可显示的流式文本内容')
  })

  it('streams assistant deltas into conversation before the final response resolves', async () => {
    let resolveFirstChunk: (() => void) | null = null
    let resolveSecondChunk: (() => void) | null = null
    const encoder = new TextEncoder()

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-type': 'text/event-stream',
      }),
      body: new ReadableStream<Uint8Array>({
        async start(controller) {
          await new Promise<void>(resolve => {
            resolveFirstChunk = resolve
          })
          controller.enqueue(
            encoder.encode('data: {"type":"response.output_text.delta","delta":"第一段"}\n\n'),
          )

          await new Promise<void>(resolve => {
            resolveSecondChunk = resolve
          })
          controller.enqueue(
            encoder.encode('data: {"type":"response.output_text.delta","delta":"第二段"}\n\n'),
          )
          controller.enqueue(
            encoder.encode(
              'data: {"type":"response.completed","response":{"output_text":"第一段第二段"}}\n\n',
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

    const promptPromise = controller.prompt({
      prompt: '请流式回答',
      workspaceId: null,
      workspaceSnapshot: null,
    })

    resolveFirstChunk?.()
    await vi.waitFor(() => {
      expect(controller.getState().conversation.at(-1)?.content).toBe('第一段')
    })

    resolveSecondChunk?.()
    await expect(promptPromise).resolves.toMatchObject({
      reply: '第一段第二段',
    })
    expect(controller.getState().conversation.at(-1)?.content).toBe('第一段第二段')
    expect(controller.getState().status).toBe('ready')
  })

  it('stops a streaming reply without treating the partial answer as an error', async () => {
    let releaseFirstChunk: (() => void) | null = null
    let releaseAbortHold: (() => void) | null = null
    const encoder = new TextEncoder()

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'content-type': 'text/event-stream',
      }),
      body: new ReadableStream<Uint8Array>({
        async start(controller) {
          await new Promise<void>(resolve => {
            releaseFirstChunk = resolve
          })
          controller.enqueue(
            encoder.encode('data: {"type":"response.output_text.delta","delta":"已经生成的前半段"}\n\n'),
          )

          await new Promise<void>(resolve => {
            releaseAbortHold = resolve
          })
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

    const promptPromise = controller.prompt({
      prompt: '请开始流式回答',
      workspaceId: null,
      workspaceSnapshot: null,
    })

    releaseFirstChunk?.()
    await vi.waitFor(() => {
      expect(controller.getState().conversation.at(-1)?.content).toBe('已经生成的前半段')
    })

    const stopResult = controller.stopPrompt()
    expect(stopResult).toEqual({
      stopped: true,
      reply: '已经生成的前半段',
    })
    expect(controller.getState().status).toBe('ready')

    releaseAbortHold?.()
    await expect(promptPromise).resolves.toMatchObject({
      reply: '已经生成的前半段',
    })
    expect(controller.getState().conversation.at(-1)?.content).toBe('已经生成的前半段')
    expect(controller.getState().status).toBe('ready')
  })
})
