import { describe, expect, it } from 'vitest'
import { resolveTerminalModelLabel } from '../../../src/contexts/workspace/presentation/renderer/components/workspaceCanvas/nodeTypes'
import type { TerminalNodeData } from '../../../src/contexts/workspace/presentation/renderer/types'

function createAgentNodeData(overrides: Partial<TerminalNodeData> = {}): TerminalNodeData {
  return {
    sessionId: 'session-1',
    title: 'codex · gpt-5.4',
    titlePinnedByUser: false,
    width: 520,
    height: 320,
    kind: 'agent',
    status: 'standby',
    startedAt: null,
    endedAt: null,
    exitCode: null,
    lastError: null,
    scrollback: null,
    agent: {
      provider: 'codex',
      prompt: 'test',
      model: null,
      effectiveModel: null,
      launchMode: 'new',
      resumeSessionId: null,
      executionDirectory: 'D:/Project/freecli',
      expectedDirectory: 'D:/Project/freecli',
      directoryMode: 'workspace',
      customDirectory: null,
      shouldCreateDirectory: false,
      taskId: null,
    },
    hostedAgent: null,
    task: null,
    note: null,
    image: null,
    ...overrides,
  }
}

function createHostedTerminalNodeData(overrides: Partial<TerminalNodeData> = {}): TerminalNodeData {
  return {
    sessionId: 'terminal-session-1',
    title: 'codex',
    titlePinnedByUser: false,
    width: 520,
    height: 320,
    kind: 'terminal',
    status: 'standby',
    startedAt: null,
    endedAt: null,
    exitCode: null,
    lastError: null,
    scrollback: null,
    executionDirectory: 'D:/Project/freecli',
    expectedDirectory: 'D:/Project/freecli',
    agent: null,
    hostedAgent: {
      provider: 'codex',
      launchMode: 'new',
      resumeSessionId: null,
      resumeSessionIdVerified: false,
      model: null,
      effectiveModel: null,
      reasoningEffort: null,
      displayModelLabel: null,
      cwd: 'D:/Project/freecli',
      command: 'codex',
      startedAt: '2026-04-12T00:00:00.000Z',
      restoreIntent: true,
      state: 'active',
    },
    task: null,
    note: null,
    image: null,
    ...overrides,
  }
}

describe('resolveTerminalModelLabel', () => {
  it('prefers explicit agent model metadata', () => {
    const data = createAgentNodeData({
      title: 'codex · old-model',
      agent: {
        ...createAgentNodeData().agent!,
        model: 'gpt-5.4',
        effectiveModel: 'gpt-5.4',
      },
    })

    expect(resolveTerminalModelLabel(data)).toBe('gpt-5.4')
  })

  it('falls back to the generated agent title when runtime model metadata is missing', () => {
    const data = createAgentNodeData()

    expect(resolveTerminalModelLabel(data)).toBe('gpt-5.4')
  })

  it('does not infer a model from a user-pinned custom title', () => {
    const data = createAgentNodeData({
      title: '我的自定义 Agent',
      titlePinnedByUser: true,
    })

    expect(resolveTerminalModelLabel(data)).toBe('默认模型')
  })

  it('prefers hosted terminal runtime metadata over the command model', () => {
    const data = createHostedTerminalNodeData({
      hostedAgent: {
        ...createHostedTerminalNodeData().hostedAgent!,
        model: 'gpt-4.1',
        effectiveModel: 'gpt-5.4',
        reasoningEffort: 'high',
        displayModelLabel: 'gpt-5.4 high',
      },
    })

    expect(resolveTerminalModelLabel(data)).toBe('gpt-5.4 high')
  })

  it('falls back to the explicit hosted terminal model before defaulting', () => {
    const data = createHostedTerminalNodeData({
      hostedAgent: {
        ...createHostedTerminalNodeData().hostedAgent!,
        model: 'gpt-5.4',
      },
    })

    expect(resolveTerminalModelLabel(data)).toBe('gpt-5.4')
  })
})
