import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, clipboard, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import type {
  MaterializeClipboardImageTempFileResult,
  WriteClipboardTextInput,
} from '../../../../shared/contracts/dto'
import type { IpcRegistrationDisposable } from '../../../../app/main/ipc/types'
import { registerHandledIpc } from '../../../../app/main/ipc/handle'
import { normalizeWriteClipboardTextPayload } from './validate'

const TERMINAL_CLIPBOARD_IMAGE_DIRECTORY = 'terminal-clipboard-images'
const TERMINAL_CLIPBOARD_IMAGE_PARENT_DIRECTORY = 'cache'
const TERMINAL_CLIPBOARD_IMAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const TERMINAL_CLIPBOARD_IMAGE_FILE_PATTERN = /^clipboard-(\d+)-[0-9a-f-]+\.png$/i

function resolveTerminalClipboardImageDirectory(): string {
  return resolve(
    app.getPath('userData'),
    TERMINAL_CLIPBOARD_IMAGE_PARENT_DIRECTORY,
    TERMINAL_CLIPBOARD_IMAGE_DIRECTORY,
  )
}

function createTerminalClipboardImagePath(nowMs: number): string {
  return resolve(
    resolveTerminalClipboardImageDirectory(),
    `clipboard-${nowMs}-${crypto.randomUUID()}.png`,
  )
}

async function cleanupExpiredTerminalClipboardImages(nowMs = Date.now()): Promise<void> {
  const directory = resolveTerminalClipboardImageDirectory()

  let names: string[]
  try {
    names = await readdir(directory)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'ENOENT') {
      return
    }

    throw error
  }

  await Promise.all(
    names.map(async name => {
      const match = TERMINAL_CLIPBOARD_IMAGE_FILE_PATTERN.exec(name)
      if (!match) {
        return
      }

      const createdAtMs = Number.parseInt(match[1] ?? '', 10)
      if (!Number.isFinite(createdAtMs)) {
        return
      }

      if (nowMs - createdAtMs <= TERMINAL_CLIPBOARD_IMAGE_MAX_AGE_MS) {
        return
      }

      await rm(resolve(directory, name), { force: true }).catch(() => undefined)
    }),
  )
}

export function registerClipboardIpcHandlers(): IpcRegistrationDisposable {
  registerHandledIpc(
    IPC_CHANNELS.clipboardReadText,
    async (): Promise<string> => clipboard.readText(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc(
    IPC_CHANNELS.clipboardWriteText,
    async (_event, payload: WriteClipboardTextInput): Promise<void> => {
      const normalized = normalizeWriteClipboardTextPayload(payload)
      clipboard.writeText(normalized.text)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc(
    IPC_CHANNELS.clipboardMaterializeImageTempFile,
    async (): Promise<MaterializeClipboardImageTempFileResult | null> => {
      const image = clipboard.readImage()
      if (image.isEmpty()) {
        return null
      }

      const pngBytes = image.toPNG()
      if (pngBytes.length === 0) {
        return null
      }

      const nowMs = Date.now()
      const directory = resolveTerminalClipboardImageDirectory()
      await mkdir(directory, { recursive: true })
      await cleanupExpiredTerminalClipboardImages(nowMs)

      const targetPath = createTerminalClipboardImagePath(nowMs)
      const tempPath = `${targetPath}.tmp-${crypto.randomUUID()}`

      try {
        await writeFile(tempPath, pngBytes)
        await rename(tempPath, targetPath)
      } finally {
        await rm(tempPath, { force: true }).catch(() => undefined)
      }

      return { path: targetPath }
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(IPC_CHANNELS.clipboardReadText)
      ipcMain.removeHandler(IPC_CHANNELS.clipboardWriteText)
      ipcMain.removeHandler(IPC_CHANNELS.clipboardMaterializeImageTempFile)
    },
  }
}
