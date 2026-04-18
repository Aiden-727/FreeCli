import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createTerminalForegroundSyncScheduler,
  registerTerminalLayoutSync,
} from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/layoutSync'
import { TERMINAL_LAYOUT_SYNC_EVENT } from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/constants'

describe('terminal layout sync', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('coalesces foreground sync requests within the same frame', () => {
    let scheduledCallback: FrameRequestCallback | null = null
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(callback => {
        scheduledCallback = callback
        return 1
      })

    const onForegroundSync = vi.fn()
    const scheduler = createTerminalForegroundSyncScheduler(onForegroundSync)

    scheduler.schedule()
    scheduler.schedule()

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)
    expect(onForegroundSync).not.toHaveBeenCalled()

    scheduledCallback?.(16)

    expect(onForegroundSync).toHaveBeenCalledTimes(1)
  })

  it('routes foreground and layout events to their dedicated handlers', () => {
    let scheduledCallback: FrameRequestCallback | null = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      scheduledCallback = callback
      return 1
    })

    const onForegroundSync = vi.fn()
    const onLayoutSync = vi.fn()
    const dispose = registerTerminalLayoutSync({
      onForegroundSync,
      onLayoutSync,
    })

    window.dispatchEvent(new Event('focus'))
    expect(onForegroundSync).not.toHaveBeenCalled()
    expect(onLayoutSync).not.toHaveBeenCalled()
    scheduledCallback?.(16)
    expect(onForegroundSync).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    scheduledCallback?.(32)
    expect(onForegroundSync).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event(TERMINAL_LAYOUT_SYNC_EVENT))
    expect(onLayoutSync).toHaveBeenCalledTimes(1)

    dispose()
  })

  it('splits many foreground sync callbacks across multiple frames', () => {
    const scheduledCallbacks: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      scheduledCallbacks.push(callback)
      return scheduledCallbacks.length
    })

    const foregroundSyncCallbacks = Array.from({ length: 6 }, () => vi.fn())
    const schedulers = foregroundSyncCallbacks.map(callback =>
      createTerminalForegroundSyncScheduler(callback),
    )

    schedulers.forEach(scheduler => {
      scheduler.schedule()
    })

    expect(scheduledCallbacks).toHaveLength(1)
    scheduledCallbacks.shift()?.(16)

    expect(
      foregroundSyncCallbacks.slice(0, 4).every(callback => callback.mock.calls.length === 1),
    ).toBe(true)
    expect(
      foregroundSyncCallbacks.slice(4).every(callback => callback.mock.calls.length === 0),
    ).toBe(true)
    expect(scheduledCallbacks).toHaveLength(1)

    scheduledCallbacks.shift()?.(32)
    expect(foregroundSyncCallbacks.every(callback => callback.mock.calls.length === 1)).toBe(true)
  })
})
