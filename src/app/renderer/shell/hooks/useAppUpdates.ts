import React from 'react'
import type { AppUpdateChannel, AppUpdatePolicy, AppUpdateState } from '@shared/contracts/dto'

interface UseAppUpdatesInput {
  enabled: boolean
  policy: AppUpdatePolicy
  channel: AppUpdateChannel
  onShowMessage: (message: string, tone?: 'info' | 'warning' | 'error') => void
}

function getUpdateApi() {
  return window.freecliApi?.update
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return 'Unknown error'
}

export function useAppUpdates({
  enabled,
  policy,
  channel,
  onShowMessage,
}: UseAppUpdatesInput): {
  updateState: AppUpdateState | null
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
} {
  const [updateState, setUpdateState] = React.useState<AppUpdateState | null>(null)

  const handleError = React.useCallback(
    (error: unknown) => {
      onShowMessage(getErrorMessage(error), 'error')
    },
    [onShowMessage],
  )

  React.useEffect(() => {
    if (!enabled) {
      return
    }

    const api = getUpdateApi()
    if (!api) {
      return
    }

    let active = true

    void api
      .getState()
      .then(state => {
        if (active) {
          setUpdateState(state)
        }
      })
      .catch(handleError)

    const unsubscribe = api.onState(state => {
      setUpdateState(state)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [enabled, handleError])

  React.useEffect(() => {
    if (!enabled) {
      return
    }

    const api = getUpdateApi()
    if (!api) {
      return
    }

    void api
      .configure({ policy, channel })
      .then(state => {
        setUpdateState(state)
      })
      .catch(handleError)
  }, [channel, enabled, handleError, policy])

  const checkForUpdates = React.useCallback(async (): Promise<void> => {
    const api = getUpdateApi()
    if (!api) {
      return
    }

    try {
      setUpdateState(await api.checkForUpdates())
    } catch (error) {
      handleError(error)
    }
  }, [handleError])

  const downloadUpdate = React.useCallback(async (): Promise<void> => {
    const api = getUpdateApi()
    if (!api) {
      return
    }

    try {
      setUpdateState(await api.downloadUpdate())
    } catch (error) {
      handleError(error)
    }
  }, [handleError])

  const installUpdate = React.useCallback(async (): Promise<void> => {
    const api = getUpdateApi()
    if (!api) {
      return
    }

    try {
      await api.installUpdate()
    } catch (error) {
      handleError(error)
    }
  }, [handleError])

  return {
    updateState,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  }
}
