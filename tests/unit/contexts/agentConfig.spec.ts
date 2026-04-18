import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  resolveAgentModel,
  resolveTaskTitleModel,
  resolveTaskTitleProvider,
  resolveWorktreeNameSuggestionProvider,
} from '../../../src/contexts/settings/domain/agentSettings'

describe('agent settings normalization', () => {
  it('returns defaults for invalid input', () => {
    expect(normalizeAgentSettings(null)).toEqual(DEFAULT_AGENT_SETTINGS)
    expect(normalizeAgentSettings('invalid')).toEqual(DEFAULT_AGENT_SETTINGS)
    expect(DEFAULT_AGENT_SETTINGS.language).toBe('zh-CN')
    expect(DEFAULT_AGENT_SETTINGS.uiTheme).toBe('system')
    expect(DEFAULT_AGENT_SETTINGS.focusNodeOnClick).toBe(true)
    expect(DEFAULT_AGENT_SETTINGS.focusNodeTargetZoom).toBe(1)
    expect(DEFAULT_AGENT_SETTINGS.standbyBannerEnabled).toBe(true)
    expect(DEFAULT_AGENT_SETTINGS.standbyBannerShowTask).toBe(true)
    expect(DEFAULT_AGENT_SETTINGS.standbyBannerShowSpace).toBe(true)
    expect(DEFAULT_AGENT_SETTINGS.standbyBannerShowBranch).toBe(true)
    expect(DEFAULT_AGENT_SETTINGS.standbyBannerShowPullRequest).toBe(true)
    expect(DEFAULT_AGENT_SETTINGS.canvasInputMode).toBe('auto')
    expect(DEFAULT_AGENT_SETTINGS.defaultTerminalWindowScalePercent).toBe(80)
    expect(DEFAULT_AGENT_SETTINGS.terminalFontSize).toBe(13)
    expect(DEFAULT_AGENT_SETTINGS.uiFontSize).toBe(18)
    expect(DEFAULT_AGENT_SETTINGS.plugins.enabledIds).toEqual([])
    expect(DEFAULT_AGENT_SETTINGS.plugins.ossBackup.objectKey).toBe(
      'freecli/plugin-settings/latest.json',
    )
    expect(DEFAULT_AGENT_SETTINGS.updatePolicy).toBe('prompt')
    expect(DEFAULT_AGENT_SETTINGS.updateChannel).toBe('stable')
    expect(DEFAULT_AGENT_SETTINGS.releaseNotesSeenVersion).toBeNull()
  })

  it('normalizes the agent provider order and keeps all providers', () => {
    const result = normalizeAgentSettings({
      agentProviderOrder: ['gemini', 'codex', 'gemini', 'invalid'],
    })

    expect(result.agentProviderOrder).toEqual(['gemini', 'codex', 'claude-code', 'opencode'])
  })

  it('keeps valid provider, custom model, and model option fields', () => {
    const result = normalizeAgentSettings({
      language: 'zh-CN',
      uiTheme: 'light',
      defaultProvider: 'codex',
      customModelEnabledByProvider: {
        'claude-code': true,
        codex: false,
      },
      customModelByProvider: {
        'claude-code': 'claude-opus-4-6',
        codex: 'gpt-5.2-codex',
      },
      customModelOptionsByProvider: {
        'claude-code': ['claude-opus-4-6', 'claude-sonnet-4-5-20250929'],
        codex: ['gpt-5.2-codex', 'gpt-5.2-codex'],
      },
      taskTitleProvider: 'claude-code',
      taskTitleModel: 'claude-opus-4-6',
      taskTagOptions: ['feature', 'bug', 'feature', ''],
      focusNodeOnClick: false,
      focusNodeTargetZoom: 1.25,
      standbyBannerEnabled: false,
      standbyBannerShowTask: false,
      standbyBannerShowSpace: false,
      standbyBannerShowBranch: false,
      standbyBannerShowPullRequest: false,
      canvasInputMode: 'trackpad',
      defaultTerminalWindowScalePercent: 95,
      terminalFontSize: 15,
      uiFontSize: 21,
      updatePolicy: 'auto',
      updateChannel: 'nightly',
    })

    expect(result.language).toBe('zh-CN')
    expect(result.uiTheme).toBe('light')
    expect(result.defaultProvider).toBe('codex')
    expect(result.customModelEnabledByProvider['claude-code']).toBe(true)
    expect(result.customModelEnabledByProvider.codex).toBe(false)
    expect(result.customModelByProvider['claude-code']).toBe('claude-opus-4-6')
    expect(result.customModelByProvider.codex).toBe('gpt-5.2-codex')
    expect(result.customModelOptionsByProvider['claude-code']).toEqual([
      'claude-opus-4-6',
      'claude-sonnet-4-5-20250929',
    ])
    expect(result.customModelOptionsByProvider.codex).toEqual(['gpt-5.2-codex'])
    expect(result.taskTitleProvider).toBe('claude-code')
    expect(result.taskTitleModel).toBe('claude-opus-4-6')
    expect(result.taskTagOptions).toEqual(['feature', 'bug'])
    expect(result.focusNodeOnClick).toBe(false)
    expect(result.focusNodeTargetZoom).toBe(1.25)
    expect(result.standbyBannerEnabled).toBe(false)
    expect(result.standbyBannerShowTask).toBe(false)
    expect(result.standbyBannerShowSpace).toBe(false)
    expect(result.standbyBannerShowBranch).toBe(false)
    expect(result.standbyBannerShowPullRequest).toBe(false)
    expect(result.canvasInputMode).toBe('trackpad')
    expect(result.defaultTerminalWindowScalePercent).toBe(95)
    expect(result.terminalFontSize).toBe(15)
    expect(result.uiFontSize).toBe(21)
    expect(result.updatePolicy).toBe('prompt')
    expect(result.updateChannel).toBe('nightly')
    expect(resolveTaskTitleProvider(result)).toBe('claude-code')
    expect(resolveTaskTitleModel(result)).toBe('claude-opus-4-6')
    expect(resolveAgentModel(result, 'claude-code')).toBe('claude-opus-4-6')
    expect(resolveAgentModel(result, 'codex')).toBeNull()
  })

  it('trims custom model and keeps default behavior when empty', () => {
    const result = normalizeAgentSettings({
      defaultProvider: 'claude-code',
      customModelEnabledByProvider: {
        'claude-code': true,
        codex: true,
      },
      customModelByProvider: {
        'claude-code': '   ',
        codex: '  gpt-5.2-codex  ',
      },
      customModelOptionsByProvider: {
        'claude-code': ['  claude-opus-4-6  ', ''],
        codex: ['  gpt-5.2-codex  '],
      },
      taskTitleProvider: 'default',
      taskTitleModel: '   ',
      taskTagOptions: ['  ops ', 'ops', ''],
    })

    expect(result.customModelByProvider['claude-code']).toBe('')
    expect(result.customModelByProvider.codex).toBe('gpt-5.2-codex')
    expect(result.customModelOptionsByProvider['claude-code']).toEqual(['claude-opus-4-6'])
    expect(result.customModelOptionsByProvider.codex).toEqual(['gpt-5.2-codex'])
    expect(result.taskTitleProvider).toBe('default')
    expect(result.taskTitleModel).toBe('')
    expect(result.taskTagOptions).toEqual(['ops'])
    expect(result.focusNodeOnClick).toBe(true)
    expect(result.focusNodeTargetZoom).toBe(1)
    expect(result.canvasInputMode).toBe('auto')
    expect(result.defaultTerminalWindowScalePercent).toBe(80)
    expect(result.terminalFontSize).toBe(13)
    expect(result.uiFontSize).toBe(18)
    expect(result.updatePolicy).toBe('prompt')
    expect(result.updateChannel).toBe('stable')
    expect(resolveAgentModel(result, 'claude-code')).toBeNull()
    expect(resolveAgentModel(result, 'codex')).toBe('gpt-5.2-codex')
    expect(resolveTaskTitleProvider(result)).toBe('claude-code')
    expect(resolveTaskTitleModel(result)).toBeNull()
  })

  it('falls back to auto canvas input mode when input is invalid', () => {
    const result = normalizeAgentSettings({
      language: 'fr-FR',
      uiTheme: 'bold-blue',
      canvasInputMode: 'touchscreen',
      updatePolicy: 'download-all',
      updateChannel: 'beta',
    })

    expect(result.language).toBe('zh-CN')
    expect(result.uiTheme).toBe('system')
    expect(result.canvasInputMode).toBe('auto')
    expect(result.updatePolicy).toBe('prompt')
    expect(result.updateChannel).toBe('stable')
  })

  it('migrates legacy modelByProvider to custom override', () => {
    const result = normalizeAgentSettings({
      defaultProvider: 'codex',
      modelByProvider: {
        'claude-code': 'claude-sonnet-4-5-20250929',
        codex: 'gpt-5.2-codex',
      },
    })

    expect(result.customModelEnabledByProvider['claude-code']).toBe(true)
    expect(result.customModelEnabledByProvider.codex).toBe(true)
    expect(result.customModelByProvider['claude-code']).toBe('claude-sonnet-4-5-20250929')
    expect(result.customModelByProvider.codex).toBe('gpt-5.2-codex')
  })

  it('falls back to default task tags when options are invalid', () => {
    const result = normalizeAgentSettings({
      taskTagOptions: [123, null],
    })

    expect(result.taskTagOptions).toEqual(DEFAULT_AGENT_SETTINGS.taskTagOptions)
  })

  it('ensures selected custom model appears in options list', () => {
    const result = normalizeAgentSettings({
      defaultProvider: 'claude-code',
      customModelEnabledByProvider: {
        'claude-code': true,
        codex: false,
      },
      customModelByProvider: {
        'claude-code': 'claude-custom-lab',
        codex: '',
      },
      customModelOptionsByProvider: {
        'claude-code': ['claude-opus-4-6'],
        codex: [],
      },
    })

    expect(result.customModelOptionsByProvider['claude-code']).toEqual([
      'claude-custom-lab',
      'claude-opus-4-6',
    ])
  })

  it('clamps numeric appearance settings to safe ranges', () => {
    const result = normalizeAgentSettings({
      defaultTerminalWindowScalePercent: 999,
      terminalFontSize: 1,
      uiFontSize: 999,
    })

    expect(result.defaultTerminalWindowScalePercent).toBe(120)
    expect(result.terminalFontSize).toBe(10)
    expect(result.uiFontSize).toBe(24)
  })

  it('migrates legacy uiFontScalePercent to uiFontSize', () => {
    const result = normalizeAgentSettings({
      uiFontScalePercent: 125,
    })

    expect(result.uiFontSize).toBe(20)
  })

  it('migrates legacy normalizeZoomOnTerminalClick to focusNodeOnClick', () => {
    const result = normalizeAgentSettings({
      normalizeZoomOnTerminalClick: false,
    })

    expect(result.focusNodeOnClick).toBe(false)
  })

  it('falls back to default focus zoom when target zoom is invalid', () => {
    const result = normalizeAgentSettings({
      focusNodeTargetZoom: Number.NaN,
    })

    expect(result.focusNodeTargetZoom).toBe(1)
  })

  it('clamps focus zoom setting to the supported canvas zoom range', () => {
    const maxResult = normalizeAgentSettings({
      focusNodeTargetZoom: 999,
    })
    expect(maxResult.focusNodeTargetZoom).toBe(2)

    const minResult = normalizeAgentSettings({
      focusNodeTargetZoom: 0.001,
    })
    expect(minResult.focusNodeTargetZoom).toBe(0.1)
  })

  it('falls back to codex for task titles when default provider cannot name tasks', () => {
    expect(
      resolveTaskTitleProvider({
        ...DEFAULT_AGENT_SETTINGS,
        defaultProvider: 'opencode',
        taskTitleProvider: 'default',
      }),
    ).toBe('codex')
  })

  it('falls back to codex for worktree naming when default provider cannot suggest names', () => {
    expect(resolveWorktreeNameSuggestionProvider('gemini')).toBe('codex')
  })

  it('keeps only known built-in plugin ids', () => {
    const result = normalizeAgentSettings({
      plugins: {
        enabledIds: ['input-stats', 'input-stats', 'unknown-plugin'],
      },
    })

    expect(result.plugins.enabledIds).toEqual(['input-stats'])
  })

  it('normalizes system monitor settings under plugins and migrates legacy gpu flag', () => {
    const result = normalizeAgentSettings({
      plugins: {
        systemMonitor: {
          pollIntervalMs: 200,
          backgroundPollIntervalMs: 999999,
          saveIntervalMs: 100,
          historyRangeDays: 999,
          gpuMonitoringEnabled: true,
          taskbarWidgetEnabled: true,
          notifyIconEnabled: true,
        },
      },
    })

    expect(result.plugins.systemMonitor).toEqual({
      pollIntervalMs: 1000,
      backgroundPollIntervalMs: 120000,
      saveIntervalMs: 10000,
      historyRangeDays: 7,
      gpuMode: 'total',
      taskbarWidgetEnabled: true,
      taskbarWidget: {
        notifyIconEnabled: true,
        compactModeEnabled: true,
        alwaysOnTop: true,
        fontSize: 9,
        displayItems: ['download', 'upload', 'cpu'],
      },
    })
  })

  it('normalizes quota monitor settings under plugins', () => {
    const result = normalizeAgentSettings({
      plugins: {
        quotaMonitor: {
          apiBaseUrl: '  https://quota.example.test/api/token_stats  ',
          refreshIntervalMs: 10,
          timeoutSeconds: 999,
          retryTimes: 0,
          verifySsl: false,
          proxy: '  http://127.0.0.1:7890  ',
          keyProfiles: [
            {
              id: 'primary',
              label: ' Primary ',
              apiKey: ' key-1 ',
              enabled: true,
              type: 'capped',
              dailyInitialQuota: -1,
              hourlyIncreaseQuota: '3',
              quotaCap: '15',
            },
            {
              id: 'primary',
              label: 'duplicate',
              apiKey: 'key-2',
              enabled: true,
              type: 'normal',
            },
          ],
        },
      },
    })

    expect(result.plugins.quotaMonitor).toEqual({
      apiBaseUrl: 'https://quota.example.test/api/token_stats',
      refreshIntervalMs: 30000,
      timeoutSeconds: 120,
      retryTimes: 1,
      verifySsl: false,
      proxy: 'http://127.0.0.1:7890',
      keyProfiles: [
        {
          id: 'primary',
          label: 'Primary',
          apiKey: 'key-1',
          enabled: true,
          type: 'capped',
          dailyInitialQuota: 0,
          hourlyIncreaseQuota: 3,
          quotaCap: 15,
        },
      ],
    })
  })

  it('normalizes git worklog settings under plugins', () => {
    const result = normalizeAgentSettings({
      plugins: {
        gitWorklog: {
          authorFilter: '  Alice  ',
          rangeMode: 'date_range',
          recentDays: 999,
          rangeStartDay: '2026-04-06',
          rangeEndDay: '2026-04-02',
          autoRefreshEnabled: true,
          refreshIntervalMs: 10,
          autoImportedWorkspacePaths: ['  D:\\Project\\Drone  ', '', 'D:/Project/Drone'],
          ignoredAutoRepositoryPaths: [
            '  D:\\Project\\Drone\\.uv-cache\\sdists-v9  ',
            '',
            'D:/Project/Drone/.uv-cache/sdists-v9',
          ],
          repositories: [
            {
              id: 'repo_a',
              label: ' Repo A ',
              path: '  D:\\Project\\demo-a  ',
              enabled: true,
            },
            {
              id: 'repo_a',
              label: 'duplicate',
              path: 'D:\\Project\\demo-b',
              enabled: true,
            },
          ],
        },
      },
    })

    expect(result.plugins.gitWorklog).toEqual({
      authorFilter: 'Alice',
      rangeMode: 'date_range',
      recentDays: 90,
      rangeStartDay: '2026-04-06',
      rangeEndDay: '2026-04-02',
      autoImportedWorkspacePaths: ['D:\\Project\\Drone'],
      ignoredAutoRepositoryPaths: ['D:\\Project\\Drone\\.uv-cache\\sdists-v9'],
      autoDiscoverEnabled: true,
      autoDiscoverDepth: 3,
      autoRefreshEnabled: true,
      refreshIntervalMs: 60000,
      repositories: [
        {
          id: 'repo_a',
          label: 'Repo A',
          path: 'D:\\Project\\demo-a',
          enabled: true,
        },
      ],
    })
  })

  it('normalizes oss backup settings under plugins', () => {
    const result = normalizeAgentSettings({
      plugins: {
        ossBackup: {
          enabled: true,
          endpoint: '  https://oss-cn-hangzhou.aliyuncs.com  ',
          region: '  oss-cn-hangzhou  ',
          bucket: '  freecli-backup  ',
          objectKey: '  freecli/custom.json  ',
          accessKeyId: '  test-id  ',
          accessKeySecret: '  test-secret  ',
          autoBackupEnabled: true,
          autoBackupMinIntervalSeconds: 9999,
          restoreOnStartupEnabled: true,
          backupOnExitEnabled: 'yes',
          includedPluginIds: ['quota-monitor', 'quota-monitor', 'unknown-plugin'],
          syncInputStatsHistoryEnabled: true,
          syncQuotaMonitorHistoryEnabled: 'yes',
          lastBackupAt: ' 2026-04-04T10:00:00.000Z ',
          lastRestoreAt: '',
          lastError: {
            message: '  failed  ',
            detail: '  timeout  ',
          },
        },
      },
    })

    expect(result.plugins.ossBackup).toEqual({
      enabled: true,
      provider: 'aliyun-oss',
      endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
      region: 'oss-cn-hangzhou',
      bucket: 'freecli-backup',
      objectKey: 'freecli/custom.json',
      accessKeyId: 'test-id',
      accessKeySecret: 'test-secret',
      autoBackupEnabled: true,
      autoBackupMinIntervalSeconds: 9999,
      restoreOnStartupEnabled: true,
      backupOnExitEnabled: false,
      includedPluginIds: ['quota-monitor'],
      syncInputStatsHistoryEnabled: true,
      syncQuotaMonitorHistoryEnabled: false,
      syncGitWorklogHistoryEnabled: false,
      lastBackupAt: '2026-04-04T10:00:00.000Z',
      lastRestoreAt: null,
      lastError: {
        message: 'failed',
        detail: 'timeout',
      },
    })
  })
})
