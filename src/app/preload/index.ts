import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC_CHANNELS } from '../../shared/contracts/ipc'
import type {
  AttachTerminalInput,
  AcceptGitWorklogPendingImportInput,
  CopyWorkspacePathInput,
  CreateGitWorktreeInput,
  CreateGitWorktreeResult,
  DismissGitWorklogPendingImportInput,
  DetachTerminalInput,
  EnsureDirectoryInput,
  GetGitDefaultBranchInput,
  GetGitDefaultBranchResult,
  GetGitStatusSummaryInput,
  GetGitStatusSummaryResult,
  KillTerminalInput,
  LaunchAgentInput,
  LaunchAgentResult,
  MaterializeClipboardImageTempFileResult,
  ListInstalledAgentProvidersResult,
  GetAgentExtensionsInput,
  GetAgentExtensionsResult,
  AddAgentMcpServerInput,
  RemoveAgentMcpServerInput,
  CreateAgentSkillInput,
  CreateAgentSkillResult,
  AppUserDataInfo,
  ListGitBranchesInput,
  ListGitBranchesResult,
  ListGitWorktreesInput,
  ListGitWorktreesResult,
  ListAgentModelsInput,
  ListAgentModelsResult,
  ListTerminalProfilesResult,
  ReadAgentLastMessageInput,
  ReadAgentLastMessageResult,
  ResolveAgentResumeSessionInput,
  ResolveAgentResumeSessionResult,
  ResolveGitWorklogRepositoryInput,
  ResolveGitWorklogRepositoryResult,
  ResolveGitHubPullRequestsInput,
  ResolveGitHubPullRequestsResult,
  InputStatsStateDto,
  SystemMonitorStateDto,
  QuotaMonitorStateDto,
  RefreshGitWorklogWorkspaceInput,
  GitWorklogStateDto,
  NotifyOssBackupPersistedSettingsInput,
  OssSyncComparisonDto,
  OssBackupStateDto,
  RepairGitWorklogRepositoriesInput,
  RepairGitWorklogRepositoriesResultDto,
  RestorePluginBackupResultDto,
  RestoreGitWorklogDismissedImportInput,
  SyncWorkspaceAssistantSettingsInput,
  SyncWorkspaceAssistantWorkspaceSnapshotInput,
  SyncInputStatsSettingsInput,
  SyncSystemMonitorSettingsInput,
  SyncOssBackupSettingsInput,
  SyncGitWorklogSettingsInput,
  SyncGitWorklogWorkspacesInput,
  SyncQuotaMonitorSettingsInput,
  SyncPluginRuntimeStateInput,
  SyncPluginRuntimeStateResult,
  UndoGitWorklogRepositoriesRepairInput,
  UndoGitWorklogRepositoriesRepairResultDto,
  WorkspaceAssistantConnectionTestResult,
  WorkspaceAssistantPromptInput,
  WorkspaceAssistantPromptResult,
  WorkspaceAssistantStopPromptResult,
  WorkspaceAssistantStateDto,
  AppUpdateState,
  ConfigureAppUpdatesInput,
  GetCurrentReleaseNotesInput,
  ReleaseNotesCurrentResult,
  ListWorkspacePathOpenersResult,
  OpenWorkspacePathInput,
  PersistWriteResult,
  ReadAppStateResult,
  ReadCanvasImageInput,
  ReadCanvasImageResult,
  WindowDisplayInfo,
  ReadNodeScrollbackInput,
  ResizeTerminalInput,
  RemoveGitWorktreeInput,
  RemoveGitWorktreeResult,
  RenameGitBranchInput,
  SnapshotTerminalInput,
  SnapshotTerminalResult,
  SpawnTerminalInput,
  SpawnTerminalResult,
  TrackHostedTerminalAgentInput,
  SuggestTaskTitleInput,
  SuggestTaskTitleResult,
  SuggestWorktreeNamesInput,
  SuggestWorktreeNamesResult,
  SetWindowChromeThemeInput,
  WriteDiagnosticLogInput,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSessionMetadataEvent,
  TerminalSessionStateEvent,
  WorkspaceDirectory,
  WriteCanvasImageInput,
  WriteAppStateInput,
  WriteNodeScrollbackInput,
  WriteWorkspaceStateRawInput,
  WriteTerminalInput,
  DeleteCanvasImageInput,
  ReadDirectoryInput,
  ReadDirectoryResult,
  ReadFileTextInput,
  ReadFileTextResult,
  StatInput,
  FileSystemStat,
  WriteFileTextInput,
} from '../../shared/contracts/dto'
import { invokeIpc } from './ipcInvoke'

type UnsubscribeFn = () => void

// Custom APIs for renderer
const freecliApi = {
  meta: {
    isDev: process.env.NODE_ENV !== 'test' && process.defaultApp === true,
    isTest: process.env.NODE_ENV === 'test',
    allowWhatsNewInTests: process.env.FREECLI_TEST_WHATS_NEW === '1',
    platform: process.platform,
  },
  appLifecycle: {
    restart: (): Promise<void> => invokeIpc(IPC_CHANNELS.appLifecycleRestart),
    clearUserDataAndRestart: (): Promise<void> =>
      invokeIpc(IPC_CHANNELS.appLifecycleClearUserDataAndRestart),
    getUserDataInfo: (): Promise<AppUserDataInfo> =>
      invokeIpc(IPC_CHANNELS.appLifecycleGetUserDataInfo),
    writeDiagnosticLog: (payload: WriteDiagnosticLogInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.appLifecycleWriteDiagnosticLog, payload),
  },
  windowChrome: {
    setTheme: (payload: SetWindowChromeThemeInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.windowChromeSetTheme, payload),
  },
  windowMetrics: {
    getDisplayInfo: (): Promise<WindowDisplayInfo> =>
      invokeIpc(IPC_CHANNELS.windowMetricsGetDisplayInfo),
  },
  clipboard: {
    readText: (): Promise<string> => invokeIpc(IPC_CHANNELS.clipboardReadText),
    writeText: (text: string): Promise<void> =>
      invokeIpc(IPC_CHANNELS.clipboardWriteText, { text }),
    materializeImageTempFile: (): Promise<MaterializeClipboardImageTempFileResult | null> =>
      invokeIpc(IPC_CHANNELS.clipboardMaterializeImageTempFile),
  },
  filesystem: {
    readFileText: (payload: ReadFileTextInput): Promise<ReadFileTextResult> =>
      invokeIpc(IPC_CHANNELS.filesystemReadFileText, payload),
    writeFileText: (payload: WriteFileTextInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.filesystemWriteFileText, payload),
    readDirectory: (payload: ReadDirectoryInput): Promise<ReadDirectoryResult> =>
      invokeIpc(IPC_CHANNELS.filesystemReadDirectory, payload),
    stat: (payload: StatInput): Promise<FileSystemStat> =>
      invokeIpc(IPC_CHANNELS.filesystemStat, payload),
  },
  persistence: {
    readWorkspaceStateRaw: (): Promise<string | null> =>
      invokeIpc(IPC_CHANNELS.persistenceReadWorkspaceStateRaw),
    writeWorkspaceStateRaw: (payload: WriteWorkspaceStateRawInput): Promise<PersistWriteResult> =>
      invokeIpc(IPC_CHANNELS.persistenceWriteWorkspaceStateRaw, payload),
    readAppState: (): Promise<ReadAppStateResult> =>
      invokeIpc(IPC_CHANNELS.persistenceReadAppState),
    writeAppState: (payload: WriteAppStateInput): Promise<PersistWriteResult> =>
      invokeIpc(IPC_CHANNELS.persistenceWriteAppState, payload),
    readNodeScrollback: (payload: ReadNodeScrollbackInput): Promise<string | null> =>
      invokeIpc(IPC_CHANNELS.persistenceReadNodeScrollback, payload),
    writeNodeScrollback: (payload: WriteNodeScrollbackInput): Promise<PersistWriteResult> =>
      invokeIpc(IPC_CHANNELS.persistenceWriteNodeScrollback, payload),
  },
  workspace: {
    selectDirectory: (): Promise<WorkspaceDirectory | null> =>
      invokeIpc(IPC_CHANNELS.workspaceSelectDirectory),
    ensureDirectory: (payload: EnsureDirectoryInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.workspaceEnsureDirectory, payload),
    copyPath: (payload: CopyWorkspacePathInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.workspaceCopyPath, payload),
    listPathOpeners: (): Promise<ListWorkspacePathOpenersResult> =>
      invokeIpc(IPC_CHANNELS.workspaceListPathOpeners),
    openPath: (payload: OpenWorkspacePathInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.workspaceOpenPath, payload),
    writeCanvasImage: (payload: WriteCanvasImageInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.workspaceWriteCanvasImage, payload),
    readCanvasImage: (payload: ReadCanvasImageInput): Promise<ReadCanvasImageResult | null> =>
      invokeIpc(IPC_CHANNELS.workspaceReadCanvasImage, payload),
    deleteCanvasImage: (payload: DeleteCanvasImageInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.workspaceDeleteCanvasImage, payload),
    resolveDroppedPaths: (files: readonly File[]): string[] =>
      files
        .map(file => webUtils.getPathForFile(file))
        .map(path => path.trim())
        .filter(path => path.length > 0),
  },
  worktree: {
    listBranches: (payload: ListGitBranchesInput): Promise<ListGitBranchesResult> =>
      invokeIpc(IPC_CHANNELS.worktreeListBranches, payload),
    listWorktrees: (payload: ListGitWorktreesInput): Promise<ListGitWorktreesResult> =>
      invokeIpc(IPC_CHANNELS.worktreeListWorktrees, payload),
    statusSummary: (payload: GetGitStatusSummaryInput): Promise<GetGitStatusSummaryResult> =>
      invokeIpc(IPC_CHANNELS.worktreeStatusSummary, payload),
    getDefaultBranch: (payload: GetGitDefaultBranchInput): Promise<GetGitDefaultBranchResult> =>
      invokeIpc(IPC_CHANNELS.worktreeGetDefaultBranch, payload),
    create: (payload: CreateGitWorktreeInput): Promise<CreateGitWorktreeResult> =>
      invokeIpc(IPC_CHANNELS.worktreeCreate, payload),
    remove: (payload: RemoveGitWorktreeInput): Promise<RemoveGitWorktreeResult> =>
      invokeIpc(IPC_CHANNELS.worktreeRemove, payload),
    renameBranch: (payload: RenameGitBranchInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.worktreeRenameBranch, payload),
    suggestNames: (payload: SuggestWorktreeNamesInput): Promise<SuggestWorktreeNamesResult> =>
      invokeIpc(IPC_CHANNELS.worktreeSuggestNames, payload),
  },
  integration: {
    github: {
      resolvePullRequests: (
        payload: ResolveGitHubPullRequestsInput,
      ): Promise<ResolveGitHubPullRequestsResult> =>
        invokeIpc(IPC_CHANNELS.integrationGithubResolvePullRequests, payload),
    },
  },
  plugins: {
    syncRuntimeState: (
      payload: SyncPluginRuntimeStateInput,
    ): Promise<SyncPluginRuntimeStateResult> =>
      invokeIpc(IPC_CHANNELS.pluginsSyncRuntimeState, payload),
    inputStats: {
      syncSettings: (payload: SyncInputStatsSettingsInput): Promise<InputStatsStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsInputStatsSyncSettings, payload),
      getState: (): Promise<InputStatsStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsInputStatsGetState),
      refresh: (): Promise<InputStatsStateDto> => invokeIpc(IPC_CHANNELS.pluginsInputStatsRefresh),
      onState: (listener: (state: InputStatsStateDto) => void): UnsubscribeFn => {
        const handler = (_event: Electron.IpcRendererEvent, payload: InputStatsStateDto) => {
          listener(payload)
        }

        ipcRenderer.on(IPC_CHANNELS.pluginsInputStatsState, handler)

        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.pluginsInputStatsState, handler)
        }
      },
    },
    systemMonitor: {
      syncSettings: (payload: SyncSystemMonitorSettingsInput): Promise<SystemMonitorStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsSystemMonitorSyncSettings, payload),
      getState: (): Promise<SystemMonitorStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsSystemMonitorGetState),
      refresh: (): Promise<SystemMonitorStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsSystemMonitorRefresh),
      onState: (listener: (state: SystemMonitorStateDto) => void): UnsubscribeFn => {
        const handler = (_event: Electron.IpcRendererEvent, payload: SystemMonitorStateDto) => {
          listener(payload)
        }

        ipcRenderer.on(IPC_CHANNELS.pluginsSystemMonitorState, handler)

        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.pluginsSystemMonitorState, handler)
        }
      },
    },
    quotaMonitor: {
      syncSettings: (payload: SyncQuotaMonitorSettingsInput): Promise<QuotaMonitorStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsQuotaMonitorSyncSettings, payload),
      getState: (): Promise<QuotaMonitorStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsQuotaMonitorGetState),
      refresh: (): Promise<QuotaMonitorStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsQuotaMonitorRefresh),
      onState: (listener: (state: QuotaMonitorStateDto) => void): UnsubscribeFn => {
        const handler = (_event: Electron.IpcRendererEvent, payload: QuotaMonitorStateDto) => {
          listener(payload)
        }

        ipcRenderer.on(IPC_CHANNELS.pluginsQuotaMonitorState, handler)

        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.pluginsQuotaMonitorState, handler)
        }
      },
    },
    gitWorklog: {
      syncSettings: (payload: SyncGitWorklogSettingsInput): Promise<GitWorklogStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogSyncSettings, payload),
      syncWorkspaces: (payload: SyncGitWorklogWorkspacesInput): Promise<GitWorklogStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogSyncWorkspaces, payload),
      getState: (): Promise<GitWorklogStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogGetState),
      resolveRepository: (
        payload: ResolveGitWorklogRepositoryInput,
      ): Promise<ResolveGitWorklogRepositoryResult> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogResolveRepository, payload),
      refresh: (): Promise<GitWorklogStateDto> => invokeIpc(IPC_CHANNELS.pluginsGitWorklogRefresh),
      refreshWorkspace: (
        payload: RefreshGitWorklogWorkspaceInput,
      ): Promise<GitWorklogStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogRefreshWorkspace, payload),
      repairRepositories: (
        payload: RepairGitWorklogRepositoriesInput,
      ): Promise<RepairGitWorklogRepositoriesResultDto> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogRepairRepositories, payload),
      undoRepositoryRepair: (
        payload: UndoGitWorklogRepositoriesRepairInput,
      ): Promise<UndoGitWorklogRepositoriesRepairResultDto> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogUndoRepositoryRepair, payload),
      acceptPendingImport: (
        payload: AcceptGitWorklogPendingImportInput,
      ): Promise<GitWorklogStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogAcceptPendingImport, payload),
      dismissPendingImport: (
        payload: DismissGitWorklogPendingImportInput,
      ): Promise<GitWorklogStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogDismissPendingImport, payload),
      restoreDismissedImport: (
        payload: RestoreGitWorklogDismissedImportInput,
      ): Promise<GitWorklogStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsGitWorklogRestoreDismissedImport, payload),
      onState: (listener: (state: GitWorklogStateDto) => void): UnsubscribeFn => {
        const handler = (_event: Electron.IpcRendererEvent, payload: GitWorklogStateDto) => {
          listener(payload)
        }

        ipcRenderer.on(IPC_CHANNELS.pluginsGitWorklogState, handler)

        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.pluginsGitWorklogState, handler)
        }
      },
    },
    ossBackup: {
      syncSettings: (payload: SyncOssBackupSettingsInput): Promise<OssBackupStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsOssBackupSyncSettings, payload),
      getState: (): Promise<OssBackupStateDto> => invokeIpc(IPC_CHANNELS.pluginsOssBackupGetState),
      testConnection: (): Promise<OssBackupStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsOssBackupTestConnection),
      backup: (): Promise<OssBackupStateDto> => invokeIpc(IPC_CHANNELS.pluginsOssBackupBackup),
      getSyncComparison: (): Promise<OssSyncComparisonDto> =>
        invokeIpc(IPC_CHANNELS.pluginsOssBackupGetSyncComparison),
      restore: (): Promise<RestorePluginBackupResultDto> =>
        invokeIpc(IPC_CHANNELS.pluginsOssBackupRestore),
      notifyPersistedSettings: (
        payload: NotifyOssBackupPersistedSettingsInput,
      ): Promise<OssBackupStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsOssBackupNotifyPersistedSettings, payload),
      onState: (listener: (state: OssBackupStateDto) => void): UnsubscribeFn => {
        const handler = (_event: Electron.IpcRendererEvent, payload: OssBackupStateDto) => {
          listener(payload)
        }

        ipcRenderer.on(IPC_CHANNELS.pluginsOssBackupState, handler)

        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.pluginsOssBackupState, handler)
        }
      },
    },
    workspaceAssistant: {
      syncSettings: (
        payload: SyncWorkspaceAssistantSettingsInput,
      ): Promise<WorkspaceAssistantStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsWorkspaceAssistantSyncSettings, payload),
      syncWorkspaceSnapshot: (
        payload: SyncWorkspaceAssistantWorkspaceSnapshotInput,
      ): Promise<WorkspaceAssistantStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsWorkspaceAssistantSyncWorkspaceSnapshot, payload),
      getState: (): Promise<WorkspaceAssistantStateDto> =>
        invokeIpc(IPC_CHANNELS.pluginsWorkspaceAssistantGetState),
      testConnection: (): Promise<WorkspaceAssistantConnectionTestResult> =>
        invokeIpc(IPC_CHANNELS.pluginsWorkspaceAssistantTestConnection),
      prompt: (
        payload: WorkspaceAssistantPromptInput,
      ): Promise<WorkspaceAssistantPromptResult> =>
        invokeIpc(IPC_CHANNELS.pluginsWorkspaceAssistantPrompt, payload),
      stopPrompt: (): Promise<WorkspaceAssistantStopPromptResult> =>
        invokeIpc(IPC_CHANNELS.pluginsWorkspaceAssistantStopPrompt),
      onState: (listener: (state: WorkspaceAssistantStateDto) => void): UnsubscribeFn => {
        const handler = (_event: Electron.IpcRendererEvent, payload: WorkspaceAssistantStateDto) => {
          listener(payload)
        }

        ipcRenderer.on(IPC_CHANNELS.pluginsWorkspaceAssistantState, handler)

        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.pluginsWorkspaceAssistantState, handler)
        }
      },
    },
  },
  update: {
    getState: (): Promise<AppUpdateState> => invokeIpc(IPC_CHANNELS.appUpdateGetState),
    configure: (payload: ConfigureAppUpdatesInput): Promise<AppUpdateState> =>
      invokeIpc(IPC_CHANNELS.appUpdateConfigure, payload),
    checkForUpdates: (): Promise<AppUpdateState> => invokeIpc(IPC_CHANNELS.appUpdateCheck),
    downloadUpdate: (): Promise<AppUpdateState> => invokeIpc(IPC_CHANNELS.appUpdateDownload),
    installUpdate: (): Promise<void> => invokeIpc(IPC_CHANNELS.appUpdateInstall),
    onState: (listener: (state: AppUpdateState) => void): UnsubscribeFn => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AppUpdateState) => {
        listener(payload)
      }

      ipcRenderer.on(IPC_CHANNELS.appUpdateState, handler)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.appUpdateState, handler)
      }
    },
  },
  releaseNotes: {
    getCurrent: (payload: GetCurrentReleaseNotesInput): Promise<ReleaseNotesCurrentResult> =>
      invokeIpc(IPC_CHANNELS.releaseNotesGetCurrent, payload),
  },
  pty: {
    listProfiles: (): Promise<ListTerminalProfilesResult> =>
      invokeIpc(IPC_CHANNELS.ptyListProfiles),
    spawn: (payload: SpawnTerminalInput): Promise<SpawnTerminalResult> =>
      invokeIpc(IPC_CHANNELS.ptySpawn, payload),
    write: (payload: WriteTerminalInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.ptyWrite, payload),
    resize: (payload: ResizeTerminalInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.ptyResize, payload),
    kill: (payload: KillTerminalInput): Promise<void> => invokeIpc(IPC_CHANNELS.ptyKill, payload),
    attach: (payload: AttachTerminalInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.ptyAttach, payload),
    detach: (payload: DetachTerminalInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.ptyDetach, payload),
    snapshot: (payload: SnapshotTerminalInput): Promise<SnapshotTerminalResult> =>
      invokeIpc(IPC_CHANNELS.ptySnapshot, payload),
    trackHostedAgent: (payload: TrackHostedTerminalAgentInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.ptyTrackHostedAgent, payload),
    debugCrashHost: (): Promise<void> => invokeIpc(IPC_CHANNELS.ptyDebugCrashHost),
    onData: (listener: (event: TerminalDataEvent) => void): UnsubscribeFn => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent) => {
        listener(payload)
      }

      ipcRenderer.on(IPC_CHANNELS.ptyData, handler)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ptyData, handler)
      }
    },
    onExit: (listener: (event: TerminalExitEvent) => void): UnsubscribeFn => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent) => {
        listener(payload)
      }

      ipcRenderer.on(IPC_CHANNELS.ptyExit, handler)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ptyExit, handler)
      }
    },
    onState: (listener: (event: TerminalSessionStateEvent) => void): UnsubscribeFn => {
      const handler = (_event: Electron.IpcRendererEvent, payload: TerminalSessionStateEvent) => {
        listener(payload)
      }

      ipcRenderer.on(IPC_CHANNELS.ptyState, handler)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ptyState, handler)
      }
    },
    onMetadata: (listener: (event: TerminalSessionMetadataEvent) => void): UnsubscribeFn => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: TerminalSessionMetadataEvent,
      ) => {
        listener(payload)
      }

      ipcRenderer.on(IPC_CHANNELS.ptySessionMetadata, handler)

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.ptySessionMetadata, handler)
      }
    },
  },
  agent: {
    listModels: (payload: ListAgentModelsInput): Promise<ListAgentModelsResult> =>
      invokeIpc(IPC_CHANNELS.agentListModels, payload),
    listInstalledProviders: (): Promise<ListInstalledAgentProvidersResult> =>
      invokeIpc(IPC_CHANNELS.agentListInstalledProviders),
    launch: (payload: LaunchAgentInput): Promise<LaunchAgentResult> =>
      invokeIpc(IPC_CHANNELS.agentLaunch, payload),
    readLastMessage: (payload: ReadAgentLastMessageInput): Promise<ReadAgentLastMessageResult> =>
      invokeIpc(IPC_CHANNELS.agentReadLastMessage, payload),
    resolveResumeSessionId: (
      payload: ResolveAgentResumeSessionInput,
    ): Promise<ResolveAgentResumeSessionResult> =>
      invokeIpc(IPC_CHANNELS.agentResolveResumeSession, payload),
  },
  agentExtensions: {
    getState: (payload: GetAgentExtensionsInput): Promise<GetAgentExtensionsResult> =>
      invokeIpc(IPC_CHANNELS.agentExtensionsGetState, payload),
    addMcpServer: (payload: AddAgentMcpServerInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.agentExtensionsAddMcpServer, payload),
    removeMcpServer: (payload: RemoveAgentMcpServerInput): Promise<void> =>
      invokeIpc(IPC_CHANNELS.agentExtensionsRemoveMcpServer, payload),
    createSkill: (payload: CreateAgentSkillInput): Promise<CreateAgentSkillResult> =>
      invokeIpc(IPC_CHANNELS.agentExtensionsCreateSkill, payload),
  },
  task: {
    suggestTitle: (payload: SuggestTaskTitleInput): Promise<SuggestTaskTitleResult> =>
      invokeIpc(IPC_CHANNELS.taskSuggestTitle, payload),
  },
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('freecliApi', freecliApi)
} else {
  // @ts-ignore (define in dts)
  window.freecliApi = freecliApi
}
