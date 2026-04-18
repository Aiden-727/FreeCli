import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import helperScriptSource from './windows/inputStatsHookHelper.ps1?raw'

const HELPER_COMMAND_TIMEOUT_MS = 10_000

export interface InputStatsHelperDelta {
  keyPresses: number
  leftClicks: number
  rightClicks: number
  mouseDistancePx: number
  scrollSteps: number
  keyCounts: Record<string, number>
}

interface InputStatsHelperEnvelope {
  ok?: boolean
  result?: Record<string, unknown>
  error?: string
  detail?: string
}

function normalizeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function normalizeKeyCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const result: Record<string, number> = {}
  for (const [key, rawCount] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.trim()
    const normalizedCount = Math.round(normalizeNumber(rawCount))
    if (normalizedKey.length === 0 || normalizedCount <= 0) {
      continue
    }

    result[normalizedKey] = normalizedCount
  }

  return result
}

function normalizeEnvelope(rawLine: string): InputStatsHelperEnvelope {
  const parsed = JSON.parse(rawLine) as InputStatsHelperEnvelope
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

export class InputStatsHelperClient {
  private readonly helperScriptPath: string
  private process: ChildProcessWithoutNullStreams | null = null
  private expectedExitProcess: ChildProcessWithoutNullStreams | null = null
  private pending: {
    resolve: (value: InputStatsHelperEnvelope) => void
    reject: (reason?: unknown) => void
  } | null = null
  private pendingCommand: string | null = null
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private stdoutBuffer = ''
  private lastErrorOutput = ''

  public constructor(helperScriptPath: string) {
    this.helperScriptPath = helperScriptPath
  }

  public async ensureStarted(): Promise<void> {
    if (this.isProcessUsable(this.process)) {
      return
    }

    this.process = null
    await this.writeHelperScript()
    this.stdoutBuffer = ''
    this.lastErrorOutput = ''
    const helperProcess = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.helperScriptPath],
      {
        stdio: 'pipe',
        windowsHide: true,
      },
    )
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
      this.rejectPending(error)
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
      const isCleanExit = signal == null && code === 0
      if (!hasPendingCommand && isCleanExit) {
        return
      }

      const suffix = formatProcessExitSuffix(code, this.lastErrorOutput)
      const prefix = this.pendingCommand
        ? `Input stats helper exited while processing "${this.pendingCommand}"`
        : 'Input stats helper exited unexpectedly'
      this.rejectPending(new Error(`${prefix}${suffix}`))
    })

    await this.sendCommand('status')
  }

  public async fetchAndResetDelta(): Promise<InputStatsHelperDelta> {
    await this.ensureStarted()
    const envelope = await this.sendCommand('fetch-and-reset')
    const result = envelope.result ?? {}
    return {
      keyPresses: Math.round(normalizeNumber(result.key_presses)),
      leftClicks: Math.round(normalizeNumber(result.left_clicks)),
      rightClicks: Math.round(normalizeNumber(result.right_clicks)),
      mouseDistancePx: normalizeNumber(result.mouse_distance_px),
      scrollSteps: normalizeNumber(result.scroll_steps),
      keyCounts: normalizeKeyCounts(result.key_counts),
    }
  }

  public async stop(): Promise<void> {
    const runningProcess = this.process
    if (!runningProcess) {
      return
    }

    this.markProcessExitAsExpected(runningProcess)
    try {
      await this.sendCommand('stop')
    } catch {
      // The process may already be gone. Fall back to terminate below.
    }

    if (this.isProcessUsable(runningProcess)) {
      runningProcess.kill()
    }

    if (this.process === runningProcess) {
      this.process = null
    }
  }

  private async writeHelperScript(): Promise<void> {
    await mkdir(dirname(this.helperScriptPath), { recursive: true })
    await writeFile(this.helperScriptPath, helperScriptSource, 'utf8')
  }

  private async sendCommand(command: string): Promise<InputStatsHelperEnvelope> {
    const process = this.process
    if (!process) {
      throw new Error('Input stats helper is not running')
    }

    if (this.pending) {
      throw new Error('Input stats helper command queue is busy')
    }

    return await new Promise<InputStatsHelperEnvelope>((resolvePromise, rejectPromise) => {
      this.pending = {
        resolve: resolvePromise,
        reject: rejectPromise,
      }
      this.pendingCommand = command
      this.clearPendingTimer()
      this.pendingTimer = setTimeout(() => {
        const detail = this.lastErrorOutput.length > 0 ? `: ${this.lastErrorOutput}` : ''
        this.rejectPending(
          new Error(`Input stats helper timed out while processing "${command}"${detail}`),
        )
        this.markProcessExitAsExpected(process)
        if (this.process === process && this.isProcessUsable(process)) {
          process.kill()
          this.process = null
        }
      }, HELPER_COMMAND_TIMEOUT_MS)

      process.stdin.write(`${command}\n`, error => {
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

      let envelope: InputStatsHelperEnvelope
      try {
        envelope = normalizeEnvelope(rawLine)
      } catch (error) {
        this.rejectPending(error)
        continue
      }

      const pending = this.pending
      this.pending = null
      this.clearPendingTimer()
      if (!pending) {
        continue
      }

      if (envelope.ok) {
        pending.resolve(envelope)
        continue
      }

      pending.reject(new Error(envelope.detail ?? envelope.error ?? 'Input stats helper failed'))
    }
  }

  private consumeStderr(chunk: string): void {
    const normalized = chunk.trim()
    if (normalized.length === 0) {
      return
    }

    const maxErrorLength = 2_000
    this.lastErrorOutput = normalized.slice(-maxErrorLength)
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

    return !process.killed && process.exitCode == null
  }

  private markProcessExitAsExpected(process: ChildProcessWithoutNullStreams): void {
    this.expectedExitProcess = process
  }
}

export function resolveInputStatsHelperScriptPath(userDataPath: string): string {
  return resolve(userDataPath, 'plugins', 'input-stats', 'helper', 'input-stats-helper.ps1')
}
