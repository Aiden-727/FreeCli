import React from 'react'
import { act, renderHook } from '@testing-library/react'
import type { Node } from '@xyflow/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceCanvasAgentLastMessageCopy } from '../../../src/contexts/workspace/presentation/renderer/components/workspaceCanvas/hooks/useAgentLastMessageToNote'
import type { TerminalNodeData } from '../../../src/contexts/workspace/presentation/renderer/types'

describe('useWorkspaceCanvasAgentLastMessageCopy', () => {
  afterEach(() => {
    delete window.freecliApi
    vi.restoreAllMocks()
  })

  it('copies the last message from a hosted terminal agent session', async () => {
    const readLastMessage = vi.fn(async () => ({ message: 'hosted reply' }))
    const writeText = vi.fn(async () => undefined)
    const onShowMessage = vi.fn()

    window.freecliApi = {
      agent: {
        readLastMessage,
      },
      clipboard: {
        writeText,
      },
    } as typeof window.freecliApi

    const nodesRef = {
      current: [
        {
          id: 'terminal-1',
          type: 'terminalNode',
          position: { x: 0, y: 0 },
          data: {
            sessionId: 'session-1',
            title: 'codex · gpt-5.4',
            width: 520,
            height: 360,
            kind: 'terminal',
            status: 'standby',
            startedAt: null,
            endedAt: null,
            exitCode: null,
            lastError: null,
            scrollback: null,
            persistenceMode: 'persistent',
            executionDirectory: '/tmp/workspace-1',
            expectedDirectory: '/tmp/workspace-1',
            agent: null,
            hostedAgent: {
              provider: 'codex',
              launchMode: 'resume',
              resumeSessionId: 'resume-1',
              resumeSessionIdVerified: true,
              model: 'gpt-5.4',
              cwd: '/tmp/workspace-1',
              command: 'codex --model gpt-5.4',
              startedAt: '2026-04-03T09:00:00.000Z',
              restoreIntent: true,
              state: 'active',
            },
            task: null,
            note: null,
            image: null,
          } satisfies TerminalNodeData,
          draggable: true,
          selectable: true,
        } satisfies Node<TerminalNodeData>,
      ],
    }

    const { result } = renderHook(
      () =>
        useWorkspaceCanvasAgentLastMessageCopy({
          nodesRef,
          onShowMessage,
        }),
      {
        wrapper: ({ children }) => <>{children}</>,
      },
    )

    await act(async () => {
      await result.current('terminal-1')
    })

    expect(readLastMessage).toHaveBeenCalledWith({
      provider: 'codex',
      cwd: '/tmp/workspace-1',
      startedAt: '2026-04-03T09:00:00.000Z',
      resumeSessionId: 'resume-1',
    })
    expect(writeText).toHaveBeenCalledWith('hosted reply')
    expect(onShowMessage).toHaveBeenCalledWith('已复制最后一条 Agent 消息。')
  })
})
