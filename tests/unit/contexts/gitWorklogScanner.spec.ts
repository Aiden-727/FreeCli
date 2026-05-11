import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GitWorklogScanner,
  isTrackableGitWorklogFilePath,
} from '../../../src/plugins/gitWorklog/presentation/main/GitWorklogScanner'
import type { GitWorklogSettingsDto } from '../../../src/shared/contracts/dto'
import { DEFAULT_GIT_WORKLOG_SETTINGS } from '../../../src/contexts/plugins/domain/gitWorklogSettings'

function createSettings(overrides: Partial<GitWorklogSettingsDto> = {}): GitWorklogSettingsDto {
  return {
    ...DEFAULT_GIT_WORKLOG_SETTINGS,
    recentDays: 7,
    ...overrides,
  }
}

describe('isTrackableGitWorklogFilePath', () => {
  it('keeps source files but excludes dependency and environment artifacts', () => {
    expect(isTrackableGitWorklogFilePath('src/features/worklog/index.ts')).toBe(true)
    expect(isTrackableGitWorklogFilePath('packages/app/lib/main.dart')).toBe(true)

    expect(isTrackableGitWorklogFilePath('node_modules/react/index.js')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.cache/vite/deps/chunk.js')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.npm/_cacache/index-v5/file')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.venv/lib/site-packages/foo.py')).toBe(false)
    expect(isTrackableGitWorklogFilePath('env/lib/site-packages/foo.py')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.env')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.env.production')).toBe(false)
    expect(isTrackableGitWorklogFilePath('pnpm-lock.yaml')).toBe(false)
    expect(isTrackableGitWorklogFilePath('package-lock.json')).toBe(false)
    expect(isTrackableGitWorklogFilePath('.npmrc')).toBe(false)
  })
})

describe('GitWorklogScanner daily history cache', () => {
  const historyStore = {
    getDailyHistory: vi.fn(),
    saveDailyHistory: vi.fn(),
    getRangeStats: vi.fn(),
    saveRangeStats: vi.fn(),
    getCodeStats: vi.fn(),
    saveCodeStats: vi.fn(),
    getHeatmapStats: vi.fn(),
    saveHeatmapStats: vi.fn(),
    flush: vi.fn(),
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    historyStore.getDailyHistory.mockReset()
    historyStore.saveDailyHistory.mockReset()
    historyStore.getRangeStats.mockReset()
    historyStore.saveRangeStats.mockReset()
    historyStore.getCodeStats.mockReset()
    historyStore.saveCodeStats.mockReset()
    historyStore.getHeatmapStats.mockReset()
    historyStore.saveHeatmapStats.mockReset()
    historyStore.flush.mockReset()
  })

  it('builds range and heatmap from persisted daily history when author filter is empty', async () => {
    const scanner = new GitWorklogScanner({
      historyStore: historyStore as never,
    })
    const runGitCommand = vi
      .spyOn(
        scanner as unknown as { runGitCommand: (...args: unknown[]) => Promise<unknown> },
        'runGitCommand',
      )
      .mockImplementation(async (args: unknown) => {
        const argv = args as string[]
        if (argv.includes('show-ref')) {
          return {
            ok: true as const,
            stdout: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa refs/heads/main\n',
            stderr: '',
          }
        }
        if (argv.includes('rev-parse')) {
          return {
            ok: true as const,
            stdout: 'true\n',
            stderr: '',
          }
        }
        if (argv.includes('ls-files')) {
          return {
            ok: true as const,
            stdout: 'src/index.ts\n',
            stderr: '',
          }
        }
        if (argv.includes('status')) {
          return {
            ok: true as const,
            stdout: '',
            stderr: '',
          }
        }
        return {
          ok: true as const,
          stdout: '',
          stderr: '',
        }
      })

    historyStore.getDailyHistory.mockResolvedValue({
      refsSnapshot: [
        {
          refName: 'refs/heads/main',
          oid: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      ],
      dailyPoints: [
        {
          day: '2026-05-01',
          label: '05/01',
          commitCount: 1,
          filesChanged: 1,
          additions: 10,
          deletions: 2,
          changedLines: 12,
          files: ['src/index.ts'],
        },
      ],
      builtAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    })

    const states = await scanner.scan(createSettings(), [
      {
        id: 'repo_1',
        label: 'FreeCli',
        path: process.cwd(),
        enabled: true,
      },
    ])

    expect(states[0]?.dailyPoints).toHaveLength(7)
    expect(states[0]?.dailyPoints.some(point => point.day === '2026-05-01')).toBe(false)
    expect(states[0]?.heatmapDailyPoints).toEqual([
      expect.objectContaining({
        day: '2026-05-01',
        additions: 10,
      }),
    ])
    expect(
      runGitCommand.mock.calls.some(call => (call[0] as string[]).includes('log')),
    ).toBe(false)
    expect(historyStore.saveDailyHistory).not.toHaveBeenCalled()
  })
})
