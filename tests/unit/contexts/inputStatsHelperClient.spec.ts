import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InputStatsSettingsDto } from '../../../src/shared/contracts/dto'
import { DEFAULT_INPUT_STATS_SETTINGS } from '../../../src/contexts/plugins/domain/inputStatsSettings'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn<typeof import('node:child_process').spawn>(),
}))

const { mkdirMock, writeFileMock } = vi.hoisted(() => ({
  mkdirMock: vi.fn<typeof import('node:fs/promises').mkdir>(),
  writeFileMock: vi.fn<typeof import('node:fs/promises').writeFile>(),
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock,
  },
}))

vi.mock('node:fs/promises', () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
  default: {
    mkdir: mkdirMock,
    writeFile: writeFileMock,
  },
}))

type MockStream = EventEmitter & {
  setEncoding: ReturnType<typeof vi.fn>
}

type MockChildProcess = EventEmitter & {
  stdout: MockStream
  stderr: MockStream
  stdin: {
    write: ReturnType<typeof vi.fn>
  }
  kill: ReturnType<typeof vi.fn>
  killed: boolean
  exitCode: number | null
}

function createMockStream(): MockStream {
  const stream = new EventEmitter() as MockStream
  stream.setEncoding = vi.fn()
  return stream
}

function emitEnvelope(
  child: MockChildProcess,
  envelope: { ok?: boolean; result?: Record<string, unknown>; error?: string; detail?: string },
): void {
  child.stdout.emit('data', `${JSON.stringify(envelope)}\n`)
}

function emitExit(
  child: MockChildProcess,
  code: number | null,
  signal: NodeJS.Signals | null,
): void {
  child.exitCode = code
  child.emit('exit', code, signal)
}

function createMockChildProcess(
  onCommand: (command: string, child: MockChildProcess) => void,
): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess
  child.stdout = createMockStream()
  child.stderr = createMockStream()
  child.killed = false
  child.exitCode = null
  child.stdin = {
    write: vi.fn((chunk: string, callback?: (error: Error | null | undefined) => void) => {
      const command = String(chunk).trim()
      queueMicrotask(() => {
        onCommand(command, child)
        callback?.(null)
      })
      return true
    }),
  }
  child.kill = vi.fn(() => {
    child.killed = true
    emitExit(child, 0, 'SIGTERM')
    return true
  })
  return child
}

function createSnapshot(settings: InputStatsSettingsDto = DEFAULT_INPUT_STATS_SETTINGS) {
  return {
    today: {
      day: '2026-04-07',
      keyPresses: 2,
      leftClicks: 1,
      rightClicks: 0,
      mouseDistancePx: 18,
      scrollSteps: 3,
    },
    topKeys: [],
    allKeys: [],
    historySeriesByMetric: {
      clicks: [],
      keys: [],
      movement: [],
      scroll: [],
    },
    cumulativeTotals: {
      clicks: 1,
      keys: 2,
      movement: 18,
      scroll: 3,
    },
    settings,
  }
}

async function importInputStatsHelperClient() {
  return await import('../../../src/plugins/inputStats/presentation/main/InputStatsHelperClient')
}

async function importInputStatsPluginController() {
  return await import('../../../src/plugins/inputStats/presentation/main/InputStatsPluginController')
}

describe('InputStatsHelperClient', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    })
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('restarts on the next command after a clean idle exit', async () => {
    const firstChild = createMockChildProcess((command, child) => {
      if (command === 'status') {
        emitEnvelope(child, { ok: true, result: { running: true } })
      }
    })
    const secondChild = createMockChildProcess((command, child) => {
      if (command === 'status') {
        emitEnvelope(child, { ok: true, result: { running: true } })
        return
      }

      if (command === 'fetch-and-reset') {
        emitEnvelope(child, {
          ok: true,
          result: {
            key_presses: 7,
            left_clicks: 3,
            right_clicks: 1,
            mouse_distance_px: 42,
            scroll_steps: 5,
            key_counts: { A: 4, Enter: 3 },
          },
        })
      }
    })
    spawnMock.mockReturnValueOnce(firstChild as never).mockReturnValueOnce(secondChild as never)
    mkdirMock.mockResolvedValue(undefined)
    writeFileMock.mockResolvedValue(undefined)

    const { InputStatsHelperClient } = await importInputStatsHelperClient()
    const client = new InputStatsHelperClient('D:/Project/freecli/.tmp/input-stats-helper.ps1')

    await client.ensureStarted()
    emitExit(firstChild, 0, null)

    await expect(client.fetchAndResetDelta()).resolves.toEqual({
      keyPresses: 7,
      leftClicks: 3,
      rightClicks: 1,
      mouseDistancePx: 42,
      scrollSteps: 5,
      keyCounts: { A: 4, Enter: 3 },
    })
    expect(spawnMock).toHaveBeenCalledTimes(2)
  })

  it('treats helper stop as an expected exit', async () => {
    const child = createMockChildProcess((command, target) => {
      if (command === 'status') {
        emitEnvelope(target, { ok: true, result: { running: true } })
        return
      }

      if (command === 'stop') {
        emitEnvelope(target, { ok: true, result: { stopping: true } })
        queueMicrotask(() => {
          emitExit(target, 0, null)
        })
      }
    })
    spawnMock.mockReturnValue(child as never)
    mkdirMock.mockResolvedValue(undefined)
    writeFileMock.mockResolvedValue(undefined)

    const { InputStatsHelperClient } = await importInputStatsHelperClient()
    const client = new InputStatsHelperClient('D:/Project/freecli/.tmp/input-stats-helper.ps1')

    await client.ensureStarted()
    await expect(client.stop()).resolves.toBeUndefined()
  })

  it('surfaces stderr details when helper exits during status handshake', async () => {
    const child = createMockChildProcess((_command, target) => {
      target.stderr.emit('data', 'Add-Type compile error')
      queueMicrotask(() => {
        emitExit(target, 0, null)
      })
    })
    spawnMock.mockReturnValue(child as never)
    mkdirMock.mockResolvedValue(undefined)
    writeFileMock.mockResolvedValue(undefined)

    const { InputStatsHelperClient } = await importInputStatsHelperClient()
    const client = new InputStatsHelperClient('D:/Project/freecli/.tmp/input-stats-helper.ps1')

    await expect(client.ensureStarted()).rejects.toThrow(
      'Input stats helper exited while processing "status" (exit code 0; Add-Type compile error)',
    )
  })

  it('refreshes through fetchAndResetDelta without a duplicate ensureStarted handshake', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })

    const helperClient = {
      ensureStarted: vi.fn().mockResolvedValue(undefined),
      fetchAndResetDelta: vi.fn().mockResolvedValue({
        keyPresses: 2,
        leftClicks: 1,
        rightClicks: 0,
        mouseDistancePx: 18,
        scrollSteps: 3,
        keyCounts: { A: 2 },
      }),
      stop: vi.fn().mockResolvedValue(undefined),
    }
    const store = {
      applyDelta: vi.fn().mockResolvedValue(undefined),
      buildSnapshot: vi.fn().mockResolvedValue(createSnapshot()),
      flush: vi.fn().mockResolvedValue(undefined),
    }

    const { InputStatsPluginController } = await importInputStatsPluginController()
    const controller = new InputStatsPluginController({
      emitState: () => undefined,
      helperClient: helperClient as never,
      store: store as never,
      userDataPath: 'D:/Project/freecli/.tmp',
    })

    controller.syncSettings(DEFAULT_INPUT_STATS_SETTINGS)
    await controller.createRuntimeFactory()().activate()

    expect(helperClient.ensureStarted).not.toHaveBeenCalled()
    expect(helperClient.fetchAndResetDelta).toHaveBeenCalledTimes(1)
    expect(store.applyDelta).toHaveBeenCalledTimes(1)
  })

  it('defers timer-driven input polling while no window is focused', async () => {
    vi.useFakeTimers()

    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    })

    const focusState = { current: false }
    const helperClient = {
      ensureStarted: vi.fn().mockResolvedValue(undefined),
      fetchAndResetDelta: vi.fn().mockResolvedValue({
        keyPresses: 2,
        leftClicks: 1,
        rightClicks: 0,
        mouseDistancePx: 18,
        scrollSteps: 3,
        keyCounts: { A: 2 },
      }),
      stop: vi.fn().mockResolvedValue(undefined),
    }
    const store = {
      applyDelta: vi.fn().mockResolvedValue(undefined),
      buildSnapshot: vi.fn().mockResolvedValue(createSnapshot()),
      flush: vi.fn().mockResolvedValue(undefined),
    }

    const { InputStatsPluginController } = await importInputStatsPluginController()
    const controller = new InputStatsPluginController({
      emitState: () => undefined,
      helperClient: helperClient as never,
      store: store as never,
      userDataPath: 'D:/Project/freecli/.tmp',
      hasFocusedWindow: () => focusState.current,
    })

    controller.syncSettings({
      ...DEFAULT_INPUT_STATS_SETTINGS,
      pollIntervalMs: 60_000,
    })

    focusState.current = true
    await controller.createRuntimeFactory()().activate()
    expect(helperClient.fetchAndResetDelta).toHaveBeenCalledTimes(1)

    focusState.current = false
    await vi.advanceTimersByTimeAsync(60_000)
    expect(helperClient.fetchAndResetDelta).toHaveBeenCalledTimes(1)

    focusState.current = true
    await vi.advanceTimersByTimeAsync(5_000)
    expect(helperClient.fetchAndResetDelta).toHaveBeenCalledTimes(2)

    await controller.dispose()
    vi.useRealTimers()
  })
})
