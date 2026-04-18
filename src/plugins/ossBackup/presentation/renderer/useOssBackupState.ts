import React from 'react'
import type {
  OssBackupStateDto,
  OssSyncComparisonDto,
  RestorePluginBackupResultDto,
} from '@shared/contracts/dto'

function getOssBackupApi() {
  return window.freecliApi?.plugins?.ossBackup
}

function getFallbackState(): OssBackupStateDto {
  return {
    isEnabled: false,
    status: 'disabled',
    isTestingConnection: false,
    isBackingUp: false,
    isRestoring: false,
    nextAutoBackupDueAt: null,
    lastBackupAt: null,
    lastRestoreAt: null,
    lastSnapshotAt: null,
    includedPluginIds: [],
    lastError: null,
  }
}

export function useOssBackupState(): {
  state: OssBackupStateDto
  testConnection: () => Promise<OssBackupStateDto>
  backup: () => Promise<OssBackupStateDto>
  getSyncComparison: () => Promise<OssSyncComparisonDto | null>
  restore: () => Promise<{ result: RestorePluginBackupResultDto; state: OssBackupStateDto } | null>
} {
  const [state, setState] = React.useState<OssBackupStateDto>(getFallbackState)

  React.useEffect(() => {
    const api = getOssBackupApi()
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

  const testConnection = React.useCallback(async (): Promise<OssBackupStateDto> => {
    const api = getOssBackupApi()
    if (!api) {
      return getFallbackState()
    }

    const nextState = await api.testConnection()
    setState(nextState)
    return nextState
  }, [])

  const backup = React.useCallback(async (): Promise<OssBackupStateDto> => {
    const api = getOssBackupApi()
    if (!api) {
      return getFallbackState()
    }

    const nextState = await api.backup()
    setState(nextState)
    return nextState
  }, [])

  const restore = React.useCallback(async (): Promise<{
    result: RestorePluginBackupResultDto
    state: OssBackupStateDto
  } | null> => {
    const api = getOssBackupApi()
    if (!api) {
      return null
    }

    const result = await api.restore()
    const nextState = await api.getState()
    setState(nextState)
    return { result, state: nextState }
  }, [])

  const getSyncComparison = React.useCallback(async (): Promise<OssSyncComparisonDto | null> => {
    const api = getOssBackupApi()
    if (!api) {
      return null
    }
    return await api.getSyncComparison()
  }, [])

  return {
    state,
    testConnection,
    backup,
    getSyncComparison,
    restore,
  }
}
