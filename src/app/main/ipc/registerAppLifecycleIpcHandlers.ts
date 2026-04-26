import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/contracts/ipc'
import type { WriteDiagnosticLogInput } from '../../../shared/contracts/dto'
import type { IpcRegistrationDisposable } from './types'
import { registerHandledIpc } from './handle'
import { writeDiagnosticLogEntry } from '../diagnostics/diagnosticLogger'

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

  registerHandledIpc(
    IPC_CHANNELS.appLifecycleWriteDiagnosticLog,
    async (_event, payload: WriteDiagnosticLogInput): Promise<void> => {
      writeDiagnosticLogEntry({
        app,
        scope: payload.scope,
        level: payload.level,
        source: payload.source,
        message: payload.message,
        detail: payload.detail,
      })
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.appLifecycleRestart)
      ipcMain.removeHandler(IPC_CHANNELS.appLifecycleWriteDiagnosticLog)
    },
  }
}
