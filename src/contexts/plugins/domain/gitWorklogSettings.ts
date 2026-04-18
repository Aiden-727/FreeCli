import type {
  GitWorklogRangeMode,
  GitWorklogRepositoryDto,
  GitWorklogSettingsDto,
  GitWorklogWorkspaceDto,
} from '@shared/contracts/dto'

export const GIT_WORKLOG_RANGE_MODES = ['recent_days', 'date_range'] as const
export const GIT_WORKLOG_DEFAULT_RECENT_DAYS = 7
export const GIT_WORKLOG_MIN_RECENT_DAYS = 1
export const GIT_WORKLOG_MAX_RECENT_DAYS = 90
export const GIT_WORKLOG_DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000
export const GIT_WORKLOG_MIN_REFRESH_INTERVAL_MS = 60 * 1000
export const GIT_WORKLOG_MAX_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
export const GIT_WORKLOG_DEFAULT_AUTO_DISCOVER_DEPTH = 3
export const GIT_WORKLOG_MIN_AUTO_DISCOVER_DEPTH = 1
export const GIT_WORKLOG_MAX_AUTO_DISCOVER_DEPTH = 3

export function isGitWorklogRangeMode(value: unknown): value is GitWorklogRangeMode {
  return typeof value === 'string' && GIT_WORKLOG_RANGE_MODES.includes(value as GitWorklogRangeMode)
}

export function createDefaultGitWorklogRepository(index = 0): GitWorklogRepositoryDto {
  return {
    id: `repo_${index + 1}`,
    label: `Repository ${index + 1}`,
    path: '',
    enabled: true,
  }
}

export const DEFAULT_GIT_WORKLOG_SETTINGS: GitWorklogSettingsDto = {
  repositories: [createDefaultGitWorklogRepository()],
  ignoredAutoRepositoryPaths: [],
  autoImportedWorkspacePaths: [],
  authorFilter: '',
  rangeMode: 'recent_days',
  recentDays: GIT_WORKLOG_DEFAULT_RECENT_DAYS,
  rangeStartDay: '',
  rangeEndDay: '',
  autoRefreshEnabled: false,
  refreshIntervalMs: GIT_WORKLOG_DEFAULT_REFRESH_INTERVAL_MS,
  autoDiscoverEnabled: true,
  autoDiscoverDepth: GIT_WORKLOG_DEFAULT_AUTO_DISCOVER_DEPTH,
}

function normalizeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeWorkspaceText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeIntegerInRange(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN

  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function normalizeDayKey(value: unknown): string {
  const raw = normalizeText(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return ''
  }

  const parsed = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const year = parsed.getFullYear().toString().padStart(4, '0')
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeGitWorklogRepositories(value: unknown): GitWorklogRepositoryDto[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_GIT_WORKLOG_SETTINGS.repositories]
  }

  const normalized: GitWorklogRepositoryDto[] = []
  const seenIds = new Set<string>()

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index]
    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Record<string, unknown>
    const fallback = createDefaultGitWorklogRepository(index)
    const id = normalizeText(record.id, fallback.id) || fallback.id
    if (seenIds.has(id)) {
      continue
    }

    seenIds.add(id)
    normalized.push({
      id,
      label: normalizeText(record.label, fallback.label) || fallback.label,
      path: normalizeText(record.path),
      enabled: normalizeBoolean(record.enabled, fallback.enabled),
    })
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_GIT_WORKLOG_SETTINGS.repositories]
}

export function normalizeGitWorklogWorkspaces(value: unknown): GitWorklogWorkspaceDto[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized: GitWorklogWorkspaceDto[] = []
  const seenIds = new Set<string>()

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Record<string, unknown>
    const id = normalizeWorkspaceText(record.id)
    const name = normalizeWorkspaceText(record.name)
    const path = normalizeWorkspaceText(record.path)

    if (!id || !name || !path) {
      continue
    }

    if (seenIds.has(id)) {
      continue
    }

    seenIds.add(id)
    normalized.push({ id, name, path })
  }

  return normalized
}

export function normalizeGitWorklogSettings(value: unknown): GitWorklogSettingsDto {
  if (!value || typeof value !== 'object') {
    return DEFAULT_GIT_WORKLOG_SETTINGS
  }

  const record = value as Record<string, unknown>
  const rangeStartDay = normalizeDayKey(record.rangeStartDay)
  const rangeEndDay = normalizeDayKey(record.rangeEndDay)

  return {
    repositories: normalizeGitWorklogRepositories(record.repositories),
    ignoredAutoRepositoryPaths: normalizeUniqueGitWorklogPaths(record.ignoredAutoRepositoryPaths),
    autoImportedWorkspacePaths: normalizeUniqueGitWorklogPaths(record.autoImportedWorkspacePaths),
    authorFilter: normalizeText(record.authorFilter),
    rangeMode: isGitWorklogRangeMode(record.rangeMode)
      ? record.rangeMode
      : DEFAULT_GIT_WORKLOG_SETTINGS.rangeMode,
    recentDays: normalizeIntegerInRange(
      record.recentDays,
      DEFAULT_GIT_WORKLOG_SETTINGS.recentDays,
      GIT_WORKLOG_MIN_RECENT_DAYS,
      GIT_WORKLOG_MAX_RECENT_DAYS,
    ),
    rangeStartDay,
    rangeEndDay,
    autoRefreshEnabled: normalizeBoolean(
      record.autoRefreshEnabled,
      DEFAULT_GIT_WORKLOG_SETTINGS.autoRefreshEnabled,
    ),
    refreshIntervalMs: normalizeIntegerInRange(
      record.refreshIntervalMs,
      DEFAULT_GIT_WORKLOG_SETTINGS.refreshIntervalMs,
      GIT_WORKLOG_MIN_REFRESH_INTERVAL_MS,
      GIT_WORKLOG_MAX_REFRESH_INTERVAL_MS,
    ),
    autoDiscoverEnabled: normalizeBoolean(
      record.autoDiscoverEnabled,
      DEFAULT_GIT_WORKLOG_SETTINGS.autoDiscoverEnabled,
    ),
    autoDiscoverDepth: normalizeIntegerInRange(
      record.autoDiscoverDepth,
      DEFAULT_GIT_WORKLOG_SETTINGS.autoDiscoverDepth,
      GIT_WORKLOG_MIN_AUTO_DISCOVER_DEPTH,
      GIT_WORKLOG_MAX_AUTO_DISCOVER_DEPTH,
    ),
  }
}

function normalizeUniqueGitWorklogPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalized: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    const path = normalizeText(item)
    if (path.length === 0) {
      continue
    }

    const comparable = path.replaceAll('\\', '/').replaceAll(/\/+/g, '/').toLowerCase()
    if (seen.has(comparable)) {
      continue
    }

    seen.add(comparable)
    normalized.push(path)
  }

  return normalized
}

export function getConfiguredGitWorklogRepositories(
  settings: GitWorklogSettingsDto,
): GitWorklogRepositoryDto[] {
  return settings.repositories.filter(repo => repo.enabled && repo.path.trim().length > 0)
}
