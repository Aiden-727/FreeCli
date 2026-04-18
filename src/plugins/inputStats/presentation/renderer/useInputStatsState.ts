import React from 'react'
import type { InputStatsStateDto } from '@shared/contracts/dto'
import { DEFAULT_INPUT_STATS_SETTINGS } from '@contexts/plugins/domain/inputStatsSettings'

function getInputStatsApi() {
  return window.freecliApi?.plugins?.inputStats
}

function getFallbackState(): InputStatsStateDto {
  return {
    isEnabled: false,
    isSupported: window.freecliApi?.meta?.platform === 'win32',
    isMonitoring: false,
    status: 'disabled',
    lastUpdatedAt: null,
    settings: DEFAULT_INPUT_STATS_SETTINGS,
    today: {
      day: new Date().toISOString().slice(0, 10),
      keyPresses: 0,
      leftClicks: 0,
      rightClicks: 0,
      mouseDistancePx: 0,
      scrollSteps: 0,
    },
    topKeysRange: DEFAULT_INPUT_STATS_SETTINGS.topKeysRange,
    topKeys: [],
    allKeys: [],
    historyRangeDays: DEFAULT_INPUT_STATS_SETTINGS.historyRangeDays,
    historySeriesByMetric: {
      clicks: [],
      keys: [],
      movement: [],
      scroll: [],
    },
    cumulativeRangeDays: DEFAULT_INPUT_STATS_SETTINGS.cumulativeRangeDays,
    cumulativeTotals: {
      clicks: 0,
      keys: 0,
      movement: 0,
      scroll: 0,
    },
    lastError: null,
  }
}

export function useInputStatsState(): {
  state: InputStatsStateDto
  refresh: () => Promise<InputStatsStateDto>
} {
  const [state, setState] = React.useState<InputStatsStateDto>(getFallbackState)

  React.useEffect(() => {
    const api = getInputStatsApi()
    if (!api) {
      return
    }

    let active = true
    void api
      .getState()
      .then(nextState => {
        if (active) {
          setState(nextState)
        }
      })
      .catch(() => {
        if (active) {
          setState(getFallbackState())
        }
      })

    const unsubscribe = api.onState(nextState => {
      setState(nextState)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const refresh = React.useCallback(async (): Promise<InputStatsStateDto> => {
    const api = getInputStatsApi()
    if (!api) {
      return getFallbackState()
    }

    const nextState = await api.refresh()
    setState(nextState)
    return nextState
  }, [])

  return {
    state,
    refresh,
  }
}
