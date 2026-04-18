import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import { registerHandledIpc } from '../../../../app/main/ipc/handle'
import type { IpcRegistrationDisposable } from '../../../../app/main/ipc/types'
import { IPC_CHANNELS } from '../../../../shared/contracts/ipc'
import type {
  GitWorklogStateDto,
  InputStatsStateDto,
  OssSyncComparisonDto,
  OssBackupStateDto,
  RestorePluginBackupResultDto,
  QuotaMonitorStateDto,
  SystemMonitorStateDto,
  SyncInputStatsSettingsInput,
  SyncSystemMonitorSettingsInput,
  SyncGitWorklogSettingsInput,
  SyncGitWorklogWorkspacesInput,
  SyncOssBackupSettingsInput,
  SyncPluginRuntimeStateInput,
  SyncPluginRuntimeStateResult,
  SyncQuotaMonitorSettingsInput,
} from '../../../../shared/contracts/dto'
import { MainPluginRuntimeHost } from '../../application/MainPluginRuntimeHost'
import { getBuiltinPluginRuntimeFactories } from '../../infrastructure/main/pluginRuntimeRegistry'
import { InputStatsPluginController } from '../../../../plugins/inputStats/presentation/main/InputStatsPluginController'
import { QuotaMonitorPluginController } from '../../../../plugins/quotaMonitor/presentation/main/QuotaMonitorPluginController'
import { GitWorklogPluginController } from '../../../../plugins/gitWorklog/presentation/main/GitWorklogPluginController'
import { GitWorklogScanner } from '../../../../plugins/gitWorklog/presentation/main/GitWorklogScanner'
import { GitWorklogHistoryStore } from '../../../../plugins/gitWorklog/infrastructure/main/GitWorklogHistoryStore'
import { OssBackupPluginController } from '../../../../plugins/ossBackup/presentation/main/OssBackupPluginController'
import { SystemMonitorPluginController } from '../../../../plugins/systemMonitor/presentation/main/SystemMonitorPluginController'
import {
  normalizeNotifyOssBackupPersistedSettingsPayload,
  normalizeSyncInputStatsSettingsPayload,
  normalizeSyncGitWorklogSettingsPayload,
  normalizeSyncGitWorklogWorkspacesPayload,
  normalizeSyncOssBackupSettingsPayload,
  normalizeSyncPluginRuntimeStatePayload,
  normalizeSyncQuotaMonitorSettingsPayload,
  normalizeSyncSystemMonitorSettingsPayload,
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
  const gitWorklogScanner = new GitWorklogScanner({
    historyStore: gitWorklogHistoryStore,
  })

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
    scanner: gitWorklogScanner,
  })
  const ossBackupController = new OssBackupPluginController({
    getPersistenceStore,
    appVersion: options.appVersion ?? 'unknown',
    userDataPath,
    gitWorklogHistoryStore,
  })
  const pluginRuntimeHost = new MainPluginRuntimeHost({
    ...getBuiltinPluginRuntimeFactories(),
    'input-stats': inputStatsController.createRuntimeFactory(),
    'system-monitor': systemMonitorController.createRuntimeFactory(),
    'quota-monitor': quotaMonitorController.createRuntimeFactory(),
    'git-worklog': gitWorklogController.createRuntimeFactory(),
    'oss-backup': ossBackupController.createRuntimeFactory(),
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

  registerHandledIpc<GitWorklogStateDto>(
    IPC_CHANNELS.pluginsGitWorklogRefresh,
    async (): Promise<GitWorklogStateDto> => await gitWorklogController.refreshNow(),
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

  return {
    dispose: async () => {
      ipcMain.removeHandler(IPC_CHANNELS.pluginsSyncRuntimeState)
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
      ipcMain.removeHandler(IPC_CHANNELS.pluginsGitWorklogRefresh)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupSyncSettings)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupGetState)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupTestConnection)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupBackup)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupGetSyncComparison)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupRestore)
      ipcMain.removeHandler(IPC_CHANNELS.pluginsOssBackupNotifyPersistedSettings)
      await pluginRuntimeHost.dispose()
      await inputStatsController.dispose()
      await systemMonitorController.dispose()
      await quotaMonitorController.dispose()
      await gitWorklogController.dispose()
      await ossBackupController.dispose()
      await gitWorklogHistoryStore.dispose()
    },
  }
}
