import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  GitWorklogStateDto,
  OssBackupStateDto,
  OssSyncComparisonDto,
  QuotaMonitorStateDto,
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
    },
    repos: [],
    autoCandidates: [],
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
    expect(screen.queryByTestId('git-worklog-config-board')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('git-worklog-open-config-dialog'))
    expect(screen.getByTestId('git-worklog-config-dialog')).toBeVisible()
    expect(screen.getByTestId('git-worklog-config-board')).toBeVisible()
    expect(screen.getByTestId('git-worklog-config-scan-panel')).toBeVisible()
    expect(screen.getByTestId('git-worklog-config-automation-panel')).toBeVisible()
    expect(screen.getByTestId('git-worklog-add-repository')).toBeVisible()
    expect(screen.getAllByText('子仓库').at(0)).toBeVisible()
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

  it('confirms auto-discovered candidates into managed repositories', async () => {
    installGitWorklogApiMock({
      autoCandidates: [
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
    expect(await screen.findByTestId('git-worklog-auto-candidates')).toBeVisible()

    fireEvent.click(screen.getByTestId('git-worklog-confirm-auto-candidate-auto_workspace_root_apps__admin'))

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
    expect(await screen.findByTestId('git-worklog-manage-repository-repo_2')).toBeVisible()

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
})
