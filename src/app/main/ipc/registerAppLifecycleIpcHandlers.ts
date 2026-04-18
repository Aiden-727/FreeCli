import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/contracts/ipc'
import type { IpcRegistrationDisposable } from './types'
import { registerHandledIpc } from './handle'

function queueFallbackRestartRequest(): boolean {
  setTimeout(() => {
    app.relaunch()
    app.quit()
  }, 0)

  return true
}

export function registerAppLifecycleIpcHandlers(deps?: {
  requestRestart?: () => boolean
}): IpcRegistrationDisposable {
  const requestRestart = deps?.requestRestart ?? queueFallbackRestartRequest

  registerHandledIpc(
    IPC_CHANNELS.appLifecycleRestart,
    async (): Promise<void> => {
      requestRestart()
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.appLifecycleRestart)
    },
  }
}
