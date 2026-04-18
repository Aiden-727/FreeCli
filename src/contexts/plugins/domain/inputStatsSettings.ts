import type {
  InputStatsCumulativeRangeDays,
  InputStatsHistoryRangeDays,
  InputStatsSettingsDto,
  InputStatsTopKeysRange,
} from '@shared/contracts/dto'
import { isRecord, normalizeIntegerInRange } from '@contexts/settings/domain/settingsNormalization'

export const INPUT_STATS_HISTORY_RANGE_OPTIONS = [
  7, 30,
] as const satisfies readonly InputStatsHistoryRangeDays[]
export const INPUT_STATS_TOP_KEYS_RANGE_OPTIONS = [
  0, 1, 7, 15, 30,
] as const satisfies readonly InputStatsTopKeysRange[]
export const INPUT_STATS_CUMULATIVE_RANGE_OPTIONS = [
  1, 7, 15, 30, 0,
] as const satisfies readonly InputStatsCumulativeRangeDays[]

export const INPUT_STATS_MIN_POLL_INTERVAL_MS = 3_000
export const INPUT_STATS_MAX_POLL_INTERVAL_MS = 120_000
export const INPUT_STATS_DEFAULT_POLL_INTERVAL_MS = 15_000

function isInputStatsHistoryRangeDays(value: unknown): value is InputStatsHistoryRangeDays {
  return (
    typeof value === 'number' &&
    INPUT_STATS_HISTORY_RANGE_OPTIONS.includes(value as InputStatsHistoryRangeDays)
  )
}

function isInputStatsTopKeysRange(value: unknown): value is InputStatsTopKeysRange {
  return (
    typeof value === 'number' &&
    INPUT_STATS_TOP_KEYS_RANGE_OPTIONS.includes(value as InputStatsTopKeysRange)
  )
}

function isInputStatsCumulativeRangeDays(value: unknown): value is InputStatsCumulativeRangeDays {
  return (
    typeof value === 'number' &&
    INPUT_STATS_CUMULATIVE_RANGE_OPTIONS.includes(value as InputStatsCumulativeRangeDays)
  )
}

export const DEFAULT_INPUT_STATS_SETTINGS: InputStatsSettingsDto = {
  pollIntervalMs: INPUT_STATS_DEFAULT_POLL_INTERVAL_MS,
  historyRangeDays: 7,
  topKeysRange: 7,
  cumulativeRangeDays: 7,
}

export function normalizeInputStatsSettings(value: unknown): InputStatsSettingsDto {
  if (!isRecord(value)) {
    return DEFAULT_INPUT_STATS_SETTINGS
  }

  return {
    pollIntervalMs: normalizeIntegerInRange(
      value.pollIntervalMs,
      DEFAULT_INPUT_STATS_SETTINGS.pollIntervalMs,
      INPUT_STATS_MIN_POLL_INTERVAL_MS,
      INPUT_STATS_MAX_POLL_INTERVAL_MS,
    ),
    historyRangeDays: isInputStatsHistoryRangeDays(value.historyRangeDays)
      ? value.historyRangeDays
      : DEFAULT_INPUT_STATS_SETTINGS.historyRangeDays,
    topKeysRange: isInputStatsTopKeysRange(value.topKeysRange)
      ? value.topKeysRange
      : DEFAULT_INPUT_STATS_SETTINGS.topKeysRange,
    cumulativeRangeDays: isInputStatsCumulativeRangeDays(value.cumulativeRangeDays)
      ? value.cumulativeRangeDays
      : DEFAULT_INPUT_STATS_SETTINGS.cumulativeRangeDays,
  }
}
