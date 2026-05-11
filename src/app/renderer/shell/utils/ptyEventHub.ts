import type {
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSessionAttentionEvent,
  TerminalSessionMetadataEvent,
  TerminalSessionStateEvent,
} from '@shared/contracts/dto'

type UnsubscribeFn = () => void

interface PtyEventSource {
  onData: (listener: (event: TerminalDataEvent) => void) => UnsubscribeFn
  onExit: (listener: (event: TerminalExitEvent) => void) => UnsubscribeFn
  onState?: (listener: (event: TerminalSessionStateEvent) => void) => UnsubscribeFn
  onAttention?: (listener: (event: TerminalSessionAttentionEvent) => void) => UnsubscribeFn
  onMetadata?: (listener: (event: TerminalSessionMetadataEvent) => void) => UnsubscribeFn
}

type ListenerMap<Event> = {
  global: Set<(event: Event) => void>
  bySessionId: Map<string, Set<(event: Event) => void>>
}

export interface PtyEventHub {
  onData: (listener: (event: TerminalDataEvent) => void) => UnsubscribeFn
  onSessionData: (sessionId: string, listener: (event: TerminalDataEvent) => void) => UnsubscribeFn
  onExit: (listener: (event: TerminalExitEvent) => void) => UnsubscribeFn
  onSessionExit: (sessionId: string, listener: (event: TerminalExitEvent) => void) => UnsubscribeFn
  onState: (listener: (event: TerminalSessionStateEvent) => void) => UnsubscribeFn
  onSessionState: (
    sessionId: string,
    listener: (event: TerminalSessionStateEvent) => void,
  ) => UnsubscribeFn
  onAttention: (listener: (event: TerminalSessionAttentionEvent) => void) => UnsubscribeFn
  onSessionAttention: (
    sessionId: string,
    listener: (event: TerminalSessionAttentionEvent) => void,
  ) => UnsubscribeFn
  onMetadata: (listener: (event: TerminalSessionMetadataEvent) => void) => UnsubscribeFn
  onSessionMetadata: (
    sessionId: string,
    listener: (event: TerminalSessionMetadataEvent) => void,
  ) => UnsubscribeFn
  dispose: () => void
}

function createListenerMap<Event>(): ListenerMap<Event> {
  return {
    global: new Set(),
    bySessionId: new Map(),
  }
}

function dispatchEvent<Event extends { sessionId: string }>(
  listeners: ListenerMap<Event>,
  event: Event,
): void {
  listeners.global.forEach(listener => {
    listener(event)
  })

  const sessionListeners = listeners.bySessionId.get(event.sessionId)
  sessionListeners?.forEach(listener => {
    listener(event)
  })
}

function hasListeners<Event>(listeners: ListenerMap<Event>): boolean {
  return listeners.global.size > 0 || listeners.bySessionId.size > 0
}

function subscribeGlobal<Event>(
  listeners: ListenerMap<Event>,
  listener: (event: Event) => void,
): UnsubscribeFn {
  listeners.global.add(listener)
  return () => {
    listeners.global.delete(listener)
  }
}

function subscribeSession<Event>(
  listeners: ListenerMap<Event>,
  sessionId: string,
  listener: (event: Event) => void,
): UnsubscribeFn {
  const normalizedSessionId = sessionId.trim()
  if (normalizedSessionId.length === 0) {
    return () => undefined
  }

  const sessionListeners = listeners.bySessionId.get(normalizedSessionId) ?? new Set()
  sessionListeners.add(listener)
  listeners.bySessionId.set(normalizedSessionId, sessionListeners)

  return () => {
    const current = listeners.bySessionId.get(normalizedSessionId)
    if (!current) {
      return
    }

    current.delete(listener)
    if (current.size === 0) {
      listeners.bySessionId.delete(normalizedSessionId)
    }
  }
}

export function createPtyEventHub(source: PtyEventSource): PtyEventHub {
  const dataListeners = createListenerMap<TerminalDataEvent>()
  const exitListeners = createListenerMap<TerminalExitEvent>()
  const stateListeners = createListenerMap<TerminalSessionStateEvent>()
  const attentionListeners = createListenerMap<TerminalSessionAttentionEvent>()
  const metadataListeners = createListenerMap<TerminalSessionMetadataEvent>()

  let unsubscribeDataSource: UnsubscribeFn | null = null
  let unsubscribeExitSource: UnsubscribeFn | null = null
  let unsubscribeStateSource: UnsubscribeFn | null = null
  let unsubscribeAttentionSource: UnsubscribeFn | null = null
  let unsubscribeMetadataSource: UnsubscribeFn | null = null

  const ensureDataSourceSubscription = (): void => {
    if (unsubscribeDataSource || !hasListeners(dataListeners)) {
      return
    }

    unsubscribeDataSource = source.onData(event => {
      dispatchEvent(dataListeners, event)
    })
  }

  const ensureExitSourceSubscription = (): void => {
    if (unsubscribeExitSource || !hasListeners(exitListeners)) {
      return
    }

    unsubscribeExitSource = source.onExit(event => {
      dispatchEvent(exitListeners, event)
    })
  }

  const ensureStateSourceSubscription = (): void => {
    if (unsubscribeStateSource || !hasListeners(stateListeners) || !source.onState) {
      return
    }

    unsubscribeStateSource = source.onState(event => {
      dispatchEvent(stateListeners, event)
    })
  }

  const ensureAttentionSourceSubscription = (): void => {
    if (unsubscribeAttentionSource || !hasListeners(attentionListeners) || !source.onAttention) {
      return
    }

    unsubscribeAttentionSource = source.onAttention(event => {
      dispatchEvent(attentionListeners, event)
    })
  }

  const ensureMetadataSourceSubscription = (): void => {
    if (unsubscribeMetadataSource || !hasListeners(metadataListeners) || !source.onMetadata) {
      return
    }

    unsubscribeMetadataSource = source.onMetadata(event => {
      dispatchEvent(metadataListeners, event)
    })
  }

  const cleanupDataSourceSubscription = (): void => {
    if (unsubscribeDataSource && !hasListeners(dataListeners)) {
      unsubscribeDataSource()
      unsubscribeDataSource = null
    }
  }

  const cleanupExitSourceSubscription = (): void => {
    if (unsubscribeExitSource && !hasListeners(exitListeners)) {
      unsubscribeExitSource()
      unsubscribeExitSource = null
    }
  }

  const cleanupStateSourceSubscription = (): void => {
    if (unsubscribeStateSource && !hasListeners(stateListeners)) {
      unsubscribeStateSource()
      unsubscribeStateSource = null
    }
  }

  const cleanupAttentionSourceSubscription = (): void => {
    if (unsubscribeAttentionSource && !hasListeners(attentionListeners)) {
      unsubscribeAttentionSource()
      unsubscribeAttentionSource = null
    }
  }

  const cleanupMetadataSourceSubscription = (): void => {
    if (unsubscribeMetadataSource && !hasListeners(metadataListeners)) {
      unsubscribeMetadataSource()
      unsubscribeMetadataSource = null
    }
  }

  const onData = (listener: (event: TerminalDataEvent) => void): UnsubscribeFn => {
    const unsubscribe = subscribeGlobal(dataListeners, listener)
    ensureDataSourceSubscription()
    return () => {
      unsubscribe()
      cleanupDataSourceSubscription()
    }
  }

  const onSessionData = (
    sessionId: string,
    listener: (event: TerminalDataEvent) => void,
  ): UnsubscribeFn => {
    const unsubscribe = subscribeSession(dataListeners, sessionId, listener)
    ensureDataSourceSubscription()
    return () => {
      unsubscribe()
      cleanupDataSourceSubscription()
    }
  }

  const onExit = (listener: (event: TerminalExitEvent) => void): UnsubscribeFn => {
    const unsubscribe = subscribeGlobal(exitListeners, listener)
    ensureExitSourceSubscription()
    return () => {
      unsubscribe()
      cleanupExitSourceSubscription()
    }
  }

  const onSessionExit = (
    sessionId: string,
    listener: (event: TerminalExitEvent) => void,
  ): UnsubscribeFn => {
    const unsubscribe = subscribeSession(exitListeners, sessionId, listener)
    ensureExitSourceSubscription()
    return () => {
      unsubscribe()
      cleanupExitSourceSubscription()
    }
  }

  const onState = (listener: (event: TerminalSessionStateEvent) => void): UnsubscribeFn => {
    const unsubscribe = subscribeGlobal(stateListeners, listener)
    ensureStateSourceSubscription()
    return () => {
      unsubscribe()
      cleanupStateSourceSubscription()
    }
  }

  const onSessionState = (
    sessionId: string,
    listener: (event: TerminalSessionStateEvent) => void,
  ): UnsubscribeFn => {
    const unsubscribe = subscribeSession(stateListeners, sessionId, listener)
    ensureStateSourceSubscription()
    return () => {
      unsubscribe()
      cleanupStateSourceSubscription()
    }
  }

  const onAttention = (listener: (event: TerminalSessionAttentionEvent) => void): UnsubscribeFn => {
    const unsubscribe = subscribeGlobal(attentionListeners, listener)
    ensureAttentionSourceSubscription()
    return () => {
      unsubscribe()
      cleanupAttentionSourceSubscription()
    }
  }

  const onSessionAttention = (
    sessionId: string,
    listener: (event: TerminalSessionAttentionEvent) => void,
  ): UnsubscribeFn => {
    const unsubscribe = subscribeSession(attentionListeners, sessionId, listener)
    ensureAttentionSourceSubscription()
    return () => {
      unsubscribe()
      cleanupAttentionSourceSubscription()
    }
  }

  const onMetadata = (listener: (event: TerminalSessionMetadataEvent) => void): UnsubscribeFn => {
    const unsubscribe = subscribeGlobal(metadataListeners, listener)
    ensureMetadataSourceSubscription()
    return () => {
      unsubscribe()
      cleanupMetadataSourceSubscription()
    }
  }

  const onSessionMetadata = (
    sessionId: string,
    listener: (event: TerminalSessionMetadataEvent) => void,
  ): UnsubscribeFn => {
    const unsubscribe = subscribeSession(metadataListeners, sessionId, listener)
    ensureMetadataSourceSubscription()
    return () => {
      unsubscribe()
      cleanupMetadataSourceSubscription()
    }
  }

  return {
    onData,
    onSessionData,
    onExit,
    onSessionExit,
    onState,
    onSessionState,
    onAttention,
    onSessionAttention,
    onMetadata,
    onSessionMetadata,
    dispose: () => {
      unsubscribeDataSource?.()
      unsubscribeExitSource?.()
      unsubscribeStateSource?.()
      unsubscribeAttentionSource?.()
      unsubscribeMetadataSource?.()
      unsubscribeDataSource = null
      unsubscribeExitSource = null
      unsubscribeStateSource = null
      unsubscribeAttentionSource = null
      unsubscribeMetadataSource = null
      dataListeners.global.clear()
      dataListeners.bySessionId.clear()
      exitListeners.global.clear()
      exitListeners.bySessionId.clear()
      stateListeners.global.clear()
      stateListeners.bySessionId.clear()
      attentionListeners.global.clear()
      attentionListeners.bySessionId.clear()
      metadataListeners.global.clear()
      metadataListeners.bySessionId.clear()
    },
  }
}

let singleton: {
  source: PtyEventSource
  hub: PtyEventHub
} | null = null

export function getPtyEventHub(): PtyEventHub {
  const source = window.freecliApi.pty
  if (!singleton || singleton.source !== source) {
    singleton?.hub.dispose()
    singleton = {
      source,
      hub: createPtyEventHub(source),
    }
  }

  return singleton.hub
}
