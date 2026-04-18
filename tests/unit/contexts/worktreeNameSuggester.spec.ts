import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn<typeof import('node:child_process').spawn>(),
}))

const { readFileMock, rmMock } = vi.hoisted(() => ({
  readFileMock: vi.fn<typeof import('node:fs/promises').readFile>(),
  rmMock: vi.fn<typeof import('node:fs/promises').rm>(),
}))

vi.mock('node:child_process', () => {
  return {
    spawn: spawnMock,
    default: {
      spawn: spawnMock,
    },
  }
})

vi.mock('node:fs/promises', () => {
  return {
    readFile: readFileMock,
    rm: rmMock,
    default: {
      readFile: readFileMock,
      rm: rmMock,
    },
  }
})

const ORIGINAL_ENV = { ...process.env }

async function importWorktreeNameSuggester() {
  return await import('../../../src/contexts/worktree/infrastructure/git/WorktreeNameSuggester')
}

type MockChildProcess = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => true)
  return child
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.clearAllMocks()
  vi.resetModules()
})

describe('suggestWorktreeNames', () => {
  it('hides the Windows console window for background worktree suggestions', async () => {
    process.env.NODE_ENV = 'production'

    const child = createMockChildProcess()
    spawnMock.mockImplementation((_command, _args, _options) => {
      queueMicrotask(() => {
        child.emit('close', 0)
      })
      return child as never
    })
    readFileMock.mockResolvedValue(
      '{"branchName":"space/fix-login","worktreeName":"fix-login"}' as never,
    )
    rmMock.mockResolvedValue(undefined)

    const { suggestWorktreeNames } = await importWorktreeNameSuggester()
    const result = await suggestWorktreeNames({
      provider: 'codex',
      cwd: 'D:/Project/freecli',
      spaceName: '登录修复',
      spaceNotes: '处理多终端异常',
      tasks: [{ title: '修复登录', requirement: '修复登录失败后的重试逻辑' }],
      model: 'gpt-5.2-codex',
    })

    expect(spawnMock).toHaveBeenCalledWith(
      'codex',
      expect.any(Array),
      expect.objectContaining({
        cwd: 'D:/Project/freecli',
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }),
    )
    expect(result.branchName).toBe('space/fix-login')
    expect(result.worktreeName).toBe('fix-login')
  })
})
