import { BrowserWindow } from 'electron'
import type { EyeCarePhase, EyeCareSettingsDto, EyeCareStateDto } from '@shared/contracts/dto'
import { DEFAULT_EYE_CARE_SETTINGS } from '@contexts/plugins/domain/eyeCareSettings'
import type { MainPluginRuntime, MainPluginRuntimeFactory } from '@contexts/plugins/application/MainPluginRuntimeHost'
import { IPC_CHANNELS } from '@shared/contracts/ipc'

function createDefaultState(): EyeCareStateDto {
  return {
    status: 'disabled',
    phase: 'idle',
    phaseStartedAt: null,
    phaseEndsAt: null,
    remainingSeconds: 0,
    cycleIndex: 0,
    completedBreakCountToday: 0,
    lastBreakFinishedAt: null,
    isOverlayVisible: false,
    isPaused: false,
    isStopped: false,
    isRunning: false,
    canStart: false,
    canPause: false,
    canResume: false,
    canStop: false,
    canPostpone: false,
    canSkip: false,
  }
}

export class EyeCarePluginController {
  private settings: EyeCareSettingsDto = DEFAULT_EYE_CARE_SETTINGS
  private state: EyeCareStateDto = createDefaultState()
  private timer: NodeJS.Timeout | null = null
  private enabled = false
  private pendingPhase: EyeCarePhase | null = null
  private pendingRemainingSeconds: number | null = null

  createRuntimeFactory(): MainPluginRuntimeFactory {
    return () => ({
      activate: async () => {
        this.setEnabled(true)
      },
      deactivate: async () => {
        this.setEnabled(false)
      },
    }) satisfies MainPluginRuntime
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.stopTimer()
      this.state = createDefaultState()
      this.broadcast()
      return
    }

    this.startWorkingCycle()
  }

  syncSettings(settings: EyeCareSettingsDto): EyeCareStateDto {
    this.settings = settings
    if (this.enabled && this.state.phase === 'idle' && !this.state.isStopped) {
      this.startWorkingCycle()
    }
    this.broadcast()
    return this.state
  }

  getState(): EyeCareStateDto {
    return this.state
  }

  startCycle(): EyeCareStateDto {
    if (!this.enabled) {
      return this.state
    }

    this.pendingPhase = null
    this.pendingRemainingSeconds = null
    this.startWorkingCycle()
    return this.state
  }

  pause(): EyeCareStateDto {
    if (!this.enabled || !this.state.isRunning || this.state.phase === 'paused' || !this.state.phaseEndsAt) {
      return this.state
    }

    const activePhase = this.state.phase
    const remainingSeconds = this.getRemainingSeconds()
    this.stopTimer()
    this.state = {
      ...this.state,
      phase: 'paused',
      status: 'running',
      phaseEndsAt: null,
      remainingSeconds,
      isPaused: true,
      isStopped: false,
      isRunning: false,
      canStart: false,
      canPause: false,
      canResume: true,
      canStop: true,
      isOverlayVisible: false,
    }
    this.pendingPhase = activePhase === 'working' ? 'working' : 'breaking'
    this.pendingRemainingSeconds = remainingSeconds
    this.broadcast()
    return this.state
  }

  resume(): EyeCareStateDto {
    if (!this.enabled || this.state.phase !== 'paused' || !this.pendingPhase) {
      return this.state
    }

    const phase = this.pendingPhase
    const remainingSeconds =
      this.pendingRemainingSeconds ??
      (phase === 'working' ? this.settings.workDurationMinutes * 60 : this.settings.breakDurationSeconds)

    this.pendingPhase = null
    this.pendingRemainingSeconds = null
    this.enterPhase(phase, remainingSeconds)
    return this.state
  }

  stop(): EyeCareStateDto {
    if (!this.enabled) {
      return this.state
    }

    this.stopTimer()
    this.pendingPhase = null
    this.pendingRemainingSeconds = null
    this.state = {
      ...this.state,
      status: 'idle',
      phase: 'idle',
      phaseStartedAt: null,
      phaseEndsAt: null,
      remainingSeconds: 0,
      isOverlayVisible: false,
      isPaused: false,
      isStopped: true,
      isRunning: false,
      canStart: true,
      canPause: false,
      canResume: false,
      canStop: false,
      canPostpone: false,
      canSkip: false,
    }
    this.broadcast()
    return this.state
  }

  postponeBreak(): EyeCareStateDto {
    if (!this.enabled || this.state.phase !== 'breaking' || !this.state.canPostpone) {
      return this.state
    }

    this.enterPhase('working', this.settings.postponeMinutes * 60)
    return this.state
  }

  async dispose(): Promise<void> {
    this.stopTimer()
  }

  private startWorkingCycle(): void {
    this.enterPhase('working', this.settings.workDurationMinutes * 60)
  }

  private completeBreak(): void {
    const nowIso = new Date().toISOString()
    this.state = {
      ...this.state,
      completedBreakCountToday: this.state.completedBreakCountToday + 1,
      lastBreakFinishedAt: nowIso,
    }

    if (this.settings.autoStartNextCycle) {
      this.enterPhase('working', this.settings.workDurationMinutes * 60)
      return
    }

    this.stopTimer()
    this.state = {
      ...this.state,
      status: 'idle',
      phase: 'idle',
      phaseStartedAt: null,
      phaseEndsAt: null,
      remainingSeconds: 0,
      isOverlayVisible: false,
      isRunning: false,
      canStart: true,
      canPause: false,
      canResume: false,
      canStop: false,
      isPaused: false,
      isStopped: false,
      canPostpone: false,
      canSkip: false,
    }
    this.broadcast()
  }

  private enterPhase(phase: EyeCarePhase, durationSeconds: number): void {
    this.stopTimer()
    const startedAt = new Date()
    const endsAt = new Date(startedAt.getTime() + durationSeconds * 1000)
    const isBreaking = phase === 'breaking'

    this.state = {
      ...this.state,
      status: 'running',
      phase,
      phaseStartedAt: startedAt.toISOString(),
      phaseEndsAt: endsAt.toISOString(),
      remainingSeconds: durationSeconds,
      cycleIndex: phase === 'working' ? this.state.cycleIndex + 1 : this.state.cycleIndex,
      isOverlayVisible: isBreaking && this.settings.mode === 'forced-blur',
      isPaused: false,
      isStopped: false,
      isRunning: true,
      canStart: false,
      canPause: true,
      canResume: false,
      canStop: true,
      canSkip: isBreaking && !this.settings.strictMode && this.settings.allowSkip,
      canPostpone: isBreaking && this.settings.allowPostpone,
    }

    this.broadcast()
    this.timer = setInterval(() => {
      this.tick()
    }, 1000)
  }

  private tick(): void {
    if (!this.state.phaseEndsAt) {
      return
    }

    const remainingSeconds = Math.max(
      0,
      Math.ceil((new Date(this.state.phaseEndsAt).getTime() - Date.now()) / 1000),
    )

    this.state = {
      ...this.state,
      remainingSeconds,
    }

    if (remainingSeconds <= 0) {
      if (this.state.phase === 'working') {
        this.enterPhase('breaking', this.settings.breakDurationSeconds)
        return
      }

      if (this.state.phase === 'breaking') {
        this.completeBreak()
        return
      }
    }

    this.broadcast()
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private getRemainingSeconds(): number {
    if (!this.state.phaseEndsAt) {
      return this.state.remainingSeconds
    }

    return Math.max(
      0,
      Math.ceil((new Date(this.state.phaseEndsAt).getTime() - Date.now()) / 1000),
    )
  }

  private broadcast(): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) {
        continue
      }

      window.webContents.send(IPC_CHANNELS.pluginsEyeCareState, this.state)
    }
  }
}
