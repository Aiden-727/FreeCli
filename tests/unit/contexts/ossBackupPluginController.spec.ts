import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PersistenceStore } from '../../../src/platform/persistence/sqlite/PersistenceStore'
import { DEFAULT_AGENT_SETTINGS } from '../../../src/contexts/settings/domain/agentSettings'
import { DEFAULT_OSS_BACKUP_SETTINGS } from '../../../src/contexts/plugins/domain/ossBackupSettings'
import {
  DEFAULT_QUOTA_MONITOR_SETTINGS,
  createDefaultQuotaMonitorKeyProfile,
} from '../../../src/contexts/plugins/domain/quotaMonitorSettings'
import { OssBackupPluginController } from '../../../src/plugins/ossBackup/presentation/main/OssBackupPluginController'
import type {
  OssBackupSettingsDto,
  OssBackupStateDto,
  PluginBackupSnapshotDto,
} from '../../../src/shared/contracts/dto'
import type { OssObjectStoreClient } from '../../../src/plugins/ossBackup/presentation/main/OssObjectStoreClient'
import type { GitWorklogHistorySyncPayload } from '../../../src/plugins/gitWorklog/infrastructure/main/GitWorklogHistoryStore'

function createConfiguredSettings(
  overrides: Partial<OssBackupSettingsDto> = {},
): OssBackupSettingsDto {
  return {
    ...DEFAULT_OSS_BACKUP_SETTINGS,
    enabled: true,
    endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
    region: 'oss-cn-hangzhou',
    bucket: 'freecli-test',
    objectKey: 'freecli/plugin-settings',
    accessKeyId: 'test-key-id',
    accessKeySecret: 'test-secret',
    ...overrides,
  }
}

function createPersistenceStoreStub(overrides?: {
  quotaApiBaseUrl?: string
  ossSettings?: Partial<OssBackupSettingsDto>
}): PersistenceStore {
  return {
    readWorkspaceStateRaw: vi.fn(async () => null),
    writeWorkspaceStateRaw: vi.fn(async () => ({ ok: true, level: 'full', bytes: 1 })),
    readAppState: vi.fn(async () => ({
      settings: {
        ...DEFAULT_AGENT_SETTINGS,
        plugins: {
          ...DEFAULT_AGENT_SETTINGS.plugins,
          enabledIds: ['quota-monitor', 'oss-backup'],
          quotaMonitor: {
            ...DEFAULT_QUOTA_MONITOR_SETTINGS,
            apiBaseUrl: overrides?.quotaApiBaseUrl ?? DEFAULT_QUOTA_MONITOR_SETTINGS.apiBaseUrl,
            keyProfiles: [
              {
                ...createDefaultQuotaMonitorKeyProfile(0),
                id: 'primary',
                label: 'Primary',
                apiKey: 'quota-secret',
              },
            ],
          },
          ossBackup: {
            ...createConfiguredSettings(),
            includedPluginIds: ['quota-monitor'],
            ...(overrides?.ossSettings ?? {}),
          },
        },
      },
    })),
    writeAppState: vi.fn(async () => ({ ok: true, level: 'full', bytes: 1 })),
    readNodeScrollback: vi.fn(async () => null),
    writeNodeScrollback: vi.fn(async () => ({ ok: true, level: 'full', bytes: 1 })),
    consumeRecovery: vi.fn(() => null),
    dispose: vi.fn(),
  }
}

describe('OssBackupPluginController', () => {
  const tempDirs = new Set<string>()

  const createTempUserDataPath = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'oss-backup-tests-'))
    tempDirs.add(dir)
    return dir
  }

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    const cleanup = [...tempDirs]
    tempDirs.clear()
    return Promise.all(cleanup.map(path => rm(path, { recursive: true, force: true })))
  })

  it('uploads sanitized plugin snapshot and manifest after activation', async () => {
    const store = createPersistenceStoreStub()
    const putJson = vi.fn(async () => undefined)
    const gitWorklogHistoryStore = {
      exportForSync: vi.fn(async () => ({
        formatVersion: 1,
        exportedAt: '2026-04-04T10:00:00.000Z',
        repositories: [],
      })),
      importForSync: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    }
    const client = {
      putJson,
      getJsonIfExists: vi.fn(async () => null),
      testConnection: vi.fn(),
    }
    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: client as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
      gitWorklogHistoryStore: gitWorklogHistoryStore as never,
    })

    controller.syncSettings(
      createConfiguredSettings({
        syncGitWorklogHistoryEnabled: true,
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    const state = await controller.backupNow()
    const snapshotCall = putJson.mock.calls.find(
      call => call[1] === 'freecli/plugin-settings/latest.json',
    )
    const manifestCall = putJson.mock.calls.find(
      call => call[1] === 'freecli/plugin-settings/manifest.json',
    )
    const gitHistoryCall = putJson.mock.calls.find(
      call => call[1] === 'freecli/plugin-settings/git-worklog-history.json',
    )
    const uploadedSnapshot = snapshotCall?.[2] as PluginBackupSnapshotDto

    expect(putJson).toHaveBeenCalledTimes(3)
    expect(gitWorklogHistoryStore.exportForSync).toHaveBeenCalledTimes(1)
    expect(gitHistoryCall?.[2]).toEqual({
      formatVersion: 1,
      exportedAt: '2026-04-04T10:00:00.000Z',
      repositories: [],
    } satisfies GitWorklogHistorySyncPayload)
    expect(uploadedSnapshot.plugins.quotaMonitor?.keyProfiles[0]?.apiKey).toBe('')
    expect(uploadedSnapshot.plugins.ossBackup).toEqual({
      provider: 'aliyun-oss',
      endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
      region: 'oss-cn-hangzhou',
      bucket: 'freecli-test',
      objectKey: 'freecli/plugin-settings',
      autoBackupEnabled: false,
      autoBackupMinIntervalSeconds: 180,
      restoreOnStartupEnabled: false,
      backupOnExitEnabled: false,
      includedPluginIds: ['quota-monitor'],
      syncInputStatsHistoryEnabled: false,
      syncQuotaMonitorHistoryEnabled: false,
      syncGitWorklogHistoryEnabled: false,
    })
    expect(manifestCall?.[2]).toMatchObject({
      schema: 1,
      files: {
        'plugin-settings': {
          version: 1,
        },
        'git-worklog-history': {
          version: 1,
        },
      },
    })
    expect(state.status).toBe('ready')
    expect(state.lastBackupAt).not.toBeNull()

    await controller.dispose()
  })

  it('keeps the same remote object keys for legacy file-path configuration', async () => {
    const store = createPersistenceStoreStub({
      ossSettings: {
        objectKey: 'freecli/legacy/latest.json',
      },
    })
    const putJson = vi.fn(async () => undefined)
    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson,
        getJsonIfExists: vi.fn(async () => null),
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
    })

    controller.syncSettings(
      createConfiguredSettings({
        objectKey: 'freecli/legacy/latest.json',
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    await controller.backupNow()

    expect(putJson.mock.calls.some(call => call[1] === 'freecli/legacy/latest.json')).toBe(true)
    expect(putJson.mock.calls.some(call => call[1] === 'freecli/legacy/manifest.json')).toBe(true)
    const latestSnapshotCall = putJson.mock.calls.find(call => call[1] === 'freecli/legacy/latest.json')
    expect((latestSnapshotCall?.[2] as PluginBackupSnapshotDto).plugins.ossBackup?.objectKey).toBe(
      'freecli/legacy',
    )

    await controller.dispose()
  })

  it('returns an error state when backup is requested without a complete OSS configuration', async () => {
    const store = createPersistenceStoreStub()
    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson: vi.fn(),
        getJsonIfExists: vi.fn(),
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
    })

    controller.syncSettings(
      createConfiguredSettings({
        bucket: '',
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    const state = await controller.backupNow()

    expect(state.status).toBe('error')
    expect(state.lastError?.message).toContain('OSS')

    await controller.dispose()
  })

  it('throws and keeps an error state when restore fails', async () => {
    const store = createPersistenceStoreStub()
    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson: vi.fn(),
        getJsonIfExists: vi.fn().mockRejectedValue(new Error('network down')),
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
    })

    controller.syncSettings(createConfiguredSettings())
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    await expect(controller.restoreBackup()).rejects.toThrow('network down')
    expect(controller.getState().status).toBe('error')
    expect(controller.getState().lastError?.message).toContain('network down')

    await controller.dispose()
  })

  it('only schedules auto backup for included plugin changes', async () => {
    vi.useFakeTimers()
    const userDataPath = createTempUserDataPath()
    const store = createPersistenceStoreStub()

    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson: vi.fn(async () => undefined),
        getJsonIfExists: vi.fn(async () => null),
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath,
    })

    controller.syncSettings(
      createConfiguredSettings({
        autoBackupEnabled: true,
        autoBackupMinIntervalSeconds: 5,
        includedPluginIds: ['quota-monitor'],
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    const backupSpy = vi.spyOn(
      controller as unknown as {
        performBackup: (mode: 'manual' | 'auto' | 'exit') => Promise<unknown>
      },
      'performBackup',
    )

    await vi.advanceTimersByTimeAsync(5000)
    await Promise.resolve()
    expect(backupSpy).toHaveBeenCalledTimes(1)
    expect(backupSpy).toHaveBeenNthCalledWith(1, 'auto')
    backupSpy.mockClear()

    controller.notePersistedSettings({ changedPluginIds: ['git-worklog'] })
    await vi.advanceTimersByTimeAsync(5000)
    await Promise.resolve()
    expect(backupSpy).not.toHaveBeenCalled()

    controller.notePersistedSettings({ changedPluginIds: ['quota-monitor'] })
    await vi.advanceTimersByTimeAsync(4000)
    await Promise.resolve()
    expect(backupSpy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()

    expect(backupSpy).toHaveBeenCalledTimes(1)
    expect(backupSpy).toHaveBeenCalledWith('auto')

    await controller.dispose()
  })

  it('schedules auto backup for git worklog history changes when history sync is enabled', async () => {
    vi.useFakeTimers()
    const store = createPersistenceStoreStub()
    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson: vi.fn(async () => undefined),
        getJsonIfExists: vi.fn(async () => null),
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
    })

    controller.syncSettings(
      createConfiguredSettings({
        autoBackupEnabled: true,
        autoBackupMinIntervalSeconds: 5,
        syncGitWorklogHistoryEnabled: true,
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    const backupSpy = vi.spyOn(
      controller as unknown as {
        performBackup: (mode: 'manual' | 'auto' | 'exit') => Promise<unknown>
      },
      'performBackup',
    )

    await vi.advanceTimersByTimeAsync(5000)
    await Promise.resolve()
    backupSpy.mockClear()

    controller.notePersistedSettings({ changedPluginIds: ['git-worklog'] })
    await vi.advanceTimersByTimeAsync(5000)
    await Promise.resolve()

    expect(backupSpy).toHaveBeenCalledTimes(1)
    expect(backupSpy).toHaveBeenCalledWith('auto')

    await controller.dispose()
  })

  it('schedules exponential backoff retry when auto backup fails with retriable network error', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13T12:00:00.000Z'))

    const store = createPersistenceStoreStub()
    const putJson = vi.fn(async () => {
      throw new Error('network timeout')
    })
    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson,
        getJsonIfExists: vi.fn(async () => null),
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
    })

    controller.syncSettings(
      createConfiguredSettings({
        autoBackupEnabled: false,
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    controller.syncSettings(
      createConfiguredSettings({
        autoBackupEnabled: true,
        autoBackupMinIntervalSeconds: 5,
      }),
    )

    vi.spyOn(controller as unknown as { canAutoPush: () => boolean }, 'canAutoPush').mockReturnValue(true)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const performBackup = (
      controller as unknown as {
        performBackup: (mode: 'manual' | 'auto' | 'exit') => Promise<OssBackupStateDto>
      }
    ).performBackup.bind(controller)
    const state = await performBackup('auto')

    expect(putJson).toHaveBeenCalled()
    expect(state.status).toBe('error')
    expect(state.lastError?.message).toContain('自动重试')
    expect(state.nextAutoBackupDueAt).toBe('2026-04-13T12:00:25.500Z')

    await controller.dispose()
  })

  it('stops scheduling retries after reaching max retry attempts', async () => {
    vi.useFakeTimers()

    const store = createPersistenceStoreStub()
    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson: vi.fn(async () => {
          throw new Error('connection reset by peer')
        }),
        getJsonIfExists: vi.fn(async () => null),
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
    })

    controller.syncSettings(
      createConfiguredSettings({
        autoBackupEnabled: false,
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    controller.syncSettings(
      createConfiguredSettings({
        autoBackupEnabled: true,
      }),
    )

    vi.spyOn(controller as unknown as { canAutoPush: () => boolean }, 'canAutoPush').mockReturnValue(true)
    ;(controller as unknown as { autoBackupRetryAttempts: number }).autoBackupRetryAttempts = 5

    const performBackup = (
      controller as unknown as {
        performBackup: (mode: 'manual' | 'auto' | 'exit') => Promise<OssBackupStateDto>
      }
    ).performBackup.bind(controller)
    const state = await performBackup('auto')

    expect(state.status).toBe('error')
    expect(state.lastError?.message).not.toContain('自动重试')
    expect(state.nextAutoBackupDueAt).toBeNull()
    expect((controller as unknown as { autoBackupRetryAttempts: number }).autoBackupRetryAttempts).toBe(
      0,
    )

    await controller.dispose()
  })

  it('restores from cloud on startup when enabled and persists merged plugin settings', async () => {
    const readAppState = vi.fn(async () => ({
      formatVersion: 1,
      activeWorkspaceId: null,
      workspaces: [],
      settings: {
        ...DEFAULT_AGENT_SETTINGS,
        plugins: {
          ...DEFAULT_AGENT_SETTINGS.plugins,
          enabledIds: ['quota-monitor', 'oss-backup'],
          quotaMonitor: {
            ...DEFAULT_QUOTA_MONITOR_SETTINGS,
            keyProfiles: [
              {
                ...createDefaultQuotaMonitorKeyProfile(0),
                id: 'primary',
                label: 'Primary',
                apiKey: 'local-secret',
              },
            ],
          },
          ossBackup: createConfiguredSettings({
            restoreOnStartupEnabled: true,
          }),
        },
      },
    }))
    const writeAppState = vi.fn(async () => ({ ok: true, level: 'full', bytes: 1 }))
    const store = {
      ...createPersistenceStoreStub(),
      readAppState,
      writeAppState,
    } satisfies PersistenceStore

    const remoteSnapshot: PluginBackupSnapshotDto = {
      formatVersion: 1,
      createdAt: '2026-04-04T10:00:00.000Z',
      appVersion: '0.2.0',
      plugins: {
        enabledIds: ['quota-monitor', 'oss-backup'],
        ossBackup: {
          provider: 'aliyun-oss',
          endpoint: 'https://oss-cn-shanghai.aliyuncs.com',
          region: 'oss-cn-shanghai',
          bucket: 'cloud-bucket',
          objectKey: 'freecli/cloud/latest.json',
          autoBackupEnabled: true,
          autoBackupMinIntervalSeconds: 15,
          restoreOnStartupEnabled: true,
          backupOnExitEnabled: true,
          includedPluginIds: ['quota-monitor'],
          syncInputStatsHistoryEnabled: false,
          syncQuotaMonitorHistoryEnabled: false,
        },
      },
    }
    const getJsonIfExists = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(remoteSnapshot)
    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson: vi.fn(async () => undefined),
        getJsonIfExists,
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
    })

    controller.syncSettings(
      createConfiguredSettings({
        restoreOnStartupEnabled: true,
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    await vi.waitFor(() => {
      expect(writeAppState).toHaveBeenCalledTimes(1)
    })

    const persisted = writeAppState.mock.calls[0]?.[0] as {
      settings?: { plugins?: { ossBackup?: { [key: string]: unknown } } }
    }
    expect(persisted.settings?.plugins?.ossBackup?.objectKey).toBe('freecli/cloud')
    expect(persisted.settings?.plugins?.ossBackup?.restoreOnStartupEnabled).toBe(true)
    expect(persisted.settings?.plugins?.ossBackup?.backupOnExitEnabled).toBe(true)
    expect(controller.getState().lastRestoreAt).not.toBeNull()

    await controller.dispose()
  })

  it('restores git worklog history dataset when history sync is enabled', async () => {
    const store = createPersistenceStoreStub()
    const gitWorklogHistoryStore = {
      exportForSync: vi.fn(async () => ({
        formatVersion: 1,
        exportedAt: '2026-04-03T08:00:00.000Z',
        repositories: [],
      })),
      importForSync: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    }
    const remoteSnapshot: PluginBackupSnapshotDto = {
      formatVersion: 1,
      createdAt: '2026-04-04T10:00:00.000Z',
      appVersion: '0.2.0',
      plugins: {
        enabledIds: ['git-worklog', 'oss-backup'],
        ossBackup: {
          provider: 'aliyun-oss',
          endpoint: 'https://oss-cn-shanghai.aliyuncs.com',
          region: 'oss-cn-shanghai',
          bucket: 'cloud-bucket',
          objectKey: 'freecli/cloud/latest.json',
          autoBackupEnabled: false,
          autoBackupMinIntervalSeconds: 180,
          restoreOnStartupEnabled: false,
          backupOnExitEnabled: false,
          includedPluginIds: ['git-worklog'],
          syncInputStatsHistoryEnabled: false,
          syncQuotaMonitorHistoryEnabled: false,
          syncGitWorklogHistoryEnabled: true,
        },
      },
    }
    const remoteGitWorklogHistory: GitWorklogHistorySyncPayload = {
      formatVersion: 1,
      exportedAt: '2026-04-04T10:00:00.000Z',
      repositories: [
        {
          repoPath: 'd:/project/repo-a',
          rangeStats: [],
          codeStats: [],
          heatmapStats: [],
          dailyHistory: null,
        },
      ],
    }
    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson: vi.fn(async () => undefined),
        getJsonIfExists: vi
          .fn()
          .mockResolvedValueOnce({
            schema: 1,
            deviceId: 'DEV_REMOTE',
            updatedAt: '2026-04-04T10:00:00.000Z',
            files: {
              'plugin-settings': {
                version: 3,
                updatedAt: '2026-04-04T10:00:00.000Z',
                sha256: 'remote-plugin',
                size: 128,
              },
              'git-worklog-history': {
                version: 2,
                updatedAt: '2026-04-04T10:00:00.000Z',
                sha256: 'remote-git-history',
                size: 64,
              },
            },
          })
          .mockResolvedValueOnce(remoteSnapshot)
          .mockResolvedValueOnce(remoteGitWorklogHistory),
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
      gitWorklogHistoryStore: gitWorklogHistoryStore as never,
    })

    controller.syncSettings(
      createConfiguredSettings({
        syncGitWorklogHistoryEnabled: true,
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    await controller.restoreBackup()

    expect(gitWorklogHistoryStore.importForSync).toHaveBeenCalledTimes(1)
    expect(gitWorklogHistoryStore.importForSync).toHaveBeenCalledWith(remoteGitWorklogHistory)

    await controller.dispose()
  })

  it('prevents default quit through the original event object without illegal invocation', async () => {
    const store = createPersistenceStoreStub()
    const quit = vi.fn()
    const beforeQuitListeners = new Set<(...args: unknown[]) => void>()
    const willQuitListeners = new Set<(...args: unknown[]) => void>()
    const appLifecycleApi = {
      getPath: vi.fn(() => createTempUserDataPath()),
      on: vi.fn((event: 'before-quit' | 'will-quit', listener: (...args: unknown[]) => void) => {
        if (event === 'before-quit') {
          beforeQuitListeners.add(listener)
          return
        }

        willQuitListeners.add(listener)
      }),
      off: vi.fn((event: 'before-quit' | 'will-quit', listener: (...args: unknown[]) => void) => {
        if (event === 'before-quit') {
          beforeQuitListeners.delete(listener)
          return
        }

        willQuitListeners.delete(listener)
      }),
      quit,
    }

    const controller = new OssBackupPluginController({
      getPersistenceStore: async () => store,
      appVersion: '0.0.1',
      client: {
        putJson: vi.fn(async () => undefined),
        getJsonIfExists: vi.fn(async () => null),
        testConnection: vi.fn(),
      } as unknown as OssObjectStoreClient,
      emitState: () => undefined,
      userDataPath: createTempUserDataPath(),
    })

    vi.spyOn(controller as unknown as { getAppLifecycleApi: () => unknown }, 'getAppLifecycleApi').mockReturnValue(
      appLifecycleApi,
    )

    controller.syncSettings(
      createConfiguredSettings({
        backupOnExitEnabled: true,
      }),
    )
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    const event = {
      defaultPrevented: false,
      preventDefault() {
        if (this !== event) {
          throw new TypeError('Illegal invocation')
        }
        this.defaultPrevented = true
      },
    }

    expect(beforeQuitListeners.size).toBe(1)
    expect(() => {
      for (const listener of beforeQuitListeners) {
        listener(event)
      }
    }).not.toThrow()

    expect(event.defaultPrevented).toBe(true)

    await controller.dispose()
  })
})
