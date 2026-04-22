import React from 'react'
import { useAppStore } from '@app/renderer/shell/store/useAppStore'
import type {
  WorkspaceAssistantWorkspaceSnapshotDto,
  WorkspaceAssistantPromptResult,
  WorkspaceAssistantStopPromptResult,
  WorkspaceAssistantStateDto,
} from '@shared/contracts/dto'
import {
  buildWorkspaceAssistantFallbackState,
  buildWorkspaceAssistantInsights,
  buildWorkspaceAssistantSnapshot,
} from './workspaceAssistantContext'
import { useWorkspaceAssistantProjectContext } from './useWorkspaceAssistantProjectContext'

function getWorkspaceAssistantApi() {
  return window.freecliApi?.plugins?.workspaceAssistant
}

export function useWorkspaceAssistantState(): {
  state: WorkspaceAssistantStateDto
  snapshot: WorkspaceAssistantWorkspaceSnapshotDto | null
  sendPrompt: (prompt: string) => Promise<WorkspaceAssistantPromptResult>
  stopPrompt: () => Promise<WorkspaceAssistantStopPromptResult>
} {
  const workspaces = useAppStore(state => state.workspaces)
  const activeWorkspaceId = useAppStore(state => state.activeWorkspaceId)
  const settings = useAppStore(state => state.agentSettings.plugins.workspaceAssistant)
  const isPluginEnabled = useAppStore(state =>
    state.agentSettings.plugins.enabledIds.includes('workspace-assistant'),
  )

  const activeWorkspace = React.useMemo(
    () => workspaces.find(workspace => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspaces],
  )
  const { projectFiles, projectSummary } = useWorkspaceAssistantProjectContext(
    activeWorkspace?.path ?? null,
    isPluginEnabled && settings.allowProjectScan,
  )
  const derivedSnapshot = React.useMemo(
    () => buildWorkspaceAssistantSnapshot(activeWorkspace, projectFiles, projectSummary),
    [activeWorkspace, projectFiles, projectSummary],
  )
  const derivedInsights = React.useMemo(
    () => buildWorkspaceAssistantInsights(derivedSnapshot),
    [derivedSnapshot],
  )
  const [remoteState, setRemoteState] = React.useState<WorkspaceAssistantStateDto>(
    buildWorkspaceAssistantFallbackState,
  )

  React.useEffect(() => {
    const api = getWorkspaceAssistantApi()
    if (!api) {
      return
    }

    let active = true
    void api
      .getState()
      .then(nextState => {
        if (active) {
          setRemoteState(nextState)
        }
      })
      .catch(() => {
        if (active) {
          setRemoteState(buildWorkspaceAssistantFallbackState())
        }
      })

    const unsubscribe = api.onState(nextState => {
      setRemoteState(nextState)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const state = React.useMemo<WorkspaceAssistantStateDto>(
    () => ({
      ...remoteState,
      isEnabled: isPluginEnabled,
      isDockCollapsed: settings.dockCollapsed,
      isAutoOpenOnStartup: settings.autoOpenOnStartup,
      status: isPluginEnabled ? remoteState.status : 'disabled',
      lastUpdatedAt: remoteState.lastUpdatedAt,
      currentWorkspace: derivedSnapshot,
      insights: derivedInsights,
      unreadInsights: derivedInsights.filter(insight => insight.tone === 'urgent').length,
      settings,
    }),
    [derivedInsights, derivedSnapshot, isPluginEnabled, remoteState, settings],
  )

  const sendPrompt = React.useCallback(
    async (prompt: string): Promise<WorkspaceAssistantPromptResult> => {
      const api = getWorkspaceAssistantApi()
      if (api) {
        if (typeof api.syncSettings === 'function') {
          await api.syncSettings({
            settings,
          })
        }

        return await api.prompt({
          prompt,
          workspaceId: activeWorkspaceId,
          workspaceSnapshot: derivedSnapshot,
        })
      }

      throw new Error('工作流助手插件 API 不可用，请先确认插件已正确启用。')
    },
    [activeWorkspaceId, derivedSnapshot, settings],
  )

  const stopPrompt = React.useCallback(async (): Promise<WorkspaceAssistantStopPromptResult> => {
    const api = getWorkspaceAssistantApi()
    if (!api || typeof api.stopPrompt !== 'function') {
      throw new Error('工作流助手插件 API 不可用，请先确认插件已正确启用。')
    }

    return await api.stopPrompt()
  }, [])

  return { state, snapshot: derivedSnapshot, sendPrompt, stopPrompt }
}
