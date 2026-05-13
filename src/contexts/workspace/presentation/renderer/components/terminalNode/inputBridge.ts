type PtyWriteEncoding = 'utf8' | 'binary'

type PtyWritePayload = {
  data: string
  encoding: PtyWriteEncoding
  coalesce: boolean
}

type TerminalClipboardController = {
  getSelection: () => string
  hasSelection: () => boolean
  modes?: {
    bracketedPasteMode?: boolean
  }
}

type PtyWriteQueue = {
  enqueue: (data: string, encoding?: PtyWriteEncoding, coalesce?: boolean) => void
  flush: () => void
}

type PtyWriteQueueState = {
  pendingCount: number
  isWriting: boolean
}

type PlatformInfo = {
  platform?: string
  userAgent?: string
}

export function isWindowsPlatform(platformInfo: PlatformInfo | undefined = navigator): boolean {
  if (!platformInfo) {
    return false
  }

  return /win/i.test(platformInfo.platform ?? '') || /windows/i.test(platformInfo.userAgent ?? '')
}

export function isWindowsTerminalCopyShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  platformInfo: PlatformInfo | undefined = navigator,
): boolean {
  return (
    isWindowsPlatform(platformInfo) &&
    event.key.toLowerCase() === 'c' &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  )
}

export function isWindowsTerminalPasteShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  platformInfo: PlatformInfo | undefined = navigator,
): boolean {
  if (!isWindowsPlatform(platformInfo) || event.metaKey || event.altKey) {
    return false
  }

  if (event.key.toLowerCase() === 'v') {
    return event.ctrlKey && !event.shiftKey
  }

  return event.key === 'Insert' && event.shiftKey && !event.ctrlKey
}

function isTerminalFindShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'>,
): boolean {
  if (event.altKey) {
    return false
  }

  if (!(event.metaKey || event.ctrlKey)) {
    return false
  }

  return event.key.toLowerCase() === 'f'
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (text.length === 0) {
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // Fall back to execCommand for Electron environments where Clipboard API is unavailable.
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  textarea.style.top = '0'
  textarea.style.left = '0'

  const activeElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  document.body.append(textarea)
  textarea.focus()
  textarea.select()

  try {
    document.execCommand('copy')
  } finally {
    textarea.remove()
    activeElement?.focus()
  }
}

export async function readTextFromClipboard(): Promise<string> {
  if (
    typeof window !== 'undefined' &&
    typeof window.freecliApi?.clipboard?.readText === 'function'
  ) {
    try {
      return await window.freecliApi.clipboard.readText()
    } catch {
      // Fall through to the browser Clipboard API.
    }
  }

  if (
    typeof navigator === 'undefined' ||
    !navigator.clipboard ||
    typeof navigator.clipboard.readText !== 'function'
  ) {
    return ''
  }

  try {
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
}

export async function pasteTextFromClipboard({
  readClipboardText = readTextFromClipboard,
  ptyWriteQueue,
  terminal,
}: {
  readClipboardText?: () => Promise<string> | string
  ptyWriteQueue: PtyWriteQueue
  terminal: TerminalClipboardController
}): Promise<void> {
  const text = await readClipboardText()
  if (text.length === 0) {
    return
  }

  const normalizedText = text.replace(/\r?\n/g, '\r')
  const bracketedText = terminal.modes?.bracketedPasteMode
    ? `\u001b[200~${normalizedText}\u001b[201~`
    : normalizedText
  ptyWriteQueue.enqueue(bracketedText)
  ptyWriteQueue.flush()
}

export function handleTerminalCustomKeyEvent({
  copySelectedText = copyTextToClipboard,
  event,
  getPendingPastePromise,
  pasteClipboardText = pasteTextFromClipboard,
  onOpenFind,
  platformInfo,
  ptyWriteQueue,
  terminal,
}: {
  copySelectedText?: (text: string) => Promise<void> | void
  event: KeyboardEvent
  getPendingPastePromise?: () => Promise<void> | null
  pasteClipboardText?: (
    options: Pick<Parameters<typeof pasteTextFromClipboard>[0], 'ptyWriteQueue' | 'terminal'>,
  ) => Promise<void> | void
  onOpenFind?: () => void
  platformInfo?: PlatformInfo
  ptyWriteQueue: PtyWriteQueue
  terminal: TerminalClipboardController
}): boolean {
  const pendingPastePromise = getPendingPastePromise?.() ?? null
  const shouldDelaySubmitUntilPasteCompletes =
    event.type === 'keydown' &&
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    pendingPastePromise !== null

  if (shouldDelaySubmitUntilPasteCompletes) {
    event.preventDefault()
    event.stopPropagation()
    void pendingPastePromise.finally(() => {
      ptyWriteQueue.enqueue('\r')
      ptyWriteQueue.flush()
    })
    return false
  }

  if (
    event.key === 'Enter' &&
    event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    if (event.type === 'keydown') {
      ptyWriteQueue.enqueue('\u001b\r')
      ptyWriteQueue.flush()
    }

    return false
  }

  if (event.type === 'keydown' && isTerminalFindShortcut(event)) {
    event.preventDefault()
    event.stopPropagation()
    onOpenFind?.()
    return false
  }

  if (event.type !== 'keydown' || !isWindowsTerminalCopyShortcut(event, platformInfo)) {
    if (event.type === 'keydown' && isWindowsTerminalPasteShortcut(event, platformInfo)) {
      event.preventDefault()
      event.stopPropagation()
      void pasteClipboardText({ ptyWriteQueue, terminal })
      return false
    }

    return true
  }

  if (!terminal.hasSelection()) {
    return true
  }

  const selection = terminal.getSelection()
  if (selection.length === 0) {
    return true
  }

  void copySelectedText(selection)
  return false
}

export function createPtyWriteQueue(
  write: (payload: PtyWritePayload) => Promise<void>,
  options?: {
    onStateChange?: (state: PtyWriteQueueState) => void
  },
): {
  enqueue: (data: string, encoding?: PtyWriteEncoding, coalesce?: boolean) => void
  flush: () => void
  dispose: () => void
} {
  let isDisposed = false
  const pendingWrites: PtyWritePayload[] = []
  let pendingWrite: Promise<void> | null = null
  const emitStateChange = () => {
    options?.onStateChange?.({
      pendingCount: pendingWrites.length,
      isWriting: pendingWrite !== null,
    })
  }

  const takeNextPayload = (): PtyWritePayload | null => {
    const firstPayload = pendingWrites.shift()
    if (!firstPayload) {
      return null
    }

    let data = firstPayload.data
    while (
      pendingWrites.length > 0 &&
      pendingWrites[0]?.encoding === firstPayload.encoding &&
      pendingWrites[0]?.coalesce === true &&
      firstPayload.coalesce === true
    ) {
      data += pendingWrites.shift()?.data ?? ''
    }

    return {
      data,
      encoding: firstPayload.encoding,
      coalesce: firstPayload.coalesce,
    }
  }

  const flush = () => {
    if (isDisposed || pendingWrite) {
      return
    }

    const nextPayload = takeNextPayload()
    if (!nextPayload) {
      emitStateChange()
      return
    }

    pendingWrite = write(nextPayload)
      .catch(() => undefined)
      .finally(() => {
        pendingWrite = null
        emitStateChange()
        flush()
      })
    emitStateChange()
  }

  return {
    enqueue: (data, encoding = 'utf8', coalesce = true) => {
      if (isDisposed || data.length === 0) {
        return
      }

      pendingWrites.push({ data, encoding, coalesce })
      emitStateChange()
    },
    flush,
    dispose: () => {
      isDisposed = true
      pendingWrites.length = 0
      pendingWrite = null
      emitStateChange()
    },
  }
}
