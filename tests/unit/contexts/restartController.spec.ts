import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createAppRestartController,
  RESTART_FORCE_EXIT_TIMEOUT_MS,
} from '../../../src/app/main/restartController'

type Listener = (...args: unknown[]) => void

function createMockApp() {
  const listeners = new Map<string, Listener[]>()

  return {
    relaunch: vi.fn(),
    quit: vi.fn(),
    exit: vi.fn(),
    on: vi.fn((event: string, listener: Listener) => {
      const existing = listeners.get(event) ?? []
      existing.push(listener)
      listeners.set(event, existing)
    }),
    emit(event: string, ...args: unknown[]) {
      const handlers = listeners.get(event) ?? []
      handlers.forEach(handler => handler(...args))
    },
  }
}

function createBrowserWindowApi(windowCount = 2) {
  const windows = Array.from({ length: windowCount }, () => ({
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
  }))

  return {
    api: {
      getAllWindows: () => windows,
    },
    windows,
  }
}

describe('createAppRestartController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('queues relaunch after the IPC turn and keeps restart requests idempotent', () => {
    vi.useFakeTimers()

    const app = createMockApp()
    const { api, windows } = createBrowserWindowApi()
    const controller = createAppRestartController({
      app,
      browserWindow: api,
    })

    expect(controller.requestRestart()).toBe(true)
    expect(controller.requestRestart()).toBe(false)
    expect(controller.isRestartPending()).toBe(true)

    expect(app.relaunch).not.toHaveBeenCalled()
    expect(app.quit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(0)

    expect(app.relaunch).toHaveBeenCalledTimes(1)
    expect(app.quit).toHaveBeenCalledTimes(1)
    expect(app.exit).not.toHaveBeenCalled()
    expect(windows[0]?.close).toHaveBeenCalledTimes(1)
    expect(windows[1]?.close).toHaveBeenCalledTimes(1)

    controller.dispose()
  })

  it('forces exit only when graceful quit does not reach will-quit in time', () => {
    vi.useFakeTimers()

    const app = createMockApp()
    const { api } = createBrowserWindowApi(0)
    const onBeforeForceExit = vi.fn()
    const controller = createAppRestartController({
      app,
      browserWindow: api,
      forceExitTimeoutMs: RESTART_FORCE_EXIT_TIMEOUT_MS,
      onBeforeForceExit,
    })

    controller.requestRestart()
    vi.advanceTimersByTime(0)
    expect(app.quit).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(RESTART_FORCE_EXIT_TIMEOUT_MS)

    expect(onBeforeForceExit).toHaveBeenCalledTimes(1)
    expect(app.exit).toHaveBeenCalledWith(0)

    controller.dispose()
  })

  it('cancels forced exit once Electron reaches will-quit', () => {
    vi.useFakeTimers()

    const app = createMockApp()
    const { api } = createBrowserWindowApi(0)
    const onBeforeForceExit = vi.fn()
    const controller = createAppRestartController({
      app,
      browserWindow: api,
      forceExitTimeoutMs: RESTART_FORCE_EXIT_TIMEOUT_MS,
      onBeforeForceExit,
    })

    controller.requestRestart()
    vi.advanceTimersByTime(0)
    app.emit('will-quit')

    vi.advanceTimersByTime(RESTART_FORCE_EXIT_TIMEOUT_MS)

    expect(onBeforeForceExit).not.toHaveBeenCalled()
    expect(app.exit).not.toHaveBeenCalled()

    controller.dispose()
  })
})
