import React from 'react'
import type { SystemMonitorStateDto } from '@shared/contracts/dto'
import { DEFAULT_SYSTEM_MONITOR_SETTINGS } from '@contexts/plugins/domain/systemMonitorSettings'

function getSystemMonitorApi() {
  return window.freecliApi?.plugins?.systemMonitor
}

function getFallbackState(): SystemMonitorStateDto {
  const now = new Date().toISOString()
  const day = now.slice(0, 10)

  return {
    isEnabled: false,
    isSupported: window.freecliApi?.meta?.platform === 'win32',
    isMonitoring: false,
    status: 'disabled',
    lastUpdatedAt: null,
    settings: DEFAULT_SYSTEM_MONITOR_SETTINGS,
    current: {
      recordedAt: now,
      uploadBytesPerSecond: 0,
      downloadBytesPerSecond: 0,
      cpuUsagePercent: 0,
      memoryUsagePercent: 0,
      gpuUsagePercent: null,
    },
    historyRangeDays: DEFAULT_SYSTEM_MONITOR_SETTINGS.historyRangeDays,
    history: [],
    todayTraffic: {
      day,
      uploadBytes: 0,
      downloadBytes: 0,
    },
    recentDaysTraffic: [],
    lastError: null,
  }
}

export function useSystemMonitorState(): {
  state: SystemMonitorStateDto
  refresh: () => Promise<SystemMonitorStateDto>
} {
  const [state, setState] = React.useState<SystemMonitorStateDto>(getFallbackState)

  React.useEffect(() => {
    const api = getSystemMonitorApi()
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

  const refresh = React.useCallback(async (): Promise<SystemMonitorStateDto> => {
    const api = getSystemMonitorApi()
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
