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

describe('GitWorklogPluginController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('aggregates ready state when all repositories scan successfully', async () => {
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

    const state = controller.getState()
    expect(scanner.scan).toHaveBeenCalledTimes(1)
    expect(state.status).toBe('ready')
    expect(state.successfulRepoCount).toBe(1)
    expect(state.overview.commitCountToday).toBe(3)
    expect(state.overview.changedLinesToday).toBe(100)
    expect(state.overview.changedLinesInRange).toBe(260)
    expect(state.overview.dailyPoints).toHaveLength(2)
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

  it('collects auto-discovered repositories as candidates when manual list is empty', async () => {
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
    expect((state.autoCandidates ?? []).length).toBeGreaterThan(0)
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

  it('does not auto-discover workspaces that were already imported once', async () => {
    const scanner = createScannerMock({
      scan: vi.fn(),
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
        autoImportedWorkspacePaths: [process.cwd()],
      }),
    )

    const runtime = controller.createRuntimeFactory()()
    await runtime.activate()

    expect(scanner.scan).not.toHaveBeenCalled()
    expect(controller.getState().status).toBe('needs_config')

    await controller.dispose()
  })

  it('exposes auto-discovered repositories as confirmation candidates', async () => {
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

    expect(controller.getState().autoCandidates).toEqual([
      {
        id: 'auto_workspace_root_apps__admin',
        label: 'admin',
        path: nestedRepository,
        parentWorkspaceId: 'workspace_root',
        parentWorkspaceName: 'Workspace Root',
        parentWorkspacePath: workspaceRoot,
        detectedAt: null,
      },
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
      expect(controller.getState().autoCandidates).toHaveLength(2)
    })
    expect(controller.getState().autoCandidates?.some(repo => repo.path === workspaceTwo)).toBe(
      true,
    )

    await controller.dispose()
    await rm(tempRoot, { recursive: true, force: true })
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
})
