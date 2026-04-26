import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  GitWorklogRepoStateDto,
  GitWorklogSettingsDto,
} from '../../../src/shared/contracts/dto'
import {
  DEFAULT_GIT_WORKLOG_SETTINGS,
  createDefaultGitWorklogRepository,
} from '../../../src/contexts/plugins/domain/gitWorklogSettings'
import { GitWorklogPluginController } from '../../../src/plugins/gitWorklog/presentation/main/GitWorklogPluginController'
import { GitWorklogRepositoryRepairService } from '../../../src/plugins/gitWorklog/presentation/main/GitWorklogRepositoryRepairService'
import { GitWorklogDiscoveryStore } from '../../../src/plugins/gitWorklog/infrastructure/main/GitWorklogDiscoveryStore'
import type { ApprovedWorkspaceStore } from '../../../src/contexts/workspace/infrastructure/approval/ApprovedWorkspaceStore'
import type { GitWorklogScanner } from '../../../src/plugins/gitWorklog/presentation/main/GitWorklogScanner'

function createSettings(overrides: Partial<GitWorklogSettingsDto> = {}): GitWorklogSettingsDto {
  return {
    ...DEFAULT_GIT_WORKLOG_SETTINGS,
    repositories: [
      {
        ...createDefaultGitWorklogRepository(0),
        id: 'repo_primary',
        label: 'Primary Repo',
        path: 'D:\\Project\\demo',
      },
    ],
    ...overrides,
  }
}

function createRepoState(overrides: Partial<GitWorklogRepoStateDto> = {}): GitWorklogRepoStateDto {
  return {
    repoId: 'repo_primary',
    label: 'Primary Repo',
    path: 'D:\\Project\\demo',
    origin: 'manual',
    parentWorkspaceId: null,
    parentWorkspaceName: null,
    parentWorkspacePath: null,
    commitCountToday: 3,
    filesChangedToday: 5,
    additionsToday: 80,
    deletionsToday: 20,
    changedLinesToday: 100,
    netLinesToday: 60,
    commitCountInRange: 12,
    filesChangedInRange: 18,
    additionsInRange: 220,
    deletionsInRange: 40,
    changedLinesInRange: 260,
    totalCodeFiles: 24,
    totalCodeLines: 1800,
    dailyPoints: [
      {
        day: '2026-04-01',
        label: '04/01',
        commitCount: 4,
        filesChanged: 8,
        additions: 120,
        deletions: 20,
        changedLines: 140,
      },
      {
        day: '2026-04-02',
        label: '04/02',
        commitCount: 3,
        filesChanged: 5,
        additions: 80,
        deletions: 20,
        changedLines: 100,
      },
    ],
    heatmapDailyPoints: [
      {
        day: '2025-12-20',
        label: '12/20',
        commitCount: 2,
        filesChanged: 4,
        additions: 40,
        deletions: 10,
        changedLines: 50,
      },
      {
        day: '2026-04-01',
        label: '04/01',
        commitCount: 4,
        filesChanged: 8,
        additions: 120,
        deletions: 20,
        changedLines: 140,
      },
      {
        day: '2026-04-02',
        label: '04/02',
        commitCount: 3,
        filesChanged: 5,
        additions: 80,
        deletions: 20,
        changedLines: 100,
      },
    ],
    lastScannedAt: '2026-04-02T00:00:00.000Z',
    error: null,
    ...overrides,
  }
}

function createScannerMock(
  overrides: Partial<{
    scan: GitWorklogScanner['scan']
    resolveRepositoryRoot: GitWorklogScanner['resolveRepositoryRoot']
  }> = {},
) {
  return {
    scan: vi.fn().mockResolvedValue([createRepoState()]),
    resolveRepositoryRoot: vi.fn().mockImplementation(async (candidatePath: string) => ({
      ok: true as const,
      path: candidatePath,
      label: candidatePath.split(/[\\/]/).filter(Boolean).at(-1) ?? candidatePath,
    })),
    ...overrides,
  }
}

async function createDiscoveryStore() {
  const tempRoot = await mkdtemp(join(tmpdir(), 'git-worklog-discovery-store-'))
  return {
    tempRoot,
    store: new GitWorklogDiscoveryStore(join(tempRoot, 'discovery-state.json')),
  }
}

describe('GitWorklogPluginController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('aggregates ready state when all repositories scan successfully', async () => {
    const scanner = createScannerMock({
      scan: vi.fn().mockResolvedValue([createRepoState()]),
      resolveRepositoryRoot: vi.fn().mockImplementation(async (candidatePath: string) => ({
        ok: true as const,
        path: candidatePath,
        label: candidatePath.split(/[\\/]/).filter(Boolean).at(-1) ?? candidatePath,
      })),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncSettings(createSettings())
    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    const state = controller.getState()
    expect(scanner.scan).toHaveBeenCalledTimes(1)
    expect(state.status).toBe('ready')
    expect(state.successfulRepoCount).toBe(1)
    expect(state.overview.commitCountToday).toBe(3)
    expect(state.overview.changedLinesToday).toBe(100)
    expect(state.overview.changedLinesInRange).toBe(260)
    expect(state.overview.dailyPoints).toHaveLength(2)
    expect(state.overview.heatmapDailyPoints).toHaveLength(3)
    expect(state.overview.heatmapDailyPoints[0]?.day).toBe('2025-12-20')
    expect(state.lastError).toBeNull()

    await controller.dispose()
  })

  it('marks unapproved repositories as errors while keeping approved results', async () => {
    const scanner = createScannerMock({
      scan: vi.fn().mockResolvedValue([
        createRepoState(),
        createRepoState({
          repoId: 'repo_secondary',
          label: 'Secondary Repo',
          path: 'D:\\Project\\other',
          commitCountToday: 1,
          changedLinesToday: 12,
          totalCodeFiles: 5,
          totalCodeLines: 90,
        }),
      ]),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockImplementation(async (path: string) => !path.includes('blocked')),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_primary',
            label: 'Primary Repo',
            path: 'D:\\Project\\demo',
          },
          {
            ...createDefaultGitWorklogRepository(1),
            id: 'repo_blocked',
            label: 'Blocked Repo',
            path: 'D:\\blocked\\repo',
          },
        ],
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    const state = controller.getState()
    expect(state.status).toBe('partial_error')
    expect(state.successfulRepoCount).toBe(2)
    expect(state.lastError?.type).toBe('unapproved_path')
    expect(state.repos.find(repo => repo.repoId === 'repo_blocked')?.error?.type).toBe(
      'unapproved_path',
    )

    await controller.dispose()
  })

  it('collects workspace-level pending imports when manual list is empty', async () => {
    const scanner = createScannerMock({
      scan: vi
        .fn()
        .mockImplementation(
          async (_settings, repositories: GitWorklogSettingsDto['repositories']) => {
            return repositories.map(repository =>
              createRepoState({
                repoId: repository.id,
                label: repository.label,
                path: repository.path,
              }),
            )
          },
        ),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_root',
        name: 'Workspace Root',
        path: process.cwd(),
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_empty',
            label: 'Empty Repo',
            path: '',
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    const state = controller.getState()
    expect(scanner.scan).not.toHaveBeenCalled()
    expect((state.pendingImports ?? []).length).toBeGreaterThan(0)
    expect(state.pendingImports?.[0]?.workspaceId).toBe('workspace_root')
    expect(state.status).toBe('needs_config')

    await controller.dispose()
  })

  it('skips ignored auto-discovered repositories', async () => {
    const scanner = createScannerMock({
      scan: vi
        .fn()
        .mockImplementation(
          async (_settings, repositories: GitWorklogSettingsDto['repositories']) =>
            repositories.map(repository =>
              createRepoState({
                repoId: repository.id,
                label: repository.label,
                path: repository.path,
                origin: 'auto',
              }),
            ),
        ),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_root',
        name: 'Workspace Root',
        path: process.cwd(),
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_empty',
            label: 'Empty Repo',
            path: '',
          },
        ],
        ignoredAutoRepositoryPaths: [process.cwd()],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(scanner.scan).not.toHaveBeenCalled()
    expect(controller.getState().status).toBe('needs_config')
    expect(controller.getState().repos.some(repo => repo.origin === 'auto')).toBe(false)

    await controller.dispose()
  })

  it('does not create pending imports for workspaces that were already imported once when they still have managed repositories', async () => {
    const workspaceRoot = 'D:\\Project\\Drone'
    const scanner = createScannerMock({
      scan: vi.fn().mockResolvedValue([
        createRepoState({
          repoId: 'repo_drone',
          label: 'Drone',
          path: workspaceRoot,
        }),
      ]),
      resolveRepositoryRoot: vi.fn().mockImplementation(async (candidatePath: string) => {
        if (candidatePath === workspaceRoot) {
          return {
            ok: true as const,
            path: workspaceRoot,
            label: 'Drone',
          }
        }

        return {
          ok: false as const,
          error: {
            type: 'not_git_repo' as const,
            message: '不是有效的 Git 仓库',
            detail: null,
          },
        }
      }),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const { tempRoot, store } = await createDiscoveryStore()
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      discoveryStore: store,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_root',
        name: 'Workspace Root',
        path: workspaceRoot,
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_drone',
            label: 'Drone',
            path: workspaceRoot,
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(scanner.scan).toHaveBeenCalledTimes(1)
    expect(controller.getState().pendingImports).toEqual([])
    expect(controller.getState().status).toBe('ready')

    await controller.dispose()
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('re-surfaces pending imports when a workspace was marked as imported before but no managed repository remains', async () => {
    const workspaceRoot = join(process.cwd(), 'FastWrite')
    const scanner = {
      scan: vi.fn().mockResolvedValue([]),
      resolveRepositoryRoot: vi.fn().mockImplementation(async (candidatePath: string) => {
        if (candidatePath === workspaceRoot) {
          return {
            ok: true as const,
            path: workspaceRoot,
            label: 'FastWrite',
          }
        }

        return {
          ok: false as const,
          error: {
            type: 'not_git_repo' as const,
            message: '不是有效的 Git 仓库',
            detail: null,
          },
        }
      }),
    }
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const { tempRoot, store } = await createDiscoveryStore()
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      discoveryStore: store,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_fastwrite',
        name: 'FastWrite',
        path: workspaceRoot,
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_drone',
            label: 'Drone',
            path: 'D:\\Project\\Drone',
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(controller.getState().pendingImports).toEqual([
      expect.objectContaining({
        workspaceId: 'workspace_fastwrite',
        workspaceName: 'FastWrite',
        workspacePath: workspaceRoot,
        error: null,
        retryCount: 0,
        detectedAt: expect.any(String),
        repositories: [
          expect.objectContaining({
            id: 'auto_workspace_fastwrite_root',
            label: 'FastWrite',
            path: workspaceRoot,
            parentWorkspaceId: 'workspace_fastwrite',
            parentWorkspaceName: 'FastWrite',
            parentWorkspacePath: workspaceRoot,
            detectedAt: expect.any(String),
          }),
        ],
      }),
    ])

    await controller.dispose()
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('drops stale pending imports immediately after settings confirm the repository into managed state', async () => {
    const workspaceRoot = 'D:\\Project\\FastWrite'
    const scanner = createScannerMock({
      scan: vi.fn().mockResolvedValue([]),
      resolveRepositoryRoot: vi.fn().mockImplementation(async (candidatePath: string) => {
        if (candidatePath === workspaceRoot) {
          return {
            ok: true as const,
            path: workspaceRoot,
            label: 'FastWrite',
          }
        }

        return {
          ok: false as const,
          error: {
            type: 'not_git_repo' as const,
            message: '不是有效的 Git 仓库',
            detail: null,
          },
        }
      }),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const { tempRoot, store } = await createDiscoveryStore()
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      discoveryStore: store,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_fastwrite',
        name: 'FastWrite',
        path: workspaceRoot,
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_empty',
            label: 'Empty Repo',
            path: '',
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    await store.upsertScanResult({
      workspace: {
        id: 'workspace_fastwrite',
        name: 'FastWrite',
        path: workspaceRoot,
      },
      repositories: [
        {
          id: 'auto_workspace_fastwrite_root',
          label: 'FastWrite',
          path: workspaceRoot,
          parentWorkspaceId: 'workspace_fastwrite',
          parentWorkspaceName: 'FastWrite',
          parentWorkspacePath: workspaceRoot,
          detectedAt: null,
        },
      ],
      error: null,
      scannedAt: '2026-04-12T09:30:00.000Z',
    })

    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_fastwrite',
            label: 'FastWrite',
            path: workspaceRoot,
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(controller.getState().pendingImports).toEqual([])
    expect(controller.getState().autoCandidates).toEqual([])

    await controller.dispose()
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('does not create pending imports for workspaces dismissed by the user', async () => {
    const scanner = createScannerMock({
      scan: vi.fn(),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const { tempRoot, store } = await createDiscoveryStore()
    await store.dismissWorkspace({
      workspaceId: 'workspace_root',
      workspaceName: 'Workspace Root',
      workspacePath: process.cwd(),
      dismissedAt: '2026-04-12T09:30:00.000Z',
    })
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      discoveryStore: store,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_root',
        name: 'Workspace Root',
        path: process.cwd(),
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_empty',
            label: 'Empty Repo',
            path: '',
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(controller.getState().pendingImports).toEqual([])
    expect(controller.getState().dismissedImports?.[0]?.workspacePath).toBe(process.cwd())

    await controller.dispose()
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('exposes workspace-level pending import structures for confirmation', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'git-worklog-candidates-'))
    const workspaceRoot = join(tempRoot, 'workspace-root')
    const nestedRepository = join(workspaceRoot, 'apps', 'admin')
    await mkdir(join(nestedRepository, '.git'), { recursive: true })

    const scanner = {
      scan: vi.fn().mockResolvedValue([]),
      resolveRepositoryRoot: vi.fn().mockImplementation(async (candidatePath: string) => {
        if (candidatePath === nestedRepository) {
          return {
            ok: true as const,
            path: nestedRepository,
            label: 'admin',
          }
        }

        return {
          ok: false as const,
          error: {
            type: 'not_git_repo' as const,
            message: '不是有效的 Git 仓库',
            detail: null,
          },
        }
      }),
    }
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_root',
        name: 'Workspace Root',
        path: workspaceRoot,
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_empty',
            label: 'Empty Repo',
            path: '',
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 3,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(controller.getState().pendingImports).toEqual([
      expect.objectContaining({
        workspaceId: 'workspace_root',
        workspaceName: 'Workspace Root',
        workspacePath: workspaceRoot,
        error: null,
        retryCount: 0,
        detectedAt: expect.any(String),
        repositories: [
          expect.objectContaining({
            id: 'auto_workspace_root_apps__admin',
            label: 'admin',
            path: nestedRepository,
            parentWorkspaceId: 'workspace_root',
            parentWorkspaceName: 'Workspace Root',
            parentWorkspacePath: workspaceRoot,
            detectedAt: expect.any(String),
          }),
        ],
      }),
    ])

    await controller.dispose()
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('surfaces workspace discovery errors and schedules automatic retry instead of treating them as empty', async () => {
    vi.useFakeTimers()
    const workspaceRoot = join(process.cwd(), 'FastWrite')
    const scanner = {
      scan: vi.fn().mockResolvedValue([]),
      resolveRepositoryRoot: vi.fn().mockImplementation(async () => {
        throw new Error('spawn git EACCES')
      }),
    }
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_fastwrite',
        name: 'FastWrite',
        path: workspaceRoot,
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_empty',
            label: 'Empty Repo',
            path: '',
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(controller.getState().pendingImports).toEqual([
      {
        detectedAt: null,
        workspaceId: 'workspace_fastwrite',
        workspaceName: 'FastWrite',
        workspacePath: workspaceRoot,
        repositories: [],
        error: {
          type: 'command_failed',
          message: '工作区 Git 扫描失败',
          detail: 'spawn git EACCES',
        },
        retryCount: 1,
      },
    ])

    scanner.resolveRepositoryRoot = vi.fn().mockResolvedValue({
      ok: true as const,
      path: workspaceRoot,
      label: 'FastWrite',
    })

    await vi.advanceTimersByTimeAsync(5_500)
    await vi.waitFor(() => {
      expect(scanner.resolveRepositoryRoot).toHaveBeenCalledTimes(2)
    })

    expect(controller.getState().pendingImports).toEqual([
      expect.objectContaining({
        workspaceId: 'workspace_fastwrite',
        workspaceName: 'FastWrite',
        workspacePath: workspaceRoot,
        error: null,
        retryCount: 0,
        repositories: [
          expect.objectContaining({
            id: 'auto_workspace_fastwrite_root',
            label: 'FastWrite',
            path: workspaceRoot,
            parentWorkspaceId: 'workspace_fastwrite',
            parentWorkspaceName: 'FastWrite',
            parentWorkspacePath: workspaceRoot,
          }),
        ],
      }),
    ])

    await controller.dispose()
  })

  it('keeps discovering nested repositories even when the workspace root is also a git repository', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'git-worklog-nested-root-'))
    const workspaceRoot = join(tempRoot, 'workspace-root')
    const nestedRepositoryOne = join(workspaceRoot, 'apps', 'admin')
    const nestedRepositoryTwo = join(workspaceRoot, 'packages', 'shared')
    await mkdir(join(workspaceRoot, '.git'), { recursive: true })
    await mkdir(join(nestedRepositoryOne, '.git'), { recursive: true })
    await mkdir(join(nestedRepositoryTwo, '.git'), { recursive: true })

    const scanner = {
      scan: vi.fn().mockResolvedValue([]),
      resolveRepositoryRoot: vi.fn().mockImplementation(async (candidatePath: string) => {
        if (candidatePath === workspaceRoot) {
          return {
            ok: true as const,
            path: workspaceRoot,
            label: 'workspace-root',
          }
        }

        if (candidatePath === nestedRepositoryOne) {
          return {
            ok: true as const,
            path: nestedRepositoryOne,
            label: 'admin',
          }
        }

        if (candidatePath === nestedRepositoryTwo) {
          return {
            ok: true as const,
            path: nestedRepositoryTwo,
            label: 'shared',
          }
        }

        return {
          ok: false as const,
          error: {
            type: 'not_git_repo' as const,
            message: '不是有效的 Git 仓库',
            detail: null,
          },
        }
      }),
    }
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_root',
        name: 'Workspace Root',
        path: workspaceRoot,
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_empty',
            label: 'Empty Repo',
            path: '',
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 3,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(controller.getState().pendingImports).toEqual([
      expect.objectContaining({
        workspaceId: 'workspace_root',
        workspaceName: 'Workspace Root',
        workspacePath: workspaceRoot,
        error: null,
        retryCount: 0,
        detectedAt: expect.any(String),
        repositories: [
          expect.objectContaining({
            id: 'auto_workspace_root_root',
            label: 'workspace-root',
            path: workspaceRoot,
            parentWorkspaceId: 'workspace_root',
            parentWorkspaceName: 'Workspace Root',
            parentWorkspacePath: workspaceRoot,
            detectedAt: expect.any(String),
          }),
          expect.objectContaining({
            id: 'auto_workspace_root_apps__admin',
            label: 'admin',
            path: nestedRepositoryOne,
            parentWorkspaceId: 'workspace_root',
            parentWorkspaceName: 'Workspace Root',
            parentWorkspacePath: workspaceRoot,
            detectedAt: expect.any(String),
          }),
          expect.objectContaining({
            id: 'auto_workspace_root_packages__shared',
            label: 'shared',
            path: nestedRepositoryTwo,
            parentWorkspaceId: 'workspace_root',
            parentWorkspaceName: 'Workspace Root',
            parentWorkspacePath: workspaceRoot,
            detectedAt: expect.any(String),
          }),
        ],
      }),
    ])

    await controller.dispose()
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('clears stale lastError after settings are changed', async () => {
    const scanner = createScannerMock({
      scan: vi.fn().mockResolvedValue([createRepoState()]),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_blocked',
            label: 'Blocked Repo',
            path: 'D:\\blocked\\repo',
          },
        ],
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    expect(controller.getState().lastError?.type).toBe('unapproved_path')

    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_blocked',
            label: 'Recovered Repo',
            path: 'D:\\Project\\demo',
          },
        ],
      }),
    )

    expect(controller.getState().lastError).toBeNull()

    await controller.dispose()
  })

  it('does not re-scan when only presentation grouping fields change', async () => {
    vi.useFakeTimers()
    const scanner = createScannerMock({
      scan: vi.fn().mockResolvedValue([createRepoState()]),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_primary',
            label: 'Primary Repo',
            path: 'D:\\Project\\demo',
            assignedWorkspaceId: 'workspace_a',
          },
        ],
        repositoryOrder: ['repo_primary'],
        workspaceOrder: ['workspace_a'],
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    expect(scanner.scan).toHaveBeenCalledTimes(1)

    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_primary',
            label: 'Renamed For UI',
            path: 'D:\\Project\\demo',
            assignedWorkspaceId: 'workspace_b',
          },
        ],
        repositoryOrder: ['repo_primary'],
        workspaceOrder: ['workspace_b'],
      }),
    )

    await vi.advanceTimersByTimeAsync(500)
    expect(scanner.scan).toHaveBeenCalledTimes(1)

    await controller.dispose()
    vi.useRealTimers()
  })

  it('re-runs discovery after workspace sync arrives during an in-flight refresh', async () => {
    vi.useFakeTimers()
    const tempRoot = await mkdtemp(join(tmpdir(), 'git-worklog-controller-'))
    const workspaceOne = join(tempRoot, 'workspace-one')
    const workspaceTwo = join(tempRoot, 'workspace-two')
    await mkdir(join(workspaceOne, '.git'), { recursive: true })
    await mkdir(join(workspaceTwo, '.git'), { recursive: true })

    let resolveFirstScan: ((value: GitWorklogRepoStateDto[]) => void) | null = null
    const scanner = createScannerMock({
      scan: vi
        .fn()
        .mockImplementationOnce(
          async (_settings, repositories: GitWorklogSettingsDto['repositories']) =>
            await new Promise<GitWorklogRepoStateDto[]>(resolve => {
              resolveFirstScan = () =>
                resolve(
                  repositories.map(repository =>
                    createRepoState({
                      repoId: repository.id,
                      label: repository.label,
                      path: repository.path,
                      origin: 'auto',
                    }),
                  ),
                )
            }),
        )
        .mockImplementation(
          async (_settings, repositories: GitWorklogSettingsDto['repositories']) =>
            repositories.map(repository =>
              createRepoState({
                repoId: repository.id,
                label: repository.label,
                path: repository.path,
                origin: 'auto',
              }),
            ),
        ),
      resolveRepositoryRoot: vi.fn().mockImplementation(async (candidatePath: string) => ({
        ok: true as const,
        path: candidatePath,
        label: candidatePath.split(/[\\/]/).filter(Boolean).at(-1) ?? candidatePath,
      })),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncWorkspaces([
      {
        id: 'workspace_one',
        name: 'Workspace One',
        path: workspaceOne,
      },
    ])
    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_empty',
            label: 'Empty Repo',
            path: '',
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    const activatePromise = runtime.activate()

    controller.syncWorkspaces([
      {
        id: 'workspace_one',
        name: 'Workspace One',
        path: workspaceOne,
      },
      {
        id: 'workspace_two',
        name: 'Workspace Two',
        path: workspaceTwo,
      },
    ])

    await vi.advanceTimersByTimeAsync(450)
    await vi.waitFor(() => {
      expect(scanner.resolveRepositoryRoot).toHaveBeenCalled()
    })

    resolveFirstScan?.([])
    await activatePromise
    await vi.runAllTicks()
    await vi.waitFor(() => {
      expect(controller.getState().pendingImports).toHaveLength(2)
    })
    expect(
      controller.getState().pendingImports?.some(importItem => importItem.workspacePath === workspaceTwo),
    ).toBe(true)

    await controller.dispose()
    await rm(tempRoot, { recursive: true, force: true })
    vi.useRealTimers()
  })

  it('does not schedule an extra full repository scan when only workspace import discovery changes', async () => {
    vi.useFakeTimers()

    const scanner = createScannerMock({
      scan: vi.fn().mockResolvedValue([createRepoState()]),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncSettings(createSettings())

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()
    expect(scanner.scan).toHaveBeenCalledTimes(1)

    controller.syncWorkspaces([
      {
        id: 'workspace_new',
        name: 'Workspace New',
        path: 'D:\\Project\\workspace-new',
      },
    ])

    await vi.advanceTimersByTimeAsync(5_000)
    expect(scanner.scan).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(55_000)
    expect(scanner.scan).toHaveBeenCalledTimes(1)

    await controller.dispose()
    vi.useRealTimers()
  })

  it('defers timer-driven scans while the app has no focused window', async () => {
    vi.useFakeTimers()

    const focusState = { current: false }
    const scanner = createScannerMock({
      scan: vi.fn().mockResolvedValue([createRepoState()]),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
      hasFocusedWindow: () => focusState.current,
    })

    controller.syncSettings(
      createSettings({
        autoRefreshEnabled: true,
        refreshIntervalMs: 60_000,
      }),
    )

    const runtime = controller.createRuntimeFactory()()

    focusState.current = true
    await runtime.activate()
    expect(scanner.scan).toHaveBeenCalledTimes(1)

    focusState.current = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(scanner.scan).toHaveBeenCalledTimes(1)

    focusState.current = true
    await vi.advanceTimersByTimeAsync(5_000)
    expect(scanner.scan).toHaveBeenCalledTimes(2)

    await controller.dispose()
  })

  it('updates workspace projection immediately after workspace sync without waiting for the delayed scan window', async () => {
    vi.useFakeTimers()

    const scanner = createScannerMock({
      scan: vi.fn().mockResolvedValue([createRepoState()]),
    })
    const approvedWorkspaces: ApprovedWorkspaceStore = {
      registerRoot: vi.fn(),
      isPathApproved: vi.fn().mockResolvedValue(true),
    }
    const controller = new GitWorklogPluginController({
      approvedWorkspaces,
      scanner: scanner as unknown as GitWorklogScanner,
      emitState: () => undefined,
    })

    controller.syncSettings(
      createSettings({
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_empty',
            label: 'Empty Repo',
            path: '',
          },
        ],
        autoDiscoverEnabled: true,
        autoDiscoverDepth: 1,
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    controller.syncWorkspaces([
      {
        id: 'workspace_new',
        name: 'Workspace New',
        path: 'D:\\Project\\workspace-new',
      },
    ])

    await vi.advanceTimersByTimeAsync(150)
    await vi.waitFor(() => {
      expect(controller.getState().pendingImports?.length).toBeGreaterThan(0)
    })

    expect(controller.getState().availableWorkspaces).toEqual([
      {
        id: 'workspace_new',
        name: 'Workspace New',
        path: 'D:\\Project\\workspace-new',
      },
    ])
    expect(scanner.scan).not.toHaveBeenCalledTimes(2)

    await controller.dispose()
    vi.useRealTimers()
  })

  it('repairs duplicate git roots, mismatched labels, and invalid workspace assignments', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'git-worklog-repair-'))
    const repairService = new GitWorklogRepositoryRepairService(
      join(tempRoot, 'repository-repair-backup.json'),
      vi.fn().mockImplementation(async (pathValue: string) => {
        if (pathValue === 'D:\\Project\\FastWrite\\packages\\ui') {
          return {
            ok: true as const,
            path: 'D:\\Project\\FastWrite',
            label: 'FastWrite',
          }
        }

        if (pathValue === 'D:\\Project\\FastWrite') {
          return {
            ok: true as const,
            path: 'D:\\Project\\FastWrite',
            label: 'FastWrite',
          }
        }

        if (pathValue === 'D:\\Project\\Drone') {
          return {
            ok: true as const,
            path: 'D:\\Project\\Drone',
            label: 'Drone',
          }
        }

        return { ok: false as const }
      }),
    )

    const result = await repairService.repair({
      settings: {
        ...DEFAULT_GIT_WORKLOG_SETTINGS,
        repositories: [
          {
            ...createDefaultGitWorklogRepository(0),
            id: 'repo_1',
            label: 'FreeCli',
            path: 'D:\\Project\\FastWrite\\packages\\ui',
            assignedWorkspaceId: 'workspace_missing',
          },
          {
            ...createDefaultGitWorklogRepository(1),
            id: 'repo_1',
            label: 'Repository 2',
            path: 'D:\\Project\\FastWrite',
            assignedWorkspaceId: null,
          },
          {
            ...createDefaultGitWorklogRepository(2),
            id: 'repo_3',
            label: 'Drone',
            path: 'D:\\Project\\Drone',
            assignedWorkspaceId: '__external__',
          },
        ],
        repositoryOrder: ['repo_1', 'repo_1', 'repo_3'],
        workspaceOrder: ['workspace_missing'],
      },
      availableWorkspaces: [
        {
          id: 'workspace_fastwrite',
          name: 'FastWrite',
          path: 'D:\\Project\\FastWrite',
        },
      ],
    })

    expect(result.summary.duplicateIdsFixed).toBe(0)
    expect(result.summary.duplicatePathsFixed).toBe(1)
    expect(result.summary.pathsNormalized).toBe(1)
    expect(result.summary.workspaceAssignmentsFixed).toBe(1)
    expect(result.summary.labelsFixed).toBe(0)
    expect(result.repairedSettings.repositories).toEqual([
      expect.objectContaining({
        id: 'repo_1',
        label: 'FreeCli',
        path: 'D:\\Project\\FastWrite',
        assignedWorkspaceId: 'workspace_fastwrite',
      }),
      expect.objectContaining({
        id: 'repo_3',
        label: 'Drone',
        path: 'D:\\Project\\Drone',
        assignedWorkspaceId: '__external__',
      }),
    ])
    expect(result.repairedSettings.repositoryOrder).toEqual(['repo_1', 'repo_3'])
    expect(result.repairedSettings.workspaceOrder).toEqual([
      'workspace_fastwrite',
      '__external__',
    ])

    const undo = await repairService.undo({
      settings: result.repairedSettings,
    })
    expect(undo.restored).toBe(true)
    expect(undo.restoredSettings.repositories).toHaveLength(3)

    await rm(tempRoot, { recursive: true, force: true })
  })
})
