import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn<typeof import('node:child_process').spawn>(),
}))

const { accessMock, readdirMock } = vi.hoisted(() => ({
  accessMock: vi.fn<typeof import('node:fs/promises').access>(),
  readdirMock: vi.fn<typeof import('node:fs/promises').readdir>(),
}))

const { appMock } = vi.hoisted(() => ({
  appMock: {
    isPackaged: true,
    getAppPath: vi.fn(() => 'D:/Project/freecli'),
  },
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock,
  },
}))

vi.mock('node:fs/promises', () => ({
  access: accessMock,
  readdir: readdirMock,
  default: {
    access: accessMock,
    readdir: readdirMock,
  },
}))

vi.mock('electron', () => ({
  app: appMock,
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

async function importSystemMonitorHelperClient() {
  return await import('../../../src/plugins/systemMonitor/presentation/main/SystemMonitorHelperClient')
}

describe('SystemMonitorHelperClient', () => {
  const originalResourcesPath = process.resourcesPath

  afterEach(() => {
    process.resourcesPath = originalResourcesPath
    appMock.isPackaged = true
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('fails fast with explicit diagnostics when packaged helper files are incomplete', async () => {
    process.resourcesPath = 'D:/FreeCli/resources'
    accessMock.mockImplementation(async target => {
      const filePath = String(target)
      if (filePath.endsWith('WindowsMonitorHelper.exe')) {
        return undefined
      }

      throw new Error(`missing: ${filePath}`)
    })
    readdirMock.mockResolvedValue(['WindowsMonitorHelper.exe', 'WindowsMonitorHelper.pdb'] as never)

    const { SystemMonitorHelperClient } = await importSystemMonitorHelperClient()
    const client = new SystemMonitorHelperClient({
      packagedHelperPath: 'D:/FreeCli/resources/system-monitor-helper/WindowsMonitorHelper.exe',
    })

    await expect(client.ensureStarted()).rejects.toThrow(
      'System monitor helper files are incomplete',
    )
    await expect(client.ensureStarted()).rejects.toThrow('packaged=true')
    await expect(client.ensureStarted()).rejects.toThrow(
      'missing=WindowsMonitorHelper.dll, WindowsMonitorHelper.deps.json',
    )
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('includes launch context and stderr when the helper exits during the first snapshot command', async () => {
    process.resourcesPath = 'D:/FreeCli/resources'
    accessMock.mockResolvedValue(undefined)
    readdirMock.mockResolvedValue([
      'WindowsMonitorHelper.exe',
      'WindowsMonitorHelper.dll',
      'WindowsMonitorHelper.deps.json',
      'WindowsMonitorHelper.runtimeconfig.json',
    ] as never)

    const child = createMockChildProcess((_command, target) => {
      target.stderr.emit('data', 'You must install or update .NET to run this application.')
      queueMicrotask(() => {
        emitExit(target, 2147516566, null)
      })
    })
    spawnMock.mockReturnValue(child as never)

    const { SystemMonitorHelperClient } = await importSystemMonitorHelperClient()
    const client = new SystemMonitorHelperClient({
      packagedHelperPath: 'D:/FreeCli/resources/system-monitor-helper/WindowsMonitorHelper.exe',
    })

    await expect(client.getSnapshot()).rejects.toThrow(
      'System monitor helper exited while processing "snapshot"',
    )
    await expect(client.getSnapshot()).rejects.toThrow(
      'binary=D:/FreeCli/resources/system-monitor-helper/WindowsMonitorHelper.exe',
    )
    await expect(client.getSnapshot()).rejects.toThrow(
      'You must install or update .NET to run this application.',
    )
  })
})
