import React from 'react'
import type { QuotaMonitorStateDto } from '@shared/contracts/dto'

function getQuotaMonitorApi() {
  return window.freecliApi?.plugins?.quotaMonitor
}

function getFallbackState(): QuotaMonitorStateDto {
  return {
    isEnabled: false,
    isRefreshing: false,
    status: 'disabled',
    lastUpdatedAt: null,
    configuredProfileCount: 0,
    activeProfileCount: 0,
    successfulProfileCount: 0,
    profiles: [],
    lastError: null,
  }
}

export function useQuotaMonitorState(): {
  state: QuotaMonitorStateDto
  refresh: () => Promise<QuotaMonitorStateDto>
} {
  const [state, setState] = React.useState<QuotaMonitorStateDto>(getFallbackState)

  React.useEffect(() => {
    const api = getQuotaMonitorApi()
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

  const refresh = React.useCallback(async (): Promise<QuotaMonitorStateDto> => {
    const api = getQuotaMonitorApi()
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
