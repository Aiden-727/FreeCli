import type {
  SystemMonitorGpuMode,
  SystemMonitorHistoryRangeDays,
  SystemMonitorTaskbarDisplayItem,
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
export const SYSTEM_MONITOR_TASKBAR_DISPLAY_ITEM_OPTIONS = [
  'download',
  'upload',
  'cpu',
  'memory',
  'gpu',
] as const satisfies readonly SystemMonitorTaskbarDisplayItem[]
export const SYSTEM_MONITOR_MIN_TASKBAR_FONT_SIZE = 8
export const SYSTEM_MONITOR_MAX_TASKBAR_FONT_SIZE = 18
export const SYSTEM_MONITOR_DEFAULT_TASKBAR_FONT_SIZE = 9

function isSystemMonitorHistoryRangeDays(value: unknown): value is SystemMonitorHistoryRangeDays {
  return (
    typeof value === 'number' &&
    SYSTEM_MONITOR_HISTORY_RANGE_OPTIONS.includes(value as SystemMonitorHistoryRangeDays)
  )
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function isSystemMonitorGpuMode(value: unknown): value is SystemMonitorGpuMode {
  return (
    typeof value === 'string' &&
    SYSTEM_MONITOR_GPU_MODE_OPTIONS.includes(value as SystemMonitorGpuMode)
  )
}

function isSystemMonitorTaskbarDisplayItem(
  value: unknown,
): value is SystemMonitorTaskbarDisplayItem {
  return (
    typeof value === 'string' &&
    SYSTEM_MONITOR_TASKBAR_DISPLAY_ITEM_OPTIONS.includes(value as SystemMonitorTaskbarDisplayItem)
  )
}

function normalizeTaskbarDisplayItems(value: unknown): SystemMonitorTaskbarDisplayItem[] {
  if (!Array.isArray(value)) {
    return DEFAULT_SYSTEM_MONITOR_SETTINGS.taskbarWidget.displayItems
  }

  const uniqueItems = [...new Set(value.filter(isSystemMonitorTaskbarDisplayItem))]
  return uniqueItems.length > 0
    ? uniqueItems
    : DEFAULT_SYSTEM_MONITOR_SETTINGS.taskbarWidget.displayItems
}

export const DEFAULT_SYSTEM_MONITOR_SETTINGS: SystemMonitorSettingsDto = {
  pollIntervalMs: SYSTEM_MONITOR_DEFAULT_POLL_INTERVAL_MS,
  backgroundPollIntervalMs: SYSTEM_MONITOR_DEFAULT_BACKGROUND_POLL_INTERVAL_MS,
  saveIntervalMs: SYSTEM_MONITOR_DEFAULT_SAVE_INTERVAL_MS,
  historyRangeDays: 7,
  gpuMode: 'off',
  taskbarWidgetEnabled: false,
  taskbarWidget: {
    notifyIconEnabled: false,
    compactModeEnabled: true,
    alwaysOnTop: true,
    fontSize: SYSTEM_MONITOR_DEFAULT_TASKBAR_FONT_SIZE,
    displayItems: ['download', 'upload', 'cpu'],
  },
}

export function normalizeSystemMonitorSettings(value: unknown): SystemMonitorSettingsDto {
  if (!isRecord(value)) {
    return DEFAULT_SYSTEM_MONITOR_SETTINGS
  }

  const legacyGpuMonitoringEnabled = normalizeBoolean(value.gpuMonitoringEnabled, false)
  const taskbarWidgetSource = isRecord(value.taskbarWidget) ? value.taskbarWidget : {}
  const legacyNotifyIconEnabled = normalizeBoolean(value.notifyIconEnabled, false)
  const legacyTaskbarDisplayItems = normalizeTaskbarDisplayItems(value.taskbarDisplayItems)

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
    taskbarWidgetEnabled: normalizeBoolean(
      value.taskbarWidgetEnabled,
      DEFAULT_SYSTEM_MONITOR_SETTINGS.taskbarWidgetEnabled,
    ),
    taskbarWidget: {
      notifyIconEnabled: normalizeBoolean(
        taskbarWidgetSource.notifyIconEnabled,
        legacyNotifyIconEnabled ?? DEFAULT_SYSTEM_MONITOR_SETTINGS.taskbarWidget.notifyIconEnabled,
      ),
      compactModeEnabled: normalizeBoolean(
        taskbarWidgetSource.compactModeEnabled,
        DEFAULT_SYSTEM_MONITOR_SETTINGS.taskbarWidget.compactModeEnabled,
      ),
      alwaysOnTop: normalizeBoolean(
        taskbarWidgetSource.alwaysOnTop,
        DEFAULT_SYSTEM_MONITOR_SETTINGS.taskbarWidget.alwaysOnTop,
      ),
      fontSize: normalizeIntegerInRange(
        taskbarWidgetSource.fontSize,
        DEFAULT_SYSTEM_MONITOR_SETTINGS.taskbarWidget.fontSize,
        SYSTEM_MONITOR_MIN_TASKBAR_FONT_SIZE,
        SYSTEM_MONITOR_MAX_TASKBAR_FONT_SIZE,
      ),
      displayItems:
        taskbarWidgetSource.displayItems !== undefined
          ? normalizeTaskbarDisplayItems(taskbarWidgetSource.displayItems)
          : legacyTaskbarDisplayItems,
    },
  }
}
