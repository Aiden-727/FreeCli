import type {
  SystemMonitorGpuMode,
  SystemMonitorHeaderDisplayItem,
  SystemMonitorHistoryRangeDays,
  SystemMonitorSettingsDto,
} from '@shared/contracts/dto'
import { isRecord, normalizeIntegerInRange } from '@contexts/settings/domain/settingsNormalization'

export const SYSTEM_MONITOR_HISTORY_RANGE_OPTIONS = [1, 7, 30] as const satisfies readonly SystemMonitorHistoryRangeDays[]
export const SYSTEM_MONITOR_GPU_MODE_OPTIONS = ['off', 'total'] as const satisfies readonly SystemMonitorGpuMode[]
export const SYSTEM_MONITOR_DEFAULT_POLL_INTERVAL_MS = 1_000
export const SYSTEM_MONITOR_MIN_POLL_INTERVAL_MS = 1_000
export const SYSTEM_MONITOR_MAX_POLL_INTERVAL_MS = 60_000
export const SYSTEM_MONITOR_DEFAULT_BACKGROUND_POLL_INTERVAL_MS = 1_000
export const SYSTEM_MONITOR_MIN_BACKGROUND_POLL_INTERVAL_MS = 1_000
export const SYSTEM_MONITOR_MAX_BACKGROUND_POLL_INTERVAL_MS = 120_000
export const SYSTEM_MONITOR_DEFAULT_SAVE_INTERVAL_MS = 30_000
export const SYSTEM_MONITOR_MIN_SAVE_INTERVAL_MS = 10_000
export const SYSTEM_MONITOR_MAX_SAVE_INTERVAL_MS = 600_000
export const SYSTEM_MONITOR_HEADER_DISPLAY_ITEM_OPTIONS = [
  'download',
  'upload',
  'cpu',
  'memory',
  'gpu',
] as const satisfies readonly SystemMonitorHeaderDisplayItem[]

function isSystemMonitorHistoryRangeDays(value: unknown): value is SystemMonitorHistoryRangeDays {
  return (
    typeof value === 'number' &&
    SYSTEM_MONITOR_HISTORY_RANGE_OPTIONS.includes(value as SystemMonitorHistoryRangeDays)
  )
}

function isSystemMonitorGpuMode(value: unknown): value is SystemMonitorGpuMode {
  return (
    typeof value === 'string' &&
    SYSTEM_MONITOR_GPU_MODE_OPTIONS.includes(value as SystemMonitorGpuMode)
  )
}

function isSystemMonitorHeaderDisplayItem(value: unknown): value is SystemMonitorHeaderDisplayItem {
  return (
    typeof value === 'string' &&
    SYSTEM_MONITOR_HEADER_DISPLAY_ITEM_OPTIONS.includes(value as SystemMonitorHeaderDisplayItem)
  )
}

function normalizeHeaderDisplayItems(value: unknown): SystemMonitorHeaderDisplayItem[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SYSTEM_MONITOR_SETTINGS.header.displayItems
  }

  const uniqueItems = [...new Set(value.filter(isSystemMonitorHeaderDisplayItem))]
  return uniqueItems.length > 0 ? uniqueItems : DEFAULT_SYSTEM_MONITOR_SETTINGS.header.displayItems
}

export const DEFAULT_SYSTEM_MONITOR_SETTINGS: SystemMonitorSettingsDto = {
  pollIntervalMs: SYSTEM_MONITOR_DEFAULT_POLL_INTERVAL_MS,
  backgroundPollIntervalMs: SYSTEM_MONITOR_DEFAULT_BACKGROUND_POLL_INTERVAL_MS,
  saveIntervalMs: SYSTEM_MONITOR_DEFAULT_SAVE_INTERVAL_MS,
  historyRangeDays: 7,
  gpuMode: 'off',
  header: {
    displayItems: ['download', 'upload', 'cpu'],
  },
}

export function normalizeSystemMonitorSettings(value: unknown): SystemMonitorSettingsDto {
  if (!isRecord(value)) {
    return DEFAULT_SYSTEM_MONITOR_SETTINGS
  }

  const legacyGpuMonitoringEnabled = typeof value.gpuMonitoringEnabled === 'boolean'
    ? value.gpuMonitoringEnabled
    : false
  const legacyDisplayItems = normalizeHeaderDisplayItems(value.taskbarDisplayItems)
  const headerSource = isRecord(value.header) ? value.header : {}

  return {
    pollIntervalMs: normalizeIntegerInRange(
      value.pollIntervalMs,
      DEFAULT_SYSTEM_MONITOR_SETTINGS.pollIntervalMs,
      SYSTEM_MONITOR_MIN_POLL_INTERVAL_MS,
      SYSTEM_MONITOR_MAX_POLL_INTERVAL_MS,
    ),
    backgroundPollIntervalMs: normalizeIntegerInRange(
      value.backgroundPollIntervalMs,
      DEFAULT_SYSTEM_MONITOR_SETTINGS.backgroundPollIntervalMs,
      SYSTEM_MONITOR_MIN_BACKGROUND_POLL_INTERVAL_MS,
      SYSTEM_MONITOR_MAX_BACKGROUND_POLL_INTERVAL_MS,
    ),
    saveIntervalMs: normalizeIntegerInRange(
      value.saveIntervalMs,
      DEFAULT_SYSTEM_MONITOR_SETTINGS.saveIntervalMs,
      SYSTEM_MONITOR_MIN_SAVE_INTERVAL_MS,
      SYSTEM_MONITOR_MAX_SAVE_INTERVAL_MS,
    ),
    historyRangeDays: isSystemMonitorHistoryRangeDays(value.historyRangeDays)
      ? value.historyRangeDays
      : DEFAULT_SYSTEM_MONITOR_SETTINGS.historyRangeDays,
    gpuMode: isSystemMonitorGpuMode(value.gpuMode)
      ? value.gpuMode
      : legacyGpuMonitoringEnabled
        ? 'total'
        : DEFAULT_SYSTEM_MONITOR_SETTINGS.gpuMode,
    header: {
      displayItems:
        headerSource.displayItems !== undefined
          ? normalizeHeaderDisplayItems(headerSource.displayItems)
          : legacyDisplayItems,
    },
  }
}
