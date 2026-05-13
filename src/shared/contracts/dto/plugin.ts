export interface SyncPluginRuntimeStateInput {
  enabledPluginIds: string[]
}

export interface SyncPluginRuntimeStateResult {
  activePluginIds: string[]
}

export type WorkspaceAssistantTone = 'neutral' | 'helpful' | 'urgent'

export interface WorkspaceAssistantSettingsDto {
  enabled: boolean
  dockCollapsed: boolean
  autoOpenOnStartup: boolean
  proactiveRemindersEnabled: boolean
  proactiveReminderIntervalMinutes: number
  modelProvider: 'local' | 'openai-compatible'
  aiEnabled: boolean
  apiBaseUrl: string
  apiKey: string
  modelName: string
  allowProjectScan: boolean
  allowWorkspaceSummary: boolean
  allowTaskInsight: boolean
  allowFollowUpQuestions: boolean
  allowSuggestionToasts: boolean
  assistantNotes: string
}

export type EyeCareMode = 'gentle' | 'forced-blur'
export type EyeCarePhase = 'idle' | 'working' | 'breaking' | 'paused'

export interface EyeCareSettingsDto {
  workDurationMinutes: number
  breakDurationSeconds: number
  mode: EyeCareMode
  strictMode: boolean
  allowPostpone: boolean
  postponeMinutes: number
  allowSkip: boolean
  autoStartNextCycle: boolean
}

export interface EyeCareStateDto {
  status: 'disabled' | 'idle' | 'running'
  phase: EyeCarePhase
  phaseStartedAt: string | null
  phaseEndsAt: string | null
  remainingSeconds: number
  cycleIndex: number
  completedBreakCountToday: number
  lastBreakFinishedAt: string | null
  isOverlayVisible: boolean
  isPaused: boolean
  isStopped: boolean
  isRunning: boolean
  canStart: boolean
  canPause: boolean
  canResume: boolean
  canStop: boolean
  canSkip: boolean
  canPostpone: boolean
}

export interface SyncEyeCareSettingsInput {
  settings: EyeCareSettingsDto
}

export interface WorkspaceAssistantInsightDto {
  id: string
  tone: WorkspaceAssistantTone
  title: string
  body: string
  source: string
  createdAt: string
  actionLabel: string | null
}

export interface WorkspaceAssistantConversationMessageDto {
  id: string
  role: 'assistant' | 'user' | 'system'
  content: string
  createdAt: string
}

export interface WorkspaceAssistantTaskSnapshotDto {
  id: string
  title: string
  status: 'todo' | 'doing' | 'ai_done' | 'done'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  linkedAgentNodeId: string | null
  lastRunAt: string | null
}

export interface WorkspaceAssistantAgentSnapshotDto {
  id: string
  title: string
  status: string | null
  provider: string | null
  taskId: string | null
  prompt: string
  lastError: string | null
}

export interface WorkspaceAssistantNoteSnapshotDto {
  id: string
  title: string
  text: string
}

export interface WorkspaceAssistantProjectFileSummaryDto {
  kind: 'readme' | 'package_json' | 'tsconfig' | 'pnpm_workspace' | 'gitignore' | 'other'
  name: string
  path: string
  summary: string
}

export interface WorkspaceAssistantSpaceSnapshotDto {
  id: string
  name: string
  nodeCount: number
}

export interface WorkspaceAssistantWorkspaceSnapshotDto {
  id: string
  name: string
  path: string
  activeSpaceId: string | null
  spaceCount: number
  nodeCount: number
  taskCount: number
  agentCount: number
  noteCount: number
  terminalCount: number
  projectSummary: string | null
  projectFiles: WorkspaceAssistantProjectFileSummaryDto[]
  tasks: WorkspaceAssistantTaskSnapshotDto[]
  agents: WorkspaceAssistantAgentSnapshotDto[]
  notes: WorkspaceAssistantNoteSnapshotDto[]
  spaces: WorkspaceAssistantSpaceSnapshotDto[]
}

export type WorkspaceAssistantRuntimeStatus =
  | 'disabled'
  | 'idle'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'warning'
  | 'error'

export interface WorkspaceAssistantStateDto {
  isEnabled: boolean
  isDockCollapsed: boolean
  isAutoOpenOnStartup: boolean
  status: WorkspaceAssistantRuntimeStatus
  lastUpdatedAt: string | null
  unreadInsights: number
  currentWorkspace: WorkspaceAssistantWorkspaceSnapshotDto | null
  insights: WorkspaceAssistantInsightDto[]
  conversation: WorkspaceAssistantConversationMessageDto[]
  settings: WorkspaceAssistantSettingsDto
}

export interface SyncWorkspaceAssistantSettingsInput {
  settings: WorkspaceAssistantSettingsDto
}

export interface SyncWorkspaceAssistantWorkspaceSnapshotInput {
  snapshot: WorkspaceAssistantWorkspaceSnapshotDto | null
}

export interface WorkspaceAssistantPromptInput {
  prompt: string
  workspaceId: string | null
  workspaceSnapshot?: WorkspaceAssistantWorkspaceSnapshotDto | null
}

export interface WorkspaceAssistantPromptResult {
  reply: string
  suggestions: string[]
}

export interface WorkspaceAssistantStopPromptResult {
  stopped: boolean
  reply: string | null
}

export interface WorkspaceAssistantConnectionTestResult {
  ok: boolean
  message: string
}

export type InputStatsHistoryMetric = 'clicks' | 'keys' | 'movement' | 'scroll'
export type InputStatsTopKeysRange = 0 | 1 | 7 | 15 | 30
export type InputStatsHistoryRangeDays = 7 | 30
export type InputStatsCumulativeRangeDays = 0 | 1 | 7 | 15 | 30

export interface InputStatsSettingsDto {
  pollIntervalMs: number
  historyRangeDays: InputStatsHistoryRangeDays
  topKeysRange: InputStatsTopKeysRange
  cumulativeRangeDays: InputStatsCumulativeRangeDays
}

export interface InputStatsDailyStatsDto {
  day: string
  keyPresses: number
  leftClicks: number
  rightClicks: number
  mouseDistancePx: number
  scrollSteps: number
}

export interface InputStatsKeyCountItemDto {
  key: string
  count: number
}

export interface InputStatsHistoryPointDto {
  day: string
  label: string
  value: number
}

export interface InputStatsMetricTotalsDto {
  clicks: number
  keys: number
  movement: number
  scroll: number
}

export interface InputStatsErrorDto {
  message: string
  detail: string | null
}

export type InputStatsStateStatus =
  | 'disabled'
  | 'unsupported'
  | 'idle'
  | 'starting'
  | 'ready'
  | 'error'

export interface InputStatsStateDto {
  isEnabled: boolean
  isSupported: boolean
  isMonitoring: boolean
  status: InputStatsStateStatus
  lastUpdatedAt: string | null
  settings: InputStatsSettingsDto
  today: InputStatsDailyStatsDto
  topKeysRange: InputStatsTopKeysRange
  topKeys: InputStatsKeyCountItemDto[]
  allKeys: InputStatsKeyCountItemDto[]
  historyRangeDays: InputStatsHistoryRangeDays
  historySeriesByMetric: Record<InputStatsHistoryMetric, InputStatsHistoryPointDto[]>
  cumulativeRangeDays: InputStatsCumulativeRangeDays
  cumulativeTotals: InputStatsMetricTotalsDto
  lastError: InputStatsErrorDto | null
}

export interface SyncInputStatsSettingsInput {
  settings: InputStatsSettingsDto
}

export type SystemMonitorHistoryRangeDays = 1 | 7 | 30
export type SystemMonitorGpuMode = 'off' | 'total'
export type SystemMonitorHeaderDisplayItem = 'download' | 'upload' | 'cpu' | 'memory' | 'gpu'

export interface SystemMonitorHeaderSettingsDto {
  displayItems: SystemMonitorHeaderDisplayItem[]
}

export interface SystemMonitorSettingsDto {
  pollIntervalMs: number
  backgroundPollIntervalMs: number
  saveIntervalMs: number
  historyRangeDays: SystemMonitorHistoryRangeDays
  gpuMode: SystemMonitorGpuMode
  header: SystemMonitorHeaderSettingsDto
}

export interface SystemMonitorSnapshotDto {
  recordedAt: string
  uploadBytesPerSecond: number
  downloadBytesPerSecond: number
  cpuUsagePercent: number
  memoryUsagePercent: number
  gpuUsagePercent: number | null
}

export interface SystemMonitorDailyTrafficDto {
  day: string
  uploadBytes: number
  downloadBytes: number
}

export interface SystemMonitorErrorDto {
  message: string
  detail: string | null
}

export type SystemMonitorStateStatus =
  | 'disabled'
  | 'unsupported'
  | 'idle'
  | 'starting'
  | 'ready'
  | 'partial_error'
  | 'error'

export interface SystemMonitorStateDto {
  isEnabled: boolean
  isSupported: boolean
  isMonitoring: boolean
  status: SystemMonitorStateStatus
  lastUpdatedAt: string | null
  settings: SystemMonitorSettingsDto
  current: SystemMonitorSnapshotDto
  historyRangeDays: SystemMonitorHistoryRangeDays
  history: SystemMonitorSnapshotDto[]
  todayTraffic: SystemMonitorDailyTrafficDto
  recentDaysTraffic: SystemMonitorDailyTrafficDto[]
  lastError: SystemMonitorErrorDto | null
}

export interface SyncSystemMonitorSettingsInput {
  settings: SystemMonitorSettingsDto
}

export type QuotaMonitorKeyType = 'normal' | 'capped'

export interface QuotaMonitorKeyProfileDto {
  id: string
  label: string
  apiKey: string
  enabled: boolean
  type: QuotaMonitorKeyType
  dailyInitialQuota: number
  hourlyIncreaseQuota: number
  quotaCap: number
}

export interface QuotaMonitorSettingsDto {
  apiBaseUrl: string
  refreshIntervalMs: number
  timeoutSeconds: number
  retryTimes: number
  verifySsl: boolean
  proxy: string
  keyProfiles: QuotaMonitorKeyProfileDto[]
}

export type QuotaMonitorStateStatus =
  | 'disabled'
  | 'needs_config'
  | 'idle'
  | 'loading'
  | 'ready'
  | 'partial_error'
  | 'error'

export type QuotaMonitorErrorType = 'timeout' | 'network' | 'ssl' | 'invalid_response' | 'unknown'

export interface QuotaMonitorErrorDto {
  type: QuotaMonitorErrorType
  message: string
  detail: string | null
}

export interface QuotaMonitorProfileStateDto {
  profileId: string
  label: string
  keyType: QuotaMonitorKeyType
  tokenName: string | null
  todayUsedQuota: number
  todayUsedQuotaIntDisplay: string
  averageQuotaPerCall: number
  remainQuotaDisplay: string
  remainQuotaValue: number
  remainQuotaIntDisplay: string
  todayUsageCount: number
  expiredTimeFormatted: string
  remainingDaysLabel: string
  estimatedRemainingHours: number | null
  estimatedRemainingTimeLabel: string
  statusText: string
  remainRatio: number
  workDurationTodaySeconds: number
  workDurationAllTimeSeconds: number
  dailyTrend: QuotaMonitorTrendPointDto[]
  hourlyTrend: QuotaMonitorTrendPointDto[]
  modelUsageSummary: QuotaMonitorModelUsageSummaryDto | null
  dailyTokenTrend: QuotaMonitorModelTrendDto
  hourlyTokenTrend: QuotaMonitorModelTrendDto
  cappedInsight: QuotaMonitorCappedInsightDto | null
  lastFetchedAt: string | null
  error: QuotaMonitorErrorDto | null
}

export interface QuotaMonitorTrendPointDto {
  label: string
  quota: number
  count: number
}

export interface QuotaMonitorModelMetricDto {
  modelName: string
  calls: number
  todayTokens: number
  totalTokens: number
  activeDays: number
  averageDailyTokens: number
}

export interface QuotaMonitorModelUsageSummaryDto {
  totalCalls: number
  totalTokens: number
  todayTokens: number
  activeDays: number
  averageDailyTokens: number
  latestRequestTime: string | null
  models: QuotaMonitorModelMetricDto[]
}

export interface QuotaMonitorModelTrendDto {
  labels: string[]
  seriesByModel: Record<string, number[]>
}

export interface QuotaMonitorCappedInsightDto {
  wastedTodayQuota: number
  wastedTotalQuota: number
  requiredConsume: number
  nextTopUpInMinutes: number | null
  nextTopUpAmount: number | null
}

export interface QuotaMonitorStateDto {
  isEnabled: boolean
  isRefreshing: boolean
  status: QuotaMonitorStateStatus
  lastUpdatedAt: string | null
  configuredProfileCount: number
  activeProfileCount: number
  successfulProfileCount: number
  profiles: QuotaMonitorProfileStateDto[]
  lastError: QuotaMonitorErrorDto | null
}

export interface SyncQuotaMonitorSettingsInput {
  settings: QuotaMonitorSettingsDto
}

export interface GitWorklogRepositoryDto {
  id: string
  label: string
  path: string
  enabled: boolean
  origin?: 'manual' | 'auto'
  assignedWorkspaceId?: string | null
}

export interface GitWorklogWorkspaceDto {
  id: string
  name: string
  path: string
}

export interface GitWorklogAutoCandidateDto {
  id: string
  label: string
  path: string
  parentWorkspaceId: string | null
  parentWorkspaceName: string | null
  parentWorkspacePath: string | null
  detectedAt: string | null
}

export interface GitWorklogPendingImportDto {
  workspaceId: string
  workspaceName: string
  workspacePath: string
  detectedAt: string | null
  repositories: GitWorklogAutoCandidateDto[]
  error?: GitWorklogErrorDto | null
  retryCount?: number
}

export interface GitWorklogDismissedImportDto {
  workspaceId: string | null
  workspaceName: string
  workspacePath: string
  dismissedAt: string | null
}

export interface RefreshGitWorklogWorkspaceInput {
  workspacePath: string
}

export interface AcceptGitWorklogPendingImportInput {
  workspacePath: string
}

export interface DismissGitWorklogPendingImportInput {
  workspacePath: string
}

export interface RestoreGitWorklogDismissedImportInput {
  workspacePath: string
}

export type GitWorklogRangeMode = 'recent_days' | 'date_range'

export interface GitWorklogSettingsDto {
  repositories: GitWorklogRepositoryDto[]
  repositoryOrder: string[]
  workspaceOrder: string[]
  ignoredAutoRepositoryPaths: string[]
  autoImportedWorkspacePaths: string[]
  dismissedWorkspacePaths: string[]
  authorFilter: string
  rangeMode: GitWorklogRangeMode
  recentDays: number
  rangeStartDay: string
  rangeEndDay: string
  autoRefreshEnabled: boolean
  refreshIntervalMs: number
  autoDiscoverEnabled: boolean
  autoDiscoverDepth: number
}

export type OssBackupProvider = 'aliyun-oss'
export type OssSyncDatasetId =
  | 'plugin-settings'
  | 'input-stats-history'
  | 'quota-monitor-history'
  | 'git-worklog-history'
export type OssSyncDecision = 'use_local' | 'use_remote'

export interface OssBackupErrorDto {
  message: string
  detail: string | null
}

export interface OssBackupSettingsDto {
  enabled: boolean
  provider: OssBackupProvider
  endpoint: string
  region: string
  bucket: string
  objectKey: string
  accessKeyId: string
  accessKeySecret: string
  autoBackupEnabled: boolean
  autoBackupMinIntervalSeconds: number
  restoreOnStartupEnabled: boolean
  backupOnExitEnabled: boolean
  includedPluginIds: string[]
  syncInputStatsHistoryEnabled: boolean
  syncQuotaMonitorHistoryEnabled: boolean
  syncGitWorklogHistoryEnabled: boolean
  lastBackupAt: string | null
  lastRestoreAt: string | null
  lastError: OssBackupErrorDto | null
}

export interface BackupQuotaMonitorKeyProfileDto {
  id: string
  label: string
  apiKey: string
  enabled: boolean
  type: QuotaMonitorKeyType
  dailyInitialQuota: number
  hourlyIncreaseQuota: number
  quotaCap: number
}

export interface BackupQuotaMonitorSettingsDto {
  apiBaseUrl: string
  refreshIntervalMs: number
  timeoutSeconds: number
  retryTimes: number
  verifySsl: boolean
  proxy: string
  keyProfiles: BackupQuotaMonitorKeyProfileDto[]
}

export interface BackupOssSettingsDto {
  provider: OssBackupProvider
  endpoint: string
  region: string
  bucket: string
  objectKey: string
  autoBackupEnabled: boolean
  autoBackupMinIntervalSeconds: number
  restoreOnStartupEnabled: boolean
  backupOnExitEnabled: boolean
  includedPluginIds: string[]
  syncInputStatsHistoryEnabled: boolean
  syncQuotaMonitorHistoryEnabled: boolean
  syncGitWorklogHistoryEnabled: boolean
}

export interface BackupWorkspaceAssistantSettingsDto {
  enabled: boolean
  dockCollapsed: boolean
  autoOpenOnStartup: boolean
  proactiveRemindersEnabled: boolean
  proactiveReminderIntervalMinutes: number
  modelProvider: 'local' | 'openai-compatible'
  aiEnabled: boolean
  apiBaseUrl: string
  apiKey: string
  modelName: string
  allowProjectScan: boolean
  allowWorkspaceSummary: boolean
  allowTaskInsight: boolean
  allowFollowUpQuestions: boolean
  allowSuggestionToasts: boolean
  assistantNotes: string
}

export interface PluginBackupSnapshotDto {
  formatVersion: number
  createdAt: string
  appVersion: string
  plugins: {
    enabledIds: string[]
    eyeCare?: EyeCareSettingsDto
    quotaMonitor?: BackupQuotaMonitorSettingsDto
    gitWorklog?: GitWorklogSettingsDto
    ossBackup?: BackupOssSettingsDto
    workspaceAssistant?: BackupWorkspaceAssistantSettingsDto
  }
}

export type OssBackupStateStatus =
  | 'disabled'
  | 'idle'
  | 'testing'
  | 'backing_up'
  | 'restoring'
  | 'ready'
  | 'error'

export interface OssBackupStateDto {
  isEnabled: boolean
  status: OssBackupStateStatus
  isTestingConnection: boolean
  isBackingUp: boolean
  isRestoring: boolean
  nextAutoBackupDueAt: string | null
  lastBackupAt: string | null
  lastRestoreAt: string | null
  lastSnapshotAt: string | null
  includedPluginIds: string[]
  lastError: OssBackupErrorDto | null
}

export interface OssSyncFileInfoDto {
  datasetId: OssSyncDatasetId
  exists: boolean
  sizeBytes: number | null
  modifiedAt: string | null
  checksum: string | null
  checksumType: 'SHA256'
  version: number | null
  note: string | null
}

export interface OssSyncSideDto {
  label: 'local' | 'remote'
  deviceId: string | null
  updatedAt: string | null
  hasManifest: boolean
  files: Record<OssSyncDatasetId, OssSyncFileInfoDto>
}

export interface OssSyncComparisonDto {
  local: OssSyncSideDto
  remote: OssSyncSideDto
  hasConflict: boolean
  conflictedDatasetIds: OssSyncDatasetId[]
  suggested: OssSyncDecision | null
}

export interface SyncOssBackupSettingsInput {
  settings: OssBackupSettingsDto
}

export interface NotifyOssBackupPersistedSettingsInput {
  changedPluginIds: string[]
}

export interface RestorePluginBackupResultDto {
  snapshot: PluginBackupSnapshotDto
}

export type GitWorklogStateStatus =
  | 'disabled'
  | 'needs_config'
  | 'idle'
  | 'loading'
  | 'ready'
  | 'partial_error'
  | 'error'

export type GitWorklogErrorType =
  | 'invalid_path'
  | 'unapproved_path'
  | 'git_unavailable'
  | 'not_git_repo'
  | 'command_failed'
  | 'unknown'

export interface GitWorklogErrorDto {
  type: GitWorklogErrorType
  message: string
  detail: string | null
}

export interface GitWorklogOverviewDto {
  monitoredRepoCount: number
  activeRepoCount: number
  healthyRepoCount: number
  commitCountToday: number
  filesChangedToday: number
  additionsToday: number
  deletionsToday: number
  changedLinesToday: number
  commitCountInRange: number
  filesChangedInRange: number
  additionsInRange: number
  deletionsInRange: number
  changedLinesInRange: number
  totalCodeFiles: number
  totalCodeLines: number
  dailyPoints: GitWorklogDailyPointDto[]
  heatmapDailyPoints: GitWorklogDailyPointDto[]
}

export interface GitWorklogDailyPointDto {
  day: string
  label: string
  commitCount: number
  filesChanged: number
  additions: number
  deletions: number
  changedLines: number
}

export interface GitWorklogRepoStateDto {
  repoId: string
  label: string
  path: string
  origin: 'manual' | 'auto'
  parentWorkspaceId: string | null
  parentWorkspaceName: string | null
  parentWorkspacePath: string | null
  commitCountToday: number
  filesChangedToday: number
  additionsToday: number
  deletionsToday: number
  changedLinesToday: number
  netLinesToday: number
  commitCountInRange: number
  filesChangedInRange: number
  additionsInRange: number
  deletionsInRange: number
  changedLinesInRange: number
  totalCodeFiles: number
  totalCodeLines: number
  dailyPoints: GitWorklogDailyPointDto[]
  heatmapDailyPoints: GitWorklogDailyPointDto[]
  lastScannedAt: string | null
  error: GitWorklogErrorDto | null
}

export interface GitWorklogStateDto {
  isEnabled: boolean
  isRefreshing: boolean
  status: GitWorklogStateStatus
  lastUpdatedAt: string | null
  configuredRepoCount: number
  activeRepoCount: number
  successfulRepoCount: number
  overview: GitWorklogOverviewDto
  repos: GitWorklogRepoStateDto[]
  autoCandidates?: GitWorklogAutoCandidateDto[]
  pendingImports?: GitWorklogPendingImportDto[]
  dismissedImports?: GitWorklogDismissedImportDto[]
  availableWorkspaces?: GitWorklogWorkspaceDto[]
  lastError: GitWorklogErrorDto | null
}

export interface SyncGitWorklogSettingsInput {
  settings: GitWorklogSettingsDto
}

export interface SyncGitWorklogWorkspacesInput {
  workspaces: GitWorklogWorkspaceDto[]
}

export interface ResolveGitWorklogRepositoryInput {
  path: string
}

export interface ResolveGitWorklogRepositoryResult {
  path: string
  label: string
}

export interface GitWorklogRepositoryRepairChangeDto {
  repositoryId: string
  path: string
  changes: string[]
}

export interface GitWorklogRepositoryRepairSummaryDto {
  duplicateIdsFixed: number
  duplicatePathsFixed: number
  pathsNormalized: number
  workspaceAssignmentsFixed: number
  labelsFixed: number
}

export interface RepairGitWorklogRepositoriesInput {
  settings: GitWorklogSettingsDto
  availableWorkspaces: GitWorklogWorkspaceDto[]
}

export interface RepairGitWorklogRepositoriesResultDto {
  repairedSettings: GitWorklogSettingsDto
  summary: GitWorklogRepositoryRepairSummaryDto
  changedRepositories: GitWorklogRepositoryRepairChangeDto[]
  backupAvailable: boolean
}

export interface UndoGitWorklogRepositoriesRepairInput {
  settings: GitWorklogSettingsDto
}

export interface UndoGitWorklogRepositoriesRepairResultDto {
  restoredSettings: GitWorklogSettingsDto
  restored: boolean
}
