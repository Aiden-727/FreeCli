import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EYE_CARE_SETTINGS } from '../../../src/contexts/plugins/domain/eyeCareSettings'
import { EyeCarePluginController } from '../../../src/plugins/eyeCare/presentation/main/EyeCarePluginController'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

function enterBreakingPhase(controller: EyeCarePluginController, durationSeconds: number): void {
  ;(
    controller as unknown as {
      enterPhase: (phase: 'breaking', durationSeconds: number) => void
    }
  ).enterPhase('breaking', durationSeconds)
}

describe('EyeCarePluginController', () => {
  const controllers: EyeCarePluginController[] = []

  afterEach(async () => {
    await Promise.all(controllers.splice(0).map(async controller => await controller.dispose()))
  })

  it('allows skipping a break when strict mode is off and skip is enabled', () => {
    const controller = new EyeCarePluginController()
    controllers.push(controller)

    controller.syncSettings({
      ...DEFAULT_EYE_CARE_SETTINGS,
      strictMode: false,
      allowSkip: true,
      allowPostpone: true,
      workDurationMinutes: 25,
      breakDurationSeconds: 20,
    })
    controller.setEnabled(true)

    const stateBeforeBreak = controller.getState()
    enterBreakingPhase(controller, 20)

    const breakingState = controller.getState()
    expect(breakingState.phase).toBe('breaking')
    expect(breakingState.canSkip).toBe(true)

    const skippedState = controller.skipBreak()
    expect(skippedState.phase).toBe('working')
    expect(skippedState.isOverlayVisible).toBe(false)
    expect(skippedState.canSkip).toBe(false)
    expect(skippedState.remainingSeconds).toBe(25 * 60)
    expect(skippedState.cycleIndex).toBe(stateBeforeBreak.cycleIndex + 1)
  })

  it('keeps the current break when skip is not allowed', () => {
    const controller = new EyeCarePluginController()
    controllers.push(controller)

    controller.syncSettings({
      ...DEFAULT_EYE_CARE_SETTINGS,
      strictMode: true,
      allowSkip: false,
    })
    controller.setEnabled(true)
    enterBreakingPhase(controller, 20)

    const beforeSkip = controller.getState()
    const afterSkip = controller.skipBreak()

    expect(afterSkip).toEqual(beforeSkip)
  })
})
