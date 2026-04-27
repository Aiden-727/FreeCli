import { describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../src/shared/contracts/ipc'
import { invokeHandledIpc } from './ipcTestUtils'

function createIpcHarness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
  }

  return { handlers, ipcMain }
}

describe('app lifecycle IPC', () => {
  it('schedules restart through the injected owner instead of relaunching inline', async () => {
    vi.resetModules()

    const { handlers, ipcMain } = createIpcHarness()
    const app = {
      relaunch: vi.fn(),
      quit: vi.fn(),
    }
    const requestRestart = vi.fn(() => true)

    vi.doMock('electron', () => ({ app, ipcMain }))

    const { registerAppLifecycleIpcHandlers } =
      await import('../../../src/app/main/ipc/registerAppLifecycleIpcHandlers')

    const disposable = registerAppLifecycleIpcHandlers({ requestRestart })
    const handler = handlers.get(IPC_CHANNELS.appLifecycleRestart)

    await expect(invokeHandledIpc<void>(handler, null)).resolves.toBeUndefined()
    expect(requestRestart).toHaveBeenCalledTimes(1)
    expect(app.relaunch).not.toHaveBeenCalled()
    expect(app.quit).not.toHaveBeenCalled()

    disposable.dispose()
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.appLifecycleRestart)
  })

  it('delegates clear-user-data-and-restart to the injected owner', async () => {
    vi.resetModules()

    const { handlers, ipcMain } = createIpcHarness()
    const app = {
      relaunch: vi.fn(),
      quit: vi.fn(),
      getPath: vi.fn(() => 'C:/Users/Aiden/AppData/Roaming/freecli'),
    }
    const requestRestart = vi.fn(() => true)
    const clearUserDataAndRestart = vi.fn(async () => undefined)

    vi.doMock('electron', () => ({ app, ipcMain }))

    const { registerAppLifecycleIpcHandlers } =
      await import('../../../src/app/main/ipc/registerAppLifecycleIpcHandlers')

    const disposable = registerAppLifecycleIpcHandlers({
      requestRestart,
      clearUserDataAndRestart,
    })
    const clearHandler = handlers.get(IPC_CHANNELS.appLifecycleClearUserDataAndRestart)
    const infoHandler = handlers.get(IPC_CHANNELS.appLifecycleGetUserDataInfo)

    await expect(invokeHandledIpc<void>(clearHandler, null)).resolves.toBeUndefined()
    expect(clearUserDataAndRestart).toHaveBeenCalledTimes(1)
    expect(requestRestart).not.toHaveBeenCalled()

    await expect(invokeHandledIpc<{ path: string }>(infoHandler, null)).resolves.toEqual({
      path: 'C:/Users/Aiden/AppData/Roaming/freecli',
    })

    disposable.dispose()
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.appLifecycleClearUserDataAndRestart,
    )
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.appLifecycleGetUserDataInfo)
  })
})
