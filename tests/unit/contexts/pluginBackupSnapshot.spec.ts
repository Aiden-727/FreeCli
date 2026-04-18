import { describe, expect, it } from 'vitest'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'
import {
  createPluginBackupSnapshot,
  mergeRestoredPluginSettings,
  normalizePluginBackupSnapshot,
} from '../../../src/contexts/plugins/domain/pluginBackupSnapshot'

describe('plugin backup snapshot', () => {
  it('sanitizes sensitive fields before upload', () => {
    const snapshot = createPluginBackupSnapshot({
      appVersion: '0.2.0',
      pluginSettings: {
        ...DEFAULT_AGENT_SETTINGS.plugins,
        enabledIds: ['quota-monitor', 'oss-backup'],
        quotaMonitor: {
          ...DEFAULT_AGENT_SETTINGS.plugins.quotaMonitor,
          apiBaseUrl: 'https://quota.example.test',
          keyProfiles: [
            {
              id: 'key_1',
              label: 'Primary',
              apiKey: 'secret-key',
              enabled: true,
              type: 'normal',
              dailyInitialQuota: 0,
              hourlyIncreaseQuota: 0,
              quotaCap: 0,
            },
          ],
        },
        ossBackup: {
          ...DEFAULT_AGENT_SETTINGS.plugins.ossBackup,
          endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
          region: 'oss-cn-hangzhou',
          bucket: 'freecli',
          objectKey: 'freecli/latest.json',
          accessKeyId: 'id',
          accessKeySecret: 'secret',
          autoBackupEnabled: true,
          autoBackupMinIntervalSeconds: 12,
          restoreOnStartupEnabled: true,
          backupOnExitEnabled: true,
          includedPluginIds: ['quota-monitor'],
        },
      },
    })

    expect(snapshot.plugins.quotaMonitor?.keyProfiles[0]?.apiKey).toBe('')
    expect(snapshot.plugins.ossBackup).toEqual({
      provider: 'aliyun-oss',
      endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
      region: 'oss-cn-hangzhou',
      bucket: 'freecli',
      objectKey: 'freecli/latest.json',
      autoBackupEnabled: true,
      autoBackupMinIntervalSeconds: 12,
      restoreOnStartupEnabled: true,
      backupOnExitEnabled: true,
      includedPluginIds: ['quota-monitor'],
      syncInputStatsHistoryEnabled: false,
      syncQuotaMonitorHistoryEnabled: false,
      syncGitWorklogHistoryEnabled: false,
    })
  })

  it('normalizes cloud snapshot and merges it back into local settings', () => {
    const normalized = normalizePluginBackupSnapshot({
      formatVersion: 1,
      createdAt: '2026-04-04T10:00:00.000Z',
      appVersion: '0.2.0',
      plugins: {
        enabledIds: ['quota-monitor', 'git-worklog', 'unknown-plugin'],
        quotaMonitor: {
          apiBaseUrl: ' https://quota.example.test ',
          refreshIntervalMs: 180000,
          timeoutSeconds: 12,
          retryTimes: 3,
          verifySsl: true,
          proxy: '',
          keyProfiles: [
            {
              id: 'key_1',
              label: 'Primary',
              apiKey: 'should-be-cleared',
              enabled: true,
              type: 'normal',
              dailyInitialQuota: 0,
              hourlyIncreaseQuota: 0,
              quotaCap: 0,
            },
          ],
        },
        ossBackup: {
          provider: 'aliyun-oss',
          endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
          region: 'oss-cn-hangzhou',
          bucket: 'freecli',
          objectKey: 'freecli/latest.json',
          autoBackupEnabled: true,
          autoBackupMinIntervalSeconds: 120,
          restoreOnStartupEnabled: true,
          backupOnExitEnabled: true,
          includedPluginIds: ['quota-monitor'],
        },
      },
    })

    expect(normalized).not.toBeNull()
    expect(normalized?.plugins.quotaMonitor?.keyProfiles[0]?.apiKey).toBe('')

    const merged = mergeRestoredPluginSettings(DEFAULT_AGENT_SETTINGS.plugins, normalized!)
    expect(merged.enabledIds).toEqual(['quota-monitor', 'git-worklog'])
    expect(merged.systemMonitor).toEqual(DEFAULT_AGENT_SETTINGS.plugins.systemMonitor)
    expect(merged.quotaMonitor.apiBaseUrl).toBe('https://quota.example.test')
    expect(merged.quotaMonitor.keyProfiles[0]?.apiKey).toBe('')
    expect(merged.ossBackup.objectKey).toBe('freecli/latest.json')
    expect(merged.ossBackup.accessKeySecret).toBe('')
    expect(merged.ossBackup.autoBackupMinIntervalSeconds).toBe(120)
    expect(merged.ossBackup.restoreOnStartupEnabled).toBe(true)
    expect(merged.ossBackup.backupOnExitEnabled).toBe(true)
    expect(merged.ossBackup.syncInputStatsHistoryEnabled).toBe(false)
    expect(merged.ossBackup.syncQuotaMonitorHistoryEnabled).toBe(false)
    expect(merged.ossBackup.syncGitWorklogHistoryEnabled).toBe(false)
  })
})
