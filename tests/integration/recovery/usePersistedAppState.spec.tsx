import React from 'react'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'

const { flushScheduledPersistedStateWrite, schedulePersistedStateWrite } = vi.hoisted(() => ({
  flushScheduledPersistedStateWrite: vi.fn(),
  schedulePersistedStateWrite: vi.fn(),
}))

vi.mock('../../../src/contexts/workspace/presentation/renderer/utils/persistence', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/contexts/workspace/presentation/renderer/utils/persistence')
  >('../../../src/contexts/workspace/presentation/renderer/utils/persistence')

  return {
    ...actual,
    flushScheduledPersistedStateWrite,
    schedulePersistedStateWrite,
  }
})

const { flushScheduledNodeScrollbackWrites } = vi.hoisted(() => ({
  flushScheduledNodeScrollbackWrites: vi.fn(),
}))

vi.mock(
  '../../../src/contexts/workspace/presentation/renderer/utils/persistence/scrollbackSchedule',
  async () => {
    const actual = await vi.importActual<
      typeof import('../../../src/contexts/workspace/presentation/renderer/utils/persistence/scrollbackSchedule')
    >('../../../src/contexts/workspace/presentation/renderer/utils/persistence/scrollbackSchedule')

    return {
      ...actual,
      flushScheduledNodeScrollbackWrites,
    }
  },
)

import { usePersistedAppState } from '../../../src/app/renderer/shell/hooks/usePersistedAppState'
import { useAppStore } from '../../../src/app/renderer/shell/store/useAppStore'

describe('usePersistedAppState', () => {
  beforeEach(() => {
    flushScheduledPersistedStateWrite.mockReset()
    schedulePersistedStateWrite.mockReset()
    flushScheduledNodeScrollbackWrites.mockReset()

    Object.defineProperty(window, 'freecliApi', {
      configurable: true,
      writable: true,
      value: { meta: { isTest: false } },
    })

    useAppStore.getState().setPersistNotice(null)
  })

  it('flushes app state + node scrollbacks on beforeunload', () => {
    schedulePersistedStateWrite.mockImplementation(() => {})

    function Harness() {
      usePersistedAppState({
        workspaces: [],
        activeWorkspaceId: null,
        agentSettings: DEFAULT_AGENT_SETTINGS,
        isHydrated: true,
        producePersistedState: () => ({
          formatVersion: 0,
          activeWorkspaceId: null,
          workspaces: [],
          settings: DEFAULT_AGENT_SETTINGS,
        }),
      })
      return null
    }

    render(<Harness />)

    window.dispatchEvent(new Event('beforeunload'))

    expect(flushScheduledNodeScrollbackWrites).toHaveBeenCalledTimes(1)
    expect(flushScheduledPersistedStateWrite).toHaveBeenCalledTimes(1)
  })

  it('keeps recovery notices after successful full writes', async () => {
    useAppStore.getState().setPersistNotice({
      tone: 'warning',
      message: 'Persistence database was corrupted and has been reset.',
      kind: 'recovery',
    })

    schedulePersistedStateWrite.mockImplementation((_producer, options) => {
      options?.onResult?.({ ok: true, level: 'full', bytes: 1 })
    })

    function Harness() {
      usePersistedAppState({
        workspaces: [],
        activeWorkspaceId: null,
        agentSettings: DEFAULT_AGENT_SETTINGS,
        isHydrated: true,
        producePersistedState: () => ({
          formatVersion: 0,
          activeWorkspaceId: null,
          workspaces: [],
          settings: DEFAULT_AGENT_SETTINGS,
        }),
      })
      return null
    }

    render(<Harness />)

    await waitFor(() => {
      expect(useAppStore.getState().persistNotice?.kind).toBe('recovery')
    })
  })

  it('does not auto-schedule persisted writes for runtime-only workspace updates', () => {
    schedulePersistedStateWrite.mockImplementation(() => {})

    const producePersistedState = vi.fn(() => ({
      formatVersion: 0,
      activeWorkspaceId: 'workspace-1',
      workspaces: [],
      settings: DEFAULT_AGENT_SETTINGS,
    }))

    const { rerender } = renderHook(
      ({ workspaces }) =>
        usePersistedAppState({
          workspaces,
          activeWorkspaceId: 'workspace-1',
          agentSettings: DEFAULT_AGENT_SETTINGS,
          isHydrated: true,
          producePersistedState,
        }),
      {
        initialProps: { workspaces: [] as unknown[] },
      },
    )

    expect(schedulePersistedStateWrite).toHaveBeenCalledTimes(1)

    rerender({ workspaces: [] })

    expect(schedulePersistedStateWrite).toHaveBeenCalledTimes(1)
  })

  it('still schedules an immediate pending write when a workspace change explicitly requests persistence', () => {
    schedulePersistedStateWrite.mockImplementation(() => {})

    const producePersistedState = vi.fn(() => ({
      formatVersion: 0,
      activeWorkspaceId: 'workspace-1',
      workspaces: [],
      settings: DEFAULT_AGENT_SETTINGS,
    }))

    const { result, rerender } = renderHook(
      ({ workspaces }) =>
        usePersistedAppState({
          workspaces,
          activeWorkspaceId: 'workspace-1',
          agentSettings: DEFAULT_AGENT_SETTINGS,
          isHydrated: true,
          producePersistedState,
        }),
      {
        initialProps: { workspaces: [] as unknown[] },
      },
    )

    schedulePersistedStateWrite.mockClear()
    flushScheduledPersistedStateWrite.mockClear()

    act(() => {
      result.current.requestPersistFlush()
    })

    rerender({ workspaces: [] })

    expect(schedulePersistedStateWrite).toHaveBeenCalledTimes(1)
    expect(flushScheduledPersistedStateWrite).not.toHaveBeenCalled()
  })

  it('enqueues a persisted write immediately when an explicit flush is requested', () => {
    schedulePersistedStateWrite.mockImplementation(() => {})

    const producePersistedState = vi.fn(() => ({
      formatVersion: 0,
      activeWorkspaceId: 'workspace-1',
      workspaces: [],
      settings: DEFAULT_AGENT_SETTINGS,
    }))

    const { result } = renderHook(() =>
      usePersistedAppState({
        workspaces: [],
        activeWorkspaceId: 'workspace-1',
        agentSettings: DEFAULT_AGENT_SETTINGS,
        isHydrated: true,
        producePersistedState,
      }),
    )

    schedulePersistedStateWrite.mockClear()
    flushScheduledPersistedStateWrite.mockClear()

    act(() => {
      result.current.requestPersistFlush()
    })

    expect(schedulePersistedStateWrite).toHaveBeenCalledTimes(1)
    expect(flushScheduledPersistedStateWrite).not.toHaveBeenCalled()
  })

  it('keeps automatic persistence for durable shell inputs', () => {
    schedulePersistedStateWrite.mockImplementation(() => {})

    const producePersistedState = vi.fn(() => ({
      formatVersion: 0,
      activeWorkspaceId: 'workspace-1',
      workspaces: [],
      settings: DEFAULT_AGENT_SETTINGS,
    }))

    const { rerender } = renderHook(
      ({ activeWorkspaceId, agentSettings }) =>
        usePersistedAppState({
          workspaces: [],
          activeWorkspaceId,
          agentSettings,
          isHydrated: true,
          producePersistedState,
        }),
      {
        initialProps: {
          activeWorkspaceId: 'workspace-1' as string | null,
          agentSettings: DEFAULT_AGENT_SETTINGS,
        },
      },
    )

    expect(schedulePersistedStateWrite).toHaveBeenCalledTimes(1)

    rerender({
      activeWorkspaceId: 'workspace-2',
      agentSettings: DEFAULT_AGENT_SETTINGS,
    })

    rerender({
      activeWorkspaceId: 'workspace-2',
      agentSettings: {
        ...DEFAULT_AGENT_SETTINGS,
        uiFontSize: DEFAULT_AGENT_SETTINGS.uiFontSize + 1,
      },
    })

    expect(schedulePersistedStateWrite).toHaveBeenCalledTimes(3)
  })
})
