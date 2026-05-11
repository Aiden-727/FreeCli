import type { App, BrowserWindow, NativeImage, Tray } from 'electron'
import { Menu, Tray as ElectronTray } from 'electron'

interface MainWindowLike {
  close: () => void
  destroy?: () => void
  focus?: () => void
  hide?: () => void
  isDestroyed?: () => boolean
  isMinimized?: () => boolean
  restore?: () => void
  show?: () => void
}

interface BrowserWindowApi {
  getAllWindows: () => MainWindowLike[]
}

interface BackgroundLifecycleControllerDeps {
  app: Pick<App, 'on' | 'quit'>
  browserWindow: BrowserWindowApi
  createTray?: (image?: NativeImage) => Tray
  icon?: NativeImage | null
  onShowMainWindow: () => void
  onBeforeHideToTray: (window: MainWindowLike) => void | Promise<void>
  onBeforeFullQuit: () => void
}

export interface BackgroundLifecycleController {
  ensureTrayVisible: () => void
  handleMainWindowClose: (event: { preventDefault?: () => void }, window: MainWindowLike) => void
  isFullQuitRequested: () => boolean
  requestFullQuit: () => void
  showMainWindowFromTray: () => void
  dispose: () => void
}

export function createBackgroundLifecycleController({
  app,
  browserWindow,
  createTray = image => new ElectronTray(image),
  icon = null,
  onShowMainWindow,
  onBeforeHideToTray,
  onBeforeFullQuit,
}: BackgroundLifecycleControllerDeps): BackgroundLifecycleController {
  let fullQuitRequested = false
  let tray: Tray | null = null

  const ensureTray = (): Tray => {
    if (tray) {
      return tray
    }

    tray = createTray(icon ?? undefined)
    tray.setToolTip('FreeCli')
    tray.addListener('double-click', () => {
      onShowMainWindow()
    })
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: '显示主窗口',
          click: () => {
            onShowMainWindow()
          },
        },
        {
          type: 'separator',
        },
        {
          label: '退出 FreeCli',
          click: () => {
            fullQuitRequested = true
            onBeforeFullQuit()
            for (const window of browserWindow.getAllWindows()) {
              if (window.isDestroyed?.()) {
                continue
              }

              window.close()
            }
            app.quit()
          },
        },
      ]),
    )

    return tray
  }

  return {
    ensureTrayVisible: () => {
      ensureTray()
    },
    handleMainWindowClose: (event, window) => {
      if (fullQuitRequested) {
        return
      }

      event.preventDefault?.()
      void Promise.resolve(onBeforeHideToTray(window)).finally(() => {
        if (window.isDestroyed?.()) {
          return
        }

        ensureTray()
        window.destroy?.()
      })
    },
    isFullQuitRequested: () => fullQuitRequested,
    requestFullQuit: () => {
      fullQuitRequested = true
      onBeforeFullQuit()
    },
    showMainWindowFromTray: () => {
      onShowMainWindow()
    },
    dispose: () => {
      tray?.destroy()
      tray = null
    },
  }
}
