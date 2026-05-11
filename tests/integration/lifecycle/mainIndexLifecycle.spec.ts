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

function createMockTray() {
  return class Tray {
    public static instances: Tray[] = []
    public readonly setToolTip = vi.fn()
    public readonly addListener = vi.fn()
    public readonly setContextMenu = vi.fn()
    public readonly destroy = vi.fn()

    public constructor() {
      Tray.instances.push(this)
    }
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('main process lifecycle', () => {
  it('quits on window-all-closed during tests', async () => {
    vi.resetModules()

    const app = createMockApp()
    const dispose = vi.fn()

    class BrowserWindow {
      public static windows: BrowserWindow[] = []
      private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>()

      public static getAllWindows(): BrowserWindow[] {
        return BrowserWindow.windows
      }

      public webContents = {
        isDestroyed: vi.fn(() => false),
        getType: vi.fn(() => 'window'),
        send: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
      }

      public constructor() {
        BrowserWindow.windows.push(this)
      }

      public on(event: string, listener: (...args: unknown[]) => void): void {
        const existing = this.listeners.get(event) ?? []
        existing.push(listener)
        this.listeners.set(event, existing)
      }
      public emit(event: string, ...args: unknown[]): void {
        const handlers = this.listeners.get(event) ?? []
        handlers.forEach(handler => handler(...args))
      }
      public isDestroyed(): boolean {
        return false
      }
      public isMinimized(): boolean {
        return false
      }
      public restore(): void {}
      public focus(): void {}
      public hide(): void {}
      public destroy(): void {}
      public show(): void {}
      public loadURL(): void {}
      public loadFile(): void {}
    }

    const Tray = createMockTray()

    vi.doMock('electron', () => ({
      app,
      shell: {
        openExternal: vi.fn(),
      },
      BrowserWindow,
      Tray,
      ipcMain: {
        on: vi.fn(),
        removeListener: vi.fn(),
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

    vi.doMock('../../../src/contexts/terminal/presentation/main-ipc/runtime', () => ({
      createPtyRuntime: () => ({
        deactivateTransientSessions: vi.fn(),
        dispose: vi.fn(),
      }),
    }))

    vi.doMock('../../../src/app/main/controlSurface/registerControlSurfaceServer', () => ({
      registerControlSurfaceServer: () => ({ dispose: vi.fn() }),
    }))

    vi.doMock('../../../src/app/main/ipc/registerIpcHandlers', () => ({
      registerIpcHandlers: () => ({ dispose }),
    }))

    await import('../../../src/app/main/index')
    await flushAsyncWork()

    app.emit('window-all-closed')

    expect(dispose).not.toHaveBeenCalled()
    expect(app.quit).toHaveBeenCalledTimes(1)

    const preventDefault = vi.fn()
    app.emit('before-quit', { preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(dispose).not.toHaveBeenCalled()

    app.emit('will-quit')
    await flushAsyncWork()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('destroys the main window into tray state instead of quitting on close in non-test mode', async () => {
    vi.resetModules()
    const previousNodeEnv = process.env['NODE_ENV']
    process.env['NODE_ENV'] = 'development'

    try {
      const app = createMockApp()
      const dispose = vi.fn()

      class BrowserWindow {
        public static windows: BrowserWindow[] = []
        private readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>()
        public webContents = {
          isDestroyed: vi.fn(() => false),
          getType: vi.fn(() => 'window'),
          send: vi.fn(),
          setWindowOpenHandler: vi.fn(),
          on: vi.fn(),
        }
        public hide = vi.fn()
        public destroy = vi.fn()
        public show = vi.fn()
        public focus = vi.fn()
        public restore = vi.fn()

        public constructor() {
          BrowserWindow.windows.push(this)
        }

        public static getAllWindows(): BrowserWindow[] {
          return BrowserWindow.windows
        }

        public on(event: string, listener: (...args: unknown[]) => void): void {
          const existing = this.listeners.get(event) ?? []
          existing.push(listener)
          this.listeners.set(event, existing)
        }

        public emit(event: string, ...args: unknown[]): void {
          const handlers = this.listeners.get(event) ?? []
          handlers.forEach(handler => handler(...args))
        }

        public isDestroyed(): boolean {
          return false
        }

        public isMinimized(): boolean {
          return false
        }

        public loadURL(): void {}
        public loadFile(): void {}
      }

      const Tray = createMockTray()
      const ptyRuntime = {
        deactivateTransientSessions: vi.fn(),
      }

      vi.doMock('electron', () => ({
        app,
        shell: {
          openExternal: vi.fn(),
        },
        BrowserWindow,
        Tray,
        ipcMain: {
          on: vi.fn(),
          removeListener: vi.fn(),
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
        registerIpcHandlers: () => ({ dispose }),
      }))

      vi.doMock('../../../src/app/main/controlSurface/registerControlSurfaceServer', () => ({
        registerControlSurfaceServer: () => ({ dispose: vi.fn() }),
      }))

      vi.doMock('../../../src/contexts/terminal/presentation/main-ipc/runtime', () => ({
        createPtyRuntime: () => ptyRuntime,
      }))

      await import('../../../src/app/main/index')
      await flushAsyncWork()

      const mainWindow = BrowserWindow.windows[0]
      const preventDefault = vi.fn()
      mainWindow.emit('close', { preventDefault })

      await flushAsyncWork()

      expect(preventDefault).toHaveBeenCalledTimes(1)
      expect(ptyRuntime.deactivateTransientSessions).toHaveBeenCalledTimes(1)
      expect(mainWindow.destroy).toHaveBeenCalledTimes(1)
      expect(mainWindow.hide).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
      expect(dispose).not.toHaveBeenCalled()
    } finally {
      process.env['NODE_ENV'] = previousNodeEnv
    }
  })
})
