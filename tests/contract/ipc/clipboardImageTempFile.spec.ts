import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { IPC_CHANNELS } from '../../../src/shared/contracts/ipc'
import { invokeHandledIpc } from './ipcTestUtils'

const userDataDir = '/tmp/freecli-user-data'

async function setupClipboardIpc(): Promise<{
  handlers: Map<string, (...args: unknown[]) => unknown>
  fsMocks: {
    mkdir: ReturnType<typeof vi.fn>
    readdir: ReturnType<typeof vi.fn>
    writeFile: ReturnType<typeof vi.fn>
    rename: ReturnType<typeof vi.fn>
    rm: ReturnType<typeof vi.fn>
  }
}> {
  vi.resetModules()

  const mkdir = vi.fn(async () => undefined)
  const readdir = vi.fn(async () => [])
  const writeFile = vi.fn(async () => undefined)
  const rename = vi.fn(async () => undefined)
  const rm = vi.fn(async () => undefined)

  vi.doMock('node:fs/promises', () => ({
    mkdir,
    readdir,
    writeFile,
    rename,
    rm,
    default: { mkdir, readdir, writeFile, rename, rm },
  }))

  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
  }

  const clipboard = {
    readText: vi.fn(() => ''),
    writeText: vi.fn(),
    readImage: vi.fn(() => ({
      isEmpty: () => false,
      toPNG: () => Buffer.from([1, 2, 3]),
    })),
  }

  vi.doMock('electron', () => ({
    app: { getPath: vi.fn(() => userDataDir) },
    ipcMain,
    clipboard,
  }))

  const { registerClipboardIpcHandlers } = await import(
    '../../../src/contexts/clipboard/presentation/main-ipc/register'
  )
  registerClipboardIpcHandlers()

  return {
    handlers,
    fsMocks: { mkdir, readdir, writeFile, rename, rm },
  }
}

describe('clipboard image materialization IPC', () => {
  it('writes clipboard images to the terminal clipboard cache directory', async () => {
    const { handlers, fsMocks } = await setupClipboardIpc()

    const handler = handlers.get(IPC_CHANNELS.clipboardMaterializeImageTempFile)
    expect(handler).toBeTypeOf('function')

    const result = await invokeHandledIpc(handler, null)

    expect(result).toMatchObject({
      path: expect.stringContaining(
        resolve(userDataDir, 'cache', 'terminal-clipboard-images', 'clipboard-'),
      ),
    })
    expect(fsMocks.mkdir).toHaveBeenCalledWith(
      resolve(userDataDir, 'cache', 'terminal-clipboard-images'),
      {
        recursive: true,
      },
    )

    const writePath = fsMocks.writeFile.mock.calls[0]?.[0] as string | undefined
    expect(writePath).toContain('.png.tmp-')
    expect(fsMocks.rename).toHaveBeenCalledWith(writePath, result?.path)
    expect(fsMocks.rm).toHaveBeenCalledWith(writePath, { force: true })
  })

  it('returns null when the system clipboard does not contain an image', async () => {
    vi.resetModules()

    const mkdir = vi.fn(async () => undefined)
    const readdir = vi.fn(async () => [])
    const writeFile = vi.fn(async () => undefined)
    const rename = vi.fn(async () => undefined)
    const rm = vi.fn(async () => undefined)

    vi.doMock('node:fs/promises', () => ({
      mkdir,
      readdir,
      writeFile,
      rename,
      rm,
      default: { mkdir, readdir, writeFile, rename, rm },
    }))

    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
      removeHandler: vi.fn(),
    }

    vi.doMock('electron', () => ({
      app: { getPath: vi.fn(() => userDataDir) },
      ipcMain,
      clipboard: {
        readText: vi.fn(() => ''),
        writeText: vi.fn(),
        readImage: vi.fn(() => ({
          isEmpty: () => true,
          toPNG: () => Buffer.alloc(0),
        })),
      },
    }))

    const { registerClipboardIpcHandlers } = await import(
      '../../../src/contexts/clipboard/presentation/main-ipc/register'
    )
    registerClipboardIpcHandlers()

    const handler = handlers.get(IPC_CHANNELS.clipboardMaterializeImageTempFile)
    expect(handler).toBeTypeOf('function')

    await expect(invokeHandledIpc(handler, null)).resolves.toBeNull()
    expect(writeFile).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
  })
})
