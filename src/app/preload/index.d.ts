import type {
  AttachTerminalInput,
  CopyWorkspacePathInput,
  CreateGitWorktreeInput,
  CreateGitWorktreeResult,
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
  ListGitBranchesInput,
  ListGitBranchesResult,
  ListGitWorktreesInput,
  ListGitWorktreesResult,
  ListAgentModelsInput,
  ListAgentModelsResult,
  ListInstalledAgentProvidersResult,
  GetAgentExtensionsInput,
  GetAgentExtensionsResult,
  AddAgentMcpServerInput,
  RemoveAgentMcpServerInput,
  CreateAgentSkillInput,
  CreateAgentSkillResult,
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
  GitWorklogStateDto,
  NotifyOssBackupPersistedSettingsInput,
  OssSyncComparisonDto,
  OssBackupStateDto,
  RestorePluginBackupResultDto,
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

type UnsubscribeFn = () => void

export interface FreeCliApi {
  meta: {
    isDev: boolean
    isTest: boolean
    allowWhatsNewInTests: boolean
    platform: string
  }
  appLifecycle: {
    restart: () => Promise<void>
  }
  windowChrome: {
    setTheme: (payload: SetWindowChromeThemeInput) => Promise<void>
  }
  windowMetrics: {
    getDisplayInfo: () => Promise<WindowDisplayInfo>
  }
  clipboard: {
    readText: () => Promise<string>
    writeText: (text: string) => Promise<void>
    materializeImageTempFile: () => Promise<MaterializeClipboardImageTempFileResult | null>
  }
  filesystem: {
    readFileText: (payload: ReadFileTextInput) => Promise<ReadFileTextResult>
    writeFileText: (payload: WriteFileTextInput) => Promise<void>
    readDirectory: (payload: ReadDirectoryInput) => Promise<ReadDirectoryResult>
    stat: (payload: StatInput) => Promise<FileSystemStat>
  }
  persistence: {
    readWorkspaceStateRaw: () => Promise<string | null>
    writeWorkspaceStateRaw: (payload: WriteWorkspaceStateRawInput) => Promise<PersistWriteResult>
    readAppState: () => Promise<ReadAppStateResult>
    writeAppState: (payload: WriteAppStateInput) => Promise<PersistWriteResult>
    readNodeScrollback: (payload: ReadNodeScrollbackInput) => Promise<string | null>
    writeNodeScrollback: (payload: WriteNodeScrollbackInput) => Promise<PersistWriteResult>
  }
  workspace: {
    selectDirectory: () => Promise<WorkspaceDirectory | null>
    ensureDirectory: (payload: EnsureDirectoryInput) => Promise<void>
    copyPath: (payload: CopyWorkspacePathInput) => Promise<void>
    listPathOpeners: () => Promise<ListWorkspacePathOpenersResult>
    openPath: (payload: OpenWorkspacePathInput) => Promise<void>
    writeCanvasImage: (payload: WriteCanvasImageInput) => Promise<void>
    readCanvasImage: (payload: ReadCanvasImageInput) => Promise<ReadCanvasImageResult | null>
    deleteCanvasImage: (payload: DeleteCanvasImageInput) => Promise<void>
    resolveDroppedPaths: (files: readonly File[]) => string[]
  }
  worktree: {
    listBranches: (payload: ListGitBranchesInput) => Promise<ListGitBranchesResult>
    listWorktrees: (payload: ListGitWorktreesInput) => Promise<ListGitWorktreesResult>
    statusSummary: (payload: GetGitStatusSummaryInput) => Promise<GetGitStatusSummaryResult>
    getDefaultBranch: (payload: GetGitDefaultBranchInput) => Promise<GetGitDefaultBranchResult>
    create: (payload: CreateGitWorktreeInput) => Promise<CreateGitWorktreeResult>
    remove: (payload: RemoveGitWorktreeInput) => Promise<RemoveGitWorktreeResult>
    renameBranch: (payload: RenameGitBranchInput) => Promise<void>
    suggestNames: (payload: SuggestWorktreeNamesInput) => Promise<SuggestWorktreeNamesResult>
  }
  integration: {
    github: {
      resolvePullRequests: (
        payload: ResolveGitHubPullRequestsInput,
      ) => Promise<ResolveGitHubPullRequestsResult>
    }
  }
  plugins: {
    syncRuntimeState: (
      payload: SyncPluginRuntimeStateInput,
    ) => Promise<SyncPluginRuntimeStateResult>
    inputStats: {
      syncSettings: (payload: SyncInputStatsSettingsInput) => Promise<InputStatsStateDto>
      getState: () => Promise<InputStatsStateDto>
      refresh: () => Promise<InputStatsStateDto>
      onState: (listener: (state: InputStatsStateDto) => void) => UnsubscribeFn
    }
    systemMonitor: {
      syncSettings: (payload: SyncSystemMonitorSettingsInput) => Promise<SystemMonitorStateDto>
      getState: () => Promise<SystemMonitorStateDto>
      refresh: () => Promise<SystemMonitorStateDto>
      onState: (listener: (state: SystemMonitorStateDto) => void) => UnsubscribeFn
    }
    quotaMonitor: {
      syncSettings: (payload: SyncQuotaMonitorSettingsInput) => Promise<QuotaMonitorStateDto>
      getState: () => Promise<QuotaMonitorStateDto>
      refresh: () => Promise<QuotaMonitorStateDto>
      onState: (listener: (state: QuotaMonitorStateDto) => void) => UnsubscribeFn
    }
    gitWorklog: {
      syncSettings: (payload: SyncGitWorklogSettingsInput) => Promise<GitWorklogStateDto>
      syncWorkspaces: (payload: SyncGitWorklogWorkspacesInput) => Promise<GitWorklogStateDto>
      getState: () => Promise<GitWorklogStateDto>
      resolveRepository: (
        payload: ResolveGitWorklogRepositoryInput,
      ) => Promise<ResolveGitWorklogRepositoryResult>
      refresh: () => Promise<GitWorklogStateDto>
      onState: (listener: (state: GitWorklogStateDto) => void) => UnsubscribeFn
    }
    ossBackup: {
      syncSettings: (payload: SyncOssBackupSettingsInput) => Promise<OssBackupStateDto>
      getState: () => Promise<OssBackupStateDto>
      testConnection: () => Promise<OssBackupStateDto>
      backup: () => Promise<OssBackupStateDto>
      getSyncComparison: () => Promise<OssSyncComparisonDto>
      restore: () => Promise<RestorePluginBackupResultDto>
      notifyPersistedSettings: (
        payload: NotifyOssBackupPersistedSettingsInput,
      ) => Promise<OssBackupStateDto>
      onState: (listener: (state: OssBackupStateDto) => void) => UnsubscribeFn
    }
    workspaceAssistant: {
      syncSettings: (
        payload: SyncWorkspaceAssistantSettingsInput,
      ) => Promise<WorkspaceAssistantStateDto>
      syncWorkspaceSnapshot: (
        payload: SyncWorkspaceAssistantWorkspaceSnapshotInput,
      ) => Promise<WorkspaceAssistantStateDto>
      getState: () => Promise<WorkspaceAssistantStateDto>
      testConnection: () => Promise<WorkspaceAssistantConnectionTestResult>
      prompt: (payload: WorkspaceAssistantPromptInput) => Promise<WorkspaceAssistantPromptResult>
      stopPrompt: () => Promise<WorkspaceAssistantStopPromptResult>
      onState: (listener: (state: WorkspaceAssistantStateDto) => void) => UnsubscribeFn
    }
  }
  update: {
    getState: () => Promise<AppUpdateState>
    configure: (payload: ConfigureAppUpdatesInput) => Promise<AppUpdateState>
    checkForUpdates: () => Promise<AppUpdateState>
    downloadUpdate: () => Promise<AppUpdateState>
    installUpdate: () => Promise<void>
    onState: (listener: (state: AppUpdateState) => void) => UnsubscribeFn
  }
  releaseNotes: {
    getCurrent: (payload: GetCurrentReleaseNotesInput) => Promise<ReleaseNotesCurrentResult>
  }
  pty: {
    listProfiles?: () => Promise<ListTerminalProfilesResult>
    spawn: (payload: SpawnTerminalInput) => Promise<SpawnTerminalResult>
    write: (payload: WriteTerminalInput) => Promise<void>
    resize: (payload: ResizeTerminalInput) => Promise<void>
    kill: (payload: KillTerminalInput) => Promise<void>
    attach: (payload: AttachTerminalInput) => Promise<void>
    detach: (payload: DetachTerminalInput) => Promise<void>
    snapshot: (payload: SnapshotTerminalInput) => Promise<SnapshotTerminalResult>
    trackHostedAgent: (payload: TrackHostedTerminalAgentInput) => Promise<void>
    debugCrashHost: () => Promise<void>
    onData: (listener: (event: TerminalDataEvent) => void) => UnsubscribeFn
    onExit: (listener: (event: TerminalExitEvent) => void) => UnsubscribeFn
    onState: (listener: (event: TerminalSessionStateEvent) => void) => UnsubscribeFn
    onMetadata: (listener: (event: TerminalSessionMetadataEvent) => void) => UnsubscribeFn
  }
  agent: {
    listModels: (payload: ListAgentModelsInput) => Promise<ListAgentModelsResult>
    listInstalledProviders: () => Promise<ListInstalledAgentProvidersResult>
    launch: (payload: LaunchAgentInput) => Promise<LaunchAgentResult>
    readLastMessage: (payload: ReadAgentLastMessageInput) => Promise<ReadAgentLastMessageResult>
    resolveResumeSessionId: (
      payload: ResolveAgentResumeSessionInput,
    ) => Promise<ResolveAgentResumeSessionResult>
  }
  agentExtensions: {
    getState: (payload: GetAgentExtensionsInput) => Promise<GetAgentExtensionsResult>
    addMcpServer: (payload: AddAgentMcpServerInput) => Promise<void>
    removeMcpServer: (payload: RemoveAgentMcpServerInput) => Promise<void>
    createSkill: (payload: CreateAgentSkillInput) => Promise<CreateAgentSkillResult>
  }
  task: {
    suggestTitle: (payload: SuggestTaskTitleInput) => Promise<SuggestTaskTitleResult>
  }
}

declare global {
  interface Window {
    freecliApi: FreeCliApi
  }
}
