import { access, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { app } from 'electron'
import type { SystemMonitorGpuMode } from '@shared/contracts/dto'

const HELPER_COMMAND_TIMEOUT_MS = 10_000
const HELPER_REQUIRED_FILES = [
  'WindowsMonitorHelper.exe',
  'WindowsMonitorHelper.dll',
  'WindowsMonitorHelper.deps.json',
]

export interface SystemMonitorRawSample {
  recordedAt: Date
  uploadBytesTotal: number
  downloadBytesTotal: number
  uploadBytesPerSecond: number
  downloadBytesPerSecond: number
  cpuUsagePercent: number
  memoryUsagePercent: number
  gpuUsagePercent: number | null
}

interface HelperEnvelope {
  ok?: boolean
  result?: {
    configured?: boolean
    stopping?: boolean
    snapshot?: {
      recordedAt?: string
      uploadBytesTotal?: number
      downloadBytesTotal?: number
      uploadBytesPerSecond?: number
      downloadBytesPerSecond?: number
      cpuUsagePercent?: number
      memoryUsagePercent?: number
      gpuUsagePercent?: number | null
    }
  }
  error?: string
  detail?: string
}

function clampNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function clampPercent(value: unknown): number {
  return Math.min(100, Math.max(0, Math.round(clampNonNegative(value))))
}

function normalizeEnvelope(rawLine: string): HelperEnvelope {
  const parsed = JSON.parse(rawLine) as HelperEnvelope
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function formatProcessExitSuffix(code: number | null, stderrOutput: string): string {
  const segments: string[] = []
  if (typeof code === 'number') {
    segments.push(`exit code ${code}`)
  }
  if (stderrOutput.length > 0) {
    segments.push(stderrOutput)
  }

  return segments.length > 0 ? ` (${segments.join('; ')})` : ''
}

interface HelperLaunchContext {
  binaryPath: string
  helperDirectory: string
  appIsPackaged: boolean
  processResourcesPath: string | null
  missingFiles: string[]
  directoryEntries: string[]
}

function formatHelperLaunchContext(context: HelperLaunchContext): string {
  const segments = [
    `binary=${context.binaryPath}`,
    `cwd=${context.helperDirectory}`,
    `packaged=${String(context.appIsPackaged)}`,
  ]

  if (context.processResourcesPath) {
    segments.push(`resourcesPath=${context.processResourcesPath}`)
  }

  if (context.missingFiles.length > 0) {
    segments.push(`missing=${context.missingFiles.join(', ')}`)
  }

  if (context.directoryEntries.length > 0) {
    segments.push(`dir=[${context.directoryEntries.join(', ')}]`)
  }

  return segments.join('; ')
}

function buildHelperStartupError(
  message: string,
  context: HelperLaunchContext,
  detail?: string,
): Error {
  const suffix = detail && detail.trim().length > 0 ? `; detail=${detail.trim()}` : ''
  return new Error(`${message} (${formatHelperLaunchContext(context)}${suffix})`)
}

export class SystemMonitorHelperClient {
  private readonly packagedHelperPathOverride: string | null
  private readonly devHelperPathOverride: string | null
  private process: ChildProcessWithoutNullStreams | null = null
  private expectedExitProcess: ChildProcessWithoutNullStreams | null = null
  private pending: {
    resolve: (value: HelperEnvelope) => void
    reject: (reason?: unknown) => void
  } | null = null
  private pendingCommand: string | null = null
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private stdoutBuffer = ''
  private lastErrorOutput = ''
  private lastLaunchContext: HelperLaunchContext | null = null

  public constructor(options?: { packagedHelperPath?: string; devHelperPath?: string }) {
    this.packagedHelperPathOverride = options?.packagedHelperPath ?? null
    this.devHelperPathOverride = options?.devHelperPath ?? null
  }

  public async ensureStarted(): Promise<void> {
    if (this.isProcessUsable(this.process)) {
      return
    }

    this.process = null
    this.stdoutBuffer = ''
    this.lastErrorOutput = ''
    this.lastLaunchContext = null

    const helperBinaryPath = await this.resolveHelperBinaryPath()
    const launchContext = await this.collectLaunchContext(helperBinaryPath)
    this.lastLaunchContext = launchContext
    if (launchContext.missingFiles.length > 0) {
      throw buildHelperStartupError('System monitor helper files are incomplete', launchContext)
    }

    const helperProcess = spawn(helperBinaryPath, [], {
      cwd: dirname(helperBinaryPath),
      stdio: 'pipe',
      windowsHide: true,
    })
    this.process = helperProcess

    helperProcess.stdout.setEncoding('utf8')
    helperProcess.stderr.setEncoding('utf8')
    helperProcess.stdout.on('data', chunk => {
      this.consumeStdout(chunk)
    })
    helperProcess.stderr.on('data', chunk => {
      this.consumeStderr(chunk)
    })
    helperProcess.once('error', error => {
      if (this.process === helperProcess) {
        this.process = null
      }

      this.rejectPending(this.decorateLaunchError(error))
    })
    helperProcess.once('exit', (code, signal) => {
      if (this.process === helperProcess) {
        this.process = null
      }

      const isExpectedExit =
        this.expectedExitProcess === helperProcess || signal === 'SIGTERM' || signal === 'SIGKILL'
      if (this.expectedExitProcess === helperProcess) {
        this.expectedExitProcess = null
      }

      if (isExpectedExit) {
        return
      }

      const hasPendingCommand = this.pending !== null
      const isCleanExit = (signal === null || signal === undefined) && code === 0
      if (!hasPendingCommand && isCleanExit) {
        return
      }

      const suffix = formatProcessExitSuffix(code, this.lastErrorOutput)
      const prefix = this.pendingCommand
        ? `System monitor helper exited while processing "${this.pendingCommand}"`
        : 'System monitor helper exited unexpectedly'
      this.rejectPending(this.decorateLaunchError(new Error(`${prefix}${suffix}`)))
    })
  }

  public async configure(options: { gpuMode: SystemMonitorGpuMode }): Promise<void> {
    await this.ensureStarted()
    await this.sendCommand({
      type: 'configure',
      config: {
        gpuMode: options.gpuMode,
      },
    })
  }

  public async getSnapshot(): Promise<SystemMonitorRawSample> {
    await this.ensureStarted()
    const envelope = await this.sendCommand({
      type: 'snapshot',
    })
    const snapshot = envelope.result?.snapshot
    const recordedAt =
      typeof snapshot?.recordedAt === 'string' && snapshot.recordedAt.trim().length > 0
        ? new Date(snapshot.recordedAt)
        : new Date()

    return {
      recordedAt,
      uploadBytesTotal: clampNonNegative(snapshot?.uploadBytesTotal),
      downloadBytesTotal: clampNonNegative(snapshot?.downloadBytesTotal),
      uploadBytesPerSecond: clampNonNegative(snapshot?.uploadBytesPerSecond),
      downloadBytesPerSecond: clampNonNegative(snapshot?.downloadBytesPerSecond),
      cpuUsagePercent: clampPercent(snapshot?.cpuUsagePercent),
      memoryUsagePercent: clampPercent(snapshot?.memoryUsagePercent),
      gpuUsagePercent:
        typeof snapshot?.gpuUsagePercent === 'number' && Number.isFinite(snapshot.gpuUsagePercent)
          ? clampPercent(snapshot.gpuUsagePercent)
          : null,
    }
  }

  public async stop(): Promise<void> {
    const runningProcess = this.process
    if (!runningProcess) {
      return
    }

    this.markProcessExitAsExpected(runningProcess)
    try {
      await this.sendCommand({ type: 'stop' })
    } catch {
      // The helper may already be gone. Fall back to termination.
    }

    if (this.isProcessUsable(runningProcess)) {
      runningProcess.kill()
    }

    if (this.process === runningProcess) {
      this.process = null
    }
  }

  private async resolveHelperBinaryPath(): Promise<string> {
    const packagedBasePath =
      this.packagedHelperPathOverride ??
      (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
        ? resolve(process.resourcesPath, 'system-monitor-helper', 'WindowsMonitorHelper.exe')
        : null)
    const devBasePath =
      this.devHelperPathOverride ??
      (() => {
        try {
          return resolve(
            app.getAppPath(),
            'build-resources',
            'system-monitor-helper',
            'WindowsMonitorHelper.exe',
          )
        } catch {
          return resolve(
            process.cwd(),
            'build-resources',
            'system-monitor-helper',
            'WindowsMonitorHelper.exe',
          )
        }
      })()
    const candidates = app.isPackaged
      ? [packagedBasePath, devBasePath]
      : [devBasePath, packagedBasePath]

    const existingCandidate = await Promise.all(
      candidates.map(async candidate => {
        if (!candidate) {
          return null
        }

        try {
          await access(candidate)
          return candidate
        } catch {
          return null
        }
      }),
    )
    const resolvedCandidate = existingCandidate.find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
    )
    if (resolvedCandidate) {
      return resolvedCandidate
    }

    throw new Error(`System monitor helper binary is missing. Looked for: ${candidates.join(', ')}`)
  }

  private async collectLaunchContext(helperBinaryPath: string): Promise<HelperLaunchContext> {
    const helperDirectory = dirname(helperBinaryPath)
    let directoryEntries: string[] = []

    try {
      directoryEntries = (await readdir(helperDirectory)).sort((left, right) =>
        left.localeCompare(right),
      )
    } catch {
      directoryEntries = []
    }

    const missingFiles = (
      await Promise.all(
        HELPER_REQUIRED_FILES.map(async fileName => {
          const fullPath = resolve(helperDirectory, fileName)
          try {
            await access(fullPath)
            return null
          } catch {
            return fileName
          }
        }),
      )
    ).filter((fileName): fileName is string => typeof fileName === 'string')

    return {
      binaryPath: helperBinaryPath,
      helperDirectory,
      appIsPackaged: app.isPackaged,
      processResourcesPath:
        typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
          ? process.resourcesPath
          : null,
      missingFiles,
      directoryEntries,
    }
  }

  private decorateLaunchError(error: unknown): Error {
    if (!this.lastLaunchContext) {
      return error instanceof Error ? error : new Error(String(error))
    }

    const detail =
      error instanceof Error
        ? [error.message, this.lastErrorOutput].filter(Boolean).join('; ')
        : [String(error), this.lastErrorOutput].filter(Boolean).join('; ')
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : 'System monitor helper failed to start'

    return buildHelperStartupError(message, this.lastLaunchContext, detail)
  }

  private async sendCommand(command: Record<string, unknown>): Promise<HelperEnvelope> {
    const process = this.process
    if (!process) {
      throw new Error('System monitor helper is not running')
    }

    if (this.pending) {
      throw new Error('System monitor helper command queue is busy')
    }

    const payload = JSON.stringify(command)
    const commandType = typeof command.type === 'string' ? command.type : 'unknown'

    return await new Promise<HelperEnvelope>((resolvePromise, rejectPromise) => {
      this.pending = {
        resolve: resolvePromise,
        reject: rejectPromise,
      }
      this.pendingCommand = commandType
      this.clearPendingTimer()
      this.pendingTimer = setTimeout(() => {
        const detail = this.lastErrorOutput.length > 0 ? `: ${this.lastErrorOutput}` : ''
        this.rejectPending(
          this.decorateLaunchError(
            new Error(`System monitor helper timed out while processing "${commandType}"${detail}`),
          ),
        )
        this.markProcessExitAsExpected(process)
        if (this.process === process && this.isProcessUsable(process)) {
          process.kill()
          this.process = null
        }
      }, HELPER_COMMAND_TIMEOUT_MS)

      process.stdin.write(`${payload}\n`, error => {
        if (!error) {
          return
        }

        this.rejectPending(error)
      })
    })
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    while (true) {
      const lineBreakIndex = this.stdoutBuffer.indexOf('\n')
      if (lineBreakIndex < 0) {
        return
      }

      const rawLine = this.stdoutBuffer.slice(0, lineBreakIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(lineBreakIndex + 1)
      if (rawLine.length === 0) {
        continue
      }

      let envelope: HelperEnvelope
      try {
        envelope = normalizeEnvelope(rawLine)
      } catch (error) {
        this.rejectPending(this.decorateLaunchError(error))
        continue
      }

      const pending = this.pending
      this.pending = null
      this.pendingCommand = null
      this.clearPendingTimer()
      if (!pending) {
        continue
      }

      if (envelope.ok) {
        pending.resolve(envelope)
        continue
      }

      pending.reject(
        this.decorateLaunchError(
          new Error(envelope.detail ?? envelope.error ?? 'System monitor helper failed'),
        ),
      )
    }
  }

  private consumeStderr(chunk: string): void {
    const normalized = chunk.trim()
    if (normalized.length === 0) {
      return
    }

    const nextOutput =
      this.lastErrorOutput.length > 0 ? `${this.lastErrorOutput}\n${normalized}` : normalized
    const tail = nextOutput.slice(-2_000)
    const firstNewlineIndex = tail.indexOf('\n')
    this.lastErrorOutput =
      tail.length === nextOutput.length || firstNewlineIndex < 0
        ? tail
        : tail.slice(firstNewlineIndex + 1)
  }

  private clearPendingTimer(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
  }

  private rejectPending(reason?: unknown): void {
    const pending = this.pending
    this.pending = null
    this.pendingCommand = null
    this.clearPendingTimer()
    pending?.reject(reason)
  }

  private isProcessUsable(
    process: ChildProcessWithoutNullStreams | null,
  ): process is ChildProcessWithoutNullStreams {
    if (!process) {
      return false
    }

    return !process.killed && (process.exitCode === null || process.exitCode === undefined)
  }

  private markProcessExitAsExpected(process: ChildProcessWithoutNullStreams): void {
    this.expectedExitProcess = process
  }
}
