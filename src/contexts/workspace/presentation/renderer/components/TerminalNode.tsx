import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useStore } from '@xyflow/react'
import { SerializeAddon } from '@xterm/addon-serialize'
import { SearchAddon } from '@xterm/addon-search'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { getPtyEventHub } from '@app/renderer/shell/utils/ptyEventHub'
import { useTranslation } from '@app/renderer/i18n'
import {
  createTerminalCommandInputState,
  parseTerminalCommandInput,
} from './terminalNode/commandInput'
import {
  createPtyWriteQueue,
  handleTerminalCustomKeyEvent,
  readTextFromClipboard,
} from './terminalNode/inputBridge'
import {
  createTerminalForegroundSyncScheduler,
  registerTerminalLayoutSync,
} from './terminalNode/layoutSync'
import { mergeScrollbackSnapshots, resolveScrollbackDelta } from './terminalNode/scrollback'
import {
  clearCachedTerminalScreenStateInvalidation,
  getCachedTerminalScreenState,
  isCachedTerminalScreenStateInvalidated,
  setCachedTerminalScreenState,
} from './terminalNode/screenStateCache'
import { syncTerminalNodeSize } from './terminalNode/syncTerminalNodeSize'
import { resolveSuffixPrefixOverlap } from './terminalNode/overlap'
import { resolveTerminalNodeFrameStyle } from './terminalNode/nodeFrameStyle'
import {
  resolveTerminalFontFamily,
  shouldEnableOverlappingGlyphRescale,
} from './terminalNode/renderingHeuristics'
import { resolveTerminalTheme, resolveTerminalUiTheme } from './terminalNode/theme'
import { registerTerminalSelectionTestHandle } from './terminalNode/testHarness'
import { patchXtermMouseServiceWithRetry } from './terminalNode/patchXtermMouseService'
import { useTerminalThemeApplier } from './terminalNode/useTerminalThemeApplier'
import { useTerminalBodyClickFallback } from './terminalNode/useTerminalBodyClickFallback'
import { useTerminalFind } from './terminalNode/useTerminalFind'
import { useTerminalResize } from './terminalNode/useTerminalResize'
import { useTerminalScrollback } from './terminalNode/useScrollback'
import { resolveInitialTerminalDimensions } from './terminalNode/initialDimensions'
import { revealHydratedTerminal } from './terminalNode/revealHydratedTerminal'
import { createTerminalOutputScheduler } from './terminalNode/outputScheduler'
import {
  applyTerminalAlternateScreenData,
  createTerminalAlternateScreenState,
} from './terminalNode/alternateScreen'
import {
  selectDragSurfaceSelectionMode,
  selectViewportInteractionActive,
} from './terminalNode/reactFlowState'
import {
  buildTerminalDropPasteText,
  isFileDropTransfer,
  toTerminalDropErrorMessage,
} from './terminalNode/dropInput'
import { convertHighByteX10MouseReportsToSgr } from '@platform/process/pty/x10Mouse'
import { TerminalNodeFrame } from './terminalNode/TerminalNodeFrame'
import { resolveCanonicalNodeMinSize } from '../utils/workspaceNodeSizing'
import type { TerminalNodeProps } from './TerminalNode.types'

export function TerminalNode({
  nodeId,
  sessionId,
  title,
  modelLabel,
  kind,
  isAgentLike = false,
  labelColor,
  labelColorOverride,
  terminalThemeMode = 'sync-with-ui',
  profileId,
  runtimeKind,
  credentialProfileId,
  activeCredentialProfileId,
  terminalCredentialProfiles,
  activeCredentialProvider,
  isSelected = false,
  isDragging = false,
  status,
  directoryMismatch,
  lastError,
  position,
  width,
  height,
  terminalFontSize,
  scrollback,
  persistenceMode,
  onClose,
  onCopyLastMessage,
  onResize,
  onScrollbackChange,
  onTitleCommit,
  onLabelColorChange,
  onCredentialProfileChange,
  onPersistenceModeChange,
  onCommandRun,
  onAlternateScreenChange,
  onInteractionStart,
  onShowMessage,
}: TerminalNodeProps): JSX.Element {
  const { t } = useTranslation()
  const pasteIndicatorDelayMs = 180
  const isDragSurfaceSelectionMode = useStore(selectDragSurfaceSelectionMode)
  const isViewportInteractionActive = useStore(selectViewportInteractionActive)
  const outputSchedulerRef = useRef<ReturnType<typeof createTerminalOutputScheduler> | null>(null)
  const isViewportInteractionActiveRef = useRef(isViewportInteractionActive)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const ptyWriteQueueRef = useRef<ReturnType<typeof createPtyWriteQueue> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isPointerResizingRef = useRef(false)
  const lastSyncedContainerSizeRef = useRef<{ width: number; height: number } | null>(null)
  const lastSyncedPtySizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const commandInputStateRef = useRef(createTerminalCommandInputState())
  const alternateScreenStateRef = useRef(createTerminalAlternateScreenState())
  const onCommandRunRef = useRef(onCommandRun)
  const onAlternateScreenChangeRef = useRef(onAlternateScreenChange)
  const isTerminalHydratedRef = useRef(false)
  const [isTerminalHydrated, setIsTerminalHydrated] = useState(false)
  const [isPasteIndicatorVisible, setIsPasteIndicatorVisible] = useState(false)
  const isPasteIndicatorVisibleRef = useRef(false)
  const pasteFlowActiveRef = useRef(false)
  const pasteIntentSequenceRef = useRef(0)
  const latestPasteIntentSequenceRef = useRef(0)
  const pendingClipboardPastePromiseRef = useRef<Promise<void> | null>(null)
  const pasteIndicatorTimerRef = useRef<number | null>(null)
  const {
    state: findState,
    open: openTerminalFind,
    close: closeTerminalFind,
    setQuery: setFindQuery,
    findNext: findNextMatch,
    findPrevious: findPreviousMatch,
    bindSearchAddon: bindSearchAddonToFind,
  } = useTerminalFind({
    sessionId,
    terminalRef,
    terminalThemeMode,
  })

  const pasteResolvedPathsIntoTerminal = useCallback(
    ({
      paths,
      terminal,
      unavailableMessage,
    }: {
      paths: readonly string[]
      terminal?: { focus?: () => void } | null
      unavailableMessage: string
    }): boolean => {
      const pasteText = buildTerminalDropPasteText({
        paths,
        profileId,
        runtimeKind,
      })
      if (pasteText.length === 0) {
        onShowMessage?.(unavailableMessage, 'warning')
        return false
      }

      const targetTerminal = terminal ?? terminalRef.current
      const targetQueue = ptyWriteQueueRef.current
      if (!targetTerminal || !targetQueue) {
        return false
      }

      latestPasteIntentSequenceRef.current = ++pasteIntentSequenceRef.current
      targetTerminal.focus?.()
      targetQueue.enqueue(pasteText)
      targetQueue.flush()
      return true
    },
    [onShowMessage, profileId, runtimeKind],
  )

  const resolveClipboardImageTempPath = useCallback(
    async ({ warnIfUnavailable = false }: { warnIfUnavailable?: boolean } = {}): Promise<
      string | null
    > => {
      const materializeClipboardImageTempFile =
        window.freecliApi?.clipboard?.materializeImageTempFile
      if (typeof materializeClipboardImageTempFile !== 'function') {
        if (warnIfUnavailable) {
          onShowMessage?.(t('messages.terminalClipboardImageUnavailable'), 'warning')
        }
        return null
      }

      try {
        const result = await materializeClipboardImageTempFile()
        const path = typeof result?.path === 'string' ? result.path.trim() : ''
        if (path.length === 0) {
          if (warnIfUnavailable) {
            onShowMessage?.(t('messages.terminalClipboardImageUnavailable'), 'warning')
          }
          return null
        }

        return path
      } catch (error) {
        onShowMessage?.(
          t('messages.terminalClipboardImageMaterializeFailed', {
            message: toTerminalDropErrorMessage(error),
          }),
          'error',
        )
        return null
      }
    },
    [onShowMessage, t],
  )

  const pasteClipboardContentIntoTerminal = useCallback(
    async ({
      ptyWriteQueue,
      terminal,
    }: {
      ptyWriteQueue: {
        enqueue: (data: string, encoding?: 'utf8' | 'binary', coalesce?: boolean) => void
        flush: () => void
      }
      terminal: { modes?: { bracketedPasteMode?: boolean }; focus?: () => void }
    }): Promise<void> => {
      const imagePath = await resolveClipboardImageTempPath()
      if (imagePath) {
        pasteResolvedPathsIntoTerminal({
          paths: [imagePath],
          terminal,
          unavailableMessage: t('messages.terminalClipboardImageUnavailable'),
        })
        return
      }

      const text = await readTextFromClipboard()
      if (text.length === 0) {
        return
      }

      latestPasteIntentSequenceRef.current = ++pasteIntentSequenceRef.current
      const normalizedText = text.replace(/\r?\n/g, '\r')
      const payload = terminal.modes?.bracketedPasteMode
        ? `\u001b[200~${normalizedText}\u001b[201~`
        : normalizedText
      for (const char of payload) {
        ptyWriteQueue.enqueue(char, 'utf8', false)
      }
      ptyWriteQueue.flush()
    },
    [pasteResolvedPathsIntoTerminal, resolveClipboardImageTempPath, t],
  )

  const scheduleClipboardPasteIntoTerminal = useCallback(
    ({
      ptyWriteQueue,
      terminal,
    }: {
      ptyWriteQueue: {
        enqueue: (data: string, encoding?: 'utf8' | 'binary', coalesce?: boolean) => void
        flush: () => void
      }
      terminal: { modes?: { bracketedPasteMode?: boolean } }
    }): Promise<void> => {
      const pastePromise = pasteClipboardContentIntoTerminal({ ptyWriteQueue, terminal }).finally(
        () => {
          if (pendingClipboardPastePromiseRef.current === pastePromise) {
            pendingClipboardPastePromiseRef.current = null
          }
        },
      )

      pendingClipboardPastePromiseRef.current = pastePromise
      return pastePromise
    },
    [pasteClipboardContentIntoTerminal],
  )

  const clearPasteIndicatorTimer = useCallback(() => {
    if (pasteIndicatorTimerRef.current === null) {
      return
    }

    window.clearTimeout(pasteIndicatorTimerRef.current)
    pasteIndicatorTimerRef.current = null
  }, [])

  const completePasteFlow = useCallback(() => {
    pasteFlowActiveRef.current = false
    latestPasteIntentSequenceRef.current = 0
    pendingClipboardPastePromiseRef.current = null
    isPasteIndicatorVisibleRef.current = false
    clearPasteIndicatorTimer()
    setIsPasteIndicatorVisible(false)
  }, [clearPasteIndicatorTimer])

  const handlePtyQueueStateChange = useCallback(
    ({ isWriting, pendingCount }: { isWriting: boolean; pendingCount: number }) => {
      const isBusy = isWriting || pendingCount > 0

      if (!isBusy) {
        if (pasteFlowActiveRef.current || isPasteIndicatorVisibleRef.current) {
          completePasteFlow()
        }
        return
      }

      if (!pasteFlowActiveRef.current && latestPasteIntentSequenceRef.current > 0) {
        pasteFlowActiveRef.current = true
        latestPasteIntentSequenceRef.current = 0
        clearPasteIndicatorTimer()
        pasteIndicatorTimerRef.current = window.setTimeout(() => {
          pasteIndicatorTimerRef.current = null
          if (pasteFlowActiveRef.current) {
            isPasteIndicatorVisibleRef.current = true
            setIsPasteIndicatorVisible(true)
          }
        }, pasteIndicatorDelayMs)
        return
      }

      if (!pasteFlowActiveRef.current) {
        return
      }
    },
    [clearPasteIndicatorTimer, completePasteFlow],
  )

  const hasImageClipboardData = useCallback(
    (transfer: DataTransfer | null | undefined): boolean => {
      const items = Array.from(transfer?.items ?? [])
      if (items.length > 0) {
        return items.some(
          item =>
            item.kind === 'file' &&
            typeof item.type === 'string' &&
            item.type.trim().toLowerCase().startsWith('image/'),
        )
      }

      return Array.from(transfer?.files ?? []).some(
        file =>
          typeof file.type === 'string' && file.type.trim().toLowerCase().startsWith('image/'),
      )
    },
    [],
  )

  useEffect(() => {
    onCommandRunRef.current = onCommandRun
  }, [onCommandRun])
  useEffect(() => {
    isPasteIndicatorVisibleRef.current = isPasteIndicatorVisible
  }, [isPasteIndicatorVisible])
  useEffect(() => {
    onAlternateScreenChangeRef.current = onAlternateScreenChange
  }, [onAlternateScreenChange])
  useEffect(() => {
    isViewportInteractionActiveRef.current = isViewportInteractionActive
    outputSchedulerRef.current?.onViewportInteractionActiveChange(isViewportInteractionActive)
  }, [isViewportInteractionActive])
  const {
    scrollbackBufferRef,
    markScrollbackDirty,
    scheduleScrollbackPublish,
    disposeScrollbackPublish,
    cancelScrollbackPublish,
  } = useTerminalScrollback({
    sessionId,
    scrollback,
    onScrollbackChange,
    isPointerResizingRef,
  })
  useEffect(() => {
    lastSyncedPtySizeRef.current = null
    lastSyncedContainerSizeRef.current = null
    commandInputStateRef.current = createTerminalCommandInputState()
    alternateScreenStateRef.current = createTerminalAlternateScreenState()
    isTerminalHydratedRef.current = false
    setIsTerminalHydrated(false)
    completePasteFlow()
  }, [completePasteFlow, sessionId])

  useEffect(() => {
    return () => {
      pasteFlowActiveRef.current = false
      latestPasteIntentSequenceRef.current = 0
      pendingClipboardPastePromiseRef.current = null
      isPasteIndicatorVisibleRef.current = false
      clearPasteIndicatorTimer()
    }
  }, [clearPasteIndicatorTimer])

  const syncTerminalSize = useCallback(() => {
    syncTerminalNodeSize({
      terminalRef,
      fitAddonRef,
      containerRef,
      isPointerResizingRef,
      lastSyncedContainerSizeRef,
      lastSyncedPtySizeRef,
      sessionId,
    })
  }, [sessionId])
  const syncTerminalForeground = useCallback(() => {
    syncTerminalNodeSize({
      terminalRef,
      fitAddonRef,
      containerRef,
      isPointerResizingRef,
      lastSyncedContainerSizeRef,
      lastSyncedPtySizeRef,
      sessionId,
      mode: 'foreground',
    })
  }, [sessionId])
  const syncTerminalLayout = useCallback(() => {
    syncTerminalNodeSize({
      terminalRef,
      fitAddonRef,
      containerRef,
      isPointerResizingRef,
      lastSyncedContainerSizeRef,
      lastSyncedPtySizeRef,
      sessionId,
      mode: 'foreground',
    })
  }, [sessionId])
  const applyTerminalTheme = useTerminalThemeApplier({
    terminalRef,
    containerRef,
    terminalThemeMode,
  })
  const { draftFrame, handleResizePointerDown } = useTerminalResize({
    position,
    width,
    height,
    minSize: resolveCanonicalNodeMinSize(kind),
    onResize,
    syncTerminalSize,
    scheduleScrollbackPublish,
    isPointerResizingRef,
  })
  const sizeStyle = resolveTerminalNodeFrameStyle({ draftFrame, position, width, height })
  useEffect(() => {
    if (sessionId.trim().length === 0) {
      return undefined
    }

    const ptyWithOptionalAttach = window.freecliApi.pty as typeof window.freecliApi.pty & {
      attach?: (payload: { sessionId: string }) => Promise<void>
      detach?: (payload: { sessionId: string }) => Promise<void>
    }
    const cachedScreenState = getCachedTerminalScreenState(nodeId, sessionId)
    const initialDimensions = resolveInitialTerminalDimensions(cachedScreenState)
    const scrollbackBuffer = scrollbackBufferRef.current
    const initialTerminalTheme = resolveTerminalTheme(terminalThemeMode)
    const resolvedTerminalUiTheme = resolveTerminalUiTheme(terminalThemeMode)
    const platform = window.freecliApi.meta.platform
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: resolveTerminalFontFamily(platform, runtimeKind),
      rescaleOverlappingGlyphs: shouldEnableOverlappingGlyphRescale(platform, runtimeKind),
      theme: initialTerminalTheme,
      allowProposedApi: true,
      convertEol: true,
      scrollback: 5000,
      ...(initialDimensions ?? {}),
    })
    const fitAddon = new FitAddon()
    const serializeAddon = new SerializeAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(serializeAddon)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    const terminalSupportsSearch =
      typeof (terminal as unknown as { onWriteParsed?: unknown }).onWriteParsed === 'function'
    const disposeTerminalFind = terminalSupportsSearch
      ? (() => {
          const searchAddon = new SearchAddon()
          terminal.loadAddon(searchAddon)
          return bindSearchAddonToFind(searchAddon)
        })()
      : () => undefined
    let disposeTerminalSelectionTestHandle: () => void = () => undefined
    const ptyWriteQueue = createPtyWriteQueue(
      ({ data, encoding }) =>
        window.freecliApi.pty.write({
          sessionId,
          data,
          ...(encoding === 'binary' ? { encoding } : {}),
        }),
      {
        onStateChange: handlePtyQueueStateChange,
      },
    )
    ptyWriteQueueRef.current = ptyWriteQueue
    terminal.attachCustomKeyEventHandler(event =>
      handleTerminalCustomKeyEvent({
        event,
        ptyWriteQueue,
        terminal,
        onOpenFind: openTerminalFind,
        pasteClipboardText: scheduleClipboardPasteIntoTerminal,
        getPendingPastePromise: () => pendingClipboardPastePromiseRef.current,
      }),
    )
    let cancelMouseServicePatch: () => void = () => undefined
    if (containerRef.current) {
      terminal.open(containerRef.current)
      containerRef.current.setAttribute('data-cove-terminal-theme', resolvedTerminalUiTheme)
      cancelMouseServicePatch = patchXtermMouseServiceWithRetry(terminal)
      if (window.freecliApi.meta.isTest) {
        disposeTerminalSelectionTestHandle = registerTerminalSelectionTestHandle(nodeId, {
          clearSelection: terminal.clearSelection.bind(terminal),
          getSelection: terminal.getSelection.bind(terminal),
          hasSelection: terminal.hasSelection.bind(terminal),
          selectAll: terminal.selectAll.bind(terminal),
          cols: terminal.cols,
          rows: terminal.rows,
          element: terminal.element,
          sessionId,
          emitBinaryInput: (data: string) => {
            if (window.freecliApi.meta.platform === 'win32') {
              ptyWriteQueue.enqueue(convertHighByteX10MouseReportsToSgr(data), 'utf8', false)
              ptyWriteQueue.flush()
              return
            }

            ptyWriteQueue.enqueue(data, 'binary', false)
            ptyWriteQueue.flush()
          },
        })
      }
      requestAnimationFrame(syncTerminalSize)
      if (window.freecliApi.meta.isTest) {
        terminal.focus()
      }
    }

    let isDisposed = false
    let shouldForwardTerminalData = false
    const dataDisposable = terminal.onData(data => {
      if (!shouldForwardTerminalData) {
        return
      }

      ptyWriteQueue.enqueue(data)
      ptyWriteQueue.flush()

      const commandRunHandler = onCommandRunRef.current
      if (!commandRunHandler || alternateScreenStateRef.current.active) {
        return
      }

      const parsed = parseTerminalCommandInput(data, commandInputStateRef.current)
      commandInputStateRef.current = parsed.nextState
      parsed.commands.forEach(command => {
        commandRunHandler(command)
      })
    })
    const binaryDisposable = terminal.onBinary(data => {
      if (!shouldForwardTerminalData) {
        return
      }

      ptyWriteQueue.enqueue(data, 'binary')
      ptyWriteQueue.flush()
    })

    let isHydrating = true
    const bufferedDataChunks: string[] = []
    let bufferedExitCode: number | null = null
    const ptyEventHub = getPtyEventHub()

    const outputScheduler = createTerminalOutputScheduler({
      terminal,
      scrollbackBuffer,
      markScrollbackDirty,
    })
    outputSchedulerRef.current = outputScheduler
    outputScheduler.onViewportInteractionActiveChange(isViewportInteractionActiveRef.current)

    const unsubscribeData = ptyEventHub.onSessionData(sessionId, event => {
      const alternateScreen = applyTerminalAlternateScreenData(
        alternateScreenStateRef.current,
        event.data,
      )
      alternateScreenStateRef.current = alternateScreen.nextState
      if (alternateScreen.didChange) {
        onAlternateScreenChangeRef.current?.(alternateScreen.nextState.active)
      }

      if (isHydrating) {
        bufferedDataChunks.push(event.data)
        return
      }

      outputScheduler.handleChunk(event.data)
    })

    const unsubscribeExit = ptyEventHub.onSessionExit(sessionId, event => {
      if (isHydrating) {
        bufferedExitCode = event.exitCode
        return
      }

      const exitMessage = `\r\n[process exited with code ${event.exitCode}]\r\n`
      outputScheduler.handleChunk(exitMessage, { immediateScrollbackPublish: true })
    })

    const attachPromise = Promise.resolve(ptyWithOptionalAttach.attach?.({ sessionId }))

    const finalizeHydration = (rawSnapshot: string): void => {
      if (isDisposed) {
        return
      }

      const alternateScreen = applyTerminalAlternateScreenData(
        createTerminalAlternateScreenState(),
        rawSnapshot,
      )
      alternateScreenStateRef.current = alternateScreen.nextState
      if (alternateScreen.nextState.active) {
        onAlternateScreenChangeRef.current?.(true)
      }

      scrollbackBuffer.set(rawSnapshot)
      isHydrating = false
      ptyWriteQueue.flush()

      const bufferedData = bufferedDataChunks.join('')
      bufferedDataChunks.length = 0

      if (bufferedData.length > 0) {
        const overlap = resolveSuffixPrefixOverlap(rawSnapshot, bufferedData)
        const remainder = bufferedData.slice(overlap)

        if (remainder.length > 0) {
          terminal.write(remainder)
          scrollbackBuffer.append(remainder)
        }
      }

      if (bufferedExitCode !== null) {
        const exitMessage = `\r\n[process exited with code ${bufferedExitCode}]\r\n`
        bufferedExitCode = null
        terminal.write(exitMessage)
        scrollbackBuffer.append(exitMessage)
      }

      markScrollbackDirty(true)
      revealHydratedTerminal(syncTerminalSize, () => {
        if (!isDisposed) {
          isTerminalHydratedRef.current = true
          setIsTerminalHydrated(true)
        }
      })
    }

    const hydrateFromSnapshot = async () => {
      await attachPromise.catch(() => undefined)

      const persistedSnapshot = scrollbackBuffer.snapshot()
      const cachedSerializedScreen = cachedScreenState?.serialized ?? ''
      const baseRawSnapshot =
        cachedScreenState && cachedScreenState.rawSnapshot.length > 0
          ? cachedScreenState.rawSnapshot
          : persistedSnapshot
      let restoredPayload =
        cachedSerializedScreen.length > 0 ? cachedSerializedScreen : persistedSnapshot
      let rawSnapshot = baseRawSnapshot

      try {
        const snapshot = await window.freecliApi.pty.snapshot({ sessionId })
        if (cachedSerializedScreen.length > 0) {
          restoredPayload = `${cachedSerializedScreen}${resolveScrollbackDelta(baseRawSnapshot, snapshot.data)}`
          rawSnapshot = mergeScrollbackSnapshots(baseRawSnapshot, snapshot.data)
        } else {
          rawSnapshot = mergeScrollbackSnapshots(persistedSnapshot, snapshot.data)
          restoredPayload = rawSnapshot
        }
      } catch {
        rawSnapshot = baseRawSnapshot
      }

      if (isDisposed) {
        return
      }

      if (restoredPayload.length > 0) {
        terminal.write(restoredPayload, () => {
          shouldForwardTerminalData = true
          finalizeHydration(rawSnapshot)
        })
      } else {
        shouldForwardTerminalData = true
        finalizeHydration(rawSnapshot)
      }
    }

    void hydrateFromSnapshot()

    const resizeObserver = new ResizeObserver(() => {
      syncTerminalSize()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    const foregroundSyncScheduler = createTerminalForegroundSyncScheduler(syncTerminalForeground)
    const disposeLayoutSync = registerTerminalLayoutSync({
      onForegroundSync: foregroundSyncScheduler.schedule,
      onLayoutSync: syncTerminalLayout,
    })

    const handleThemeChange = () => {
      if (terminalThemeMode !== 'sync-with-ui') {
        return
      }
      applyTerminalTheme()
      syncTerminalSize()
    }
    window.addEventListener('freecli-theme-changed', handleThemeChange)

    return () => {
      const isInvalidated = isCachedTerminalScreenStateInvalidated(nodeId, sessionId)

      const hasPendingWrites = outputScheduler.hasPendingWrites()

      if (!isInvalidated && isTerminalHydratedRef.current && !hasPendingWrites) {
        // Live PTY output owns terminal modes; the renderer cache should only restore pixels.
        const serializedScreen = serializeAddon.serialize({ excludeModes: true })
        if (serializedScreen.length > 0) {
          setCachedTerminalScreenState(nodeId, {
            sessionId,
            serialized: serializedScreen,
            rawSnapshot: scrollbackBuffer.snapshot(),
            cols: terminal.cols,
            rows: terminal.rows,
          })
        }
      }

      cancelMouseServicePatch()
      isDisposed = true
      const detachPromise = ptyWithOptionalAttach.detach?.({ sessionId })
      void detachPromise?.catch(() => undefined)
      foregroundSyncScheduler.dispose()
      disposeLayoutSync()
      window.removeEventListener('freecli-theme-changed', handleThemeChange)
      resizeObserver.disconnect()
      dataDisposable.dispose()
      binaryDisposable.dispose()
      unsubscribeData()
      unsubscribeExit()
      disposeTerminalSelectionTestHandle()
      disposeTerminalFind()
      outputScheduler.dispose()
      outputSchedulerRef.current = null
      ptyWriteQueue.dispose()
      ptyWriteQueueRef.current = null
      if (isInvalidated) {
        cancelScrollbackPublish()
        clearCachedTerminalScreenStateInvalidation(nodeId, sessionId)
      } else {
        disposeScrollbackPublish()
      }
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [
    cancelScrollbackPublish,
    applyTerminalTheme,
    bindSearchAddonToFind,
    runtimeKind,
    nodeId,
    disposeScrollbackPublish,
    markScrollbackDirty,
    openTerminalFind,
    handlePtyQueueStateChange,
    scheduleClipboardPasteIntoTerminal,
    scrollbackBufferRef,
    sessionId,
    syncTerminalForeground,
    syncTerminalSize,
    syncTerminalLayout,
    terminalThemeMode,
  ])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }

    terminal.options.fontSize = terminalFontSize
    syncTerminalSize()
  }, [syncTerminalSize, terminalFontSize])

  useEffect(() => {
    const frame = requestAnimationFrame(syncTerminalSize)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [height, syncTerminalSize, width])

  const hasSelectedDragSurface = isDragSurfaceSelectionMode && (isSelected || isDragging)
  const {
    consumeIgnoredClick: consumeIgnoredTerminalBodyClick,
    handlePointerDownCapture: handleTerminalBodyPointerDownCapture,
    handlePointerMoveCapture: handleTerminalBodyPointerMoveCapture,
    handlePointerUp: handleTerminalBodyPointerUp,
  } = useTerminalBodyClickFallback(onInteractionStart)

  const handleTerminalBodyDragOver = useCallback<React.DragEventHandler<HTMLDivElement>>(event => {
    if (!isFileDropTransfer(event.dataTransfer)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleTerminalBodyDrop = useCallback<React.DragEventHandler<HTMLDivElement>>(
    event => {
      if (!isFileDropTransfer(event.dataTransfer)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const files = Array.from(event.dataTransfer.files ?? [])
      if (files.length === 0) {
        onShowMessage?.(t('messages.terminalDropPathUnavailable'), 'warning')
        return
      }

      const resolveDroppedPaths = window.freecliApi?.workspace?.resolveDroppedPaths
      if (typeof resolveDroppedPaths !== 'function') {
        onShowMessage?.(t('messages.terminalDropPathUnavailable'), 'warning')
        return
      }

      void Promise.resolve()
        .then(() => {
          const paths = resolveDroppedPaths(files)
          pasteResolvedPathsIntoTerminal({
            paths,
            unavailableMessage: t('messages.terminalDropPathUnavailable'),
          })
        })
        .catch(error => {
          onShowMessage?.(
            t('messages.terminalDropPathResolveFailed', {
              message: toTerminalDropErrorMessage(error),
            }),
            'error',
          )
        })
    },
    [onShowMessage, pasteResolvedPathsIntoTerminal, t],
  )

  const handleTerminalBodyPaste = useCallback<React.ClipboardEventHandler<HTMLDivElement>>(
    event => {
      if (!hasImageClipboardData(event.clipboardData)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      void resolveClipboardImageTempPath({ warnIfUnavailable: true }).then(path => {
        if (!path) {
          return
        }

        pasteResolvedPathsIntoTerminal({
          paths: [path],
          unavailableMessage: t('messages.terminalClipboardImageUnavailable'),
        })
      })
    },
    [hasImageClipboardData, pasteResolvedPathsIntoTerminal, resolveClipboardImageTempPath, t],
  )

  return (
    <TerminalNodeFrame
      title={title}
      modelLabel={modelLabel}
      kind={kind}
      isAgentLike={isAgentLike}
      labelColor={labelColor}
      labelColorOverride={labelColorOverride}
      terminalThemeMode={terminalThemeMode}
      credentialProfileId={credentialProfileId}
      activeCredentialProfileId={activeCredentialProfileId}
      terminalCredentialProfiles={terminalCredentialProfiles}
      activeCredentialProvider={activeCredentialProvider}
      isSelected={hasSelectedDragSurface}
      isDragging={isDragging}
      status={status}
      directoryMismatch={directoryMismatch}
      lastError={lastError}
      persistenceMode={persistenceMode}
      sessionId={sessionId}
      isTerminalHydrated={isTerminalHydrated}
      isPasteIndicatorVisible={isPasteIndicatorVisible}
      pasteIndicatorLabel={t('terminalNode.pasting')}
      sizeStyle={sizeStyle}
      containerRef={containerRef}
      handleTerminalBodyPointerDownCapture={handleTerminalBodyPointerDownCapture}
      handleTerminalBodyPointerMoveCapture={handleTerminalBodyPointerMoveCapture}
      handleTerminalBodyPointerUp={handleTerminalBodyPointerUp}
      handleTerminalBodyPaste={handleTerminalBodyPaste}
      handleTerminalBodyDragOver={handleTerminalBodyDragOver}
      handleTerminalBodyDrop={handleTerminalBodyDrop}
      consumeIgnoredTerminalBodyClick={consumeIgnoredTerminalBodyClick}
      onInteractionStart={onInteractionStart}
      onTitleCommit={onTitleCommit}
      onLabelColorChange={onLabelColorChange}
      onCredentialProfileChange={onCredentialProfileChange}
      onPersistenceModeChange={onPersistenceModeChange}
      onClose={onClose}
      onCopyLastMessage={onCopyLastMessage}
      find={findState}
      onFindQueryChange={setFindQuery}
      onFindNext={findNextMatch}
      onFindPrevious={findPreviousMatch}
      onFindClose={closeTerminalFind}
      handleResizePointerDown={handleResizePointerDown}
    />
  )
}
