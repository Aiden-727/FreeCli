import type { App, BrowserWindow } from 'electron'
import { BrowserWindow as ElectronBrowserWindow } from 'electron'

export const RESTART_FORCE_EXIT_TIMEOUT_MS = 4_000

interface TimerApi {
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

interface BrowserWindowApi {
  getAllWindows: () => Array<Pick<BrowserWindow, 'close' | 'isDestroyed'>>
}

interface RestartControllerDeps {
  app: Pick<App, 'exit' | 'on' | 'quit' | 'relaunch'>
  browserWindow?: BrowserWindowApi
  timers?: TimerApi
  forceExitTimeoutMs?: number
  onBeforeForceExit?: () => void
}

export interface AppRestartController {
  requestRestart: () => boolean
  isRestartPending: () => boolean
  dispose: () => void
}

function createDefaultTimerApi(): TimerApi {
  return {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
}

function closeAllOpenWindows(browserWindow: BrowserWindowApi): void {
  for (const window of browserWindow.getAllWindows()) {
    if (window.isDestroyed()) {
      continue
    }

    try {
      // Close windows before quit so renderer unload/cleanup starts deterministically.
      window.close()
    } catch {
      // Ignore window teardown races during shutdown.
    }
  }
}

export function createAppRestartController({
  app,
  browserWindow = ElectronBrowserWindow,
  timers = createDefaultTimerApi(),
  forceExitTimeoutMs = RESTART_FORCE_EXIT_TIMEOUT_MS,
  onBeforeForceExit,
}: RestartControllerDeps): AppRestartController {
  let restartPending = false
  let disposed = false
  let executeRestartTimer: unknown = null
  let forceExitTimer: unknown = null

  const clearExecuteRestartTimer = (): void => {
    if (executeRestartTimer === null) {
      return
    }

    timers.clearTimeout(executeRestartTimer)
    executeRestartTimer = null
  }

  const clearForceExitTimer = (): void => {
    if (forceExitTimer === null) {
      return
    }

    timers.clearTimeout(forceExitTimer)
    forceExitTimer = null
  }

  const clearTimers = (): void => {
    clearExecuteRestartTimer()
    clearForceExitTimer()
  }

  app.on('will-quit', () => {
    clearTimers()
  })

  const scheduleForceExit = (): void => {
    clearForceExitTimer()
    forceExitTimer = timers.setTimeout(() => {
      forceExitTimer = null

      // If graceful quit is stuck on some runtime/resource edge, clean up owners explicitly
      // before using app.exit(), because Electron will skip before-quit/will-quit in that path.
      onBeforeForceExit?.()
      app.exit(0)
    }, forceExitTimeoutMs)
  }

  return {
    requestRestart: () => {
      if (restartPending || disposed) {
        return false
      }

      restartPending = true
      executeRestartTimer = timers.setTimeout(() => {
        executeRestartTimer = null

        if (disposed) {
          return
        }

        app.relaunch()
        closeAllOpenWindows(browserWindow)
        app.quit()
        scheduleForceExit()
      }, 0)

      return true
    },
    isRestartPending: () => restartPending,
    dispose: () => {
      if (disposed) {
        return
      }

      disposed = true
      clearTimers()
    },
  }
}
