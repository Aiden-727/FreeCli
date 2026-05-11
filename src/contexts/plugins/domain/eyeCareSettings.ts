import type { EyeCareMode, EyeCareSettingsDto } from '@shared/contracts/dto'

export const EYE_CARE_MODE_OPTIONS = ['gentle', 'forced-blur'] as const satisfies readonly EyeCareMode[]
export const EYE_CARE_DEFAULT_WORK_DURATION_MINUTES = 20
export const EYE_CARE_MIN_WORK_DURATION_MINUTES = 1
export const EYE_CARE_MAX_WORK_DURATION_MINUTES = 180
export const EYE_CARE_DEFAULT_BREAK_DURATION_SECONDS = 20
export const EYE_CARE_MIN_BREAK_DURATION_SECONDS = 5
export const EYE_CARE_MAX_BREAK_DURATION_SECONDS = 600
export const EYE_CARE_DEFAULT_POSTPONE_MINUTES = 5
export const EYE_CARE_MIN_POSTPONE_MINUTES = 1
export const EYE_CARE_MAX_POSTPONE_MINUTES = 60

export const DEFAULT_EYE_CARE_SETTINGS: EyeCareSettingsDto = {
  workDurationMinutes: EYE_CARE_DEFAULT_WORK_DURATION_MINUTES,
  breakDurationSeconds: EYE_CARE_DEFAULT_BREAK_DURATION_SECONDS,
  mode: 'forced-blur',
  strictMode: true,
  allowPostpone: true,
  postponeMinutes: EYE_CARE_DEFAULT_POSTPONE_MINUTES,
  allowSkip: false,
  autoStartNextCycle: true,
}

function normalizeIntegerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function isEyeCareMode(value: unknown): value is EyeCareMode {
  return typeof value === 'string' && EYE_CARE_MODE_OPTIONS.includes(value as EyeCareMode)
}

export function normalizeEyeCareSettings(value: unknown): EyeCareSettingsDto {
  if (!value || typeof value !== 'object') {
    return DEFAULT_EYE_CARE_SETTINGS
  }

  const record = value as Record<string, unknown>
  const strictMode = normalizeBoolean(record.strictMode, DEFAULT_EYE_CARE_SETTINGS.strictMode)

  return {
    workDurationMinutes: normalizeIntegerInRange(
      record.workDurationMinutes,
      DEFAULT_EYE_CARE_SETTINGS.workDurationMinutes,
      EYE_CARE_MIN_WORK_DURATION_MINUTES,
      EYE_CARE_MAX_WORK_DURATION_MINUTES,
    ),
    breakDurationSeconds: normalizeIntegerInRange(
      record.breakDurationSeconds,
      DEFAULT_EYE_CARE_SETTINGS.breakDurationSeconds,
      EYE_CARE_MIN_BREAK_DURATION_SECONDS,
      EYE_CARE_MAX_BREAK_DURATION_SECONDS,
    ),
    mode: isEyeCareMode(record.mode) ? record.mode : DEFAULT_EYE_CARE_SETTINGS.mode,
    strictMode,
    allowPostpone: normalizeBoolean(
      record.allowPostpone,
      DEFAULT_EYE_CARE_SETTINGS.allowPostpone,
    ),
    postponeMinutes: normalizeIntegerInRange(
      record.postponeMinutes,
      DEFAULT_EYE_CARE_SETTINGS.postponeMinutes,
      EYE_CARE_MIN_POSTPONE_MINUTES,
      EYE_CARE_MAX_POSTPONE_MINUTES,
    ),
    allowSkip: strictMode
      ? false
      : normalizeBoolean(record.allowSkip, DEFAULT_EYE_CARE_SETTINGS.allowSkip),
    autoStartNextCycle: normalizeBoolean(
      record.autoStartNextCycle,
      DEFAULT_EYE_CARE_SETTINGS.autoStartNextCycle,
    ),
  }
}
