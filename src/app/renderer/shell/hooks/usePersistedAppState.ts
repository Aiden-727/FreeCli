import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from '@app/renderer/i18n'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import type {
  PersistedAppState,
  WorkspaceState,
} from '@contexts/workspace/presentation/renderer/types'
import {
  flushScheduledPersistedStateWrite,
  type PersistWriteResult,
  schedulePersistedStateWrite,
} from '@contexts/workspace/presentation/renderer/utils/persistence'
import type { PersistNotice } from '../types'
import { useAppStore } from '../store/useAppStore'
import { flushScheduledNodeScrollbackWrites } from '@contexts/workspace/presentation/renderer/utils/persistence/scrollbackSchedule'
import { toErrorMessage } from '../utils/format'

export function usePersistedAppState({
  workspaces,
  activeWorkspaceId,
  agentSettings,
  isHydrated,
  producePersistedState,
  onPersistResult,
}: {
  workspaces: WorkspaceState[]
  activeWorkspaceId: string | null
  agentSettings: AgentSettings
  isHydrated: boolean
  producePersistedState: () => PersistedAppState
  onPersistResult?: (result: PersistWriteResult, state: PersistedAppState) => void
}): {
  persistNotice: PersistNotice | null
  requestPersistFlush: () => void
  flushPersistNow: () => Promise<void>
} {
  const { t } = useTranslation()
  const persistNotice = useAppStore(state => state.persistNotice)
  const setPersistNotice = useAppStore(state => state.setPersistNotice)
  const isHydratedRef = useRef(isHydrated)
  const producePersistedStateRef = useRef(producePersistedState)
  const lastAutoPersistInputsRef = useRef<{
    activeWorkspaceId: string | null
    agentSettings: AgentSettings
  } | null>(null)

  const requestPersistFlush = useCallback(() => {
    if (!isHydratedRef.current) {
      return
    }

    // Explicit durable changes should enqueue a write immediately so that a near-immediate
    // window close still has a pending producer available for beforeunload flushing.
    schedulePersistedStateWrite(producePersistedStateRef.current, {
      onResult: (result, state) => {
        handlePersistWriteResultRef.current(result, state)
      },
    })
  }, [])

  const handlePersistWriteResult = useCallback(
    (result: PersistWriteResult, state: PersistedAppState) => {
      onPersistResult?.(result, state)
      setPersistNotice(previous => {
        if (result.ok) {
          if (result.level === 'full') {
            return previous?.kind === 'recovery' ? previous : null
          }

          const message =
            result.level === 'no_scrollback'
              ? t('persistence.savedWithoutScrollback')
              : t('persistence.savedSettingsOnly')

          const next: PersistNotice = { tone: 'warning', message, kind: 'write' }
          return previous?.tone === next.tone &&
            previous.message === next.message &&
            previous.kind === next.kind
            ? previous
            : next
        }

        const message =
          result.reason === 'unavailable'
            ? t('persistence.unavailable')
            : result.reason === 'quota' || result.reason === 'payload_too_large'
              ? t('persistence.limitExceeded')
              : result.reason === 'io'
                ? t('persistence.ioFailed', { message: toErrorMessage(result.error) })
                : t('persistence.failed', { message: toErrorMessage(result.error) })

        const next: PersistNotice = { tone: 'error', message, kind: 'write' }
        return previous?.tone === next.tone &&
          previous.message === next.message &&
          previous.kind === next.kind
          ? previous
          : next
      })
    },
    [onPersistResult, setPersistNotice, t],
  )

  const handlePersistWriteResultRef = useRef(handlePersistWriteResult)

  useEffect(() => {
    isHydratedRef.current = isHydrated
  }, [isHydrated])

  useEffect(() => {
    producePersistedStateRef.current = producePersistedState
  }, [producePersistedState])

  useEffect(() => {
    handlePersistWriteResultRef.current = handlePersistWriteResult
  }, [handlePersistWriteResult])

  useEffect(() => {
    if (window.freecliApi?.meta?.isTest) {
      return
    }

    const handleBeforeUnload = () => {
      flushScheduledNodeScrollbackWrites()
      flushScheduledPersistedStateWrite()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      flushScheduledNodeScrollbackWrites()
      flushScheduledPersistedStateWrite()
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    const previousAutoPersistInputs = lastAutoPersistInputsRef.current
    const shouldAutoPersist =
      previousAutoPersistInputs === null ||
      previousAutoPersistInputs.activeWorkspaceId !== activeWorkspaceId ||
      previousAutoPersistInputs.agentSettings !== agentSettings
    if (!shouldAutoPersist) {
      return
    }

    lastAutoPersistInputsRef.current = {
      activeWorkspaceId,
      agentSettings,
    }

    schedulePersistedStateWrite(producePersistedState, { onResult: handlePersistWriteResult })
  }, [
    activeWorkspaceId,
    agentSettings,
    handlePersistWriteResult,
    isHydrated,
    producePersistedState,
    workspaces,
  ])

  const flushPersistNow = useCallback(async () => {
    await new Promise<void>(resolve => {
      schedulePersistedStateWrite(producePersistedState, {
        delayMs: 0,
        onResult: (result, state) => {
          handlePersistWriteResult(result, state)
          resolve()
        },
      })
      flushScheduledNodeScrollbackWrites()
      flushScheduledPersistedStateWrite()
    })
  }, [handlePersistWriteResult, producePersistedState])

  return { persistNotice, requestPersistFlush, flushPersistNow }
}
