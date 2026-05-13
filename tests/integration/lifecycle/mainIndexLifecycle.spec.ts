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
  await new Promise(resolve => setTimeout(resolve, 0))
}

async function waitForCondition(predicate: () => boolean, attempts: number = 20): Promise<void> {
  const tick = async (remainingAttempts: number): Promise<void> => {
    if (predicate() || remainingAttempts <= 0) {
      return
    }

    await flushAsyncWork()
    await tick(remainingAttempts - 1)
  }

  await tick(attempts)
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
        id: 1,
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
      public once(event: string, listener: (...args: unknown[]) => void): void {
        const onceListener = (...args: unknown[]): void => {
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
      public isMinimized(): boolean {
        return false
      }
      public isVisible(): boolean {
        return false
      }
      public restore(): void {}
      public focus(): void {}
      public hide(): void {}
      public destroy(): void {}
      public show(): void {}
      public showInactive(): void {}
      public setPosition(): void {}
      public loadURL(): void {}
      public loadFile(): void {}
    }

    const Tray = createMockTray()

    vi.doMock('electron', () => {
      const nativeImage = {
        createFromPath: vi.fn(() => ({
          isEmpty: () => true,
          getSize: () => ({ width: 0, height: 0 }),
          toBitmap: () => Buffer.alloc(0),
        })),
        createFromBitmap: vi.fn(() => null),
      }
      const module = {
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
        nativeImage,
      }
      return {
        ...module,
        default: module,
      }
    })

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

    vi.doMock('../../../src/app/main/runtimeIconVariant', () => ({
      createDevelopmentRuntimeIcon: vi.fn(() => null),
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
    await waitForCondition(() => BrowserWindow.windows.length > 0)

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
          id: 1,
          isDestroyed: vi.fn(() => false),
          getType: vi.fn(() => 'window'),
          send: vi.fn(() => {
            throw new Error('mock renderer unavailable')
          }),
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
        public once(event: string, listener: (...args: unknown[]) => void): void {
          const onceListener = (...args: unknown[]): void => {
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

        public isMinimized(): boolean {
          return false
        }
        public isVisible(): boolean {
          return false
        }

        public loadURL(): void {}
        public loadFile(): void {}
        public showInactive(): void {}
        public setPosition(): void {}
      }

      const Tray = createMockTray()
      const ptyRuntime = {
        deactivateTransientSessions: vi.fn(),
      }

      vi.doMock('electron', () => {
        const nativeImage = {
          createFromPath: vi.fn(() => ({
            isEmpty: () => false,
            getSize: () => ({ width: 16, height: 16 }),
            toBitmap: () => Buffer.alloc(16 * 16 * 4),
          })),
          createFromBitmap: vi.fn(() => ({
            isEmpty: () => false,
          })),
        }
        const module = {
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
          nativeImage,
        }
        return {
          ...module,
          default: module,
        }
      })

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

      vi.doMock('../../../src/app/main/runtimeIconVariant', () => ({
        createDevelopmentRuntimeIcon: vi.fn(() => ({
          isEmpty: () => false,
        })),
      }))

      vi.doMock('fs', async importOriginal => {
        const actual = await importOriginal<typeof import('fs')>()
        return {
          ...actual,
          existsSync: vi.fn(() => true),
          default: {
            ...(actual as unknown as { default?: object }).default,
            ...actual,
            existsSync: vi.fn(() => true),
          },
        }
      })

      await import('../../../src/app/main/index')
      await waitForCondition(() => BrowserWindow.windows.length > 0)

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
