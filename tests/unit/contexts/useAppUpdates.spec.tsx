import React from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppUpdates } from '../../../src/app/renderer/shell/hooks/useAppUpdates'
import type { AppUpdateState } from '../../../src/shared/contracts/dto'

function createUpdateState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    policy: 'prompt',
    channel: 'stable',
    currentVersion: '0.2.0',
    status: 'idle',
    latestVersion: null,
    releaseName: null,
    releaseDate: null,
    releaseNotesUrl: null,
    downloadPercent: null,
    downloadedBytes: null,
    totalBytes: null,
    checkedAt: null,
    message: null,
    ...overrides,
  }
}

describe('useAppUpdates', () => {
  afterEach(() => {
    delete window.freecliApi
    vi.restoreAllMocks()
  })

  it('does not configure update checks before persisted settings are ready', async () => {
    const state = createUpdateState()
    const getState = vi.fn(async () => state)
    const configure = vi.fn(async () => state)

    window.freecliApi = {
      update: {
        getState,
        configure,
        checkForUpdates: vi.fn(async () => state),
        downloadUpdate: vi.fn(async () => state),
        installUpdate: vi.fn(async () => undefined),
        onState: vi.fn(() => () => undefined),
      },
    } as typeof window.freecliApi

    const onShowMessage = vi.fn()
    const { rerender } = renderHook(
      ({ enabled }) =>
        useAppUpdates({
          enabled,
          policy: 'prompt',
          channel: 'stable',
          onShowMessage,
        }),
      {
        initialProps: { enabled: false },
      },
    )

    expect(getState).not.toHaveBeenCalled()
    expect(configure).not.toHaveBeenCalled()

    rerender({ enabled: true })

    await waitFor(() => {
      expect(getState).toHaveBeenCalledTimes(1)
      expect(configure).toHaveBeenCalledWith({
        policy: 'prompt',
        channel: 'stable',
      })
    })
  })

  it('delegates explicit update actions to the preload bridge after initialization', async () => {
    const state = createUpdateState({ status: 'available', latestVersion: '0.2.1' })
    const checkForUpdates = vi.fn(async () => state)
    const downloadUpdate = vi.fn(async () => state)
    const installUpdate = vi.fn(async () => undefined)

    window.freecliApi = {
      update: {
        getState: vi.fn(async () => state),
        configure: vi.fn(async () => state),
        checkForUpdates,
        downloadUpdate,
        installUpdate,
        onState: vi.fn(() => () => undefined),
      },
    } as typeof window.freecliApi

    const { result } = renderHook(() =>
      useAppUpdates({
        enabled: true,
        policy: 'prompt',
        channel: 'stable',
        onShowMessage: () => undefined,
      }),
    )

    await waitFor(() => {
      expect(result.current.updateState?.latestVersion).toBe('0.2.1')
    })

    await act(async () => {
      await result.current.checkForUpdates()
      await result.current.downloadUpdate()
      await result.current.installUpdate()
    })

    expect(checkForUpdates).toHaveBeenCalledTimes(1)
    expect(downloadUpdate).toHaveBeenCalledTimes(1)
    expect(installUpdate).toHaveBeenCalledTimes(1)
  })
})
