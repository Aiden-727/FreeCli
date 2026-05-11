import { app, shell, BrowserWindow, nativeImage, ipcMain } from 'electron'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { hydrateCliEnvironmentForAppLaunch } from '../../platform/os/CliEnvironment'
import { registerIpcHandlers } from './ipc/registerIpcHandlers'
import { registerControlSurfaceServer } from './controlSurface/registerControlSurfaceServer'
import { setRuntimeIconTestState } from './iconTestHarness'
import { resolveRuntimeIconPath } from './runtimeIcon'
import { createDevelopmentRuntimeIcon } from './runtimeIconVariant'
import { resolveTitleBarOverlay } from './ipc/registerWindowChromeIpcHandlers'
import { shouldEnableWaylandIme } from './waylandIme'
import { createApprovedWorkspaceStore } from '../../contexts/workspace/infrastructure/approval/ApprovedWorkspaceStore'
import { createPtyRuntime } from '../../contexts/terminal/presentation/main-ipc/runtime'
import { applyLaunchGraphicsMode, resolveLaunchGraphicsMode } from './graphicsMode'
import { createAppRestartController } from './restartController'
import { resolveDiagnosticLogPath, writeDiagnosticLogEntry } from './diagnostics/diagnosticLogger'
import { createBackgroundLifecycleController } from './backgroundLifecycleController'

let ipcDisposable: ReturnType<typeof registerIpcHandlers> | null = null
let controlSurfaceDisposable: ReturnType<typeof registerControlSurfaceServer> | null = null
let mainRuntimeDisposePromise: Promise<void> | null = null
let mainRuntimeDisposed = false
let activeMainWindow: BrowserWindow | null = null
let sharedPtyRuntime: ReturnType<typeof createPtyRuntime> | null = null
let fullQuitRequested = false
let destroyTray: (() => void) | null = null
const APP_USER_DATA_DIRECTORY_NAME = 'freecli'
const FREECLI_APP_USER_MODEL_ID = 'dev.deadwave.freecli'
const MAIN_WINDOW_TITLE = 'FreeCli'
const WINDOW_CLOSE_PREPARE_TIMEOUT_MS = 1500

if (process.env['NODE_ENV'] === 'test') {
  // GitHub Actions macOS runners often treat the Electron window as occluded/backgrounded even in
  // "normal" mode, which can pause rAF/timers and break pointer-driven E2E interactions.
  // These Chromium switches keep the renderer responsive in such environments.
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-background-timer-throttling')

  const existingDisableFeatures =
    typeof app.commandLine.getSwitchValue === 'function'
      ? app.commandLine.getSwitchValue('disable-features')
      : ''
  const disableFeatures = new Set(
    existingDisableFeatures
      .split(',')
      .map(value => value.trim())
      .filter(value => value.length > 0),
  )
  // Native window occlusion can throttle/pause rAF in headful CI environments (notably macOS).
  disableFeatures.add('CalculateNativeWinOcclusion')
  app.commandLine.appendSwitch('disable-features', [...disableFeatures].join(','))
}

if (process.platform === 'linux' && process.env['NODE_ENV'] === 'test') {
  const disableSandboxForCi =
    (process.env['CI'] === '1' || process.env['CI']?.toLowerCase() === 'true') &&
    process.env['ELECTRON_DISABLE_SANDBOX'] === '1'

  if (disableSandboxForCi) {
    app.commandLine.appendSwitch('no-sandbox')
    app.commandLine.appendSwitch('disable-dev-shm-usage')
  }
}

if (shouldEnableWaylandIme({ platform: process.platform, env: process.env })) {
  app.commandLine.appendSwitch('enable-wayland-ime')
}

function preserveCanonicalUserDataPath(): void {
  const appDataPath = app.getPath('appData')
  app.setPath('userData', resolve(appDataPath, APP_USER_DATA_DIRECTORY_NAME))
}

if (process.env.NODE_ENV !== 'test') {
  preserveCanonicalUserDataPath()
}

if (process.env.NODE_ENV === 'test' && process.env['FREECLI_TEST_USER_DATA_DIR']) {
  app.setPath('userData', resolve(process.env['FREECLI_TEST_USER_DATA_DIR']))
} else if (app.isPackaged === false) {
  const wantsSharedUserData =
    isTruthyEnv(process.env['FREECLI_DEV_USE_SHARED_USER_DATA']) ||
    process.argv.includes('--freecli-shared-user-data') ||
    process.argv.includes('--shared-user-data')

  if (!wantsSharedUserData) {
    const explicitDevUserDataDir = process.env['FREECLI_DEV_USER_DATA_DIR']
    const defaultUserDataDir = app.getPath('userData')
    const devUserDataDir = explicitDevUserDataDir
      ? resolve(explicitDevUserDataDir)
      : `${defaultUserDataDir}-dev`

    app.setPath('userData', devUserDataDir)
  }
}

const launchGraphicsMode = resolveLaunchGraphicsMode(app.getPath('userData'))
applyLaunchGraphicsMode(app, launchGraphicsMode)
const restartController = createAppRestartController({
  app,
  browserWindow: BrowserWindow,
  onBeforeForceExit: disposeMainRuntime,
})

const EXTERNAL_PROTOCOL_ALLOWLIST = new Set(['http:', 'https:', 'mailto:'])
const E2E_OFFSCREEN_COORDINATE = -50_000
type E2EWindowMode = 'normal' | 'inactive' | 'hidden' | 'offscreen'

function parseUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl.trim())
  } catch {
    return null
  }
}

function shouldOpenUrlExternally(rawUrl: string): boolean {
  const parsed = parseUrl(rawUrl)
  if (!parsed) {
    return false
  }

  return EXTERNAL_PROTOCOL_ALLOWLIST.has(parsed.protocol)
}

function resolveDevRendererOrigin(): string | null {
  const raw = process.env['ELECTRON_RENDERER_URL']
  if (!raw) {
    return null
  }

  const parsed = parseUrl(raw)
  return parsed ? parsed.origin : null
}

function isPathWithinRoot(rootPath: string, targetPath: string): boolean {
  const relativePath = relative(rootPath, targetPath)

  if (relativePath === '') {
    return true
  }

  if (relativePath === '..') {
    return false
  }

  if (relativePath.startsWith(`..${sep}`)) {
    return false
  }

  if (isAbsolute(relativePath)) {
    return false
  }

  return true
}

function isAllowedFileNavigation(parsed: URL, rendererRootDir: string): boolean {
  let filePath: string

  try {
    filePath = fileURLToPath(parsed)
  } catch {
    return false
  }

  const normalizedRoot = resolve(rendererRootDir)
  const normalizedTarget = resolve(filePath)
  return isPathWithinRoot(normalizedRoot, normalizedTarget)
}

function isAllowedNavigationTarget(
  rawUrl: string,
  devOrigin: string | null,
  rendererRootDir: string,
): boolean {
  const parsed = parseUrl(rawUrl)
  if (!parsed) {
    return false
  }

  if (devOrigin && parsed.origin === devOrigin) {
    return true
  }

  if (!devOrigin && parsed.protocol === 'file:') {
    return isAllowedFileNavigation(parsed, rendererRootDir)
  }

  return false
}

function isTruthyEnv(rawValue: string | undefined): boolean {
  if (!rawValue) {
    return false
  }

  return rawValue === '1' || rawValue.toLowerCase() === 'true'
}

function parseE2EWindowMode(rawValue: string | undefined): E2EWindowMode | null {
  if (!rawValue) {
    return null
  }

  const normalized = rawValue.toLowerCase()
  if (
    normalized === 'normal' ||
    normalized === 'inactive' ||
    normalized === 'hidden' ||
    normalized === 'offscreen'
  ) {
    return normalized
  }

  return null
}

function resolveE2EWindowMode(): E2EWindowMode {
  if (process.env['NODE_ENV'] !== 'test') {
    return 'normal'
  }

  const explicitMode = parseE2EWindowMode(process.env['FREECLI_E2E_WINDOW_MODE'])
  if (explicitMode) {
    // E2E runs must never steal OS focus. Treat explicit "normal" as "inactive".
    if (explicitMode === 'normal') {
      return 'inactive'
    }

    return explicitMode
  }

  // Keep honoring the legacy no-focus behavior flag alongside window modes.
  if (isTruthyEnv(process.env['FREECLI_E2E_NO_FOCUS'])) {
    return 'inactive'
  }

  return 'offscreen'
}

function formatDisposeError(label: string, error: unknown): string {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return `[freecli] failed to dispose ${label}: ${detail}\n`
}

function formatErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    if (typeof error.stack === 'string' && error.stack.trim().length > 0) {
      return error.stack
    }

    return `${error.name}: ${error.message}`
  }

  return String(error)
}

function writeMainDiagnostic(options: {
  source: string
  message: string
  detail?: string
  level?: 'info' | 'warn' | 'error'
}): void {
  try {
    const logPath = writeDiagnosticLogEntry({
      app,
      scope: 'main',
      source: options.source,
      message: options.message,
      detail: options.detail,
      level: options.level,
    })
    const prefix = `[freecli][${options.source}] ${options.message}`
    process.stderr.write(
      options.detail && options.detail.trim().length > 0
        ? `${prefix}\n${options.detail}\n`
        : `${prefix}\n`,
    )
    if (process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[freecli] main diagnostics log: ${logPath}\n`)
    }
  } catch (writeError) {
    process.stderr.write(
      `[freecli][diagnostics] failed to write main diagnostic log: ${formatErrorDetail(writeError)}\n`,
    )
  }
}

async function prepareWindowClose(window: BrowserWindow): Promise<void> {
  if (window.isDestroyed()) {
    return
  }

  const webContents = window.webContents
  if (webContents.isDestroyed() || webContents.getType() !== 'window') {
    return
  }

  await new Promise<void>(resolve => {
    let settled = false
    const cleanup = (): void => {
      ipcMain.removeListener(IPC_CHANNELS.appLifecycleWindowClosePrepared, handlePrepared)
      clearTimeout(timeout)
    }
    const finish = (): void => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      resolve()
    }
    const handlePrepared = (event: Electron.IpcMainEvent): void => {
      if (event.sender.id !== webContents.id) {
        return
      }

      finish()
    }
    const timeout = setTimeout(() => {
      finish()
    }, WINDOW_CLOSE_PREPARE_TIMEOUT_MS)

    ipcMain.on(IPC_CHANNELS.appLifecycleWindowClosePrepared, handlePrepared)

    try {
      webContents.send(IPC_CHANNELS.appLifecyclePrepareWindowClose)
    } catch {
      finish()
    }
  })
}

async function disposeMainRuntime(): Promise<void> {
  if (mainRuntimeDisposed) {
    return
  }

  if (mainRuntimeDisposePromise) {
    await mainRuntimeDisposePromise
    return
  }

  mainRuntimeDisposePromise = (async () => {
    const currentIpcDisposable = ipcDisposable
    ipcDisposable = null
    if (currentIpcDisposable) {
      try {
        await Promise.resolve(currentIpcDisposable.dispose())
      } catch (error) {
        process.stderr.write(formatDisposeError('IPC runtime', error))
      }
    }

    const currentControlSurfaceDisposable = controlSurfaceDisposable
    controlSurfaceDisposable = null
    if (currentControlSurfaceDisposable) {
      try {
        await Promise.resolve(currentControlSurfaceDisposable.dispose())
      } catch (error) {
        process.stderr.write(formatDisposeError('control surface runtime', error))
      }
    }

    mainRuntimeDisposed = true
  })().finally(() => {
    mainRuntimeDisposePromise = null
  })

  await mainRuntimeDisposePromise
}

function createWindow(): void {
  const devOrigin = is.dev ? resolveDevRendererOrigin() : null
  const rendererRootDir = join(__dirname, '../renderer')
  const e2eWindowMode = resolveE2EWindowMode()
  const isTestEnv = process.env['NODE_ENV'] === 'test'
  // In CI the window may not be considered foreground even in "normal" mode.
  // Disable background throttling for all test runs to keep rAF/timers deterministic.
  const keepRendererActiveInBackground = e2eWindowMode !== 'normal' || isTestEnv
  const keepRendererActiveWhenHidden = e2eWindowMode === 'hidden'
  const placeWindowOffscreen = e2eWindowMode === 'offscreen'
  const disableRendererSandboxForTests =
    isTestEnv && !isTruthyEnv(process.env['FREECLI_E2E_FORCE_RENDERER_SANDBOX'])
  const runtimeIconPath = resolveRuntimeIconPath()
  const runtimeIconImage =
    app.isPackaged === false && process.env['NODE_ENV'] !== 'test'
      ? createDevelopmentRuntimeIcon()
      : runtimeIconPath
        ? nativeImage.createFromPath(runtimeIconPath)
        : null
  if (isTestEnv) {
    setRuntimeIconTestState(runtimeIconPath)
  }
  const initialWidth = isTestEnv ? 1440 : 1200
  const initialHeight = isTestEnv ? 900 : 800

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: MAIN_WINDOW_TITLE,
    width: initialWidth,
    height: initialHeight,
    show: false,
    ...(isTestEnv ? { useContentSize: true } : {}),
    ...(keepRendererActiveWhenHidden ? { paintWhenInitiallyHidden: true } : {}),
    ...(placeWindowOffscreen ? { x: E2E_OFFSCREEN_COORDINATE, y: E2E_OFFSCREEN_COORDINATE } : {}),
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    ...(process.platform === 'win32'
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: resolveTitleBarOverlay('dark'),
        }
      : {}),
    ...(runtimeIconImage ? { icon: runtimeIconImage } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !disableRendererSandboxForTests,
      ...(keepRendererActiveInBackground ? { backgroundThrottling: false } : {}),
    },
  })
  activeMainWindow = mainWindow

  writeMainDiagnostic({
    source: 'window',
    level: 'info',
    message: `create window (userData=${app.getPath('userData')})`,
  })

  const showWindow = (): void => {
    if (e2eWindowMode === 'hidden') {
      return
    }

    if (e2eWindowMode === 'offscreen') {
      mainWindow.setPosition(E2E_OFFSCREEN_COORDINATE, E2E_OFFSCREEN_COORDINATE, false)
      mainWindow.showInactive()
      return
    }

    if (e2eWindowMode === 'inactive') {
      mainWindow.showInactive()
      return
    }

    mainWindow.show()
  }

  mainWindow.on('ready-to-show', () => {
    writeMainDiagnostic({
      source: 'window',
      level: 'info',
      message: 'ready-to-show',
    })
    showWindow()
  })

  mainWindow.on('closed', () => {
    if (activeMainWindow === mainWindow) {
      activeMainWindow = null
    }
  })

  mainWindow.webContents.on('did-start-loading', () => {
    writeMainDiagnostic({
      source: 'webContents',
      level: 'info',
      message: 'did-start-loading',
    })
  })

  mainWindow.webContents.on('did-finish-load', () => {
    writeMainDiagnostic({
      source: 'webContents',
      level: 'info',
      message: 'did-finish-load',
    })
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      writeMainDiagnostic({
        source: 'webContents',
        level: 'error',
        message: `did-fail-load (code=${errorCode}, mainFrame=${String(isMainFrame)}, url=${validatedURL})`,
        detail: errorDescription,
      })
    },
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeMainDiagnostic({
      source: 'webContents',
      level: 'error',
      message: `render-process-gone (reason=${details.reason}, exitCode=${details.exitCode})`,
    })
  })

  mainWindow.webContents.on('unresponsive', () => {
    writeMainDiagnostic({
      source: 'webContents',
      level: 'warn',
      message: 'renderer became unresponsive',
    })
  })

  mainWindow.webContents.on('responsive', () => {
    writeMainDiagnostic({
      source: 'webContents',
      level: 'info',
      message: 'renderer became responsive again',
    })
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeMainDiagnostic({
      source: 'renderer-console',
      level: level >= 3 ? 'error' : level === 2 ? 'warn' : 'info',
      message: `${message} (${sourceId}:${line})`,
    })
  })

  // 兜底：Electron #42409 - titleBarOverlay + show:false 时 ready-to-show 在 Windows 上可能不触发
  const useReadyToShowFallback = process.platform === 'win32' && e2eWindowMode === 'normal'
  if (useReadyToShowFallback) {
    const READY_TO_SHOW_FALLBACK_MS = 2000
    const fallbackTimer = setTimeout(() => {
      if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        showWindow()
      }
    }, READY_TO_SHOW_FALLBACK_MS)
    const clearFallback = (): void => clearTimeout(fallbackTimer)
    mainWindow.once('ready-to-show', clearFallback)
    mainWindow.once('closed', clearFallback)
  }

  mainWindow.webContents.setWindowOpenHandler(details => {
    if (shouldOpenUrlExternally(details.url)) {
      void shell.openExternal(details.url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedNavigationTarget(url, devOrigin, rendererRootDir)) {
      return
    }

    event.preventDefault()

    if (shouldOpenUrlExternally(url)) {
      void shell.openExternal(url)
    }
  })

  // HMR for renderer based on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function bindMainWindowCloseHandling(
  mainWindow: BrowserWindow,
  backgroundLifecycle: ReturnType<typeof createBackgroundLifecycleController>,
): void {
  mainWindow.on('close', event => {
    backgroundLifecycle.handleMainWindowClose(event, mainWindow)
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  try {
    const { consumeAndResetUserDataIfNeeded } = await import('./userDataReset')
    await consumeAndResetUserDataIfNeeded(app.getPath('userData'))
  } catch (error) {
    writeMainDiagnostic({
      source: 'startup',
      level: 'error',
      message: 'failed to reset userData before startup',
      detail: formatErrorDetail(error),
    })
  }
  writeMainDiagnostic({
    source: 'bootstrap',
    level: 'info',
    message: `app ready (userData=${app.getPath('userData')}, rendererLog=${resolveDiagnosticLogPath(app, 'renderer')})`,
  })
  hydrateCliEnvironmentForAppLaunch(app.isPackaged === true)

  // Set app user model id for windows
  electronApp.setAppUserModelId(FREECLI_APP_USER_MODEL_ID)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const runtimeIconPath = resolveRuntimeIconPath()
  const runtimeIconImage =
    app.isPackaged === false && process.env['NODE_ENV'] !== 'test'
      ? createDevelopmentRuntimeIcon()
      : runtimeIconPath
        ? nativeImage.createFromPath(runtimeIconPath)
        : null
  if (process.platform === 'darwin' && runtimeIconImage) {
    app.dock?.setIcon(runtimeIconImage)
  }

  if (isTruthyEnv(process.env['FREECLI_PTY_HOST_POC'])) {
    void (async () => {
      try {
        const { runPtyHostUtilityProcessPoc } = await import('../../platform/process/ptyHost/poc')
        await runPtyHostUtilityProcessPoc()
        app.exit(0)
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'
        process.stderr.write(`[freecli] pty-host PoC failed: ${detail}\n`)
        app.exit(1)
      }
    })()
    return
  }

  if (isTruthyEnv(process.env['FREECLI_PTY_HOST_STRESS'])) {
    void (async () => {
      try {
        const { runPtyHostStressTest } = await import('../../platform/process/ptyHost/stress')
        await runPtyHostStressTest()
        app.exit(0)
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'
        process.stderr.write(`[freecli] pty-host stress failed: ${detail}\n`)
        app.exit(1)
      }
    })()
    return
  }

  const approvedWorkspaces = createApprovedWorkspaceStore()
  const ptyRuntime = createPtyRuntime()
  sharedPtyRuntime = ptyRuntime

  ipcDisposable = registerIpcHandlers({
    approvedWorkspaces,
    ptyRuntime,
    requestRestart: restartController.requestRestart,
    clearUserDataAndRestart: async () => {
      const { writeUserDataResetMarker } = await import('./userDataReset')
      await writeUserDataResetMarker(app.getPath('userData'))
      restartController.requestRestart()
    },
  })
  if (process.env.NODE_ENV !== 'test') {
    controlSurfaceDisposable = registerControlSurfaceServer({ approvedWorkspaces, ptyRuntime })
  }

  const backgroundLifecycle = createBackgroundLifecycleController({
    app,
    browserWindow: BrowserWindow,
    icon: runtimeIconImage,
    onShowMainWindow: () => {
      const currentWindow = activeMainWindow
      if (!currentWindow || currentWindow.isDestroyed()) {
        createWindow()
        if (activeMainWindow) {
          bindMainWindowCloseHandling(activeMainWindow, backgroundLifecycle)
        }
        return
      }

      if (currentWindow.isMinimized()) {
        currentWindow.restore()
      }
      currentWindow.show()
      currentWindow.focus()
    },
    onBeforeHideToTray: async window => {
      if (window instanceof BrowserWindow) {
        await prepareWindowClose(window)
        sharedPtyRuntime?.deactivateTransientSessions()
      }
    },
    onBeforeFullQuit: () => {
      fullQuitRequested = true
    },
  })
  destroyTray = () => backgroundLifecycle.dispose()
  backgroundLifecycle.ensureTrayVisible()

  createWindow()

  if (activeMainWindow) {
    bindMainWindowCloseHandling(activeMainWindow, backgroundLifecycle)
  }

  app.on('activate', function () {
    if (restartController.isRestartPending()) {
      return
    }

    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
      if (activeMainWindow) {
        bindMainWindowCloseHandling(activeMainWindow, backgroundLifecycle)
      }
    }
  })
})

process.on('uncaughtException', error => {
  writeMainDiagnostic({
    source: 'process',
    level: 'error',
    message: 'uncaughtException',
    detail: formatErrorDetail(error),
  })
})

process.on('unhandledRejection', reason => {
  writeMainDiagnostic({
    source: 'process',
    level: 'error',
    message: 'unhandledRejection',
    detail: formatErrorDetail(reason),
  })
})

// Quit when all windows are closed.
// Tests must fully exit on macOS as well, otherwise Playwright can leave Electron running.
app.on('window-all-closed', () => {
  if (fullQuitRequested || process.env.NODE_ENV === 'test') {
    app.quit()
  }
})

app.on('before-quit', event => {
  fullQuitRequested = true
  destroyTray?.()
  destroyTray = null

  if (mainRuntimeDisposed || typeof event?.preventDefault !== 'function') {
    return
  }

  event.preventDefault()
  void Promise.resolve()
    .then(() => disposeMainRuntime())
    .finally(() => {
      app.quit()
    })
})

app.on('will-quit', () => {
  void disposeMainRuntime()
  restartController.dispose()
  sharedPtyRuntime = null
  activeMainWindow = null
  destroyTray?.()
  destroyTray = null
})
