import { describe, expect, it } from 'vitest'
import type { TerminalNodeData } from '../../src/contexts/workspace/presentation/renderer/types'
import { resolveTerminalRuntimeStatus } from '../../src/app/renderer/shell/utils/terminalRuntimeStatus'

function createTerminalNodeData(
  overrides: Partial<TerminalNodeData> = {},
): TerminalNodeData {
  return {
    sessionId: 'session-1',
    title: 'terminal',
    width: 480,
    height: 320,
    kind: 'terminal',
    status: null,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    lastError: null,
    scrollback: null,
    agent: null,
    task: null,
    note: null,
    image: null,
    ...overrides,
  }
}

describe('terminalRuntimeStatus', () => {
  it('keeps restoring as a distinct runtime status for hosted terminals', () => {
    const status = resolveTerminalRuntimeStatus(
      createTerminalNodeData({
        status: 'restoring',
        hostedAgent: {
          provider: 'codex',
          state: 'active',
          promptHint: null,
          lastError: null,
          restoreIntent: true,
          model: null,
        },
      }),
    )

    expect(status).toBe('restoring')
  })

  it('falls back to hosted agent runtime state only when explicit status is absent', () => {
    const activeStatus = resolveTerminalRuntimeStatus(
      createTerminalNodeData({
        status: null,
        hostedAgent: {
          provider: 'codex',
          state: 'active',
          promptHint: null,
          lastError: null,
          restoreIntent: true,
          model: null,
        },
      }),
    )
    const inactiveStatus = resolveTerminalRuntimeStatus(
      createTerminalNodeData({
        status: null,
        hostedAgent: {
          provider: 'codex',
          state: 'inactive',
          promptHint: null,
          lastError: null,
          restoreIntent: false,
          model: null,
        },
      }),
    )

    expect(activeStatus).toBe('running')
    expect(inactiveStatus).toBe('standby')
  })
})
