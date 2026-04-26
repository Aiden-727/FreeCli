import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  GitWorklogStateDto,
  OssBackupStateDto,
  OssSyncComparisonDto,
  QuotaMonitorStateDto,
  WorkspaceAssistantStateDto,
} from '../../../src/shared/contracts/dto'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'
import { PluginManagerPanel } from '../../../src/contexts/plugins/presentation/renderer/PluginManagerPanel'

function createQuotaProfileState(overrides: Record<string, unknown> = {}) {
  return {
    profileId: 'key_1',
    label: 'Key 1',
    keyType: 'normal',
    tokenName: 'Primary Key',
    todayUsedQuota: 128,
    todayUsedQuotaIntDisplay: '128',
    averageQuotaPerCall: 8,
    remainQuotaDisplay: '2048',
    remainQuotaValue: 2048,
    remainQuotaIntDisplay: '2048',
    todayUsageCount: 16,
    expiredTimeFormatted: '2026-12-31',
    remainingDaysLabel: '剩余273天',
    estimatedRemainingHours: 96,
    estimatedRemainingTimeLabel: '96时0分',
    statusText: '正常',
    remainRatio: 0.8,
    workDurationTodaySeconds: 5400,
    workDurationAllTimeSeconds: 86400,
    dailyTrend: [
      { label: '04/01', quota: 48, count: 6 },
      { label: '04/02', quota: 128, count: 16 },
    ],
    hourlyTrend: [
      { label: '09:00', quota: 12, count: 2 },
      { label: '10:00', quota: 24, count: 4 },
      { label: '11:00', quota: 18, count: 3 },
    ],
    modelUsageSummary: null,
    dailyTokenTrend: {
      labels: ['04/01', '04/02'],
      seriesByModel: {
        'gpt-4.1': [120, 260],
        'claude-3.7': [80, 140],
      },
    },
    hourlyTokenTrend: {
      labels: ['09:00', '10:00', '11:00'],
      seriesByModel: {
        'gpt-4.1': [30, 90, 60],
        'claude-3.7': [12, 50, 38],
      },
    },
    cappedInsight: null,
    lastFetchedAt: '2026-04-02T09:30:00.000Z',
    error: null,
    ...overrides,
  }
}

function installQuotaMonitorApiMock(overrides: Partial<QuotaMonitorStateDto> = {}) {
  const state: QuotaMonitorStateDto = {
    isEnabled: false,
    isRefreshing: false,
    status: 'needs_config',
    lastUpdatedAt: null,
    configuredProfileCount: 0,
    activeProfileCount: 1,
    successfulProfileCount: 0,
    profiles: [],
    lastError: null,
    ...overrides,
  }

  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        quotaMonitor: {
          getState: vi.fn().mockResolvedValue(state),
          refresh: vi.fn().mockResolvedValue(state),
          onState: vi.fn().mockImplementation(() => () => undefined),
        },
      },
    },
  })
}

function installGitWorklogApiMock(overrides: Partial<GitWorklogStateDto> = {}) {
  const state: GitWorklogStateDto = {
    isEnabled: false,
    isRefreshing: false,
    status: 'needs_config',
    lastUpdatedAt: null,
    configuredRepoCount: 0,
    activeRepoCount: 1,
    successfulRepoCount: 0,
    overview: {
      monitoredRepoCount: 0,
      activeRepoCount: 0,
      healthyRepoCount: 0,
      commitCountToday: 0,
      filesChangedToday: 0,
      additionsToday: 0,
      deletionsToday: 0,
      changedLinesToday: 0,
      commitCountInRange: 0,
      filesChangedInRange: 0,
      additionsInRange: 0,
      deletionsInRange: 0,
      changedLinesInRange: 0,
      totalCodeFiles: 0,
      totalCodeLines: 0,
      dailyPoints: [],
      heatmapDailyPoints: [],
    },
    repos: [],
    autoCandidates: [],
    pendingImports: [],
    dismissedImports: [],
    availableWorkspaces: [],
    lastError: null,
    ...overrides,
  }

  const current = (window as unknown as { freecliApi?: Record<string, unknown> }).freecliApi
  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      ...(current ?? {}),
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        ...((current?.plugins as Record<string, unknown> | undefined) ?? {}),
        gitWorklog: {
          getState: vi.fn().mockResolvedValue(state),
          refresh: vi.fn().mockResolvedValue(state),
          refreshWorkspace: vi.fn().mockResolvedValue(state),
          acceptPendingImport: vi.fn().mockResolvedValue(state),
          dismissPendingImport: vi.fn().mockResolvedValue(state),
          restoreDismissedImport: vi.fn().mockResolvedValue(state),
          resolveRepository: vi.fn().mockImplementation(async ({ path }: { path: string }) => ({
            path,
            label: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path,
          })),
          onState: vi.fn().mockImplementation(() => () => undefined),
        },
      },
    },
  })
}

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {
    promise,
    resolve,
    reject,
  }
}

function createDefaultOssSyncComparison(): OssSyncComparisonDto {
  return {
    local: {
      label: 'local',
      deviceId: 'DEV_LOCAL',
      updatedAt: '2026-04-04T10:00:00.000Z',
      hasManifest: true,
      files: {
        'plugin-settings': {
          datasetId: 'plugin-settings',
          exists: true,
          sizeBytes: 128,
          modifiedAt: '2026-04-04T10:00:00.000Z',
          checksum: 'local_plugin_settings',
          checksumType: 'SHA256',
          version: 2,
          note: null,
        },
        'input-stats-history': {
          datasetId: 'input-stats-history',
          exists: true,
          sizeBytes: 64,
          modifiedAt: '2026-04-04T10:00:00.000Z',
          checksum: 'local_input_history',
          checksumType: 'SHA256',
          version: 1,
          note: null,
        },
        'quota-monitor-history': {
          datasetId: 'quota-monitor-history',
          exists: true,
          sizeBytes: 64,
          modifiedAt: '2026-04-04T10:00:00.000Z',
          checksum: 'local_quota_history',
          checksumType: 'SHA256',
          version: 1,
          note: null,
        },
        'git-worklog-history': {
          datasetId: 'git-worklog-history',
          exists: true,
          sizeBytes: 80,
          modifiedAt: '2026-04-04T10:00:00.000Z',
          checksum: 'local_git_worklog_history',
          checksumType: 'SHA256',
          version: 2,
          note: null,
        },
      },
    },
    remote: {
      label: 'remote',
      deviceId: 'DEV_REMOTE',
      updatedAt: '2026-04-04T10:00:00.000Z',
      hasManifest: true,
      files: {
        'plugin-settings': {
          datasetId: 'plugin-settings',
          exists: true,
          sizeBytes: 128,
          modifiedAt: '2026-04-04T10:00:00.000Z',
          checksum: 'remote_plugin_settings',
          checksumType: 'SHA256',
          version: 3,
          note: null,
        },
        'input-stats-history': {
          datasetId: 'input-stats-history',
          exists: true,
          sizeBytes: 64,
          modifiedAt: '2026-04-04T10:00:00.000Z',
          checksum: 'remote_input_history',
          checksumType: 'SHA256',
          version: 1,
          note: null,
        },
        'quota-monitor-history': {
          datasetId: 'quota-monitor-history',
          exists: true,
          sizeBytes: 64,
          modifiedAt: '2026-04-04T10:00:00.000Z',
          checksum: 'remote_quota_history',
          checksumType: 'SHA256',
          version: 1,
          note: null,
        },
        'git-worklog-history': {
          datasetId: 'git-worklog-history',
          exists: true,
          sizeBytes: 96,
          modifiedAt: '2026-04-04T10:00:00.000Z',
          checksum: 'remote_git_worklog_history',
          checksumType: 'SHA256',
          version: 3,
          note: null,
        },
      },
    },
    hasConflict: false,
    conflictedDatasetIds: [],
    suggested: 'use_remote',
  }
}

function installOssBackupApiMock(
  overrides: Partial<OssBackupStateDto> = {},
  options: {
    comparison?: OssSyncComparisonDto
  } = {},
) {
  const state: OssBackupStateDto = {
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
    ...overrides,
  }

  const current = (window as unknown as { freecliApi?: Record<string, unknown> }).freecliApi
  const comparison = options.comparison ?? createDefaultOssSyncComparison()
  const ossBackupApi = {
    getState: vi.fn().mockResolvedValue(state),
    testConnection: vi.fn().mockResolvedValue(state),
    backup: vi.fn().mockResolvedValue(state),
    restore: vi.fn().mockResolvedValue({
      snapshot: {
        formatVersion: 1,
        createdAt: '2026-04-04T10:00:00.000Z',
        appVersion: '0.2.0',
        plugins: {
          enabledIds: ['oss-backup'],
        },
      },
    }),
    getSyncComparison: vi.fn().mockResolvedValue(comparison),
    onState: vi.fn().mockImplementation(() => () => undefined),
  }
  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      ...(current ?? {}),
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        ...((current?.plugins as Record<string, unknown> | undefined) ?? {}),
        ossBackup: ossBackupApi,
      },
    },
  })
  return ossBackupApi
}

function installWorkspaceAssistantApiMock(overrides: Partial<WorkspaceAssistantStateDto> = {}) {
  const state: WorkspaceAssistantStateDto = {
    isEnabled: true,
    isDockCollapsed: false,
    isAutoOpenOnStartup: true,
    status: 'ready',
    lastUpdatedAt: '2026-04-21T08:00:00.000Z',
    unreadInsights: 0,
    currentWorkspace: null,
    insights: [],
    conversation: [],
    settings: {
      ...DEFAULT_AGENT_SETTINGS.plugins.workspaceAssistant,
      enabled: true,
    },
    ...overrides,
  }

  const current = (window as unknown as { freecliApi?: Record<string, unknown> }).freecliApi
  const workspaceAssistantApi = {
    getState: vi.fn().mockResolvedValue(state),
    syncSettings: vi.fn().mockResolvedValue(state),
    syncWorkspaceSnapshot: vi.fn().mockResolvedValue(state),
    testConnection: vi.fn().mockResolvedValue({
      ok: true,
      message: '连接成功。',
    }),
    prompt: vi.fn(),
    onState: vi.fn().mockImplementation(() => () => undefined),
  }

  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      ...(current ?? {}),
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        ...((current?.plugins as Record<string, unknown> | undefined) ?? {}),
        workspaceAssistant: workspaceAssistantApi,
      },
    },
  })

  return workspaceAssistantApi
}

describe('PluginManagerPanel', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('toggles plugins without dropping quota monitor settings', () => {
    const onChange = vi.fn()
    installQuotaMonitorApiMock()

    render(
      <PluginManagerPanel
        isOpen
        settings={DEFAULT_AGENT_SETTINGS}
        onChange={onChange}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-toggle-input-stats'))

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      plugins: {
        ...DEFAULT_AGENT_SETTINGS.plugins,
        enabledIds: ['input-stats'],
      },
    })
  })

  it('enables workspace assistant from the host-level plugin list without requiring an inner enabled flag', () => {
    const onChange = vi.fn()

    render(
      <PluginManagerPanel
        isOpen
        settings={DEFAULT_AGENT_SETTINGS}
        onChange={onChange}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-toggle-workspace-assistant'))

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      plugins: {
        ...DEFAULT_AGENT_SETTINGS.plugins,
        enabledIds: ['workspace-assistant'],
      },
    })
  })

  it('renders enabled quota monitor section inside the plugin manager', async () => {
    installQuotaMonitorApiMock({
      status: 'ready',
      lastUpdatedAt: '2026-04-02T09:30:00.000Z',
      configuredProfileCount: 1,
      successfulProfileCount: 1,
      profiles: [createQuotaProfileState()],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['quota-monitor'],
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    expect(
      screen.queryByTestId('plugin-manager-plugin-quota-monitor-section'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('plugin-manager-nav-quota-monitor'))

    expect(await screen.findByTestId('plugin-manager-plugin-quota-monitor-section')).toBeVisible()
    expect(screen.getByTestId('quota-monitor-overview')).toBeVisible()
    expect(screen.getByTestId('quota-monitor-hero')).toBeVisible()
    expect(screen.getByTestId('quota-monitor-usage-grid')).toBeVisible()
    expect(screen.getByTestId('quota-monitor-trend-grid')).toBeVisible()
    expect(screen.getByTestId('quota-monitor-hourly-quota-trend')).toBeVisible()
    expect(screen.getByTestId('quota-monitor-daily-quota-trend')).toBeVisible()
    expect(screen.getByTestId('quota-monitor-hourly-token-trend')).toBeVisible()
    expect(screen.getByTestId('quota-monitor-daily-token-trend')).toBeVisible()
    expect(screen.getByTestId('quota-monitor-config-key-profiles')).toBeVisible()
  })

  it('shows plugin host diagnostics on the general page', () => {
    render(
      <PluginManagerPanel
        isOpen
        settings={DEFAULT_AGENT_SETTINGS}
        diagnostics={[
          {
            code: 'runtime_sync',
            message: '主进程未响应',
          },
          {
            code: 'oss_backup_sync',
            message: 'OSS 配置同步失败',
          },
        ]}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    const diagnostics = screen.getByTestId('plugin-manager-host-diagnostics')
    expect(diagnostics).toBeVisible()
    expect(screen.getByTestId('plugin-manager-host-diagnostic-runtime_sync')).toHaveTextContent(
      '运行时启停同步',
    )
    expect(screen.getByTestId('plugin-manager-host-diagnostic-runtime_sync')).toHaveTextContent(
      '主进程未响应',
    )
    expect(screen.getByTestId('plugin-manager-host-diagnostic-oss_backup_sync')).toHaveTextContent(
      'OSS 配置同步失败',
    )
  })

  it('renders enabled git worklog section inside the plugin manager', async () => {
    installGitWorklogApiMock({
      status: 'ready',
      lastUpdatedAt: '2026-04-02T09:30:00.000Z',
      configuredRepoCount: 1,
      successfulRepoCount: 1,
      overview: {
        monitoredRepoCount: 1,
        activeRepoCount: 1,
        healthyRepoCount: 1,
        commitCountToday: 4,
        filesChangedToday: 6,
        additionsToday: 120,
        deletionsToday: 20,
        changedLinesToday: 140,
        commitCountInRange: 12,
        filesChangedInRange: 24,
        additionsInRange: 420,
        deletionsInRange: 80,
        changedLinesInRange: 500,
        totalCodeFiles: 18,
        totalCodeLines: 2048,
        dailyPoints: [
          {
            day: '2026-03-31',
            label: '03/31',
            commitCount: 2,
            filesChanged: 3,
            additions: 80,
            deletions: 12,
            changedLines: 92,
          },
          {
            day: '2026-04-01',
            label: '04/01',
            commitCount: 4,
            filesChanged: 6,
            additions: 120,
            deletions: 20,
            changedLines: 140,
          },
        ],
        heatmapDailyPoints: [
          {
            day: '2025-11-18',
            label: '11/18',
            commitCount: 1,
            filesChanged: 2,
            additions: 24,
            deletions: 6,
            changedLines: 30,
          },
          {
            day: '2026-03-31',
            label: '03/31',
            commitCount: 2,
            filesChanged: 3,
            additions: 80,
            deletions: 12,
            changedLines: 92,
          },
          {
            day: '2026-04-01',
            label: '04/01',
            commitCount: 4,
            filesChanged: 6,
            additions: 120,
            deletions: 20,
            changedLines: 140,
          },
        ],
      },
      repos: [
        {
          repoId: 'repo_a',
          label: 'Repo A',
          path: 'D:\\Project\\repo-a',
          origin: 'manual',
          parentWorkspaceId: 'workspace_a',
          parentWorkspaceName: 'Workspace A',
          parentWorkspacePath: 'D:\\Project',
          commitCountToday: 4,
          filesChangedToday: 6,
          additionsToday: 120,
          deletionsToday: 20,
          changedLinesToday: 140,
          netLinesToday: 100,
          commitCountInRange: 12,
          filesChangedInRange: 24,
          additionsInRange: 420,
          deletionsInRange: 80,
          changedLinesInRange: 500,
          totalCodeFiles: 18,
          totalCodeLines: 2048,
          dailyPoints: [
            {
              day: '2026-03-31',
              label: '03/31',
              commitCount: 2,
              filesChanged: 3,
              additions: 80,
              deletions: 12,
              changedLines: 92,
            },
            {
              day: '2026-04-01',
              label: '04/01',
              commitCount: 4,
              filesChanged: 6,
              additions: 120,
              deletions: 20,
              changedLines: 140,
            },
          ],
          heatmapDailyPoints: [
            {
              day: '2025-11-18',
              label: '11/18',
              commitCount: 1,
              filesChanged: 2,
              additions: 24,
              deletions: 6,
              changedLines: 30,
            },
            {
              day: '2026-03-31',
              label: '03/31',
              commitCount: 2,
              filesChanged: 3,
              additions: 80,
              deletions: 12,
              changedLines: 92,
            },
            {
              day: '2026-04-01',
              label: '04/01',
              commitCount: 4,
              filesChanged: 6,
              additions: 120,
              deletions: 20,
              changedLines: 140,
            },
          ],
          lastScannedAt: '2026-04-02T09:30:00.000Z',
          error: null,
        },
      ],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))

    expect(await screen.findByTestId('plugin-manager-plugin-git-worklog-section')).toBeVisible()
    expect(screen.getByTestId('git-worklog-overview')).toBeVisible()
    expect(screen.getByTestId('git-worklog-summary-trend')).toBeVisible()
    expect(screen.getByTestId('git-worklog-heatmap')).toBeVisible()
    expect(screen.getByTestId('git-worklog-open-config-dialog')).toBeVisible()
    expect(screen.getByText('今日新增')).toBeVisible()
    expect(screen.getByText('今日删除')).toBeVisible()
    expect(screen.getByText('累计改动')).toBeVisible()
    expect(screen.queryByTestId('git-worklog-config-board')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('git-worklog-heatmap-year-trigger'))
    expect(screen.getByRole('option', { name: '2025 年' })).toBeVisible()
    fireEvent.click(screen.getByTestId('git-worklog-open-config-dialog'))
    expect(screen.getByTestId('git-worklog-config-dialog')).toBeVisible()
    expect(screen.getByTestId('git-worklog-config-board')).toBeVisible()
    expect(screen.getByTestId('git-worklog-config-scan-panel')).toBeVisible()
    expect(screen.getByTestId('git-worklog-config-automation-panel')).toBeVisible()
    expect(screen.getByTestId('git-worklog-config-refresh-now')).toBeVisible()
    expect(screen.getByTestId('git-worklog-config-add-repository')).toBeVisible()
    expect(screen.getByTestId('git-worklog-add-repository')).toBeVisible()
    expect(screen.getAllByText('组内仓库').at(0)).toBeVisible()
    expect(screen.queryByTestId('git-worklog-repository-master-detail')).not.toBeInTheDocument()
  })

  it('renders enabled oss backup section inside the plugin manager', async () => {
    installOssBackupApiMock({
      isEnabled: true,
      status: 'ready',
      includedPluginIds: ['quota-monitor'],
      lastBackupAt: '2026-04-04T10:00:00.000Z',
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['oss-backup'],
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-oss-backup'))

    expect(await screen.findByTestId('plugin-manager-plugin-oss-backup-section')).toBeVisible()
    expect(screen.getByTestId('oss-backup-open-connection-dialog')).toBeVisible()
    fireEvent.click(screen.getByTestId('oss-backup-open-connection-dialog'))
    expect(screen.getByTestId('oss-backup-connection-dialog')).toBeVisible()
    expect(screen.getByTestId('oss-backup-endpoint')).toBeVisible()
    expect(screen.getByTestId('oss-backup-auto-backup-interval')).toBeVisible()
    expect(screen.getByTestId('oss-backup-restore-on-startup')).toBeVisible()
    expect(screen.getByTestId('oss-backup-backup-on-exit')).toBeVisible()
    expect(screen.getByTestId('oss-backup-sync-git-worklog-history')).toBeVisible()
    expect(screen.getByTestId('oss-backup-run-backup')).toBeVisible()
  })

  it('opens sync decision dialog before restore when comparison suggests local source', async () => {
    const ossApi = installOssBackupApiMock(
      {
        isEnabled: true,
        status: 'ready',
        includedPluginIds: ['quota-monitor'],
        lastBackupAt: '2026-04-04T10:00:00.000Z',
      },
      {
        comparison: {
          ...createDefaultOssSyncComparison(),
          suggested: 'use_local',
          hasConflict: false,
          conflictedDatasetIds: [],
        },
      },
    )

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['oss-backup'],
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-oss-backup'))
    expect(await screen.findByTestId('plugin-manager-plugin-oss-backup-section')).toBeVisible()

    fireEvent.click(screen.getByTestId('oss-backup-run-restore'))

    expect(await screen.findByTestId('oss-backup-sync-decision-dialog')).toBeVisible()
    expect(screen.getAllByText('工作量统计历史').length).toBeGreaterThan(0)
    expect(ossApi.restore).not.toHaveBeenCalled()
  })

  it('confirms pending workspace imports into managed repositories', async () => {
    installGitWorklogApiMock({
      pendingImports: [
        {
          detectedAt: '2026-04-12T09:30:00.000Z',
          workspaceId: 'workspace_drone',
          workspaceName: 'Drone',
          workspacePath: 'D:\\Project\\Drone',
          repositories: [
            {
              id: 'auto_workspace_root_apps__admin',
              label: 'admin',
              path: 'D:\\Project\\Drone\\apps\\admin',
              parentWorkspaceId: 'workspace_drone',
              parentWorkspaceName: 'Drone',
              parentWorkspacePath: 'D:\\Project\\Drone',
              detectedAt: '2026-04-12T09:30:00.000Z',
            },
          ],
        },
      ],
      availableWorkspaces: [
        {
          id: 'workspace_drone',
          name: 'Drone',
          path: 'D:\\Project\\Drone',
        },
      ],
    })
    const onChange = vi.fn()

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
          },
        }}
        onChange={onChange}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    expect(await screen.findByTestId('git-worklog-open-config-dialog')).toBeVisible()
    fireEvent.click(screen.getByTestId('git-worklog-open-config-dialog'))
    expect(await screen.findByTestId('git-worklog-workspace-scan-list')).toBeVisible()

    fireEvent.click(
      screen.getByTestId('git-worklog-scan-confirm-pending-import-d:/project/drone'),
    )

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        ...DEFAULT_AGENT_SETTINGS,
        plugins: {
          ...DEFAULT_AGENT_SETTINGS.plugins,
          enabledIds: ['git-worklog'],
          gitWorklog: {
            ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
            repositoryOrder: ['repo_1', 'repo_2'],
            workspaceOrder: [],
            repositories: [
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog.repositories,
              {
                id: 'repo_2',
                label: 'admin',
                path: 'D:\\Project\\Drone\\apps\\admin',
                enabled: true,
                origin: 'manual',
                assignedWorkspaceId: 'workspace_drone',
              },
            ],
          },
        },
      })
    })
  })

  it('dismisses pending workspace imports into dismissed history', async () => {
    installGitWorklogApiMock({
      pendingImports: [
        {
          detectedAt: '2026-04-12T09:30:00.000Z',
          workspaceId: 'workspace_drone',
          workspaceName: 'Drone',
          workspacePath: 'D:\\Project\\Drone',
          repositories: [
            {
              id: 'auto_workspace_root_apps__admin',
              label: 'admin',
              path: 'D:\\Project\\Drone\\apps\\admin',
              parentWorkspaceId: 'workspace_drone',
              parentWorkspaceName: 'Drone',
              parentWorkspacePath: 'D:\\Project\\Drone',
              detectedAt: '2026-04-12T09:30:00.000Z',
            },
          ],
        },
      ],
    })
    const onChange = vi.fn()

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
          },
        }}
        onChange={onChange}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))
    fireEvent.click(screen.getByTestId('git-worklog-scan-dismiss-pending-import-d:/project/drone'))

    expect(onChange).not.toHaveBeenCalled()
    const dismissMock = window.freecliApi?.plugins?.gitWorklog?.dismissPendingImport
    expect(dismissMock).toBeDefined()
    expect(dismissMock).toHaveBeenCalledWith({
      workspacePath: 'D:\\Project\\Drone',
    })
  })

  it('shows the workspace scan list even when no pending repositories were detected', async () => {
    installGitWorklogApiMock({
      availableWorkspaces: [
        {
          id: 'workspace_empty',
          name: 'Empty Workspace',
          path: 'D:\\Project\\Empty',
        },
      ],
      pendingImports: [],
      dismissedImports: [],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositories: [],
              repositoryOrder: [],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))

    const workspaceScanList = await screen.findByTestId('git-worklog-workspace-scan-list')
    expect(workspaceScanList).toBeVisible()
    expect(screen.getByRole('table')).toBeVisible()

    const workspaceScanItem = screen.getByTestId(
      'git-worklog-workspace-scan-item-d:/project/empty',
    )
    expect(within(workspaceScanItem).getByText('项目')).toBeVisible()
    expect(within(workspaceScanItem).getByText('Empty Workspace')).toBeVisible()
    expect(within(workspaceScanItem).getByText('尚未发现仓库')).toBeVisible()
    expect(within(workspaceScanItem).getByText('已纳管 0 个，待确认 0 个')).toBeVisible()
    expect(screen.getByText('项目 / 仓库')).toBeVisible()
    expect(
      screen.getByTestId('git-worklog-scan-refresh-workspace-d:/project/empty'),
    ).toBeVisible()
    expect(screen.queryByTestId('git-worklog-config-exception-list')).not.toBeInTheDocument()
  })

  it('shows workspace scan errors instead of rendering them as empty results', async () => {
    installGitWorklogApiMock({
      availableWorkspaces: [
        {
          id: 'workspace_fastwrite',
          name: 'FastWrite',
          path: 'D:\\Project\\FastWrite',
        },
      ],
      pendingImports: [
        {
          detectedAt: '2026-04-25T10:00:00.000Z',
          workspaceId: 'workspace_fastwrite',
          workspaceName: 'FastWrite',
          workspacePath: 'D:\\Project\\FastWrite',
          repositories: [],
          error: {
            type: 'command_failed',
            message: '工作区 Git 扫描失败',
            detail: 'spawn git EACCES',
          },
          retryCount: 2,
        },
      ],
      dismissedImports: [],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositories: [],
              repositoryOrder: [],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))

    const workspaceScanItem = screen.getByTestId(
      'git-worklog-workspace-scan-item-d:/project/fastwrite',
    )
    expect(within(workspaceScanItem).getByText('扫描失败')).toBeVisible()
    expect(
      within(workspaceScanItem).getByText(
        '扫描失败，系统会自动重试（第 2 次）。原因：spawn git EACCES',
      ),
    ).toBeVisible()
    expect(within(workspaceScanItem).queryByText('尚未发现仓库')).not.toBeInTheDocument()
  })

  it('shows repository action buttons inside the workspace scan list', async () => {
    installGitWorklogApiMock({
      availableWorkspaces: [
        {
          id: 'workspace_drone',
          name: 'Drone',
          path: 'D:\\Project\\Drone',
        },
      ],
      repos: [],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositoryOrder: ['repo_1'],
              repositories: [
                {
                  id: 'repo_1',
                  label: 'Drone API',
                  path: 'D:\\Project\\Drone\\api',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: 'workspace_drone',
                },
              ],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))

    expect(screen.getByTestId('git-worklog-configured-repository-list')).toBeVisible()
    expect(
      screen.queryByTestId('git-worklog-workspace-scan-repository-d:/project/drone/api'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByTestId('git-worklog-configured-repository-d:/project/drone/api'),
    ).toBeVisible()
    expect(screen.getByText('当前归属项目：Drone。')).toBeVisible()
    expect(screen.getByTestId('git-worklog-scan-manage-repository-repo_1')).toBeVisible()
    expect(screen.getByTestId('git-worklog-scan-remove-repository-repo_1')).toBeVisible()
  })

  it('renders base repositories separately from workspace scan results', async () => {
    installGitWorklogApiMock({
      availableWorkspaces: [
        {
          id: 'workspace_freecli',
          name: 'FreeCli',
          path: 'D:\\Project\\FreeCli',
        },
      ],
      pendingImports: [
        {
          detectedAt: '2026-04-26T10:00:00.000Z',
          workspaceId: 'workspace_freecli',
          workspaceName: 'FreeCli',
          workspacePath: 'D:\\Project\\FreeCli',
          repositories: [
            {
              id: 'auto_workspace_freecli_root',
              label: 'FreeCli',
              path: 'D:\\Project\\FreeCli',
              parentWorkspaceId: 'workspace_freecli',
              parentWorkspaceName: 'FreeCli',
              parentWorkspacePath: 'D:\\Project\\FreeCli',
              detectedAt: '2026-04-26T10:00:00.000Z',
            },
          ],
        },
      ],
      repos: [],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositoryOrder: ['repo_1', 'repo_2'],
              repositories: [
                {
                  id: 'repo_1',
                  label: 'FastWrite',
                  path: 'D:\\Project\\FastWrite',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: null,
                },
                {
                  id: 'repo_2',
                  label: 'Base Repo',
                  path: 'D:\\Independent\\base-repo',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: '__external__',
                },
              ],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))

    const scanList = screen.getByTestId('git-worklog-workspace-scan-list')
    expect(
      within(scanList).getByTestId('git-worklog-workspace-scan-item-d:/project/freecli'),
    ).toBeVisible()
    expect(within(scanList).queryByText('FastWrite')).not.toBeInTheDocument()
    expect(within(scanList).queryByText('Base Repo')).not.toBeInTheDocument()

    const configuredList = screen.getByTestId('git-worklog-configured-repository-list')
    expect(within(configuredList).getByText('FastWrite')).toBeVisible()
    expect(within(configuredList).getByText('Base Repo')).toBeVisible()
    expect(within(configuredList).getByText('当前没有匹配到左侧项目，或该项目尚未出现在本次扫描快照中。')).toBeVisible()
    expect(within(configuredList).getByText('当前已明确归入“基础仓库”分组。')).toBeVisible()
  })

  it('shows exception rows in the consolidated exception list', async () => {
    installGitWorklogApiMock({
      dismissedImports: [
        {
          detectedAt: '2026-04-12T09:30:00.000Z',
          workspaceId: 'workspace_drone',
          workspaceName: 'Drone',
          workspacePath: 'D:\\Project\\Drone',
          repositories: [],
        },
      ],
      availableWorkspaces: [
        {
          id: 'workspace_drone',
          name: 'Drone',
          path: 'D:\\Project\\Drone',
        },
      ],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              ignoredAutoRepositoryPaths: ['D:\\Project\\Drone\\legacy'],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))

    const exceptionList = screen.getByTestId('git-worklog-config-exception-list')
    expect(exceptionList).toBeVisible()
    expect(
      within(exceptionList).getByTestId('git-worklog-dismissed-import-d:/project/drone'),
    ).toBeVisible()
    expect(
      within(exceptionList).getByTestId('git-worklog-ignored-auto-repository-d:/project/drone/legacy'),
    ).toBeVisible()
  })

  it('opens repository manager dialog from overview card and edits the repository', async () => {
    installGitWorklogApiMock({
      availableWorkspaces: [
        {
          id: 'workspace_a',
          name: 'Drone',
          path: 'D:\\Project\\Drone',
        },
      ],
      repos: [
        {
          repoId: 'repo_1',
          label: 'Drone API',
          path: 'D:\\Project\\Drone\\api',
          origin: 'manual',
          parentWorkspaceId: 'workspace_a',
          parentWorkspaceName: 'Drone',
          parentWorkspacePath: 'D:\\Project\\Drone',
          commitCountToday: 3,
          filesChangedToday: 6,
          additionsToday: 30,
          deletionsToday: 10,
          changedLinesToday: 40,
          netLinesToday: 20,
          commitCountInRange: 3,
          filesChangedInRange: 6,
          additionsInRange: 30,
          deletionsInRange: 10,
          changedLinesInRange: 40,
          totalCodeFiles: 10,
          totalCodeLines: 500,
          dailyPoints: [
            {
              day: '2026-04-02',
              label: '04/02',
              commitCount: 3,
              filesChanged: 6,
              additions: 30,
              deletions: 10,
              changedLines: 40,
            },
          ],
          heatmapDailyPoints: [
            {
              day: '2025-10-12',
              label: '10/12',
              commitCount: 2,
              filesChanged: 5,
              additions: 50,
              deletions: 10,
              changedLines: 60,
            },
            {
              day: '2026-04-02',
              label: '04/02',
              commitCount: 3,
              filesChanged: 6,
              additions: 30,
              deletions: 10,
              changedLines: 40,
            },
          ],
          lastScannedAt: '2026-04-02T09:30:00.000Z',
          error: null,
        },
        {
          repoId: 'repo_2',
          label: 'Drone Admin',
          path: 'D:\\Project\\Drone\\admin',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 0,
          filesChangedToday: 0,
          additionsToday: 0,
          deletionsToday: 0,
          changedLinesToday: 0,
          netLinesToday: 0,
          commitCountInRange: 0,
          filesChangedInRange: 0,
          additionsInRange: 0,
          deletionsInRange: 0,
          changedLinesInRange: 0,
          totalCodeFiles: 0,
          totalCodeLines: 0,
          dailyPoints: [],
          heatmapDailyPoints: [],
          lastScannedAt: null,
          error: null,
        },
      ],
    })
    const onChange = vi.fn()

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositoryOrder: ['repo_1', 'repo_2'],
              workspaceOrder: [],
              repositories: [
                {
                  id: 'repo_1',
                  label: 'Drone API',
                  path: 'D:\\Project\\Drone\\api',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: null,
                },
                {
                  id: 'repo_2',
                  label: 'Drone Admin',
                  path: 'D:\\Project\\Drone\\admin',
                  enabled: false,
                  origin: 'manual',
                  assignedWorkspaceId: null,
                },
              ],
            },
          },
        }}
        onChange={onChange}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    await screen.findByTestId('git-worklog-repo-card-repo_2')
    await waitFor(() => {
      expect(screen.getByTestId('git-worklog-manage-repository-repo_2')).toBeVisible()
    })

    fireEvent.click(screen.getByTestId('git-worklog-manage-repository-repo_2'))
    const detail = screen.getByTestId('git-worklog-repository-dialog-repo_2')
    expect(detail).toBeVisible()

    fireEvent.change(screen.getByTestId('git-worklog-repository-label-repo_2'), {
      target: { value: 'Drone Console' },
    })

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      plugins: {
        ...DEFAULT_AGENT_SETTINGS.plugins,
        enabledIds: ['git-worklog'],
        gitWorklog: {
          ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
          repositoryOrder: ['repo_1', 'repo_2'],
          workspaceOrder: [],
          repositories: [
            {
              id: 'repo_1',
              label: 'Drone API',
              path: 'D:\\Project\\Drone\\api',
              enabled: true,
              origin: 'manual',
              assignedWorkspaceId: null,
            },
            {
              id: 'repo_2',
              label: 'Drone Console',
              path: 'D:\\Project\\Drone\\admin',
              enabled: false,
              origin: 'manual',
              assignedWorkspaceId: null,
            },
          ],
        },
      },
    })

    fireEvent.change(screen.getByTestId('git-worklog-repository-workspace-repo_2'), {
      target: { value: 'workspace_a' },
    })

    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_AGENT_SETTINGS,
      plugins: {
        ...DEFAULT_AGENT_SETTINGS.plugins,
        enabledIds: ['git-worklog'],
        gitWorklog: {
          ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
          repositoryOrder: ['repo_1', 'repo_2'],
          workspaceOrder: [],
          repositories: [
            {
              id: 'repo_1',
              label: 'Drone API',
              path: 'D:\\Project\\Drone\\api',
              enabled: true,
              origin: 'manual',
              assignedWorkspaceId: null,
            },
            {
              id: 'repo_2',
              label: 'Drone Admin',
              path: 'D:\\Project\\Drone\\admin',
              enabled: false,
              origin: 'manual',
              assignedWorkspaceId: 'workspace_a',
            },
          ],
        },
      },
    })
  })

  it('recomputes workspace summary from presentation grouping in the renderer', async () => {
    installGitWorklogApiMock({
      availableWorkspaces: [
        {
          id: 'workspace_a',
          name: 'Drone',
          path: 'D:\\Project\\Drone',
        },
        {
          id: 'workspace_b',
          name: 'Console',
          path: 'D:\\Project\\Console',
        },
      ],
      repos: [
        {
          repoId: 'repo_1',
          label: 'Drone API',
          path: 'D:\\Project\\Drone\\api',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 3,
          filesChangedToday: 6,
          additionsToday: 30,
          deletionsToday: 10,
          changedLinesToday: 40,
          netLinesToday: 20,
          commitCountInRange: 3,
          filesChangedInRange: 6,
          additionsInRange: 30,
          deletionsInRange: 10,
          changedLinesInRange: 40,
          totalCodeFiles: 10,
          totalCodeLines: 500,
          dailyPoints: [],
          heatmapDailyPoints: [],
          lastScannedAt: '2026-04-02T09:30:00.000Z',
          error: null,
        },
        {
          repoId: 'repo_2',
          label: 'Console Admin',
          path: 'D:\\Project\\Console\\admin',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 2,
          filesChangedToday: 4,
          additionsToday: 20,
          deletionsToday: 5,
          changedLinesToday: 25,
          netLinesToday: 15,
          commitCountInRange: 2,
          filesChangedInRange: 4,
          additionsInRange: 20,
          deletionsInRange: 5,
          changedLinesInRange: 25,
          totalCodeFiles: 8,
          totalCodeLines: 320,
          dailyPoints: [],
          heatmapDailyPoints: [],
          lastScannedAt: '2026-04-02T09:30:00.000Z',
          error: null,
        },
      ],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositoryOrder: ['repo_1', 'repo_2'],
              workspaceOrder: ['workspace_a', 'workspace_b'],
              repositories: [
                {
                  id: 'repo_1',
                  label: 'Drone API',
                  path: 'D:\\Project\\Drone\\api',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: 'workspace_b',
                },
                {
                  id: 'repo_2',
                  label: 'Console Admin',
                  path: 'D:\\Project\\Console\\admin',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: 'workspace_b',
                },
              ],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))

    const consoleGroup = await screen.findByTestId('git-worklog-workspace-card-workspace_b')
    expect(within(consoleGroup).getByText('2 个仓库')).toBeVisible()
    expect(within(consoleGroup).getByText('5 次提交')).toBeVisible()
    expect(within(consoleGroup).getByText('65 行改动')).toBeVisible()
  })

  it('groups standalone repositories under the base repositories card', async () => {
    installGitWorklogApiMock({
      repos: [
        {
          repoId: 'repo_1',
          label: 'Standalone API',
          path: 'D:\\Independent\\api',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 3,
          filesChangedToday: 6,
          additionsToday: 30,
          deletionsToday: 10,
          changedLinesToday: 40,
          netLinesToday: 20,
          commitCountInRange: 3,
          filesChangedInRange: 6,
          additionsInRange: 30,
          deletionsInRange: 10,
          changedLinesInRange: 40,
          totalCodeFiles: 10,
          totalCodeLines: 500,
          dailyPoints: [],
          heatmapDailyPoints: [],
          lastScannedAt: '2026-04-02T09:30:00.000Z',
          error: null,
        },
        {
          repoId: 'repo_2',
          label: 'Standalone Admin',
          path: 'D:\\Independent\\admin',
          origin: 'manual',
          parentWorkspaceId: null,
          parentWorkspaceName: null,
          parentWorkspacePath: null,
          commitCountToday: 2,
          filesChangedToday: 4,
          additionsToday: 20,
          deletionsToday: 5,
          changedLinesToday: 25,
          netLinesToday: 15,
          commitCountInRange: 2,
          filesChangedInRange: 4,
          additionsInRange: 20,
          deletionsInRange: 5,
          changedLinesInRange: 25,
          totalCodeFiles: 8,
          totalCodeLines: 320,
          dailyPoints: [],
          heatmapDailyPoints: [],
          lastScannedAt: '2026-04-02T09:30:00.000Z',
          error: null,
        },
      ],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositoryOrder: ['repo_1', 'repo_2'],
              workspaceOrder: [],
              repositories: [
                {
                  id: 'repo_1',
                  label: 'Standalone API',
                  path: 'D:\\Independent\\api',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: null,
                },
                {
                  id: 'repo_2',
                  label: 'Standalone Admin',
                  path: 'D:\\Independent\\admin',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: null,
                },
              ],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))

    const baseGroup = await screen.findByTestId('git-worklog-workspace-card-__external__')
    expect(within(baseGroup).getByText('基础仓库')).toBeVisible()
    expect(within(baseGroup).getByTestId('git-worklog-repo-card-repo_1')).toBeVisible()
    expect(within(baseGroup).getByTestId('git-worklog-repo-card-repo_2')).toBeVisible()
    expect(screen.getAllByText('基础仓库')).toHaveLength(1)
  })

  it('keeps the base repositories card visible even when it has no repositories', async () => {
    installGitWorklogApiMock({
      repos: [],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositoryOrder: [],
              workspaceOrder: [],
              repositories: [],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))

    const baseGroup = await screen.findByTestId('git-worklog-workspace-card-__external__')
    expect(within(baseGroup).getByText('基础仓库')).toBeVisible()
    expect(within(baseGroup).getByTestId('git-worklog-empty-group-__external__')).toBeVisible()
    expect(within(baseGroup).getByText('拖拽仓库到这里')).toBeVisible()
  })

  it('shows a loading state while reloading workspace scan results', async () => {
    const deferred = createDeferredPromise<GitWorklogStateDto>()
    installGitWorklogApiMock({
      availableWorkspaces: [
        {
          id: 'workspace_empty',
          name: 'Empty',
          path: 'D:\\Project\\empty',
        },
      ],
    })

    const gitWorklogApi = window.freecliApi?.plugins?.gitWorklog
    expect(gitWorklogApi).toBeDefined()
    const refreshMock = vi.fn().mockImplementation(() => deferred.promise)
    ;(
      gitWorklogApi as {
        refreshWorkspace: typeof refreshMock
      }
    ).refreshWorkspace = refreshMock

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))

    const refreshButton = await screen.findByTestId('git-worklog-scan-refresh-workspace-d:/project/empty')
    fireEvent.click(refreshButton)

    expect(refreshMock).toHaveBeenCalledTimes(1)
    expect(refreshButton).toBeDisabled()
    expect(refreshButton).toHaveAttribute('aria-busy', 'true')
    expect(refreshButton).toHaveTextContent('刷新中')

    deferred.resolve({
      isEnabled: false,
      isRefreshing: false,
      status: 'needs_config',
      lastUpdatedAt: null,
      configuredRepoCount: 0,
      activeRepoCount: 1,
      successfulRepoCount: 0,
      overview: {
        monitoredRepoCount: 0,
        activeRepoCount: 0,
        healthyRepoCount: 0,
        commitCountToday: 0,
        filesChangedToday: 0,
        additionsToday: 0,
        deletionsToday: 0,
        changedLinesToday: 0,
        commitCountInRange: 0,
        filesChangedInRange: 0,
        additionsInRange: 0,
        deletionsInRange: 0,
        changedLinesInRange: 0,
        totalCodeFiles: 0,
        totalCodeLines: 0,
        dailyPoints: [],
        heatmapDailyPoints: [],
      },
      repos: [],
      autoCandidates: [],
      pendingImports: [],
      dismissedImports: [],
      availableWorkspaces: [
        {
          id: 'workspace_empty',
          name: 'Empty',
          path: 'D:\\Project\\empty',
        },
      ],
      lastError: null,
    })

    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled()
    })
    expect(refreshButton).toHaveAttribute('aria-busy', 'false')
    expect(refreshButton).toHaveTextContent('重新读取')
  })

  it('repairs managed repository config and shows inline feedback', async () => {
    installGitWorklogApiMock({
      availableWorkspaces: [
        {
          id: 'workspace_fastwrite',
          name: 'FastWrite',
          path: 'D:\\Project\\FastWrite',
        },
      ],
    })

    const gitWorklogApi = window.freecliApi?.plugins?.gitWorklog
    expect(gitWorklogApi).toBeDefined()
    const repairMock = vi.fn().mockResolvedValue({
      repairedSettings: {
        ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
        repositories: [
          {
            id: 'repo_1',
            label: 'FastWrite',
            path: 'D:\\Project\\FastWrite',
            enabled: true,
            origin: 'manual',
            assignedWorkspaceId: 'workspace_fastwrite',
          },
        ],
        repositoryOrder: ['repo_1'],
        workspaceOrder: ['workspace_fastwrite'],
      },
      summary: {
        duplicateIdsFixed: 1,
        duplicatePathsFixed: 0,
        pathsNormalized: 1,
        workspaceAssignmentsFixed: 1,
        labelsFixed: 1,
      },
      changedRepositories: [
        {
          repositoryId: 'repo_1',
          path: 'D:\\Project\\FastWrite',
          changes: ['仓库路径已归一到真实 Git 根目录'],
        },
      ],
      backupAvailable: true,
    })
    ;(
      gitWorklogApi as {
        repairRepositories: typeof repairMock
      }
    ).repairRepositories = repairMock

    const onChange = vi.fn()
    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositories: [
                {
                  id: 'repo_1',
                  label: 'FreeCli',
                  path: 'D:\\Project\\FastWrite\\packages\\ui',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: 'workspace_missing',
                },
              ],
              repositoryOrder: ['repo_1'],
              workspaceOrder: ['workspace_missing'],
            },
          },
        }}
        onChange={onChange}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))

    const repairButton = await screen.findByTestId('git-worklog-repair-repositories')
    fireEvent.click(repairButton)

    await waitFor(() => {
      expect(repairMock).toHaveBeenCalledTimes(1)
    })
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        plugins: expect.objectContaining({
          gitWorklog: expect.objectContaining({
            repositories: [
              expect.objectContaining({
                label: 'FastWrite',
                path: 'D:\\Project\\FastWrite',
              }),
            ],
          }),
        }),
      }),
    )
    expect(await screen.findByTestId('git-worklog-repair-feedback')).toHaveTextContent(
      '已修复 1 条仓库配置异常',
    )
  })

  it('undoes the last repository repair and restores the previous settings', async () => {
    installGitWorklogApiMock()

    const gitWorklogApi = window.freecliApi?.plugins?.gitWorklog
    expect(gitWorklogApi).toBeDefined()
    const undoMock = vi.fn().mockResolvedValue({
      restored: true,
      restoredSettings: {
        ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
        repositories: [
          {
            id: 'repo_1',
            label: 'FreeCli',
            path: 'D:\\Project\\FastWrite\\packages\\ui',
            enabled: true,
            origin: 'manual',
            assignedWorkspaceId: 'workspace_missing',
          },
        ],
        repositoryOrder: ['repo_1'],
        workspaceOrder: ['workspace_missing'],
      },
    })
    ;(
      gitWorklogApi as {
        undoRepositoryRepair: typeof undoMock
      }
    ).undoRepositoryRepair = undoMock

    const onChange = vi.fn()
    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
          },
        }}
        onChange={onChange}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))

    const undoButton = await screen.findByTestId('git-worklog-undo-repository-repair')
    fireEvent.click(undoButton)

    await waitFor(() => {
      expect(undoMock).toHaveBeenCalledTimes(1)
    })
    expect(onChange).toHaveBeenCalled()
    expect(await screen.findByTestId('git-worklog-repair-feedback')).toHaveTextContent(
      '已恢复到修复前的仓库配置',
    )
  })

  it('allows retrying workspace reload after a failed refresh attempt', async () => {
    installGitWorklogApiMock({
      pendingImports: [
        {
          workspaceId: 'workspace_fastwrite',
          workspaceName: 'FastWrite',
          workspacePath: 'D:\\Project\\FastWrite',
          repositories: [],
          error: {
            code: 'workspace_scan_failed',
            message: '读取失败',
            detail: 'git 命令执行失败',
          },
          retryCount: 1,
        },
      ],
      availableWorkspaces: [
        {
          id: 'workspace_fastwrite',
          name: 'FastWrite',
          path: 'D:\\Project\\FastWrite',
        },
      ],
    })

    const gitWorklogApi = window.freecliApi?.plugins?.gitWorklog
    expect(gitWorklogApi).toBeDefined()
    const refreshMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('first refresh failed'))
      .mockResolvedValue({
        isEnabled: false,
        isRefreshing: false,
        status: 'needs_config',
        lastUpdatedAt: null,
        configuredRepoCount: 0,
        activeRepoCount: 1,
        successfulRepoCount: 0,
        overview: {
          monitoredRepoCount: 0,
          activeRepoCount: 0,
          healthyRepoCount: 0,
          commitCountToday: 0,
          filesChangedToday: 0,
          additionsToday: 0,
          deletionsToday: 0,
          changedLinesToday: 0,
          commitCountInRange: 0,
          filesChangedInRange: 0,
          additionsInRange: 0,
          deletionsInRange: 0,
          changedLinesInRange: 0,
          totalCodeFiles: 0,
          totalCodeLines: 0,
          dailyPoints: [],
          heatmapDailyPoints: [],
        },
        repos: [],
        autoCandidates: [],
        pendingImports: [
          {
            workspaceId: 'workspace_fastwrite',
            workspaceName: 'FastWrite',
            workspacePath: 'D:\\Project\\FastWrite',
            repositories: [],
            error: {
              code: 'workspace_scan_failed',
              message: '读取失败',
              detail: 'git 命令执行失败',
            },
            retryCount: 2,
          },
        ],
        dismissedImports: [],
        availableWorkspaces: [
          {
            id: 'workspace_fastwrite',
            name: 'FastWrite',
            path: 'D:\\Project\\FastWrite',
          },
        ],
        lastError: null,
      })
    ;(
      gitWorklogApi as {
        refreshWorkspace: typeof refreshMock
      }
    ).refreshWorkspace = refreshMock

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    fireEvent.click(await screen.findByTestId('git-worklog-open-config-dialog'))

    const refreshButton = await screen.findByTestId(
      'git-worklog-scan-refresh-workspace-d:/project/fastwrite',
    )
    expect(screen.getByText('扫描失败')).toBeVisible()

    fireEvent.click(refreshButton)

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(refreshButton).not.toBeDisabled()
    })
    expect(refreshButton).toHaveAttribute('aria-busy', 'false')
    expect(refreshButton).toHaveTextContent('重新读取')

    fireEvent.click(refreshButton)

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(2)
    })
  })

  it('separates auto grouping from explicit base repositories selection in the repository dialog', async () => {
    installGitWorklogApiMock({
      availableWorkspaces: [
        {
          id: 'workspace_a',
          name: 'Drone',
          path: 'D:\\Project\\Drone',
        },
      ],
      repos: [],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['git-worklog'],
            gitWorklog: {
              ...DEFAULT_AGENT_SETTINGS.plugins.gitWorklog,
              repositoryOrder: ['repo_1'],
              workspaceOrder: [],
              repositories: [
                {
                  id: 'repo_1',
                  label: 'Drone API',
                  path: 'D:\\Project\\Drone\\api',
                  enabled: true,
                  origin: 'manual',
                  assignedWorkspaceId: null,
                },
              ],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-git-worklog'))
    await screen.findByTestId('git-worklog-manage-repository-repo_1')
    fireEvent.click(screen.getByTestId('git-worklog-manage-repository-repo_1'))

    const select = screen.getByTestId('git-worklog-repository-workspace-repo_1')
    expect(within(select).getByRole('option', { name: '自动按路径归组' })).toBeVisible()
    expect(within(select).getByRole('option', { name: '基础仓库' })).toBeVisible()
  })

  it('falls back to raw remain quota display when the derived integer field is missing', async () => {
    installQuotaMonitorApiMock({
      status: 'ready',
      lastUpdatedAt: '2026-04-02T09:30:00.000Z',
      configuredProfileCount: 1,
      successfulProfileCount: 1,
      profiles: [
        createQuotaProfileState({
          remainQuotaIntDisplay: '--',
        }),
      ],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['quota-monitor'],
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-quota-monitor'))

    const overview = await screen.findByTestId('quota-monitor-overview')
    expect(within(overview).getAllByText('2048').at(0)).toBeVisible()
  })

  it('renders the updated quota hero wording and average quota metric', async () => {
    installQuotaMonitorApiMock({
      status: 'ready',
      lastUpdatedAt: '2026-04-02T09:30:00.000Z',
      configuredProfileCount: 1,
      successfulProfileCount: 1,
      profiles: [createQuotaProfileState()],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['quota-monitor'],
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-quota-monitor'))

    const hero = await screen.findByTestId('quota-monitor-hero')
    expect(within(hero).getByText('剩余额度')).toBeVisible()
    expect(within(hero).getByText('预估剩余工作时长')).toBeVisible()
    expect(within(hero).getByText('剩余273天')).toBeVisible()
    expect(within(hero).getByText('96时0分')).toBeVisible()

    const usageGrid = screen.getByTestId('quota-monitor-usage-grid')
    expect(within(usageGrid).getByText('单次均额')).toBeVisible()
    expect(within(usageGrid).getByText('8')).toBeVisible()
  })

  it('keeps long quota monitor summary values on a single line', async () => {
    installQuotaMonitorApiMock({
      status: 'ready',
      lastUpdatedAt: '2026-04-02T09:30:00.000Z',
      configuredProfileCount: 1,
      successfulProfileCount: 1,
      profiles: [
        createQuotaProfileState({
          modelUsageSummary: {
            todayTokens: 1080770,
            totalTokens: 1080770000,
            models: [
              {
                modelName: 'gpt-5.2',
                todayTokens: 1080770,
                totalTokens: 1080770000,
                averageDailyTokens: 108077,
              },
            ],
          },
        }),
      ],
    })

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['quota-monitor'],
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-quota-monitor'))

    const usageGrid = await screen.findByTestId('quota-monitor-usage-grid')
    const totalTokenValue = within(usageGrid).getByText('1080.77M')
    expect(totalTokenValue).toBeVisible()
  })

  it('toggles api key visibility inside quota monitor key profiles', async () => {
    installQuotaMonitorApiMock()

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['quota-monitor'],
            quotaMonitor: {
              ...DEFAULT_AGENT_SETTINGS.plugins.quotaMonitor,
              keyProfiles: [
                {
                  ...DEFAULT_AGENT_SETTINGS.plugins.quotaMonitor.keyProfiles[0],
                  id: 'key_1',
                  apiKey: 'sk-test-visible',
                },
              ],
            },
          },
        }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-quota-monitor'))
    expect(await screen.findByTestId('plugin-manager-plugin-quota-monitor-section')).toBeVisible()

    const apiKeyInput = screen.getByTestId('quota-monitor-profile-api-key-key_1')
    const visibilityToggle = screen.getByTestId('quota-monitor-profile-api-key-visibility-key_1')
    expect(apiKeyInput).toHaveAttribute('type', 'password')
    expect(visibilityToggle).toHaveAttribute('aria-label', '显示原文')
    expect(visibilityToggle).not.toHaveTextContent('显示原文')
    expect(visibilityToggle).not.toHaveTextContent('隐藏原文')

    fireEvent.click(visibilityToggle)
    expect(apiKeyInput).toHaveAttribute('type', 'text')
    expect(visibilityToggle).toHaveAttribute('aria-label', '隐藏原文')

    fireEvent.click(visibilityToggle)
    expect(apiKeyInput).toHaveAttribute('type', 'password')
  })

  it('falls back to general navigation when the active plugin is disabled', async () => {
    installQuotaMonitorApiMock()

    function Wrapper(): React.JSX.Element {
      const [settings, setSettings] = React.useState({
        ...DEFAULT_AGENT_SETTINGS,
        plugins: {
          ...DEFAULT_AGENT_SETTINGS.plugins,
          enabledIds: ['quota-monitor'],
        },
      })

      return (
        <PluginManagerPanel
          isOpen
          settings={settings}
          onChange={setSettings}
          onClose={() => undefined}
        />
      )
    }

    render(<Wrapper />)

    fireEvent.click(screen.getByTestId('plugin-manager-nav-quota-monitor'))
    expect(await screen.findByTestId('plugin-manager-plugin-quota-monitor-section')).toBeVisible()

    fireEvent.click(screen.getByTestId('plugin-manager-nav-general'))
    fireEvent.click(screen.getByTestId('plugin-manager-toggle-quota-monitor'))

    expect(await screen.findByTestId('plugin-manager-nav-general')).toHaveClass(
      'settings-panel__nav-button--active',
    )
    expect(screen.queryByTestId('plugin-manager-nav-quota-monitor')).not.toBeInTheDocument()
  })

  it('tests workspace assistant ai configuration and shows inline feedback', async () => {
    const workspaceAssistantApi = installWorkspaceAssistantApiMock()

    render(
      <PluginManagerPanel
        isOpen
        settings={{
          ...DEFAULT_AGENT_SETTINGS,
          plugins: {
            ...DEFAULT_AGENT_SETTINGS.plugins,
            enabledIds: ['workspace-assistant'],
            workspaceAssistant: {
              ...DEFAULT_AGENT_SETTINGS.plugins.workspaceAssistant,
              enabled: true,
              modelProvider: 'openai-compatible',
              apiBaseUrl: 'https://model.example.test/v1',
              apiKey: 'sk-test',
              modelName: 'gpt-4.1-mini',
            },
          },
        }}
        onChange={() => undefined}
        onFlushPersistNow={() => undefined}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('plugin-manager-nav-workspace-assistant'))
    expect(
      await screen.findByTestId('plugin-manager-plugin-workspace-assistant-section'),
    ).toBeVisible()

    fireEvent.click(screen.getByTestId('workspace-assistant-test-connection'))

    await waitFor(() => {
      expect(workspaceAssistantApi.syncSettings).toHaveBeenCalledTimes(1)
      expect(workspaceAssistantApi.testConnection).toHaveBeenCalledTimes(1)
    })

    expect(
      await screen.findByTestId('workspace-assistant-test-connection-feedback'),
    ).toHaveTextContent('AI 配置可用，工作助手将直接使用该配置回答：连接成功。')
  })
})
