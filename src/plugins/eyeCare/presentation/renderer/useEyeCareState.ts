import React from 'react'
import type { EyeCareStateDto } from '@shared/contracts/dto'

const EMPTY_STATE: EyeCareStateDto = {
  status: 'disabled',
  phase: 'idle',
  phaseStartedAt: null,
  phaseEndsAt: null,
  remainingSeconds: 0,
  cycleIndex: 0,
  completedBreakCountToday: 0,
  lastBreakFinishedAt: null,
  isOverlayVisible: false,
  isPaused: false,
  isStopped: false,
  isRunning: false,
  canStart: false,
  canPause: false,
  canResume: false,
  canStop: false,
  canPostpone: false,
  canSkip: false,
}

export function useEyeCareState(): {
  state: EyeCareStateDto
  isHydrated: boolean
  startCycle: () => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
  postponeBreak: () => Promise<void>
} {
  const [state, setState] = React.useState<EyeCareStateDto>(EMPTY_STATE)
  const [isHydrated, setIsHydrated] = React.useState(false)

  React.useEffect(() => {
    const api = window.freecliApi?.plugins?.eyeCare
    if (!api) {
      setIsHydrated(true)
      return
    }

    let cancelled = false
    void api.getState().then(nextState => {
      if (!cancelled) {
        setState(nextState)
        setIsHydrated(true)
      }
    })

    const unsubscribe = api.onState(nextState => {
      setState(nextState)
      setIsHydrated(true)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const call = React.useCallback(async (action: () => Promise<EyeCareStateDto>) => {
    const nextState = await action()
    setState(nextState)
  }, [])

  return {
    state,
    isHydrated,
    startCycle: async () => {
      await call(async () => await window.freecliApi.plugins.eyeCare.startCycle())
    },
    pause: async () => {
      await call(async () => await window.freecliApi.plugins.eyeCare.pause())
    },
    resume: async () => {
      await call(async () => await window.freecliApi.plugins.eyeCare.resume())
    },
    stop: async () => {
      await call(async () => await window.freecliApi.plugins.eyeCare.stop())
    },
    postponeBreak: async () => {
      await call(async () => await window.freecliApi.plugins.eyeCare.postponeBreak())
    },
  }
}
