import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@app/renderer/i18n'
import { SettingsPanel } from '@contexts/settings/presentation/renderer/SettingsPanel'
import {
  DEFAULT_AGENT_SETTINGS,
  type GraphicsMode,
} from '@contexts/settings/domain/agentSettings'
import { toPersistedState } from '@contexts/workspace/presentation/renderer/utils/persistence'
import type { WorkspacePathOpener, WorkspacePathOpenerId } from '@shared/contracts/dto'
import { AppHeader } from './components/AppHeader'
import { AppShellOverlays } from './components/AppShellOverlays'
import { CommandCenter } from './components/CommandCenter'
import { DeleteProjectDialog } from './components/DeleteProjectDialog'
import { ProjectContextMenu } from './components/ProjectContextMenu'
import { Sidebar } from './components/Sidebar'
import { SpaceArchiveRecordsWindow } from './components/SpaceArchiveRecordsWindow'
import { WorkspaceMain } from './components/WorkspaceMain'
import { WorkspaceSearchOverlay } from './components/WorkspaceSearchOverlay'
import { useHydrateAppState } from './hooks/useHydrateAppState'
import { useApplyUiFontScale } from './hooks/useApplyUiFontScale'
import { useApplyUiTheme } from './hooks/useApplyUiTheme'
import { useApplyUiLanguage } from './hooks/useApplyUiLanguage'
import { usePersistedAppState } from './hooks/usePersistedAppState'
import { usePtyWorkspaceRuntimeSync } from './hooks/usePtyWorkspaceRuntimeSync'
import { useProjectContextMenuDismiss } from './hooks/useProjectContextMenuDismiss'
import { useProviderModelCatalog } from './hooks/useProviderModelCatalog'
import { useAppKeybindings } from './hooks/useAppKeybindings'
import { useAddWorkspaceAction } from './hooks/useAddWorkspaceAction'
import { useAgentStandbyNotifications } from './hooks/useAgentStandbyNotifications'
import { useFloatingMessage } from './hooks/useFloatingMessage'
import { useWorkspaceStateHandlers } from './hooks/useWorkspaceStateHandlers'
import { useAppUpdates } from './hooks/useAppUpdates'
import { useWhatsNew } from './hooks/useWhatsNew'
import { PluginControlCenterSlot } from '@contexts/plugins/presentation/renderer/PluginControlCenterSlot'
import { PluginHeaderSlot } from '@contexts/plugins/presentation/renderer/PluginHeaderSlot'
import { PluginManagerPanel } from '@contexts/plugins/presentation/renderer/PluginManagerPanel'
import { PluginWorkspaceOverlaySlot } from '@contexts/plugins/presentation/renderer/PluginWorkspaceOverlaySlot'
import type { BuiltinPluginId } from '@contexts/plugins/domain/pluginManifest'
import type {
  PluginHostDiagnosticCode,
  PluginHostDiagnosticItem,
} from '@contexts/plugins/presentation/renderer/types'
import {
  buildPluginHostSyncTasks,
  resolvePersistedPluginChangeIds,
} from '@contexts/plugins/presentation/renderer/pluginHostSyncRegistry'
import { buildWorkspaceAssistantSnapshot } from '../../../plugins/workspaceAssistant/presentation/renderer/workspaceAssistantContext'
import type { ProjectContextMenuState, WorkspaceMoveIntent } from './types'
import { useAppStore } from './store/useAppStore'
import { toErrorMessage } from './utils/format'
import { removeWorkspace } from './utils/removeWorkspace'
import { WhatsNewDialog } from './components/WhatsNewDialog'
import { formatKeyChord, resolveCommandKeybinding } from '@contexts/settings/domain/keybindings'
import {
  buildArchivedWorkspaceSnapshot,
  buildEnabledWorkspaceSnapshot,
  findNextActiveWorkspaceId,
  isWorkspaceArchived,
  moveWorkspaceIntoLifecycleGroup,
  shutdownWorkspaceRuntime,
} from './utils/workspaceArchive'

export default function App(): React.JSX.Element {
  const { t } = useTranslation()
  const {
    workspaces,
    activeWorkspaceId,
    projectContextMenu,
    projectDeleteConfirmation,
    isRemovingProject,
    agentSettings,
    isSettingsOpen,
    focusRequest,
    setWorkspaces,
    setActiveWorkspaceId,
    setProjectContextMenu,
    setProjectDeleteConfirmation,
    setAgentSettings,
    setIsSettingsOpen,
  } = useAppStore()

  const { isPersistReady } = useHydrateAppState({
    agentSettings,
    workspaces,
    activeWorkspaceId,
    setAgentSettings,
    setWorkspaces,
    setActiveWorkspaceId,
  })

  const { providerModelCatalog } = useProviderModelCatalog({
    isSettingsOpen,
  })

  useApplyUiFontScale(agentSettings.uiFontSize)
  useApplyUiTheme(agentSettings.uiTheme)
  useApplyUiLanguage(agentSettings.language)

  const producePersistedState = useCallback(() => {
    const state = useAppStore.getState()
    return toPersistedState(state.workspaces, state.activeWorkspaceId, state.agentSettings)
  }, [])
  const lastPersistedPluginSettingsRef = React.useRef<typeof agentSettings.plugins | null>(null)

  const { persistNotice, requestPersistFlush, flushPersistNow } = usePersistedAppState({
    workspaces,
    activeWorkspaceId,
    agentSettings,
    isHydrated: isPersistReady,
    producePersistedState,
    onPersistResult: (result, state) => {
      if (!result.ok) {
        return
      }

      const previousPlugins = lastPersistedPluginSettingsRef.current
      if (
        previousPlugins &&
        JSON.stringify(previousPlugins) === JSON.stringify(state.settings.plugins)
      ) {
        return
      }
      lastPersistedPluginSettingsRef.current = state.settings.plugins

      const notifyPersistedSettings = window.freecliApi?.plugins?.ossBackup?.notifyPersistedSettings
      if (typeof notifyPersistedSettings !== 'function') {
        return
      }

      const changedPluginIds = resolvePersistedPluginChangeIds(
        previousPlugins,
        state.settings.plugins,
      )

      if (changedPluginIds.length === 0) {
        return
      }

      void notifyPersistedSettings({ changedPluginIds }).catch(() => {
        // Auto backup should never block local persistence feedback.
      })
    },
  })

  const { floatingMessage, showMessage: handleShowMessage } = useFloatingMessage()
  const { notifications: agentNotifications, dismiss: handleDismissAgentNotification } =
    useAgentStandbyNotifications()
  const [pluginHostDiagnostics, setPluginHostDiagnostics] = useState<PluginHostDiagnosticItem[]>([])
  const pluginHostDiagnosticToastRef = React.useRef(new Map<PluginHostDiagnosticCode, string>())

  usePtyWorkspaceRuntimeSync({ requestPersistFlush })

  const activeWorkspace = useMemo(
    () =>
      workspaces.find(
        workspace => workspace.id === activeWorkspaceId && !isWorkspaceArchived(workspace),
      ) ?? null,
    [activeWorkspaceId, workspaces],
  )
  const isWorkspaceAssistantEnabled = useMemo(
    () => agentSettings.plugins.enabledIds.includes('workspace-assistant'),
    [agentSettings.plugins.enabledIds],
  )
  const workspaceAssistantSnapshot = useMemo(() => {
    if (!isWorkspaceAssistantEnabled) {
      return null
    }

    try {
      return buildWorkspaceAssistantSnapshot(activeWorkspace)
    } catch (error) {
      console.error('[workspace-assistant] failed to build workspace snapshot', error)
      return null
    }
  }, [activeWorkspace, isWorkspaceAssistantEnabled])

  const activeWorkspaceName = activeWorkspace?.name ?? null

  const isPrimarySidebarCollapsed = agentSettings.isPrimarySidebarCollapsed === true

  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState(false)
  const [isControlCenterOpen, setIsControlCenterOpen] = useState(false)
  const [isWorkspaceSearchOpen, setIsWorkspaceSearchOpen] = useState(false)
  const [isSpaceArchivesOpen, setIsSpaceArchivesOpen] = useState(false)
  const [isPluginManagerOpen, setIsPluginManagerOpen] = useState(false)
  const [isRestartingApp, setIsRestartingApp] = useState(false)
  const [pluginManagerInitialPageId, setPluginManagerInitialPageId] = useState<
    'general' | BuiltinPluginId
  >('general')
  const [isFocusNodeTargetZoomPreviewing, setIsFocusNodeTargetZoomPreviewing] = useState(false)
  const [settingsInitialPageId, setSettingsInitialPageId] = useState<'general' | 'integrations'>(
    'general',
  )
  const [appliedGraphicsMode, setAppliedGraphicsMode] = useState<GraphicsMode>(
    DEFAULT_AGENT_SETTINGS.graphicsMode,
  )
  const [hasCapturedAppliedGraphicsMode, setHasCapturedAppliedGraphicsMode] = useState(false)
  const [projectPathOpeners, setProjectPathOpeners] = useState<WorkspacePathOpener[]>([])
  const [isProjectPathOpenersLoading, setIsProjectPathOpenersLoading] = useState(false)
  const pluginHostSyncSignatureRef = React.useRef(new Map<PluginHostDiagnosticCode, string>())
  const workspacePluginSyncItems = useMemo(
    () =>
      workspaces.map(workspace => ({
        id: workspace.id,
        name: workspace.name,
        path: workspace.path,
      })),
    [workspaces],
  )
  const pluginHostSyncTasks = useMemo(
    () =>
      buildPluginHostSyncTasks({
        settings: agentSettings,
        workspaces: workspacePluginSyncItems,
        workspaceAssistantSnapshot,
        api: window.freecliApi,
      }),
    [agentSettings, workspaceAssistantSnapshot, workspacePluginSyncItems],
  )

  const toggleCommandCenter = useCallback((): void => {
    setIsWorkspaceSearchOpen(false)
    setIsControlCenterOpen(false)
    setIsSpaceArchivesOpen(false)
    setIsCommandCenterOpen(open => !open)
  }, [])

  const closeCommandCenter = useCallback((): void => {
    setIsCommandCenterOpen(false)
  }, [])

  const toggleControlCenter = useCallback((): void => {
    setIsCommandCenterOpen(false)
    setIsWorkspaceSearchOpen(false)
    setIsSpaceArchivesOpen(false)
    setIsControlCenterOpen(open => !open)
  }, [])

  const closeControlCenter = useCallback((): void => {
    setIsControlCenterOpen(false)
  }, [])

  const openWorkspaceSearch = useCallback((): void => {
    closeCommandCenter()
    setIsControlCenterOpen(false)
    setIsSpaceArchivesOpen(false)
    setIsWorkspaceSearchOpen(true)
  }, [closeCommandCenter])

  const closeWorkspaceSearch = useCallback((): void => {
    setIsWorkspaceSearchOpen(false)
  }, [])

  const openSpaceArchives = useCallback((): void => {
    closeCommandCenter()
    closeWorkspaceSearch()
    closeControlCenter()
    setIsSpaceArchivesOpen(true)
  }, [closeCommandCenter, closeControlCenter, closeWorkspaceSearch])

  const closeSpaceArchives = useCallback((): void => {
    setIsSpaceArchivesOpen(false)
  }, [])

  const openPluginManager = useCallback(
    (pageId: 'general' | BuiltinPluginId = 'general'): void => {
      closeCommandCenter()
      closeWorkspaceSearch()
      closeControlCenter()
      closeSpaceArchives()
      setIsSettingsOpen(false)
      setPluginManagerInitialPageId(pageId)
      setIsPluginManagerOpen(true)
    },
    [
      closeCommandCenter,
      closeControlCenter,
      closeSpaceArchives,
      closeWorkspaceSearch,
      setIsSettingsOpen,
    ],
  )

  const closePluginManager = useCallback((): void => {
    setIsPluginManagerOpen(false)
  }, [])

  const toggleWorkspaceAssistant = useCallback((): void => {
    setAgentSettings(prev => {
      if (!prev.plugins.enabledIds.includes('workspace-assistant')) {
        return prev
      }

      return {
        ...prev,
        plugins: {
          ...prev.plugins,
          workspaceAssistant: {
            ...prev.plugins.workspaceAssistant,
            dockCollapsed: !prev.plugins.workspaceAssistant.dockCollapsed,
          },
        },
      }
    })
  }, [setAgentSettings])

  const openSettingsPage = useCallback(
    (pageId: 'general' | 'integrations'): void => {
      closeCommandCenter()
      closeWorkspaceSearch()
      closeControlCenter()
      closeSpaceArchives()
      closePluginManager()
      setIsFocusNodeTargetZoomPreviewing(false)
      setSettingsInitialPageId(pageId)
      setIsSettingsOpen(true)
    },
    [
      closeCommandCenter,
      closeControlCenter,
      closePluginManager,
      closeSpaceArchives,
      closeWorkspaceSearch,
      setIsSettingsOpen,
    ],
  )

  useAppKeybindings({
    enabled: !isSettingsOpen && !isPluginManagerOpen && projectDeleteConfirmation === null,
    settings: {
      disableAppShortcutsWhenTerminalFocused: agentSettings.disableAppShortcutsWhenTerminalFocused,
      keybindings: agentSettings.keybindings,
    },
    onToggleCommandCenter: toggleCommandCenter,
    onOpenSettings: () => {
      openSettingsPage('general')
    },
    onTogglePrimarySidebar: () => {
      closeCommandCenter()
      closeWorkspaceSearch()
      closeControlCenter()
      closeSpaceArchives()
      setAgentSettings(prev => ({
        ...prev,
        isPrimarySidebarCollapsed: !prev.isPrimarySidebarCollapsed,
      }))
    },
    onAddProject: () => {
      closeCommandCenter()
      closeWorkspaceSearch()
      closeControlCenter()
      closeSpaceArchives()
      void handleAddWorkspace()
    },
    onOpenWorkspaceSearch: () => {
      openWorkspaceSearch()
    },
  })

  useEffect(() => {
    if (!isSettingsOpen && !isPluginManagerOpen && projectDeleteConfirmation === null) {
      return
    }

    setIsCommandCenterOpen(false)
    setIsWorkspaceSearchOpen(false)
    setIsControlCenterOpen(false)
    setIsSpaceArchivesOpen(false)
  }, [isPluginManagerOpen, isSettingsOpen, projectDeleteConfirmation])

  useEffect(() => {
    if (projectDeleteConfirmation === null) {
      return
    }

    setIsPluginManagerOpen(false)
  }, [projectDeleteConfirmation])

  useEffect(() => {
    if (!isSettingsOpen) {
      setIsFocusNodeTargetZoomPreviewing(false)
    }
  }, [isSettingsOpen])

  useEffect(() => {
    if (!isPersistReady || hasCapturedAppliedGraphicsMode) {
      return
    }

    setAppliedGraphicsMode(agentSettings.graphicsMode)
    setHasCapturedAppliedGraphicsMode(true)
  }, [agentSettings.graphicsMode, hasCapturedAppliedGraphicsMode, isPersistReady])

  useEffect(() => {
    document.title = activeWorkspaceName ? `${activeWorkspaceName} — FreeCli` : 'FreeCli'
  }, [activeWorkspaceName])

  const platform =
    typeof window !== 'undefined' && window.freecliApi?.meta?.platform
      ? window.freecliApi.meta.platform
      : undefined
  const commandCenterBindings = useMemo(
    () =>
      resolveCommandKeybinding({
        commandId: 'commandCenter.toggle',
        overrides: agentSettings.keybindings,
        platform,
      }),
    [agentSettings.keybindings, platform],
  )
  const commandCenterShortcutHint = formatKeyChord(platform, commandCenterBindings) || '—'
  const leftHeaderPluginIds = useMemo(
    () => agentSettings.plugins.enabledIds.filter(pluginId => pluginId === 'system-monitor'),
    [agentSettings.plugins.enabledIds],
  )
  const rightHeaderPluginIds = useMemo(
    () => agentSettings.plugins.enabledIds.filter(pluginId => pluginId !== 'system-monitor'),
    [agentSettings.plugins.enabledIds],
  )

  const reportPluginHostDiagnostic = useCallback(
    (code: PluginHostDiagnosticCode, error: unknown): void => {
      const message = toErrorMessage(error)
      setPluginHostDiagnostics(previous => {
        const existing = previous.find(item => item.code === code)
        if (existing?.message === message) {
          return previous
        }

        const title = t(`pluginManager.hostDiagnostics.items.${code}`)
        const signature = `${code}:${message}`
        if (pluginHostDiagnosticToastRef.current.get(code) !== signature) {
          pluginHostDiagnosticToastRef.current.set(code, signature)
          handleShowMessage(
            t('pluginManager.hostDiagnostics.toast', {
              title,
            }),
            'warning',
          )
        }

        const nextItem: PluginHostDiagnosticItem = { code, message }
        if (!existing) {
          return [...previous, nextItem]
        }

        return previous.map(item => (item.code === code ? nextItem : item))
      })
    },
    [handleShowMessage, t],
  )

  const clearPluginHostDiagnostic = useCallback((code: PluginHostDiagnosticCode): void => {
    pluginHostDiagnosticToastRef.current.delete(code)
    setPluginHostDiagnostics(previous => previous.filter(item => item.code !== code))
  }, [])

  const { updateState, checkForUpdates, downloadUpdate, installUpdate } = useAppUpdates({
    enabled: isPersistReady,
    policy: agentSettings.updatePolicy,
    channel: agentSettings.updateChannel,
    onShowMessage: handleShowMessage,
  })

  const whatsNew = useWhatsNew({
    isPersistReady,
    updateState,
    settings: agentSettings,
    onChangeSettings: setAgentSettings,
  })

  const handleAddWorkspace = useAddWorkspaceAction()

  const {
    handleWorkspaceNodesChange,
    handleWorkspaceViewportChange,
    handleWorkspaceMinimapVisibilityChange,
    handleWorkspaceSpacesChange,
    handleWorkspaceActiveSpaceChange,
    handleWorkspaceSpaceArchiveRecordAppend,
    handleWorkspaceSpaceArchiveRecordRemove,
    handleAnyWorkspaceWorktreesRootChange,
  } = useWorkspaceStateHandlers({ requestPersistFlush })

  const handleRemoveWorkspace = useCallback(async (workspaceId: string): Promise<void> => {
    await removeWorkspace(workspaceId)
  }, [])

  useProjectContextMenuDismiss({
    projectContextMenu,
    setProjectContextMenu,
  })

  useEffect(() => {
    if (!projectContextMenu) {
      setProjectPathOpeners([])
      setIsProjectPathOpenersLoading(false)
      return
    }

    const listPathOpeners = window.freecliApi?.workspace?.listPathOpeners
    if (typeof listPathOpeners !== 'function') {
      setProjectPathOpeners([])
      setIsProjectPathOpenersLoading(false)
      return
    }

    let cancelled = false
    setProjectPathOpeners([])
    setIsProjectPathOpenersLoading(true)

    void listPathOpeners()
      .then(result => {
        if (!cancelled) {
          setProjectPathOpeners(result.openers)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectPathOpeners([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsProjectPathOpenersLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectContextMenu])

  useEffect(() => {
    if (!isPersistReady) {
      pluginHostSyncSignatureRef.current.clear()
      return
    }

    const activeCodes = new Set(pluginHostSyncTasks.map(task => task.code))
    for (const [code] of pluginHostSyncSignatureRef.current) {
      if (activeCodes.has(code)) {
        continue
      }

      pluginHostSyncSignatureRef.current.delete(code)
      clearPluginHostDiagnostic(code)
    }

    for (const task of pluginHostSyncTasks) {
      if (pluginHostSyncSignatureRef.current.get(task.code) === task.signature) {
        continue
      }

      pluginHostSyncSignatureRef.current.set(task.code, task.signature)
      void task
        .run()
        .then(() => {
          clearPluginHostDiagnostic(task.code)
        })
        .catch(error => {
          // Plugin host sync should not block the shell when a plugin runtime or settings bridge fails.
          reportPluginHostDiagnostic(task.code, error)
        })
    }
  }, [clearPluginHostDiagnostic, isPersistReady, pluginHostSyncTasks, reportPluginHostDiagnostic])

  const handleSelectWorkspace = useCallback((workspaceId: string): void => {
    const store = useAppStore.getState()
    const targetWorkspace = store.workspaces.find(workspace => workspace.id === workspaceId)
    if (!targetWorkspace || isWorkspaceArchived(targetWorkspace)) {
      return
    }

    store.setActiveWorkspaceId(workspaceId)
    store.setFocusRequest(null)
  }, [])

  const handleMoveWorkspace = useCallback(
    async ({
      workspaceId,
      targetList,
      anchorWorkspaceId,
      placement,
    }: WorkspaceMoveIntent): Promise<void> => {
      const store = useAppStore.getState()
      const targetWorkspace = store.workspaces.find(workspace => workspace.id === workspaceId)
      if (!targetWorkspace) {
        return
      }

      const targetLifecycleState = targetList === 'archived' ? 'archived' : 'active'
      const isMovingAcrossLifecycle =
        (isWorkspaceArchived(targetWorkspace) ? 'archived' : 'active') !== targetLifecycleState

      const nextWorkspaces = moveWorkspaceIntoLifecycleGroup({
        workspaces: store.workspaces,
        workspaceId,
        targetLifecycleState,
        anchorWorkspaceId,
        placement,
        transformWorkspace:
          targetLifecycleState === 'archived'
            ? buildArchivedWorkspaceSnapshot
            : buildEnabledWorkspaceSnapshot,
      })

      if (nextWorkspaces === store.workspaces) {
        return
      }

      const nextActiveWorkspaceId =
        targetLifecycleState === 'archived' && store.activeWorkspaceId === workspaceId
          ? findNextActiveWorkspaceId(nextWorkspaces, workspaceId)
          : store.activeWorkspaceId

      store.setWorkspaces(nextWorkspaces)
      store.setActiveWorkspaceId(nextActiveWorkspaceId)
      if (nextActiveWorkspaceId !== store.activeWorkspaceId) {
        store.setFocusRequest(null)
      }
      requestPersistFlush()

      if (isMovingAcrossLifecycle && targetLifecycleState === 'archived') {
        await shutdownWorkspaceRuntime(targetWorkspace)
      }
    },
    [requestPersistFlush],
  )

  const handleSelectAgentNode = useCallback((workspaceId: string, nodeId: string): void => {
    const store = useAppStore.getState()
    const targetWorkspace = store.workspaces.find(workspace => workspace.id === workspaceId)
    if (!targetWorkspace || isWorkspaceArchived(targetWorkspace)) {
      return
    }

    store.setActiveWorkspaceId(workspaceId)
    store.setFocusRequest(prev => ({
      workspaceId,
      nodeId,
      sequence: (prev?.sequence ?? 0) + 1,
    }))
  }, [])

  const handleToggleWorkspaceArchive = useCallback(
    async (workspaceId: string): Promise<void> => {
      const store = useAppStore.getState()
      const targetWorkspace = store.workspaces.find(workspace => workspace.id === workspaceId)
      if (!targetWorkspace) {
        store.setProjectContextMenu(null)
        return
      }

      if (isWorkspaceArchived(targetWorkspace)) {
        store.setProjectContextMenu(null)
        await handleMoveWorkspace({
          workspaceId,
          targetList: 'active',
          anchorWorkspaceId: null,
          placement: 'after',
        })
        return
      }

      store.setProjectContextMenu(null)
      await handleMoveWorkspace({
        workspaceId,
        targetList: 'archived',
        anchorWorkspaceId: null,
        placement: 'after',
      })
    },
    [handleMoveWorkspace],
  )

  const handleRequestRemoveProject = useCallback((workspaceId: string): void => {
    const store = useAppStore.getState()
    const targetWorkspace = store.workspaces.find(workspace => workspace.id === workspaceId)
    if (!targetWorkspace) {
      store.setProjectContextMenu(null)
      return
    }

    store.setProjectDeleteConfirmation({
      workspaceId: targetWorkspace.id,
      workspaceName: targetWorkspace.name,
    })
    store.setProjectContextMenu(null)
  }, [])

  const handleOpenProjectPath = useCallback(
    async (workspaceId: string, openerId: WorkspacePathOpenerId): Promise<void> => {
      const openPath = window.freecliApi?.workspace?.openPath
      if (typeof openPath !== 'function') {
        return
      }

      const targetWorkspace = useAppStore
        .getState()
        .workspaces.find(workspace => workspace.id === workspaceId)
      if (!targetWorkspace) {
        useAppStore.getState().setProjectContextMenu(null)
        return
      }

      try {
        await openPath({
          path: targetWorkspace.path,
          openerId,
        })
      } catch (error) {
        handleShowMessage(
          t('messages.projectOpenFailed', { message: toErrorMessage(error) }),
          'error',
        )
      } finally {
        useAppStore.getState().setProjectContextMenu(null)
      }
    },
    [handleShowMessage, t],
  )

  const handleRestartApp = useCallback(async (): Promise<void> => {
    if (isRestartingApp) {
      return
    }

    setIsRestartingApp(true)

    try {
      await flushPersistNow()
      await window.freecliApi.appLifecycle.restart()
    } catch (error) {
      setIsRestartingApp(false)
      handleShowMessage(
        t('settingsPanel.general.graphicsModeRestartFailed', {
          message: toErrorMessage(error),
        }),
        'error',
      )
    }
  }, [flushPersistNow, handleShowMessage, isRestartingApp, t])

  return (
    <>
      <div
        className={`app-shell ${isPrimarySidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''}`}
      >
        <AppHeader
          activeWorkspaceName={activeWorkspace?.name ?? null}
          activeWorkspacePath={activeWorkspace?.path ?? null}
          isSidebarCollapsed={isPrimarySidebarCollapsed}
          isControlCenterOpen={isControlCenterOpen}
          isCommandCenterOpen={isCommandCenterOpen}
          commandCenterShortcutHint={commandCenterShortcutHint}
          updateState={updateState}
          onToggleSidebar={() => {
            setAgentSettings(prev => ({
              ...prev,
              isPrimarySidebarCollapsed: !prev.isPrimarySidebarCollapsed,
            }))
          }}
          onToggleControlCenter={() => {
            toggleControlCenter()
          }}
          onToggleCommandCenter={() => {
            toggleCommandCenter()
          }}
          onOpenPlugins={() => {
            openPluginManager('general')
          }}
          onOpenSettings={() => {
            openSettingsPage('general')
          }}
          onCheckForUpdates={() => {
            void checkForUpdates()
          }}
          onDownloadUpdate={() => {
            void downloadUpdate()
          }}
          onInstallUpdate={() => {
            void installUpdate()
          }}
          leftHeaderWidgets={
            leftHeaderPluginIds.length > 0 ? (
              <PluginHeaderSlot
                enabledPluginIds={leftHeaderPluginIds}
                onOpenPluginManager={pageId => {
                  openPluginManager(pageId ?? 'general')
                }}
              />
            ) : null
          }
          rightHeaderWidgets={
            rightHeaderPluginIds.length > 0 ? (
              <PluginHeaderSlot
                enabledPluginIds={rightHeaderPluginIds}
                onOpenPluginManager={pageId => {
                  openPluginManager(pageId ?? 'general')
                }}
                onToggleWorkspaceAssistant={toggleWorkspaceAssistant}
              />
            ) : null
          }
        />

        {isPrimarySidebarCollapsed ? null : (
          <Sidebar
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            persistNotice={persistNotice}
            onAddWorkspace={() => {
              void handleAddWorkspace()
            }}
            onSelectWorkspace={workspaceId => {
              handleSelectWorkspace(workspaceId)
            }}
            onMoveWorkspace={intent => {
              void handleMoveWorkspace(intent)
            }}
            onOpenProjectContextMenu={(state: ProjectContextMenuState) => {
              setProjectContextMenu(state)
            }}
            onSelectAgentNode={(workspaceId, nodeId) => {
              handleSelectAgentNode(workspaceId, nodeId)
            }}
          />
        )}

        <WorkspaceMain
          activeWorkspace={activeWorkspace}
          agentSettings={agentSettings}
          focusRequest={focusRequest}
          isFocusNodeTargetZoomPreviewing={isSettingsOpen && isFocusNodeTargetZoomPreviewing}
          shortcutsEnabled={
            !isSettingsOpen &&
            !isPluginManagerOpen &&
            !isCommandCenterOpen &&
            !isControlCenterOpen &&
            !isWorkspaceSearchOpen &&
            !isSpaceArchivesOpen &&
            projectDeleteConfirmation === null
          }
          onAddWorkspace={() => {
            void handleAddWorkspace()
          }}
          onShowMessage={handleShowMessage}
          onRequestPersistFlush={requestPersistFlush}
          onFlushPersistNow={flushPersistNow}
          onAppendSpaceArchiveRecord={handleWorkspaceSpaceArchiveRecordAppend}
          onNodesChange={handleWorkspaceNodesChange}
          onViewportChange={handleWorkspaceViewportChange}
          onMinimapVisibilityChange={handleWorkspaceMinimapVisibilityChange}
          onSpacesChange={handleWorkspaceSpacesChange}
          onActiveSpaceChange={handleWorkspaceActiveSpaceChange}
        />

        <WorkspaceSearchOverlay
          isOpen={isWorkspaceSearchOpen}
          activeWorkspace={activeWorkspace}
          onClose={closeWorkspaceSearch}
          onSelectSpace={spaceId => {
            handleWorkspaceActiveSpaceChange(spaceId)
          }}
          panelWidth={agentSettings.workspaceSearchPanelWidth}
          onPanelWidthChange={nextWidth => {
            setAgentSettings(prev => ({
              ...prev,
              workspaceSearchPanelWidth: nextWidth,
            }))
          }}
        />
      </div>

      <AppShellOverlays
        floatingMessage={floatingMessage}
        notifications={agentNotifications}
        dismissNotification={handleDismissAgentNotification}
        onFocusAgentNode={handleSelectAgentNode}
        agentSettings={agentSettings}
        setAgentSettings={setAgentSettings}
        activeWorkspace={activeWorkspace}
        isPrimarySidebarCollapsed={isPrimarySidebarCollapsed}
        isControlCenterOpen={isControlCenterOpen}
        onCloseControlCenter={closeControlCenter}
        onMinimapVisibilityChange={handleWorkspaceMinimapVisibilityChange}
        onOpenSettings={() => {
          openSettingsPage('general')
        }}
        pluginControlCenterWidgets={
          agentSettings.plugins.enabledIds.length > 0 ? (
            <PluginControlCenterSlot
              enabledPluginIds={agentSettings.plugins.enabledIds}
              onOpenPluginManager={pageId => {
                openPluginManager(pageId ?? 'general')
              }}
            />
          ) : null
        }
        pluginWorkspaceOverlays={
          agentSettings.plugins.enabledIds.length > 0 ? (
            <PluginWorkspaceOverlaySlot
              enabledPluginIds={agentSettings.plugins.enabledIds}
              activeWorkspaceId={activeWorkspaceId}
              onOpenPluginManager={pageId => {
                openPluginManager(pageId ?? 'general')
              }}
              onShowMessage={handleShowMessage}
            />
          ) : null
        }
      />

      <CommandCenter
        isOpen={isCommandCenterOpen}
        activeWorkspace={activeWorkspace}
        workspaces={workspaces}
        isPrimarySidebarCollapsed={isPrimarySidebarCollapsed}
        onClose={() => {
          closeCommandCenter()
        }}
        onOpenSettings={() => {
          openSettingsPage('general')
        }}
        onOpenSpaceArchives={() => {
          openSpaceArchives()
        }}
        onTogglePrimarySidebar={() => {
          setAgentSettings(prev => ({
            ...prev,
            isPrimarySidebarCollapsed: !prev.isPrimarySidebarCollapsed,
          }))
        }}
        onAddWorkspace={() => {
          void handleAddWorkspace()
        }}
        onSelectWorkspace={workspaceId => {
          handleSelectWorkspace(workspaceId)
        }}
        onSelectSpace={spaceId => {
          handleWorkspaceActiveSpaceChange(spaceId)
        }}
      />

      <SpaceArchiveRecordsWindow
        isOpen={isSpaceArchivesOpen}
        workspace={activeWorkspace}
        canvasInputModeSetting={agentSettings.canvasInputMode}
        onDeleteRecord={handleWorkspaceSpaceArchiveRecordRemove}
        onClose={closeSpaceArchives}
      />

      {projectContextMenu ? (
        <ProjectContextMenu
          workspaceId={projectContextMenu.workspaceId}
          x={projectContextMenu.x}
          y={projectContextMenu.y}
          availableOpeners={projectPathOpeners}
          isLoadingOpeners={isProjectPathOpenersLoading}
          isArchived={
            workspaces.find(workspace => workspace.id === projectContextMenu.workspaceId)
              ?.lifecycleState === 'archived'
          }
          onOpenPath={(workspaceId, openerId) => {
            void handleOpenProjectPath(workspaceId, openerId)
          }}
          onToggleArchive={workspaceId => {
            void handleToggleWorkspaceArchive(workspaceId)
          }}
          onRequestRemove={workspaceId => {
            handleRequestRemoveProject(workspaceId)
          }}
        />
      ) : null}

      {projectDeleteConfirmation ? (
        <DeleteProjectDialog
          workspaceName={projectDeleteConfirmation.workspaceName}
          isRemoving={isRemovingProject}
          onCancel={() => {
            setProjectDeleteConfirmation(null)
          }}
          onConfirm={() => {
            void handleRemoveWorkspace(projectDeleteConfirmation.workspaceId)
          }}
        />
      ) : null}

      {isSettingsOpen ? (
        <SettingsPanel
          settings={agentSettings}
          appliedGraphicsMode={appliedGraphicsMode}
          updateState={updateState}
          isRestartingApp={isRestartingApp}
          modelCatalogByProvider={providerModelCatalog}
          workspaces={workspaces}
          onWorkspaceWorktreesRootChange={(id, root) => {
            handleAnyWorkspaceWorktreesRootChange(id, root)
          }}
          isFocusNodeTargetZoomPreviewing={isFocusNodeTargetZoomPreviewing}
          onFocusNodeTargetZoomPreviewChange={setIsFocusNodeTargetZoomPreviewing}
          initialPageId={settingsInitialPageId}
          onChange={next => {
            setAgentSettings(next)
          }}
          onCheckForUpdates={() => {
            void checkForUpdates()
          }}
          onDownloadUpdate={() => {
            void downloadUpdate()
          }}
          onInstallUpdate={() => {
            void installUpdate()
          }}
          onRestartApp={() => {
            void handleRestartApp()
          }}
          onClose={() => {
            flushPersistNow()
            setIsFocusNodeTargetZoomPreviewing(false)
            setIsSettingsOpen(false)
          }}
        />
      ) : null}
      <PluginManagerPanel
        isOpen={isPluginManagerOpen}
        initialPageId={pluginManagerInitialPageId}
        settings={agentSettings}
        diagnostics={pluginHostDiagnostics}
        onChange={next => {
          setAgentSettings(next)
        }}
        onFlushPersistNow={flushPersistNow}
        onClose={() => {
          flushPersistNow()
          setIsPluginManagerOpen(false)
        }}
      />
      <WhatsNewDialog
        isOpen={whatsNew.isOpen}
        fromVersion={whatsNew.fromVersion}
        toVersion={whatsNew.toVersion}
        notes={whatsNew.notes}
        isLoading={whatsNew.isLoading}
        error={whatsNew.error}
        compareUrl={whatsNew.compareUrl}
        onClose={() => {
          whatsNew.close()
        }}
      />
    </>
  )
}
