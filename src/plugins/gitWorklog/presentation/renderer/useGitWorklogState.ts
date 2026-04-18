import React from 'react'
import type { GitWorklogStateDto } from '@shared/contracts/dto'

function getGitWorklogApi() {
  return window.freecliApi?.plugins?.gitWorklog
}

function getFallbackState(): GitWorklogStateDto {
  return {
    isEnabled: false,
    isRefreshing: false,
    status: 'disabled',
    lastUpdatedAt: null,
    configuredRepoCount: 0,
    activeRepoCount: 0,
    successfulRepoCount: 0,
    overview: {
      monitoredRepoCount: 0,
      activeRepoCount: 0,
      healthyRepoCount: 0,
      commitCountToday: 0,
      filesChangedToday: 0,
      additionsToday: 0,
      deletionsToday: 0,
      changedLinesToday: 0,
      commitCountInRange: 0,
      filesChangedInRange: 0,
      additionsInRange: 0,
      deletionsInRange: 0,
      changedLinesInRange: 0,
      totalCodeFiles: 0,
      totalCodeLines: 0,
      dailyPoints: [],
    },
    repos: [],
    lastError: null,
  }
}

export function useGitWorklogState(): {
  state: GitWorklogStateDto
  refresh: () => Promise<GitWorklogStateDto>
} {
  const [state, setState] = React.useState<GitWorklogStateDto>(getFallbackState)

  React.useEffect(() => {
    const api = getGitWorklogApi()
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

  const refresh = React.useCallback(async (): Promise<GitWorklogStateDto> => {
    const api = getGitWorklogApi()
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
