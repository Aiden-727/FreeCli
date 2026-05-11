import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import { registerHandledIpc } from '../../../../app/main/ipc/handle'
import type { IpcRegistrationDisposable } from '../../../../app/main/ipc/types'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import type {
  EyeCareStateDto,
  AcceptGitWorklogPendingImportInput,
  DismissGitWorklogPendingImportInput,
  GitWorklogStateDto,
  InputStatsStateDto,
  OssSyncComparisonDto,
  OssBackupStateDto,
  RepairGitWorklogRepositoriesResultDto,
  RefreshGitWorklogWorkspaceInput,
  RepairGitWorklogRepositoriesInput,
  RestorePluginBackupResultDto,
  RestoreGitWorklogDismissedImportInput,
  QuotaMonitorStateDto,
  ResolveGitWorklogRepositoryResult,
  SystemMonitorStateDto,
  SyncEyeCareSettingsInput,
  SyncInputStatsSettingsInput,
  SyncWorkspaceAssistantWorkspaceSnapshotInput,
  SyncSystemMonitorSettingsInput,
  SyncGitWorklogSettingsInput,
  SyncGitWorklogWorkspacesInput,
  SyncOssBackupSettingsInput,
  SyncPluginRuntimeStateInput,
  SyncPluginRuntimeStateResult,
  SyncQuotaMonitorSettingsInput,
  UndoGitWorklogRepositoriesRepairInput,
  UndoGitWorklogRepositoriesRepairResultDto,
} from '../../../../shared/contracts/dto'
import { MainPluginRuntimeHost } from '../../application/MainPluginRuntimeHost'
import { getBuiltinPluginRuntimeFactories } from '../../infrastructure/main/pluginRuntimeRegistry'
import { InputStatsPluginController } from '../../../../plugins/inputStats/presentation/main/InputStatsPluginController'
import { QuotaMonitorPluginController } from '../../../../plugins/quotaMonitor/presentation/main/QuotaMonitorPluginController'
import { GitWorklogPluginController } from '../../../../plugins/gitWorklog/presentation/main/GitWorklogPluginController'
import { GitWorklogRepositoryRepairService } from '../../../../plugins/gitWorklog/presentation/main/GitWorklogRepositoryRepairService'
import { GitWorklogScanner } from '../../../../plugins/gitWorklog/presentation/main/GitWorklogScanner'
import { GitWorklogDiscoveryStore } from '../../../../plugins/gitWorklog/infrastructure/main/GitWorklogDiscoveryStore'
import { GitWorklogHistoryStore } from '../../../../plugins/gitWorklog/infrastructure/main/GitWorklogHistoryStore'
import { OssBackupPluginController } from '../../../../plugins/ossBackup/presentation/main/OssBackupPluginController'
import { SystemMonitorPluginController } from '../../../../plugins/systemMonitor/presentation/main/SystemMonitorPluginController'
import { WorkspaceAssistantPluginController } from '../../../../plugins/workspaceAssistant/presentation/main/WorkspaceAssistantPluginController'
import { EyeCarePluginController } from '../../../../plugins/eyeCare/presentation/main/EyeCarePluginController'
import { createAppError } from '../../../../shared/errors/appError'
import {
  normalizeAcceptGitWorklogPendingImportPayload,
  normalizeDismissGitWorklogPendingImportPayload,
  normalizeNotifyOssBackupPersistedSettingsPayload,
  normalizeSyncEyeCareSettingsPayload,
  normalizeRepairGitWorklogRepositoriesPayload,
  normalizeRefreshGitWorklogWorkspacePayload,
  normalizeSyncInputStatsSettingsPayload,
  normalizeSyncGitWorklogSettingsPayload,
  normalizeSyncGitWorklogWorkspacesPayload,
  normalizeResolveGitWorklogRepositoryPayload,
  normalizeUndoGitWorklogRepositoriesRepairPayload,
  normalizeSyncOssBackupSettingsPayload,
  normalizeRestoreGitWorklogDismissedImportPayload,
  normalizeSyncPluginRuntimeStatePayload,
  normalizeSyncQuotaMonitorSettingsPayload,
  normalizeSyncSystemMonitorSettingsPayload,
  normalizeSyncWorkspaceAssistantSettingsPayload,
  normalizeSyncWorkspaceAssistantWorkspaceSnapshotPayload,
  normalizeWorkspaceAssistantPromptPayload,
} from './validate'
import type { ApprovedWorkspaceStore } from '../../../workspace/infrastructure/approval/ApprovedWorkspaceStore'
import type { PersistenceStore } from '../../../../platform/persistence/sqlite/PersistenceStore'

export function registerPluginIpcHandlers(
  approvedWorkspaces: ApprovedWorkspaceStore,
  getPersistenceStore: () => Promise<PersistenceStore>,
  options: { appVersion?: string; dbPath?: string; userDataPath?: string } = {},
): IpcRegistrationDisposable {
  const userDataPath = options.userDataPath ?? process.cwd()
  const gitWorklogHistoryStore = new GitWorklogHistoryStore(
    resolve(userDataPath, 'plugins', 'git-worklog', 'history-cache.json'),
  )
  const gitWorklogDiscoveryStore = new GitWorklogDiscoveryStore(
    resolve(userDataPath, 'plugins', 'git-worklog', 'discovery-state.json'),
  )
  const gitWorklogScanner = new GitWorklogScanner({
    historyStore: gitWorklogHistoryStore,
  })

  const eyeCareController = new EyeCarePluginController()
  const inputStatsController = new InputStatsPluginController()
  const systemMonitorController = new SystemMonitorPluginController({
    userDataPath,
  })
  const quotaMonitorController = new QuotaMonitorPluginController({
    dbPath: options.dbPath,
    ensurePersistenceReady: async () => {
      await getPersistenceStore()
    },
  })
  const gitWorklogController = new GitWorklogPluginController({
    approvedWorkspaces,
    discoveryStore: gitWorklogDiscoveryStore,
    scanner: gitWorklogScanner,
  })
  const gitWorklogRepairService = new GitWorklogRepositoryRepairService(
    resolve(userDataPath, 'plugins', 'git-worklog', 'repository-repair-backup.json'),
    async pathValue => {
      try {
        const resolved = await gitWorklogController.resolveRepository(pathValue)
        return {
          ok: true as const,
          path: resolved.path,
          label: resolved.label,
        }
      } catch {
        return { ok: false as const }
      }
    },
  )
  const ossBackupController = new OssBackupPluginController({
    getPersistenceStore,
    appVersion: options.appVersion ?? 'unknown',
    userDataPath,
    gitWorklogHistoryStore,
  })
  const workspaceAssistantController = new WorkspaceAssistantPluginController()
  const pluginRuntimeHost = new MainPluginRuntimeHost({
    ...getBuiltinPluginRuntimeFactories(),
    'eye-care': eyeCareController.createRuntimeFactory(),
    'input-stats': inputStatsController.createRuntimeFactory(),
    'system-monitor': systemMonitorController.createRuntimeFactory(),
    'quota-monitor': quotaMonitorController.createRuntimeFactory(),
    'git-worklog': gitWorklogController.createRuntimeFactory(),
    'oss-backup': ossBackupController.createRuntimeFactory(),
    'workspace-assistant': workspaceAssistantController.createRuntimeFactory(),
  })

  registerHandledIpc<SyncPluginRuntimeStateResult, SyncPluginRuntimeStateInput>(
    IPC_CHANNELS.pluginsSyncRuntimeState,
    async (_event, payload: SyncPluginRuntimeStateInput): Promise<SyncPluginRuntimeStateResult> => {
      const normalized = normalizeSyncPluginRuntimeStatePayload(payload)
      const activePluginIds = await pluginRuntimeHost.syncEnabledPlugins(
        normalized.enabledPluginIds,
      )
      return { activePluginIds }
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<EyeCareStateDto, SyncEyeCareSettingsInput>(
    IPC_CHANNELS.pluginsEyeCareSyncSettings,
    async (_event, payload): Promise<EyeCareStateDto> => {
      const normalized = normalizeSyncEyeCareSettingsPayload(payload)
      return eyeCareController.syncSettings(normalized.settings)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<EyeCareStateDto>(
    IPC_CHANNELS.pluginsEyeCareGetState,
    (): EyeCareStateDto => eyeCareController.getState(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<EyeCareStateDto>(
    IPC_CHANNELS.pluginsEyeCareStartCycle,
    (): EyeCareStateDto => eyeCareController.startCycle(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<EyeCareStateDto>(
    IPC_CHANNELS.pluginsEyeCarePause,
    (): EyeCareStateDto => eyeCareController.pause(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<EyeCareStateDto>(
    IPC_CHANNELS.pluginsEyeCareResume,
    (): EyeCareStateDto => eyeCareController.resume(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<EyeCareStateDto>(
    IPC_CHANNELS.pluginsEyeCareStop,
    (): EyeCareStateDto => eyeCareController.stop(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<EyeCareStateDto>(
    IPC_CHANNELS.pluginsEyeCarePostponeBreak,
    (): EyeCareStateDto => eyeCareController.postponeBreak(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<InputStatsStateDto, SyncInputStatsSettingsInput>(
    IPC_CHANNELS.pluginsInputStatsSyncSettings,
    async (_event, payload): Promise<InputStatsStateDto> => {
      const normalized = normalizeSyncInputStatsSettingsPayload(payload)
      return inputStatsController.syncSettings(normalized.settings)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<InputStatsStateDto>(
    IPC_CHANNELS.pluginsInputStatsGetState,
    (): InputStatsStateDto => inputStatsController.getState(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<InputStatsStateDto>(
    IPC_CHANNELS.pluginsInputStatsRefresh,
    async (): Promise<InputStatsStateDto> => await inputStatsController.refreshNow(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<SystemMonitorStateDto, SyncSystemMonitorSettingsInput>(
    IPC_CHANNELS.pluginsSystemMonitorSyncSettings,
    async (_event, payload): Promise<SystemMonitorStateDto> => {
      const normalized = normalizeSyncSystemMonitorSettingsPayload(payload)
      return systemMonitorController.syncSettings(normalized.settings)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<SystemMonitorStateDto>(
    IPC_CHANNELS.pluginsSystemMonitorGetState,
    (): SystemMonitorStateDto => systemMonitorController.getState(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<SystemMonitorStateDto>(
    IPC_CHANNELS.pluginsSystemMonitorRefresh,
    async (): Promise<SystemMonitorStateDto> => await systemMonitorController.refreshNow(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<QuotaMonitorStateDto, SyncQuotaMonitorSettingsInput>(
    IPC_CHANNELS.pluginsQuotaMonitorSyncSettings,
    async (_event, payload): Promise<QuotaMonitorStateDto> => {
      const normalized = normalizeSyncQuotaMonitorSettingsPayload(payload)
      return quotaMonitorController.syncSettings(normalized.settings)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<QuotaMonitorStateDto>(
    IPC_CHANNELS.pluginsQuotaMonitorGetState,
    (): QuotaMonitorStateDto => quotaMonitorController.getState(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<QuotaMonitorStateDto>(
    IPC_CHANNELS.pluginsQuotaMonitorRefresh,
    async (): Promise<QuotaMonitorStateDto> => await quotaMonitorController.refreshNow(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<GitWorklogStateDto, SyncGitWorklogSettingsInput>(
    IPC_CHANNELS.pluginsGitWorklogSyncSettings,
    async (_event, payload): Promise<GitWorklogStateDto> => {
      const normalized = normalizeSyncGitWorklogSettingsPayload(payload)
      return gitWorklogController.syncSettings(normalized.settings)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<GitWorklogStateDto, SyncGitWorklogWorkspacesInput>(
    IPC_CHANNELS.pluginsGitWorklogSyncWorkspaces,
    async (_event, payload): Promise<GitWorklogStateDto> => {
      const normalized = normalizeSyncGitWorklogWorkspacesPayload(payload)
      return gitWorklogController.syncWorkspaces(normalized.workspaces)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<GitWorklogStateDto>(
    IPC_CHANNELS.pluginsGitWorklogGetState,
    (): GitWorklogStateDto => gitWorklogController.getState(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<ResolveGitWorklogRepositoryResult>(
    IPC_CHANNELS.pluginsGitWorklogResolveRepository,
    async (_event, payload): Promise<ResolveGitWorklogRepositoryResult> => {
      const normalized = normalizeResolveGitWorklogRepositoryPayload(payload)
      const isApproved = await approvedWorkspaces.isPathApproved(normalized.path)
      if (!isApproved) {
        throw createAppError('common.approved_path_required', {
          debugMessage: 'plugins:git-worklog:resolve-repository path is outside approved workspaces',
        })
      }

      return await gitWorklogController.resolveRepository(normalized.path)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<GitWorklogStateDto>(
    IPC_CHANNELS.pluginsGitWorklogRefresh,
    async (): Promise<GitWorklogStateDto> => await gitWorklogController.refreshNow(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<GitWorklogStateDto, RefreshGitWorklogWorkspaceInput>(
    IPC_CHANNELS.pluginsGitWorklogRefreshWorkspace,
    async (_event, payload): Promise<GitWorklogStateDto> => {
      const normalized = normalizeRefreshGitWorklogWorkspacePayload(payload)
      return await gitWorklogController.refreshWorkspace(normalized.workspacePath)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<RepairGitWorklogRepositoriesResultDto, RepairGitWorklogRepositoriesInput>(
    IPC_CHANNELS.pluginsGitWorklogRepairRepositories,
    async (_event, payload): Promise<RepairGitWorklogRepositoriesResultDto> => {
      const normalized = normalizeRepairGitWorklogRepositoriesPayload(payload)
      return await gitWorklogRepairService.repair({
        settings: normalized.settings,
        availableWorkspaces: normalized.availableWorkspaces,
      })
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<UndoGitWorklogRepositoriesRepairResultDto, UndoGitWorklogRepositoriesRepairInput>(
    IPC_CHANNELS.pluginsGitWorklogUndoRepositoryRepair,
    async (_event, payload): Promise<UndoGitWorklogRepositoriesRepairResultDto> => {
      const normalized = normalizeUndoGitWorklogRepositoriesRepairPayload(payload)
      return await gitWorklogRepairService.undo({
        settings: normalized.settings,
      })
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<GitWorklogStateDto, AcceptGitWorklogPendingImportInput>(
    IPC_CHANNELS.pluginsGitWorklogAcceptPendingImport,
    async (_event, payload): Promise<GitWorklogStateDto> => {
      const normalized = normalizeAcceptGitWorklogPendingImportPayload(payload)
      return await gitWorklogController.acceptPendingImport(normalized.workspacePath)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<GitWorklogStateDto, DismissGitWorklogPendingImportInput>(
    IPC_CHANNELS.pluginsGitWorklogDismissPendingImport,
    async (_event, payload): Promise<GitWorklogStateDto> => {
      const normalized = normalizeDismissGitWorklogPendingImportPayload(payload)
      return await gitWorklogController.dismissPendingImport(normalized.workspacePath)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<GitWorklogStateDto, RestoreGitWorklogDismissedImportInput>(
    IPC_CHANNELS.pluginsGitWorklogRestoreDismissedImport,
    async (_event, payload): Promise<GitWorklogStateDto> => {
      const normalized = normalizeRestoreGitWorklogDismissedImportPayload(payload)
      return await gitWorklogController.restoreDismissedImport(normalized.workspacePath)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<OssBackupStateDto, SyncOssBackupSettingsInput>(
    IPC_CHANNELS.pluginsOssBackupSyncSettings,
    async (_event, payload): Promise<OssBackupStateDto> => {
      const normalized = normalizeSyncOssBackupSettingsPayload(payload)
      return ossBackupController.syncSettings(normalized.settings)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<OssBackupStateDto>(
    IPC_CHANNELS.pluginsOssBackupGetState,
    (): OssBackupStateDto => ossBackupController.getState(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<OssBackupStateDto>(
    IPC_CHANNELS.pluginsOssBackupTestConnection,
    async (): Promise<OssBackupStateDto> => await ossBackupController.testConnection(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<OssBackupStateDto>(
    IPC_CHANNELS.pluginsOssBackupBackup,
    async (): Promise<OssBackupStateDto> => await ossBackupController.backupNow(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<OssSyncComparisonDto>(
    IPC_CHANNELS.pluginsOssBackupGetSyncComparison,
    async (): Promise<OssSyncComparisonDto> => await ossBackupController.getSyncComparison(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<RestorePluginBackupResultDto>(
    IPC_CHANNELS.pluginsOssBackupRestore,
    async (): Promise<RestorePluginBackupResultDto> => await ossBackupController.restoreBackup(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc<OssBackupStateDto>(
    IPC_CHANNELS.pluginsOssBackupNotifyPersistedSettings,
    (_event, payload): OssBackupStateDto => {
      const normalized = normalizeNotifyOssBackupPersistedSettingsPayload(payload)
      return ossBackupController.notePersistedSettings(normalized)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc(
    IPC_CHANNELS.pluginsWorkspaceAssistantSyncSettings,
    async (_event, payload) => {
      const normalized = normalizeSyncWorkspaceAssistantSettingsPayload(payload)
      return workspaceAssistantController.syncSettings(normalized.settings)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc(
    IPC_CHANNELS.pluginsWorkspaceAssistantSyncWorkspaceSnapshot,
    async (_event, payload: SyncWorkspaceAssistantWorkspaceSnapshotInput) => {
      const normalized = normalizeSyncWorkspaceAssistantWorkspaceSnapshotPayload(payload)
      return workspaceAssistantController.syncWorkspaceSnapshot(normalized.snapshot)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc(
    IPC_CHANNELS.pluginsWorkspaceAssistantGetState,
    () => workspaceAssistantController.getState(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc(
    IPC_CHANNELS.pluginsWorkspaceAssistantTestConnection,
    async () => await workspaceAssistantController.testConnection(),
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc(
    IPC_CHANNELS.pluginsWorkspaceAssistantPrompt,
    async (_event, payload) => {
      const normalized = normalizeWorkspaceAssistantPromptPayload(payload)
      return workspaceAssistantController.prompt(normalized)
    },
    { defaultErrorCode: 'common.unexpected' },
  )

  registerHandledIpc(
    IPC_CHANNELS.pluginsWorkspaceAssistantStopPrompt,
    () => workspaceAssistantController.stopPrompt(),
    { defaultErrorCode: 'common.unexpected' },
  )

  return {
    dispose: async () => {
      ipcMain.removeHandler(IPC_CHANNELS.pluginsSyncRuntimeState)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsEyeCareSyncSettings)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsEyeCareGetState)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsEyeCareStartCycle)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsEyeCarePause)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsEyeCareResume)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsEyeCareStop)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsEyeCarePostponeBreak)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsInputStatsSyncSettings)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsInputStatsGetState)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsInputStatsRefresh)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsSystemMonitorSyncSettings)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsSystemMonitorGetState)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsSystemMonitorRefresh)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsQuotaMonitorSyncSettings)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsQuotaMonitorGetState)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsQuotaMonitorRefresh)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogSyncSettings)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogSyncWorkspaces)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogGetState)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogResolveRepository)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogRefresh)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogRefreshWorkspace)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogRepairRepositories)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogUndoRepositoryRepair)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogAcceptPendingImport)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogDismissPendingImport)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogRestoreDismissedImport)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupSyncSettings)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupGetState)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupTestConnection)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupBackup)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupGetSyncComparison)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupRestore)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupNotifyPersistedSettings)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsWorkspaceAssistantSyncSettings)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsWorkspaceAssistantSyncWorkspaceSnapshot)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsWorkspaceAssistantGetState)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsWorkspaceAssistantTestConnection)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsWorkspaceAssistantPrompt)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsWorkspaceAssistantStopPrompt)
      await pluginRuntimeHost.dispose()
      await eyeCareController.dispose()
      await inputStatsController.dispose()
      await systemMonitorController.dispose()
      await quotaMonitorController.dispose()
      await gitWorklogController.dispose()
      await ossBackupController.dispose()
      await workspaceAssistantController.dispose()
      await gitWorklogDiscoveryStore.dispose()
      await gitWorklogHistoryStore.dispose()
    },
  }
}
