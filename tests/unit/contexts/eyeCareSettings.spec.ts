import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EYE_CARE_SETTINGS,
  normalizeEyeCareSettings,
} from '../../../src/contexts/plugins/domain/eyeCareSettings'

describe('eyeCareSettings', () => {
  it('returns defaults for invalid payload', () => {
    expect(normalizeEyeCareSettings(null)).toEqual(DEFAULT_EYE_CARE_SETTINGS)
  })

  it('uses 20 minutes work and 20 seconds break by default', () => {
    expect(DEFAULT_EYE_CARE_SETTINGS.workDurationMinutes).toBe(20)
    expect(DEFAULT_EYE_CARE_SETTINGS.breakDurationSeconds).toBe(20)
  })

  it('forces allowSkip to false when strictMode is enabled', () => {
    const normalized = normalizeEyeCareSettings({
      strictMode: true,
      allowSkip: true,
    })

    expect(normalized.strictMode).toBe(true)
    expect(normalized.allowSkip).toBe(false)
  })
})
