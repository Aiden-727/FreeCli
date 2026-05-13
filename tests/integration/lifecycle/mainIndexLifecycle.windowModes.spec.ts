import { describe, expect, it, vi } from 'vitest'

type Listener = (...args: unknown[]) => void

function createMockApp() {
  const listeners = new Map<string, Listener[]>()

  return {
    whenReady: vi.fn(() => Promise.resolve()),
    getPath: vi.fn((_name: string) => '/tmp/freecli-test-userdata'),
    setPath: vi.fn(),
    isPackaged: false,
    commandLine: {
      appendSwitch: vi.fn(),
      getSwitchValue: vi.fn(() => ''),
    },
    on: vi.fn((event: string, listener: Listener) => {
      const existing = listeners.get(event) ?? []
      existing.push(listener)
      listeners.set(event, existing)
      return undefined
    }),
    emit(event: string, ...args: unknown[]) {
      const handlers = listeners.get(event) ?? []
      handlers.forEach(handler => handler(...args))
    },
    quit: vi.fn(),
    dock: {
      setIcon: vi.fn(),
    },
  }
}

async function withProcessEnv(
  nextEnv: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const previousEnv: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(nextEnv)) {
    previousEnv[key] = process.env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    await run()
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function waitForCondition(
  predicate: () => boolean,
  attempts: number = 20,
): Promise<void> {
  const tick = async (remainingAttempts: number): Promise<void> => {
    if (predicate() || remainingAttempts <= 0) {
      return
    }

    await flushAsyncWork()
    await tick(remainingAttempts - 1)
  }

  await tick(attempts)
}

function createBrowserWindowMock() {
  class BrowserWindow {
    public static windows: BrowserWindow[] = []
    public static constructorOptions: Array<Record<string, unknown>> = []

    private readonly listeners = new Map<string, Listener[]>()

    public static getAllWindows(): BrowserWindow[] {
      return BrowserWindow.windows
    }

    public webContents = {
      id: 1,
      isDestroyed: vi.fn(() => false),
      getType: vi.fn(() => 'window'),
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(),
    }

    public show = vi.fn()
    public showInactive = vi.fn()
    public setPosition = vi.fn()

    public constructor(options: Record<string, unknown> = {}) {
      BrowserWindow.windows.push(this)
      BrowserWindow.constructorOptions.push(options)
    }

    public on(event: string, listener: Listener): void {
      const existing = this.listeners.get(event) ?? []
      existing.push(listener)
      this.listeners.set(event, existing)
    }

    public once(event: string, listener: Listener): void {
      const onceListener: Listener = (...args: unknown[]) => {
        const existing = this.listeners.get(event) ?? []
        this.listeners.set(
          event,
          existing.filter(candidate => candidate !== onceListener),
        )
        listener(...args)
      }
      this.on(event, onceListener)
    }

    public emit(event: string, ...args: unknown[]): void {
      const handlers = this.listeners.get(event) ?? []
      handlers.forEach(handler => handler(...args))
    }

    public isDestroyed(): boolean {
      return false
    }

    public isVisible(): boolean {
      return false
    }

    public isMinimized(): boolean {
      return false
    }

    public restore(): void {}
    public focus(): void {}
    public loadURL(): void {}
    public loadFile(): void {}
  }

  return BrowserWindow
}

function mockMainIndexDependencies(params: {
  app: ReturnType<typeof createMockApp>
  dispose: ReturnType<typeof vi.fn>
  BrowserWindow: ReturnType<typeof createBrowserWindowMock>
}) {
  vi.doMock('electron', () => ({
    app: params.app,
    shell: {
      openExternal: vi.fn(),
    },
    BrowserWindow: params.BrowserWindow,
    ipcMain: {
      on: vi.fn(),
      removeListener: vi.fn(),
    },
    Tray: class Tray {
      public setToolTip = vi.fn()
      public addListener = vi.fn()
      public setContextMenu = vi.fn()
      public destroy = vi.fn()
    },
    Menu: {
      buildFromTemplate: vi.fn(() => ({})),
    },
    nativeImage: {
      createFromPath: vi.fn(() => null),
    },
  }))

  vi.doMock('@electron-toolkit/utils', () => ({
    electronApp: {
      setAppUserModelId: vi.fn(),
    },
    optimizer: {
      watchWindowShortcuts: vi.fn(),
    },
    is: {
      dev: false,
    },
  }))

  vi.doMock('../../../src/app/main/ipc/registerIpcHandlers', () => ({
    registerIpcHandlers: () => ({ dispose: params.dispose }),
  }))

  vi.doMock('../../../src/contexts/terminal/presentation/main-ipc/runtime', () => ({
    createPtyRuntime: () => ({
      deactivateTransientSessions: vi.fn(),
      dispose: vi.fn(),
    }),
  }))

  vi.doMock('../../../src/app/main/controlSurface/registerControlSurfaceServer', () => ({
    registerControlSurfaceServer: () => ({ dispose: vi.fn() }),
  }))
}

async function importMainIndex(): Promise<void> {
  await import('../../../src/app/main/index')
  await flushAsyncWork()
}

describe('main process lifecycle window modes', () => {
  it('shows window without focusing during E2E no-focus mode', async () => {
    await withProcessEnv(
      {
        FREECLI_E2E_NO_FOCUS: '1',
        FREECLI_E2E_WINDOW_MODE: undefined,
        NODE_ENV: 'test',
      },
      async () => {
        vi.resetModules()

        const app = createMockApp()
        const dispose = vi.fn()
        const BrowserWindow = createBrowserWindowMock()
        mockMainIndexDependencies({ app, dispose, BrowserWindow })

        await importMainIndex()
        await waitForCondition(() => BrowserWindow.windows.length > 0)

        const mainWindow = BrowserWindow.windows[0]
        expect(mainWindow).toBeDefined()
        mainWindow.emit('ready-to-show')

        expect(mainWindow.showInactive).toHaveBeenCalledTimes(1)
        expect(mainWindow.show).not.toHaveBeenCalled()

        const firstWindowOptions = BrowserWindow.constructorOptions[0]
        expect(firstWindowOptions['title']).toBe('FreeCli')
        const webPreferences = firstWindowOptions['webPreferences'] as {
          backgroundThrottling?: boolean
        }
        expect(webPreferences.backgroundThrottling).toBe(false)

        app.emit('before-quit')
        expect(dispose).not.toHaveBeenCalled()

        app.emit('will-quit')
        expect(dispose).toHaveBeenCalledTimes(1)
      },
    )
  })

  it('does not focus window when FREECLI_E2E_WINDOW_MODE=normal during tests', async () => {
    await withProcessEnv(
      {
        FREECLI_E2E_NO_FOCUS: undefined,
        FREECLI_E2E_WINDOW_MODE: 'normal',
        NODE_ENV: 'test',
      },
      async () => {
        vi.resetModules()

        const app = createMockApp()
        const dispose = vi.fn()
        const BrowserWindow = createBrowserWindowMock()
        mockMainIndexDependencies({ app, dispose, BrowserWindow })

        await importMainIndex()
        await waitForCondition(() => BrowserWindow.windows.length > 0)

        const mainWindow = BrowserWindow.windows[0]
        expect(mainWindow).toBeDefined()
        mainWindow.emit('ready-to-show')

        expect(mainWindow.showInactive).toHaveBeenCalledTimes(1)
        expect(mainWindow.show).not.toHaveBeenCalled()

        app.emit('before-quit')
        expect(dispose).not.toHaveBeenCalled()

        app.emit('will-quit')
        expect(dispose).toHaveBeenCalledTimes(1)
      },
    )
  })

  it('keeps E2E window hidden for visual regression mode', async () => {
    await withProcessEnv(
      {
        FREECLI_E2E_NO_FOCUS: undefined,
        FREECLI_E2E_WINDOW_MODE: 'hidden',
        NODE_ENV: 'test',
      },
      async () => {
        vi.resetModules()

        const app = createMockApp()
        const dispose = vi.fn()
        const BrowserWindow = createBrowserWindowMock()
        mockMainIndexDependencies({ app, dispose, BrowserWindow })

        await importMainIndex()
        await waitForCondition(() => BrowserWindow.windows.length > 0)

        const mainWindow = BrowserWindow.windows[0]
        expect(mainWindow).toBeDefined()
        mainWindow.emit('ready-to-show')

        expect(mainWindow.show).not.toHaveBeenCalled()
        expect(mainWindow.showInactive).not.toHaveBeenCalled()

        const firstWindowOptions = BrowserWindow.constructorOptions[0]
        expect(firstWindowOptions['paintWhenInitiallyHidden']).toBe(true)

        const webPreferences = firstWindowOptions['webPreferences'] as {
          backgroundThrottling?: boolean
        }
        expect(webPreferences.backgroundThrottling).toBe(false)

        app.emit('before-quit')
        expect(dispose).not.toHaveBeenCalled()

        app.emit('will-quit')
        expect(dispose).toHaveBeenCalledTimes(1)
      },
    )
  })

  it('shows E2E window in offscreen inactive mode', async () => {
    await withProcessEnv(
      {
        FREECLI_E2E_NO_FOCUS: undefined,
        FREECLI_E2E_WINDOW_MODE: 'offscreen',
        NODE_ENV: 'test',
      },
      async () => {
        vi.resetModules()

        const app = createMockApp()
        const dispose = vi.fn()
        const BrowserWindow = createBrowserWindowMock()
        mockMainIndexDependencies({ app, dispose, BrowserWindow })

        await importMainIndex()
        await waitForCondition(() => BrowserWindow.windows.length > 0)

        const mainWindow = BrowserWindow.windows[0]
        expect(mainWindow).toBeDefined()
        mainWindow.emit('ready-to-show')

        expect(mainWindow.showInactive).toHaveBeenCalledTimes(1)
        expect(mainWindow.show).not.toHaveBeenCalled()
        expect(mainWindow.setPosition).toHaveBeenCalledWith(-50000, -50000, false)

        const firstWindowOptions = BrowserWindow.constructorOptions[0]
        expect(firstWindowOptions['x']).toBe(-50000)
        expect(firstWindowOptions['y']).toBe(-50000)
        expect(firstWindowOptions['paintWhenInitiallyHidden']).toBeUndefined()

        const webPreferences = firstWindowOptions['webPreferences'] as {
          backgroundThrottling?: boolean
        }
        expect(webPreferences.backgroundThrottling).toBe(false)

        app.emit('before-quit')
        expect(dispose).not.toHaveBeenCalled()

        app.emit('will-quit')
        expect(dispose).toHaveBeenCalledTimes(1)
      },
    )
  })
})
