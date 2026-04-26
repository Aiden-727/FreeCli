import { describe, expect, it } from 'vitest'
import type { TerminalNodeData } from '../../src/contexts/workspace/presentation/renderer/types'
import {
  resolveSidebarAgentRuntimeStatus,
  resolveSidebarTerminalRuntimeStatus,
  resolveTerminalRuntimeStatus,
} from '../../src/app/renderer/shell/utils/terminalRuntimeStatus'

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

  it('downgrades persisted active terminal statuses to stopped in sidebar when no live session exists', () => {
    const runningStatus = resolveSidebarTerminalRuntimeStatus(
      createTerminalNodeData({
        sessionId: '',
        status: 'running',
      }),
    )
    const restoringStatus = resolveSidebarTerminalRuntimeStatus(
      createTerminalNodeData({
        sessionId: '',
        status: 'restoring',
      }),
    )
    const standbyStatus = resolveSidebarTerminalRuntimeStatus(
      createTerminalNodeData({
        sessionId: '',
        status: 'standby',
      }),
    )

    expect(runningStatus).toBe('stopped')
    expect(restoringStatus).toBe('stopped')
    expect(standbyStatus).toBe('stopped')
  })

  it('keeps live terminal statuses intact in sidebar once runtime session is attached', () => {
    const status = resolveSidebarTerminalRuntimeStatus(
      createTerminalNodeData({
        sessionId: 'live-session',
        status: 'running',
      }),
    )

    expect(status).toBe('running')
  })

  it('downgrades persisted active agent statuses to stopped in sidebar when no live session exists', () => {
    expect(
      resolveSidebarAgentRuntimeStatus({
        sessionId: '',
        status: 'running',
      }),
    ).toBe('stopped')
    expect(
      resolveSidebarAgentRuntimeStatus({
        sessionId: '',
        status: 'restoring',
      }),
    ).toBe('stopped')
    expect(
      resolveSidebarAgentRuntimeStatus({
        sessionId: '',
        status: 'standby',
      }),
    ).toBe('stopped')
  })

  it('treats hosted terminal state as historical when no live session exists', () => {
    const status = resolveSidebarTerminalRuntimeStatus(
      createTerminalNodeData({
        sessionId: '',
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

    expect(status).toBe('stopped')
  })
})
