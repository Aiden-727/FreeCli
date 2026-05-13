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

async function importTaskTitleGenerator() {
  return await import('../../../src/contexts/task/infrastructure/cli/TaskTitleGenerator')
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

describe('suggestTaskTitle', () => {
  it('returns deterministic title in test mode', async () => {
    process.env.NODE_ENV = 'test'

    const { suggestTaskTitle } = await importTaskTitleGenerator()
    const result = await suggestTaskTitle({
      provider: 'codex',
      cwd: '/tmp',
      requirement: 'Implement login retry with exponential backoff and jitter',
      model: 'gpt-5.2-codex',
      availableTags: ['feature', 'bug'],
    })

    expect(result.provider).toBe('codex')
    expect(result.effectiveModel).toBe('gpt-5.2-codex')
    expect(result.title.startsWith('Auto:')).toBe(true)
    expect(result.priority).toBe('medium')
    expect(result.tags).toEqual(['feature'])
  })

  it('hides the Windows console window for background title generation', async () => {
    process.env.NODE_ENV = 'production'

    const child = createMockChildProcess()
    spawnMock.mockImplementation((_command, _args, _options) => {
      queueMicrotask(() => {
        child.emit('close', 0)
      })
      return child as never
    })
    readFileMock.mockResolvedValue(
      '{"title":"修复登录重试","priority":"high","tags":["bug"]}' as never,
    )
    rmMock.mockResolvedValue(undefined)

    const { suggestTaskTitle } = await importTaskTitleGenerator()
    const result = await suggestTaskTitle({
      provider: 'codex',
      cwd: 'D:/Project/freecli',
      requirement: '修复登录失败后的重试逻辑',
      model: 'gpt-5.2-codex',
      availableTags: ['bug', 'feature'],
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
    expect(result.title).toBe('修复登录重试')
    expect(result.priority).toBe('high')
    expect(result.tags).toEqual(['bug'])
  })
})
