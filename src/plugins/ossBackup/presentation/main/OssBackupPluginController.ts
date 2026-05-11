import { BrowserWindow, app, type Event as ElectronEvent } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type {
  NotifyOssBackupPersistedSettingsInput,
  OssBackupErrorDto,
  OssBackupSettingsDto,
  OssBackupStateDto,
  OssSyncComparisonDto,
  OssSyncDatasetId,
  OssSyncDecision,
  OssSyncFileInfoDto,
  PluginBackupSnapshotDto,
  RestorePluginBackupResultDto,
} from '@shared/contracts/dto'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import type { PersistenceStore } from '@platform/persistence/sqlite/PersistenceStore'
import {
  createPluginBackupSnapshot,
  mergeRestoredPluginSettings,
  normalizePluginBackupSnapshot,
} from '@contexts/plugins/domain/pluginBackupSnapshot'
import {
  DEFAULT_OSS_BACKUP_SETTINGS,
  isOssBackupConfigured,
  normalizeOssBackupObjectDirectory,
} from '@contexts/plugins/domain/ossBackupSettings'
import { normalizeBuiltinPluginIds } from '@contexts/plugins/domain/pluginManifest'
import { normalizeAgentSettings } from '@contexts/settings/domain/agentSettings'
import type {
  MainPluginRuntime,
  MainPluginRuntimeFactory,
} from '../../../../contexts/plugins/application/MainPluginRuntimeHost'
import {
  QuotaMonitorHistoryStore,
  type QuotaMonitorHistorySyncPayload,
  type QuotaMonitorHistorySyncModelLogRow,
  type QuotaMonitorHistorySyncSnapshotRow,
} from '../../../quotaMonitor/infrastructure/main/QuotaMonitorHistoryStore'
import {
  GitWorklogHistoryStore,
  normalizeGitWorklogHistorySyncPayload,
  type GitWorklogHistorySyncPayload,
} from '../../../gitWorklog/infrastructure/main/GitWorklogHistoryStore'
import { OssObjectStoreClient } from './OssObjectStoreClient'

const EXIT_BACKUP_TIMEOUT_MS = 2500
const AUTO_BACKUP_RETRY_MAX_ATTEMPTS = 5
const AUTO_BACKUP_RETRY_BASE_DELAY_MS = 30_000
const AUTO_BACKUP_RETRY_MAX_DELAY_MS = 15 * 60_000
const AUTO_BACKUP_RETRY_JITTER_MIN = 0.85
const AUTO_BACKUP_RETRY_JITTER_MAX = 1.15
const OSS_SYNC_STATE_SCHEMA = 1
const OSS_MANIFEST_SCHEMA = 1
const OSS_SYNC_STATE_FILE_NAME = 'sync-state.json'
const OSS_PLUGIN_SETTINGS_FILE_NAME = 'latest.json'
const OSS_MANIFEST_FILE_NAME = 'manifest.json'
const INPUT_STATS_HISTORY_FILE_NAME = 'input-stats-history.json'
const QUOTA_MONITOR_HISTORY_FILE_NAME = 'quota-monitor-history.json'
const GIT_WORKLOG_HISTORY_FILE_NAME = 'git-worklog-history.json'

const DATASET_IDS: OssSyncDatasetId[] = [
  'plugin-settings',
  'input-stats-history',
  'quota-monitor-history',
  'git-worklog-history',
]

interface OssSyncManifestFileEntry {
  version: number
  updatedAt: string
  sha256: string
  size: number
}

interface OssSyncManifestPayload {
  schema: number
  deviceId: string | null
  updatedAt: string | null
  files: Partial<Record<OssSyncDatasetId, OssSyncManifestFileEntry>>
}

interface OssLocalSyncStatePayload {
  schema: number
  deviceId: string
  updatedAt: string
  files: Partial<Record<OssSyncDatasetId, OssSyncManifestFileEntry>>
}

interface LocalDatasetSnapshot {
  datasetId: OssSyncDatasetId
  objectKey: string
  payload: unknown
  modifiedAt: string
  sizeBytes: number
  checksum: string
  virtualNote: string | null
}

interface OssObjectKeys {
  manifestKey: string
  datasetObjectKeys: Record<OssSyncDatasetId, string>
}

type AppLifecycleEvent = Pick<ElectronEvent, 'preventDefault'> & {
  readonly defaultPrevented?: boolean
}

type AppLifecycleListener = (...args: unknown[]) => void

interface AppLifecycleApi {
  on: (event: 'before-quit' | 'will-quit', listener: AppLifecycleListener) => void
  off?: (event: 'before-quit' | 'will-quit', listener: AppLifecycleListener) => void
  quit?: () => void
}

function toAppLifecycleEvent(value: unknown): AppLifecycleEvent | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const maybeEvent = value as { preventDefault?: unknown; defaultPrevented?: unknown }
  if (typeof maybeEvent.preventDefault !== 'function') {
    return null
  }

  return value as AppLifecycleEvent
}

function toErrorDto(error: unknown, fallbackMessage: string): OssBackupErrorDto {
  if (error instanceof Error) {
    const message = error.message.trim()
    return {
      message: message.length > 0 ? message : fallbackMessage,
      detail: error.stack ?? null,
    }
  }

  return {
    message: fallbackMessage,
    detail: null,
  }
}

function isRetriableNetworkLikeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.length === 0) {
    return false
  }

  return [
    'timeout',
    'timed out',
    'network',
    'socket',
    'fetch failed',
    'connection',
    'econn',
    'enotfound',
    'eai_again',
    'ecanceled',
    '429',
    '502',
    '503',
    '504',
    '网络',
    '连接',
  ].some(fragment => message.includes(fragment))
}

function createDefaultState(settings: OssBackupSettingsDto, isEnabled: boolean): OssBackupStateDto {
  return {
    isEnabled,
    status: isEnabled ? 'idle' : 'disabled',
    isTestingConnection: false,
    isBackingUp: false,
    isRestoring: false,
    nextAutoBackupDueAt: null,
    lastBackupAt: settings.lastBackupAt,
    lastRestoreAt: settings.lastRestoreAt,
    lastSnapshotAt: null,
    includedPluginIds: normalizeBuiltinPluginIds(settings.includedPluginIds),
    lastError: settings.lastError,
  }
}

function normalizeObjectKey(value: string): string {
  return normalizeOssBackupObjectDirectory(value)
}

function deriveObjectKeys(settings: OssBackupSettingsDto): OssObjectKeys {
  const basePrefix = normalizeObjectKey(settings.objectKey)
  const resolveInPrefix = (fileName: string): string =>
    basePrefix.length > 0 ? `${basePrefix}/${fileName}` : fileName

  return {
    manifestKey: resolveInPrefix(OSS_MANIFEST_FILE_NAME),
    datasetObjectKeys: {
      'plugin-settings': resolveInPrefix(OSS_PLUGIN_SETTINGS_FILE_NAME),
      'input-stats-history': resolveInPrefix(INPUT_STATS_HISTORY_FILE_NAME),
      'quota-monitor-history': resolveInPrefix(QUOTA_MONITOR_HISTORY_FILE_NAME),
      'git-worklog-history': resolveInPrefix(GIT_WORKLOG_HISTORY_FILE_NAME),
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    return null
  }

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function normalizePositiveInteger(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, Math.round(value))
}

function normalizeNonNegativeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }

  return Math.max(0, value)
}

function normalizeManifestFileEntry(value: unknown): OssSyncManifestFileEntry | null {
  if (!isRecord(value)) {
    return null
  }

  const version = normalizePositiveInteger(value.version, 0)
  const updatedAt = parseIsoDate(value.updatedAt)
  const sha256 = typeof value.sha256 === 'string' ? value.sha256.trim() : ''
  const size = normalizePositiveInteger(value.size, 0)
  if (version <= 0 || !updatedAt || sha256.length === 0) {
    return null
  }

  return {
    version,
    updatedAt,
    sha256,
    size,
  }
}

function normalizeManifest(value: unknown): OssSyncManifestPayload | null {
  if (!isRecord(value)) {
    return null
  }

  const files: Partial<Record<OssSyncDatasetId, OssSyncManifestFileEntry>> = {}
  if (isRecord(value.files)) {
    for (const datasetId of DATASET_IDS) {
      const entry = normalizeManifestFileEntry(value.files[datasetId])
      if (entry) {
        files[datasetId] = entry
      }
    }
  }

  return {
    schema: normalizePositiveInteger(value.schema, OSS_MANIFEST_SCHEMA),
    deviceId: typeof value.deviceId === 'string' && value.deviceId.trim().length > 0 ? value.deviceId : null,
    updatedAt: parseIsoDate(value.updatedAt),
    files,
  }
}

function createInitialLocalSyncState(): OssLocalSyncStatePayload {
  return {
    schema: OSS_SYNC_STATE_SCHEMA,
    deviceId: `DEV-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
    updatedAt: new Date().toISOString(),
    files: {},
  }
}

function normalizeLocalSyncState(value: unknown): OssLocalSyncStatePayload {
  if (!isRecord(value)) {
    return createInitialLocalSyncState()
  }

  const fallback = createInitialLocalSyncState()
  const files: Partial<Record<OssSyncDatasetId, OssSyncManifestFileEntry>> = {}
  if (isRecord(value.files)) {
    for (const datasetId of DATASET_IDS) {
      const entry = normalizeManifestFileEntry(value.files[datasetId])
      if (entry) {
        files[datasetId] = entry
      }
    }
  }

  return {
    schema: normalizePositiveInteger(value.schema, OSS_SYNC_STATE_SCHEMA),
    deviceId:
      typeof value.deviceId === 'string' && value.deviceId.trim().length > 0
        ? value.deviceId.trim()
        : fallback.deviceId,
    updatedAt: parseIsoDate(value.updatedAt) ?? fallback.updatedAt,
    files,
  }
}

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => stableSortValue(item))
  }

  if (!isRecord(value)) {
    return value
  }

  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort()) {
    output[key] = stableSortValue(value[key])
  }

  return output
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableSortValue(value))
}

function hashSha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function canonicalizeDatasetPayload(datasetId: OssSyncDatasetId, payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload
  }

  if (datasetId === 'plugin-settings') {
    return {
      ...payload,
      createdAt: '__stable_created_at__',
    }
  }

  if (datasetId === 'input-stats-history') {
    const days = isRecord(payload.days) ? payload.days : {}
    return {
      version: normalizePositiveInteger(payload.version, 1),
      days,
    }
  }

  if (datasetId === 'git-worklog-history') {
    return {
      formatVersion: normalizePositiveInteger(payload.formatVersion, 1),
      repositories: Array.isArray(payload.repositories) ? payload.repositories : [],
    }
  }

  return {
    formatVersion: normalizePositiveInteger(payload.formatVersion, 1),
    snapshots: Array.isArray(payload.snapshots) ? payload.snapshots : [],
    modelLogs: Array.isArray(payload.modelLogs) ? payload.modelLogs : [],
  }
}

function toSyncFileInfo(options: {
  datasetId: OssSyncDatasetId
  exists: boolean
  sizeBytes: number | null
  modifiedAt: string | null
  checksum: string | null
  version: number | null
  note: string | null
}): OssSyncFileInfoDto {
  return {
    datasetId: options.datasetId,
    exists: options.exists,
    sizeBytes: options.sizeBytes,
    modifiedAt: options.modifiedAt,
    checksum: options.checksum,
    checksumType: 'SHA256',
    version: options.version,
    note: options.note,
  }
}

function normalizeInputStatsHistoryPayload(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) {
    throw new Error('云端键鼠统计历史格式无效。')
  }

  const days = raw.days
  if (!isRecord(days)) {
    throw new Error('云端键鼠统计历史格式无效。')
  }

  return {
    version: normalizePositiveInteger(raw.version, 1),
    updatedAt: parseIsoDate(raw.updatedAt) ?? new Date().toISOString(),
    days,
  }
}

function normalizeQuotaMonitorHistoryPayload(raw: unknown): QuotaMonitorHistorySyncPayload {
  if (!isRecord(raw)) {
    throw new Error('云端额度监测历史格式无效。')
  }

  if (!Array.isArray(raw.snapshots) || !Array.isArray(raw.modelLogs)) {
    throw new Error('云端额度监测历史格式无效。')
  }

  const snapshots = raw.snapshots.filter(isRecord).map(snapshot => {
    return {
      profileId: typeof snapshot.profileId === 'string' ? snapshot.profileId : '',
      tokenName: typeof snapshot.tokenName === 'string' ? snapshot.tokenName : '',
      fetchedAt: parseIsoDate(snapshot.fetchedAt) ?? new Date().toISOString(),
      todayUsedQuota: normalizeNonNegativeNumber(snapshot.todayUsedQuota),
      todayUsageCount: normalizePositiveInteger(snapshot.todayUsageCount, 0),
      remainQuotaValue: normalizeNonNegativeNumber(snapshot.remainQuotaValue),
      remainQuotaDisplay:
        typeof snapshot.remainQuotaDisplay === 'string' ? snapshot.remainQuotaDisplay : '',
      expiredTimeFormatted:
        typeof snapshot.expiredTimeFormatted === 'string' ? snapshot.expiredTimeFormatted : '',
      statusText: typeof snapshot.statusText === 'string' ? snapshot.statusText : '',
      remainRatio: normalizeNonNegativeNumber(snapshot.remainRatio),
    } satisfies QuotaMonitorHistorySyncSnapshotRow
  })

  const modelLogs = raw.modelLogs.filter(isRecord).map(modelLog => {
    return {
      profileId: typeof modelLog.profileId === 'string' ? modelLog.profileId : '',
      tokenName: typeof modelLog.tokenName === 'string' ? modelLog.tokenName : '',
      modelName: typeof modelLog.modelName === 'string' ? modelLog.modelName : '',
      createdAtEpoch: normalizePositiveInteger(modelLog.createdAtEpoch, 0),
      createdTimeText: typeof modelLog.createdTimeText === 'string' ? modelLog.createdTimeText : '',
      promptTokens: normalizePositiveInteger(modelLog.promptTokens, 0),
      completionTokens: normalizePositiveInteger(modelLog.completionTokens, 0),
      totalTokens: normalizePositiveInteger(modelLog.totalTokens, 0),
      quota: normalizeNonNegativeNumber(modelLog.quota),
      fetchedAt: parseIsoDate(modelLog.fetchedAt) ?? new Date().toISOString(),
    } satisfies QuotaMonitorHistorySyncModelLogRow
  })

  return {
    formatVersion: 1,
    exportedAt: parseIsoDate(raw.exportedAt) ?? new Date().toISOString(),
    snapshots,
    modelLogs,
  }
}

function normalizeGitWorklogHistoryPayload(raw: unknown): GitWorklogHistorySyncPayload {
  return normalizeGitWorklogHistorySyncPayload(raw)
}

export class OssBackupPluginController {
  private readonly client: OssObjectStoreClient
  private readonly emitState: (state: OssBackupStateDto) => void
  private readonly getPersistenceStore: () => Promise<PersistenceStore>
  private readonly appVersion: string
  private readonly inputStatsHistoryPath: string
  private readonly localSyncStatePath: string
  private readonly quotaHistoryStore: QuotaMonitorHistoryStore
  private readonly gitWorklogHistoryStore: GitWorklogHistoryStore
  private settings: OssBackupSettingsDto = DEFAULT_OSS_BACKUP_SETTINGS
  private state: OssBackupStateDto = createDefaultState(DEFAULT_OSS_BACKUP_SETTINGS, false)
  private runtimeEnabled = false
  private disposed = false
  private autoBackupTimer: ReturnType<typeof setTimeout> | null = null
  private autoBackupRetryAttempts = 0
  private lifecycleHandlersRegistered = false
  private beforeQuitBypassOnce = false
  private exitBackupInFlight = false
  private operationChain: Promise<void> = Promise.resolve()

  public constructor(options: {
    getPersistenceStore: () => Promise<PersistenceStore>
    appVersion: string
    client?: OssObjectStoreClient
    emitState?: (state: OssBackupStateDto) => void
    userDataPath?: string
    quotaHistoryStore?: QuotaMonitorHistoryStore
    gitWorklogHistoryStore?: GitWorklogHistoryStore
  }) {
    const electronApp = app as unknown as { getPath?: (name: string) => string }
    const userDataPath =
      options.userDataPath ??
      (electronApp && typeof electronApp.getPath === 'function'
        ? electronApp.getPath('userData')
        : process.cwd())
    this.getPersistenceStore = options.getPersistenceStore
    this.appVersion = options.appVersion
    this.client = options.client ?? new OssObjectStoreClient()
    this.emitState = options.emitState ?? this.broadcastState
    this.inputStatsHistoryPath = resolve(userDataPath, 'plugins', 'input-stats', 'stats.json')
    this.localSyncStatePath = resolve(
      userDataPath,
      'plugins',
      'oss-backup',
      OSS_SYNC_STATE_FILE_NAME,
    )
    this.quotaHistoryStore =
      options.quotaHistoryStore ?? new QuotaMonitorHistoryStore(resolve(userDataPath, 'freecli.db'))
    this.gitWorklogHistoryStore =
      options.gitWorklogHistoryStore ??
      new GitWorklogHistoryStore(resolve(userDataPath, 'plugins', 'git-worklog', 'history-cache.json'))
  }

  public createRuntimeFactory(): MainPluginRuntimeFactory {
    return () =>
      ({
        activate: async () => {
          await this.activate()
        },
        deactivate: async () => {
          await this.deactivate()
        },
      }) satisfies MainPluginRuntime
  }

  public syncSettings(settings: OssBackupSettingsDto): OssBackupStateDto {
    this.settings = settings
    const isEnabled = this.resolveFeatureEnabled()
    this.applyState({
      ...this.state,
      isEnabled,
      status: this.resolveIdleStatus(isEnabled),
      includedPluginIds: normalizeBuiltinPluginIds(settings.includedPluginIds),
      lastBackupAt: settings.lastBackupAt,
      lastRestoreAt: settings.lastRestoreAt,
      lastError: settings.lastError,
    })

    if (!this.resolveAutoBackupEnabled()) {
      this.clearAutoBackupTimer()
      this.autoBackupRetryAttempts = 0
    }

    return this.state
  }

  public getState(): OssBackupStateDto {
    return this.state
  }

  public async testConnection(): Promise<OssBackupStateDto> {
    return await this.runSerialized(async () => {
      if (!this.runtimeEnabled) {
        this.applyState({
          ...this.state,
          isEnabled: false,
          status: 'disabled',
        })
        return this.state
      }

      if (!isOssBackupConfigured(this.settings)) {
        const lastError = {
          message: '请先填写完整的 OSS 连接配置。',
          detail: null,
        } satisfies OssBackupErrorDto
        this.applyState({
          ...this.state,
          isTestingConnection: false,
          status: 'error',
          lastError,
        })
        return this.state
      }

      this.applyState({
        ...this.state,
        isTestingConnection: true,
        status: 'testing',
        lastError: null,
      })

      try {
        await this.client.testConnection(this.settings)
        this.applyState({
          ...this.state,
          isTestingConnection: false,
          status: this.resolveIdleStatus(this.resolveFeatureEnabled()),
          lastError: null,
        })
        return this.state
      } catch (error) {
        this.applyState({
          ...this.state,
          isTestingConnection: false,
          status: 'error',
          lastError: toErrorDto(error, 'OSS 连接测试失败。'),
        })
        return this.state
      }
    })
  }

  public async backupNow(): Promise<OssBackupStateDto> {
    return await this.performBackup('manual')
  }

  public async restoreBackup(): Promise<RestorePluginBackupResultDto> {
    return await this.runSerialized(async () => {
      if (!this.runtimeEnabled) {
        this.applyState({
          ...this.state,
          isEnabled: false,
          status: 'disabled',
        })
        throw new Error('OSS 云备份插件当前未启用。')
      }

      if (!isOssBackupConfigured(this.settings)) {
        const error = new Error('请先填写完整的 OSS 连接配置。')
        this.applyState({
          ...this.state,
          status: 'error',
          lastError: toErrorDto(error, error.message),
        })
        throw error
      }

      this.applyState({
        ...this.state,
        isRestoring: true,
        status: 'restoring',
        lastError: null,
      })

      try {
        const objectKeys = deriveObjectKeys(this.settings)
        const enabledDatasets = this.resolveEnabledDatasetIds()
        const remoteManifest = await this.loadRemoteManifestIfExists(objectKeys.manifestKey)
        const snapshot = await this.applyRemoteDatasets({
          enabledDatasets,
          objectKeys,
          remoteManifest,
        })
        const completedAt = new Date().toISOString()
        await this.applyRestoredPluginSettingsToPersistence(snapshot, completedAt)

        const localState = await this.loadLocalSyncState()
        const nextFiles = { ...localState.files }

        if (remoteManifest) {
          for (const datasetId of enabledDatasets) {
            const remoteEntry = remoteManifest.files[datasetId]
            if (remoteEntry) {
              nextFiles[datasetId] = remoteEntry
            }
          }
        } else {
          const refreshedSnapshots = await this.collectLocalSnapshots(enabledDatasets, objectKeys)
          for (const datasetId of enabledDatasets) {
            const refreshed = refreshedSnapshots.get(datasetId)
            if (!refreshed) {
              continue
            }
            nextFiles[datasetId] = {
              version: Math.max(localState.files[datasetId]?.version ?? 0, 1),
              updatedAt: completedAt,
              sha256: refreshed.checksum,
              size: refreshed.sizeBytes,
            }
          }
        }

        await this.saveLocalSyncState({
          ...localState,
          updatedAt: completedAt,
          files: nextFiles,
        })

        this.applyState({
          ...this.state,
          isRestoring: false,
          status: 'ready',
          lastRestoreAt: completedAt,
          lastSnapshotAt: snapshot.createdAt,
          lastError: null,
        })

        return { snapshot }
      } catch (error) {
        this.applyState({
          ...this.state,
          isRestoring: false,
          status: 'error',
          lastError: toErrorDto(error, '从 OSS 恢复插件配置失败。'),
        })
        throw error
      }
    })
  }

  public async getSyncComparison(): Promise<OssSyncComparisonDto> {
    return await this.runSerialized(async () => {
      const objectKeys = deriveObjectKeys(this.settings)
      const enabledDatasets = this.resolveEnabledDatasetIds()
      const localState = await this.loadLocalSyncState()
      const localSnapshots = await this.collectLocalSnapshots(enabledDatasets, objectKeys)
      const remoteManifest = await this.loadRemoteManifestIfExists(objectKeys.manifestKey)
      const localFiles = this.createEmptyFileInfoRecord()
      const remoteFiles = this.createEmptyFileInfoRecord()

      for (const datasetId of DATASET_IDS) {
        if (!enabledDatasets.includes(datasetId)) {
          localFiles[datasetId] = toSyncFileInfo({
            datasetId,
            exists: false,
            sizeBytes: null,
            modifiedAt: null,
            checksum: null,
            version: null,
            note: '未启用同步',
          })
          remoteFiles[datasetId] = toSyncFileInfo({
            datasetId,
            exists: false,
            sizeBytes: null,
            modifiedAt: null,
            checksum: null,
            version: null,
            note: '未启用同步',
          })
          continue
        }

        const localSnapshot = localSnapshots.get(datasetId)
        const baseline = localState.files[datasetId] ?? null
        if (localSnapshot) {
          localFiles[datasetId] = toSyncFileInfo({
            datasetId,
            exists: true,
            sizeBytes: localSnapshot.sizeBytes,
            modifiedAt: localSnapshot.modifiedAt,
            checksum: localSnapshot.checksum,
            version: baseline?.version ?? null,
            note: localSnapshot.virtualNote,
          })
        } else {
          localFiles[datasetId] = toSyncFileInfo({
            datasetId,
            exists: false,
            sizeBytes: null,
            modifiedAt: null,
            checksum: null,
            version: baseline?.version ?? null,
            note: '本地快照不可用',
          })
        }

        if (remoteManifest) {
          const remoteEntry = remoteManifest.files[datasetId]
          if (remoteEntry) {
            remoteFiles[datasetId] = toSyncFileInfo({
              datasetId,
              exists: true,
              sizeBytes: remoteEntry.size,
              modifiedAt: remoteEntry.updatedAt,
              checksum: remoteEntry.sha256,
              version: remoteEntry.version,
              note: null,
            })
          } else {
            remoteFiles[datasetId] = toSyncFileInfo({
              datasetId,
              exists: false,
              sizeBytes: null,
              modifiedAt: null,
              checksum: null,
              version: null,
              note: '云端清单缺失',
            })
          }
          continue
        }

        const remotePayload = await this.client.getJsonIfExists(
          this.settings,
          objectKeys.datasetObjectKeys[datasetId],
        )
        if (remotePayload === null) {
          remoteFiles[datasetId] = toSyncFileInfo({
            datasetId,
            exists: false,
            sizeBytes: null,
            modifiedAt: null,
            checksum: null,
            version: null,
            note: '云端对象不存在',
          })
          continue
        }

        const remoteSerialized = JSON.stringify(remotePayload, null, 2)
        const remoteChecksum = hashSha256(
          stableStringify(canonicalizeDatasetPayload(datasetId, remotePayload)),
        )
        remoteFiles[datasetId] = toSyncFileInfo({
          datasetId,
          exists: true,
          sizeBytes: Buffer.byteLength(remoteSerialized, 'utf8'),
          modifiedAt: null,
          checksum: remoteChecksum,
          version: null,
          note: '未初始化清单',
        })
      }

      const conflictedDatasetIds = enabledDatasets.filter(datasetId => {
        const local = localFiles[datasetId]
        const remote = remoteFiles[datasetId]
        const baseline = localState.files[datasetId]
        if (!local.exists || !remote.exists || !local.checksum || !remote.checksum) {
          return false
        }

        if (baseline?.sha256) {
          const localChanged = local.checksum !== baseline.sha256
          const remoteChanged = remote.checksum !== baseline.sha256
          return localChanged && remoteChanged && local.checksum !== remote.checksum
        }

        return local.checksum !== remote.checksum
      })

      const suggested = this.resolveSuggestedDecision({
        enabledDatasets,
        localFiles,
        remoteFiles,
        localState,
        remoteManifest,
        conflictedDatasetIds,
      })

      return {
        local: {
          label: 'local',
          deviceId: localState.deviceId,
          updatedAt: localState.updatedAt,
          hasManifest: true,
          files: localFiles,
        },
        remote: {
          label: 'remote',
          deviceId: remoteManifest?.deviceId ?? null,
          updatedAt: remoteManifest?.updatedAt ?? null,
          hasManifest: remoteManifest !== null,
          files: remoteFiles,
        },
        hasConflict: conflictedDatasetIds.length > 0,
        conflictedDatasetIds,
        suggested,
      }
    })
  }

  public notePersistedSettings(input: NotifyOssBackupPersistedSettingsInput): OssBackupStateDto {
    const changedPluginIds = normalizeBuiltinPluginIds(input.changedPluginIds)
    if (!this.resolveAutoBackupEnabled()) {
      return this.state
    }

    const shouldBackupPlugins =
      changedPluginIds.includes('oss-backup') ||
      changedPluginIds.some(pluginId => this.settings.includedPluginIds.includes(pluginId))
    const shouldBackupInputHistory =
      this.settings.syncInputStatsHistoryEnabled && changedPluginIds.includes('input-stats')
    const shouldBackupQuotaHistory =
      this.settings.syncQuotaMonitorHistoryEnabled && changedPluginIds.includes('quota-monitor')
    const shouldBackupGitWorklogHistory =
      this.settings.syncGitWorklogHistoryEnabled && changedPluginIds.includes('git-worklog')

    if (
      !shouldBackupPlugins &&
      !shouldBackupInputHistory &&
      !shouldBackupQuotaHistory &&
      !shouldBackupGitWorklogHistory
    ) {
      return this.state
    }

    this.autoBackupRetryAttempts = 0
    this.scheduleAutoBackup()
    return this.state
  }

  public async dispose(): Promise<void> {
    this.disposed = true
    await this.deactivate()
    this.quotaHistoryStore.dispose()
    await this.gitWorklogHistoryStore.dispose()
  }

  private async activate(): Promise<void> {
    if (this.disposed || this.runtimeEnabled) {
      return
    }

    this.runtimeEnabled = true
    this.applyState({
      ...this.state,
      isEnabled: this.resolveFeatureEnabled(),
      status: this.resolveIdleStatus(this.resolveFeatureEnabled()),
    })
    this.registerAppLifecycleHandlers()
    this.runStartupRestoreIfNeeded()
    this.scheduleStartupAutoBackupPreviewIfNeeded()
  }

  private async deactivate(): Promise<void> {
    this.runtimeEnabled = false
    this.clearAutoBackupTimer()
    this.autoBackupRetryAttempts = 0
    this.unregisterAppLifecycleHandlers()
    this.beforeQuitBypassOnce = false
    this.exitBackupInFlight = false
    this.applyState({
      ...this.state,
      isEnabled: false,
      isTestingConnection: false,
      isBackingUp: false,
      isRestoring: false,
      nextAutoBackupDueAt: null,
      status: 'disabled',
    })
  }

  private resolveFeatureEnabled(): boolean {
    return this.runtimeEnabled && this.settings.enabled
  }

  private resolveAutoBackupEnabled(): boolean {
    return this.resolveFeatureEnabled() && this.settings.autoBackupEnabled
  }

  private resolveIdleStatus(isEnabled: boolean): OssBackupStateDto['status'] {
    if (!isEnabled) {
      return 'disabled'
    }

    if (this.state.lastError) {
      return 'error'
    }

    return this.state.lastBackupAt || this.state.lastRestoreAt ? 'ready' : 'idle'
  }

  private scheduleAutoBackup(delayMs = this.resolveAutoBackupDelayMs()): void {
    this.clearAutoBackupTimer()
    const dueAt = new Date(Date.now() + delayMs).toISOString()
    this.autoBackupTimer = setTimeout(() => {
      void this.performBackup('auto')
    }, delayMs)
    this.applyState({
      ...this.state,
      nextAutoBackupDueAt: dueAt,
    })
  }

  private clearAutoBackupTimer(): void {
    if (this.autoBackupTimer) {
      clearTimeout(this.autoBackupTimer)
      this.autoBackupTimer = null
    }
    if (this.state.nextAutoBackupDueAt !== null) {
      this.applyState({
        ...this.state,
        nextAutoBackupDueAt: null,
      })
    }
  }

  private scheduleStartupAutoBackupPreviewIfNeeded(): void {
    if (!this.resolveAutoBackupEnabled()) {
      return
    }
    if (!isOssBackupConfigured(this.settings)) {
      return
    }

    this.autoBackupRetryAttempts = 0
    this.scheduleAutoBackup()
  }

  private async performBackup(mode: 'manual' | 'auto' | 'exit'): Promise<OssBackupStateDto> {
    return await this.runSerialized(async () => {
      if (!this.runtimeEnabled) {
        this.applyState({
          ...this.state,
          isEnabled: false,
          status: 'disabled',
        })
        return this.state
      }

      if (!isOssBackupConfigured(this.settings)) {
        this.applyState({
          ...this.state,
          status: 'error',
          lastError: {
            message: '请先填写完整的 OSS 连接配置。',
            detail: null,
          },
        })
        return this.state
      }

      if (mode !== 'auto') {
        this.clearAutoBackupTimer()
      }
      this.applyState({
        ...this.state,
        isBackingUp: true,
        status: 'backing_up',
        nextAutoBackupDueAt: null,
        lastError: null,
      })

      try {
        const objectKeys = deriveObjectKeys(this.settings)
        const enabledDatasets = this.resolveEnabledDatasetIds()
        const localState = await this.loadLocalSyncState()
        const localSnapshots = await this.collectLocalSnapshots(enabledDatasets, objectKeys)
        const remoteManifest = await this.loadRemoteManifestIfExists(objectKeys.manifestKey)

        if (mode === 'auto') {
          const canPush = this.canAutoPush({
            enabledDatasets,
            localSnapshots,
            localState,
            remoteManifest,
          })
          if (!canPush) {
            this.autoBackupRetryAttempts = 0
            this.applyState({
              ...this.state,
              isBackingUp: false,
              status: this.resolveIdleStatus(this.resolveFeatureEnabled()),
              lastError: null,
            })
            return this.state
          }
        }

        const completedAt = new Date().toISOString()
        await this.uploadLocalSnapshots(localSnapshots)

        const nextManifestFiles = { ...(remoteManifest?.files ?? {}) }
        for (const datasetId of enabledDatasets) {
          const snapshot = localSnapshots.get(datasetId)
          if (!snapshot) {
            continue
          }
          const remoteVersion = remoteManifest?.files[datasetId]?.version ?? 0
          const localVersion = localState.files[datasetId]?.version ?? 0
          nextManifestFiles[datasetId] = {
            version: Math.max(remoteVersion, localVersion) + 1,
            updatedAt: completedAt,
            sha256: snapshot.checksum,
            size: snapshot.sizeBytes,
          }
        }

        const nextManifest: OssSyncManifestPayload = {
          schema: OSS_MANIFEST_SCHEMA,
          deviceId: localState.deviceId,
          updatedAt: completedAt,
          files: nextManifestFiles,
        }
        await this.uploadRemoteManifest(objectKeys.manifestKey, nextManifest)

        const nextLocalState: OssLocalSyncStatePayload = {
          ...localState,
          updatedAt: completedAt,
          files: {
            ...localState.files,
            ...Object.fromEntries(
              enabledDatasets
                .map(datasetId => [datasetId, nextManifestFiles[datasetId]] as const)
                .filter((entry): entry is [OssSyncDatasetId, OssSyncManifestFileEntry] => !!entry[1]),
            ),
          },
        }
        await this.saveLocalSyncState(nextLocalState)

        const pluginSnapshot = localSnapshots.get('plugin-settings')?.payload as
          | PluginBackupSnapshotDto
          | undefined
        this.applyState({
          ...this.state,
          isBackingUp: false,
          status: 'ready',
          lastBackupAt: completedAt,
          lastSnapshotAt: pluginSnapshot?.createdAt ?? this.state.lastSnapshotAt,
          lastError: null,
        })
        this.autoBackupRetryAttempts = 0
        return this.state
      } catch (error) {
        const errorDto = toErrorDto(error, '上传插件配置备份失败。')
        if (
          mode === 'auto' &&
          this.resolveAutoBackupEnabled() &&
          isRetriableNetworkLikeError(error) &&
          this.autoBackupRetryAttempts < AUTO_BACKUP_RETRY_MAX_ATTEMPTS
        ) {
          this.autoBackupRetryAttempts += 1
          const retryDelayMs = this.resolveAutoBackupRetryDelayMs(this.autoBackupRetryAttempts)
          this.scheduleAutoBackup(retryDelayMs)
          this.applyState({
            ...this.state,
            isBackingUp: false,
            status: 'error',
            lastError: {
              ...errorDto,
              message: `${errorDto.message}（将在稍后自动重试）`,
            },
          })
          return this.state
        }

        this.autoBackupRetryAttempts = 0
        this.applyState({
          ...this.state,
          isBackingUp: false,
          status: 'error',
          lastError: errorDto,
        })
        return this.state
      }
    })
  }

  private canAutoPush(options: {
    enabledDatasets: OssSyncDatasetId[]
    localSnapshots: Map<OssSyncDatasetId, LocalDatasetSnapshot>
    localState: OssLocalSyncStatePayload
    remoteManifest: OssSyncManifestPayload | null
  }): boolean {
    if (options.remoteManifest === null) {
      return false
    }

    let localChanged = false
    for (const datasetId of options.enabledDatasets) {
      const baseline = options.localState.files[datasetId]
      const remote = options.remoteManifest.files[datasetId]
      const local = options.localSnapshots.get(datasetId)
      if (!baseline || !remote || !local) {
        return false
      }

      if (remote.sha256 !== baseline.sha256) {
        return false
      }

      if (local.checksum !== baseline.sha256) {
        localChanged = true
      }
    }

    return localChanged
  }

  private resolveAutoBackupDelayMs(): number {
    const rawSeconds = this.settings.autoBackupMinIntervalSeconds
    const normalizedSeconds =
      typeof rawSeconds === 'number' && Number.isFinite(rawSeconds)
        ? Math.max(1, Math.round(rawSeconds))
        : 3
    return normalizedSeconds * 1000
  }

  private resolveAutoBackupRetryDelayMs(attempt: number): number {
    const expDelay = Math.min(
      AUTO_BACKUP_RETRY_MAX_DELAY_MS,
      AUTO_BACKUP_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    )
    const jitter =
      AUTO_BACKUP_RETRY_JITTER_MIN +
      Math.random() * (AUTO_BACKUP_RETRY_JITTER_MAX - AUTO_BACKUP_RETRY_JITTER_MIN)
    return Math.max(1000, Math.round(expDelay * jitter))
  }

  private runStartupRestoreIfNeeded(): void {
    if (!this.resolveFeatureEnabled() || !this.settings.restoreOnStartupEnabled) {
      return
    }
    if (!isOssBackupConfigured(this.settings)) {
      return
    }
    void this.restoreBackup().catch(() => undefined)
  }

  private registerAppLifecycleHandlers(): void {
    const electronApp = this.getAppLifecycleApi()
    if (!electronApp) {
      return
    }
    if (this.lifecycleHandlersRegistered) {
      return
    }

    electronApp.on('before-quit', this.handleBeforeQuit)
    electronApp.on('will-quit', this.handleWillQuit)
    this.lifecycleHandlersRegistered = true
  }

  private unregisterAppLifecycleHandlers(): void {
    const electronApp = this.getAppLifecycleApi()
    if (!electronApp) {
      this.lifecycleHandlersRegistered = false
      return
    }
    if (!this.lifecycleHandlersRegistered) {
      return
    }

    if (typeof electronApp.off === 'function') {
      electronApp.off('before-quit', this.handleBeforeQuit)
      electronApp.off('will-quit', this.handleWillQuit)
    }
    this.lifecycleHandlersRegistered = false
  }

  private async runBackupOnExitWithTimeout(): Promise<void> {
    if (this.exitBackupInFlight) {
      return
    }

    this.exitBackupInFlight = true
    try {
      await Promise.race([
        this.performBackup('exit').then(() => undefined),
        new Promise<void>(resolve => {
          setTimeout(resolve, EXIT_BACKUP_TIMEOUT_MS)
        }),
      ])
    } catch {
      // Ignore errors on app shutdown; allow quit to continue.
    } finally {
      this.exitBackupInFlight = false
      this.beforeQuitBypassOnce = true
      this.getAppLifecycleApi()?.quit?.()
    }
  }

  private getAppLifecycleApi(): AppLifecycleApi | null {
    const electronApp = app as unknown as {
      on?: (event: 'before-quit' | 'will-quit', listener: AppLifecycleListener) => void
      off?: (event: 'before-quit' | 'will-quit', listener: AppLifecycleListener) => void
      quit?: () => void
    }
    const on = typeof electronApp?.on === 'function' ? electronApp.on.bind(electronApp) : null
    if (!on) {
      return null
    }

    const off = typeof electronApp.off === 'function' ? electronApp.off.bind(electronApp) : undefined
    const quit = typeof electronApp.quit === 'function' ? electronApp.quit.bind(electronApp) : undefined

    return { on, off, quit }
  }

  private async applyRestoredPluginSettingsToPersistence(
    snapshot: PluginBackupSnapshotDto,
    restoredAt: string,
  ): Promise<void> {
    const store = await this.getPersistenceStore()
    const persistedAppState = await store.readAppState()
    const appStateRecord = isRecord(persistedAppState) ? persistedAppState : null
    const currentSettings = normalizeAgentSettings(appStateRecord?.settings)
    const mergedPlugins = mergeRestoredPluginSettings(currentSettings.plugins, snapshot)
    const nextSettings = normalizeAgentSettings({
      ...currentSettings,
      plugins: {
        ...mergedPlugins,
        ossBackup: {
          ...mergedPlugins.ossBackup,
          lastRestoreAt: restoredAt,
          lastError: null,
        },
      },
    })
    const nextAppState: Record<string, unknown> = appStateRecord
      ? {
          ...appStateRecord,
          settings: nextSettings,
        }
      : {
          formatVersion: 1,
          activeWorkspaceId: null,
          workspaces: [],
          settings: nextSettings,
        }

    const writeResult = await store.writeAppState(nextAppState)
    if (!writeResult.ok) {
      throw new Error('写入恢复后的插件配置失败。')
    }
  }

  private readonly handleBeforeQuit: AppLifecycleListener = (...args: unknown[]): void => {
    if (this.beforeQuitBypassOnce) {
      this.beforeQuitBypassOnce = false
      return
    }

    if (this.disposed || !this.runtimeEnabled) {
      return
    }
    if (!this.resolveFeatureEnabled() || !this.settings.backupOnExitEnabled) {
      return
    }
    if (!isOssBackupConfigured(this.settings)) {
      return
    }

    toAppLifecycleEvent(args[0])?.preventDefault()
    void this.runBackupOnExitWithTimeout()
  }

  private readonly handleWillQuit: AppLifecycleListener = (): void => {
    this.beforeQuitBypassOnce = false
    this.exitBackupInFlight = false
  }

  private resolveEnabledDatasetIds(): OssSyncDatasetId[] {
    const datasets: OssSyncDatasetId[] = ['plugin-settings']
    if (this.settings.syncInputStatsHistoryEnabled) {
      datasets.push('input-stats-history')
    }
    if (this.settings.syncQuotaMonitorHistoryEnabled) {
      datasets.push('quota-monitor-history')
    }
    if (this.settings.syncGitWorklogHistoryEnabled) {
      datasets.push('git-worklog-history')
    }
    return datasets
  }

  private async collectLocalSnapshots(
    enabledDatasets: OssSyncDatasetId[],
    objectKeys: OssObjectKeys,
  ): Promise<Map<OssSyncDatasetId, LocalDatasetSnapshot>> {
    const snapshots = new Map<OssSyncDatasetId, LocalDatasetSnapshot>()
    for (const datasetId of enabledDatasets) {
      let payload: unknown
      let modifiedAt = new Date().toISOString()
      let virtualNote: string | null = null

      if (datasetId === 'plugin-settings') {
        const snapshot = await this.readSnapshotFromPersistence()
        payload = snapshot
        modifiedAt = snapshot.createdAt
      } else if (datasetId === 'input-stats-history') {
        try {
          const raw = await readFile(this.inputStatsHistoryPath, 'utf8')
          payload = normalizeInputStatsHistoryPayload(JSON.parse(raw))
          const statsMeta = await stat(this.inputStatsHistoryPath)
          modifiedAt = statsMeta.mtime.toISOString()
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
            throw error
          }
          payload = {
            version: 1,
            updatedAt: new Date().toISOString(),
            days: {},
          }
          virtualNote = '本地尚无历史数据，按空集同步'
        }
      } else if (datasetId === 'git-worklog-history') {
        payload = await this.gitWorklogHistoryStore.exportForSync()
        modifiedAt =
          isRecord(payload) && parseIsoDate(payload.exportedAt)
            ? (parseIsoDate(payload.exportedAt) as string)
            : new Date().toISOString()
      } else {
        payload = await this.quotaHistoryStore.exportForSync()
        modifiedAt =
          isRecord(payload) && parseIsoDate(payload.exportedAt)
            ? (parseIsoDate(payload.exportedAt) as string)
            : new Date().toISOString()
      }

      const serialized = JSON.stringify(payload, null, 2)
      const canonical = stableStringify(canonicalizeDatasetPayload(datasetId, payload))
      const checksum = hashSha256(canonical)
      snapshots.set(datasetId, {
        datasetId,
        objectKey: objectKeys.datasetObjectKeys[datasetId],
        payload,
        modifiedAt,
        sizeBytes: Buffer.byteLength(serialized, 'utf8'),
        checksum,
        virtualNote,
      })
    }

    return snapshots
  }

  private async uploadLocalSnapshots(
    snapshots: Map<OssSyncDatasetId, LocalDatasetSnapshot>,
  ): Promise<void> {
    for (const snapshot of snapshots.values()) {
      await this.client.putJson(this.settings, snapshot.objectKey, snapshot.payload)
    }
  }

  private async applyRemoteDatasets(options: {
    enabledDatasets: OssSyncDatasetId[]
    objectKeys: OssObjectKeys
    remoteManifest: OssSyncManifestPayload | null
  }): Promise<PluginBackupSnapshotDto> {
    let restoredSnapshot: PluginBackupSnapshotDto | null = null
    for (const datasetId of options.enabledDatasets) {
      let payload: unknown | null = null
      if (options.remoteManifest) {
        if (!options.remoteManifest.files[datasetId]) {
          throw new Error(`云端清单缺少 ${datasetId} 数据集。`)
        }
        payload = await this.client.getJsonIfExists(
          this.settings,
          options.objectKeys.datasetObjectKeys[datasetId],
        )
        if (payload === null) {
          throw new Error(`云端对象缺少 ${datasetId} 数据集。`)
        }
      } else {
        payload = await this.client.getJsonIfExists(
          this.settings,
          options.objectKeys.datasetObjectKeys[datasetId],
        )
        if (payload === null) {
          if (datasetId === 'plugin-settings') {
            throw new Error('云端不存在可恢复的插件配置快照。')
          }
          continue
        }
      }

      if (datasetId === 'plugin-settings') {
        const snapshot = normalizePluginBackupSnapshot(payload)
        if (!snapshot) {
          throw new Error('云端备份文件格式无效。')
        }
        restoredSnapshot = snapshot
        continue
      }

      if (datasetId === 'input-stats-history') {
        await this.importInputStatsHistoryPayload(payload)
        continue
      }

      if (datasetId === 'git-worklog-history') {
        await this.importGitWorklogHistoryPayload(payload)
        continue
      }

      await this.importQuotaMonitorHistoryPayload(payload)
    }

    if (!restoredSnapshot) {
      throw new Error('云端不存在可恢复的插件配置快照。')
    }

    return restoredSnapshot
  }

  private async importInputStatsHistoryPayload(payload: unknown): Promise<void> {
    const normalized = normalizeInputStatsHistoryPayload(payload)
    await mkdir(dirname(this.inputStatsHistoryPath), { recursive: true })
    await writeFile(
      this.inputStatsHistoryPath,
      `${JSON.stringify(normalized, null, 2)}\n`,
      'utf8',
    )
  }

  private async importQuotaMonitorHistoryPayload(payload: unknown): Promise<void> {
    const normalized = normalizeQuotaMonitorHistoryPayload(payload)
    await this.quotaHistoryStore.importForSync(normalized)
  }

  private async importGitWorklogHistoryPayload(payload: unknown): Promise<void> {
    const normalized = normalizeGitWorklogHistoryPayload(payload)
    await this.gitWorklogHistoryStore.importForSync(normalized)
  }

  private createEmptyFileInfoRecord(): Record<OssSyncDatasetId, OssSyncFileInfoDto> {
    return {
      'plugin-settings': toSyncFileInfo({
        datasetId: 'plugin-settings',
        exists: false,
        sizeBytes: null,
        modifiedAt: null,
        checksum: null,
        version: null,
        note: null,
      }),
      'input-stats-history': toSyncFileInfo({
        datasetId: 'input-stats-history',
        exists: false,
        sizeBytes: null,
        modifiedAt: null,
        checksum: null,
        version: null,
        note: null,
      }),
      'quota-monitor-history': toSyncFileInfo({
        datasetId: 'quota-monitor-history',
        exists: false,
        sizeBytes: null,
        modifiedAt: null,
        checksum: null,
        version: null,
        note: null,
      }),
      'git-worklog-history': toSyncFileInfo({
        datasetId: 'git-worklog-history',
        exists: false,
        sizeBytes: null,
        modifiedAt: null,
        checksum: null,
        version: null,
        note: null,
      }),
    }
  }

  private resolveSuggestedDecision(options: {
    enabledDatasets: OssSyncDatasetId[]
    localFiles: Record<OssSyncDatasetId, OssSyncFileInfoDto>
    remoteFiles: Record<OssSyncDatasetId, OssSyncFileInfoDto>
    localState: OssLocalSyncStatePayload
    remoteManifest: OssSyncManifestPayload | null
    conflictedDatasetIds: OssSyncDatasetId[]
  }): OssSyncDecision | null {
    if (options.conflictedDatasetIds.length > 0) {
      return null
    }

    let hasLocalOnly = false
    let hasRemoteOnly = false
    let localAheadCount = 0
    let remoteAheadCount = 0

    for (const datasetId of options.enabledDatasets) {
      const local = options.localFiles[datasetId]
      const remote = options.remoteFiles[datasetId]
      const baseline = options.localState.files[datasetId]

      if (local.exists && !remote.exists) {
        hasLocalOnly = true
      }
      if (!local.exists && remote.exists) {
        hasRemoteOnly = true
      }

      if (!baseline?.sha256 || !local.checksum || !remote.checksum) {
        continue
      }
      const localChanged = local.checksum !== baseline.sha256
      const remoteChanged = remote.checksum !== baseline.sha256
      if (localChanged && !remoteChanged) {
        localAheadCount += 1
      }
      if (remoteChanged && !localChanged) {
        remoteAheadCount += 1
      }
    }

    if (hasLocalOnly && !hasRemoteOnly) {
      return 'use_local'
    }
    if (hasRemoteOnly && !hasLocalOnly) {
      return 'use_remote'
    }
    if (localAheadCount > 0 && remoteAheadCount === 0) {
      return 'use_local'
    }
    if (remoteAheadCount > 0 && localAheadCount === 0) {
      return 'use_remote'
    }

    const localUpdatedAt = parseIsoDate(options.localState.updatedAt)
    const remoteUpdatedAt = options.remoteManifest?.updatedAt ?? null
    if (localUpdatedAt && remoteUpdatedAt) {
      const localTime = new Date(localUpdatedAt).getTime()
      const remoteTime = new Date(remoteUpdatedAt).getTime()
      if (localTime > remoteTime) {
        return 'use_local'
      }
      if (remoteTime > localTime) {
        return 'use_remote'
      }
    }

    return null
  }

  private async loadRemoteManifestIfExists(objectKey: string): Promise<OssSyncManifestPayload | null> {
    const raw = await this.client.getJsonIfExists(this.settings, objectKey)
    if (raw === null) {
      return null
    }

    const manifest = normalizeManifest(raw)
    if (!manifest) {
      throw new Error('云端同步清单格式无效。')
    }
    return manifest
  }

  private async uploadRemoteManifest(
    objectKey: string,
    manifest: OssSyncManifestPayload,
  ): Promise<void> {
    await this.client.putJson(this.settings, objectKey, manifest)
  }

  private async loadLocalSyncState(): Promise<OssLocalSyncStatePayload> {
    try {
      const raw = await readFile(this.localSyncStatePath, 'utf8')
      return normalizeLocalSyncState(JSON.parse(raw))
    } catch (error) {
      const fallback = createInitialLocalSyncState()
      await this.saveLocalSyncState(fallback)
      return fallback
    }
  }

  private async saveLocalSyncState(state: OssLocalSyncStatePayload): Promise<void> {
    await mkdir(dirname(this.localSyncStatePath), { recursive: true })
    await writeFile(this.localSyncStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  }

  private async readSnapshotFromPersistence(): Promise<PluginBackupSnapshotDto> {
    const store = await this.getPersistenceStore()
    const persistedAppState = await store.readAppState()
    if (
      !persistedAppState ||
      typeof persistedAppState !== 'object' ||
      Array.isArray(persistedAppState)
    ) {
      throw new Error('当前还没有可用于备份的本地插件配置。')
    }

    const record = persistedAppState as Record<string, unknown>
    const normalizedSettings = normalizeAgentSettings(record.settings)
    return createPluginBackupSnapshot({
      appVersion: this.appVersion,
      pluginSettings: normalizedSettings.plugins,
    })
  }

  private applyState(nextState: OssBackupStateDto): void {
    this.state = nextState
    this.emitState(this.state)
  }

  private async runSerialized<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.operationChain
    let release: () => void = () => undefined
    this.operationChain = new Promise<void>(resolve => {
      release = resolve
    })

    await previous

    try {
      return await task()
    } finally {
      release()
    }
  }

  private broadcastState = (state: OssBackupStateDto): void => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.pluginsOssBackupState, state)
    }
  }
}
