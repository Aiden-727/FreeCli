import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { GitWorklogDailyPointDto } from '@shared/contracts/dto'

export interface GitWorklogCachedRangeStats {
  commitCountToday: number
  filesChangedToday: number
  additionsToday: number
  deletionsToday: number
  changedLinesToday: number
  netLinesToday: number
  commitCountInRange: number
  filesChangedInRange: number
  additionsInRange: number
  deletionsInRange: number
  changedLinesInRange: number
  dailyPoints: GitWorklogDailyPointDto[]
}

export interface GitWorklogCachedCodeStats {
  totalCodeFiles: number
  totalCodeLines: number
}

export interface GitWorklogCachedHeatmapStats {
  dailyPoints: GitWorklogDailyPointDto[]
}

export interface GitWorklogRefSnapshotEntry {
  refName: string
  oid: string
}

export interface GitWorklogCachedDailyHistory {
  refsSnapshot: GitWorklogRefSnapshotEntry[]
  dailyPoints: Array<
    GitWorklogDailyPointDto & {
      files: string[]
    }
  >
  builtAt: string
  updatedAt: string
}

export interface GitWorklogRangeCacheValidation {
  authorFilter: string
  from: string | null
  until: string | null
  refsFingerprint: string
}

export interface GitWorklogCodeCacheValidation {
  fileFingerprint: string
}

export interface GitWorklogHeatmapCacheValidation {
  authorFilter: string
  refsFingerprint: string
}

interface GitWorklogRangeCacheEntry {
  key: string
  validation: GitWorklogRangeCacheValidation
  stats: GitWorklogCachedRangeStats
  updatedAt: string
}

interface GitWorklogCodeCacheEntry {
  key: string
  validation: GitWorklogCodeCacheValidation
  stats: GitWorklogCachedCodeStats
  updatedAt: string
}

interface GitWorklogHeatmapCacheEntry {
  key: string
  validation: GitWorklogHeatmapCacheValidation
  stats: GitWorklogCachedHeatmapStats
  updatedAt: string
}

interface GitWorklogDailyHistoryEntry {
  refsSnapshot: GitWorklogRefSnapshotEntry[]
  dailyPoints: Array<
    GitWorklogDailyPointDto & {
      files: string[]
    }
  >
  builtAt: string
  updatedAt: string
}

interface GitWorklogRepositoryCacheEntry {
  repoPath: string
  rangeStats: GitWorklogRangeCacheEntry[]
  codeStats: GitWorklogCodeCacheEntry[]
  heatmapStats: GitWorklogHeatmapCacheEntry[]
  dailyHistory: GitWorklogDailyHistoryEntry | null
}

export interface GitWorklogHistorySyncPayload {
  formatVersion: 1
  exportedAt: string
  repositories: GitWorklogRepositoryCacheEntry[]
}

interface GitWorklogHistoryStoreState {
  formatVersion: 1
  repositories: GitWorklogRepositoryCacheEntry[]
}

const STORE_FORMAT_VERSION = 1
const MAX_REPOSITORIES = 240
const MAX_RANGE_STATS_PER_REPO = 18
const MAX_CODE_STATS_PER_REPO = 18
const MAX_HEATMAP_STATS_PER_REPO = 6

function normalizePathForCompare(pathValue: string): string {
  const resolved = resolve(pathValue.trim())
  const normalized = resolved.replaceAll('\\', '/').replaceAll(/\/+/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function normalizeNonNegativeInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.round(value))
}

function normalizeIsoDate(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return fallback
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return fallback
  }

  return parsed.toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeDailyPoint(raw: unknown): GitWorklogDailyPointDto | null {
  if (!isRecord(raw)) {
    return null
  }

  const day = typeof raw.day === 'string' ? raw.day.trim() : ''
  const label = typeof raw.label === 'string' ? raw.label.trim() : ''
  if (day.length === 0 || label.length === 0) {
    return null
  }

  return {
    day,
    label,
    commitCount: normalizeNonNegativeInteger(raw.commitCount),
    filesChanged: normalizeNonNegativeInteger(raw.filesChanged),
    additions: normalizeNonNegativeInteger(raw.additions),
    deletions: normalizeNonNegativeInteger(raw.deletions),
    changedLines: normalizeNonNegativeInteger(raw.changedLines),
  }
}

function normalizeRefSnapshotEntry(raw: unknown): GitWorklogRefSnapshotEntry | null {
  if (!isRecord(raw)) {
    return null
  }

  const refName = typeof raw.refName === 'string' ? raw.refName.trim() : ''
  const oid = typeof raw.oid === 'string' ? raw.oid.trim() : ''
  if (refName.length === 0 || oid.length === 0) {
    return null
  }

  return {
    refName,
    oid,
  }
}

function normalizeRefsSnapshot(raw: unknown): GitWorklogRefSnapshotEntry[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const entries: GitWorklogRefSnapshotEntry[] = []
  const seenRefs = new Set<string>()
  for (const item of raw) {
    const normalized = normalizeRefSnapshotEntry(item)
    if (!normalized || seenRefs.has(normalized.refName)) {
      continue
    }

    seenRefs.add(normalized.refName)
    entries.push(normalized)
  }

  return entries.sort((left, right) => left.refName.localeCompare(right.refName))
}

function normalizeRangeStats(raw: unknown): GitWorklogCachedRangeStats | null {
  if (!isRecord(raw)) {
    return null
  }

  const dailyPoints = Array.isArray(raw.dailyPoints)
    ? raw.dailyPoints
        .map(normalizeDailyPoint)
        .filter((point): point is GitWorklogDailyPointDto => point !== null)
    : []

  return {
    commitCountToday: normalizeNonNegativeInteger(raw.commitCountToday),
    filesChangedToday: normalizeNonNegativeInteger(raw.filesChangedToday),
    additionsToday: normalizeNonNegativeInteger(raw.additionsToday),
    deletionsToday: normalizeNonNegativeInteger(raw.deletionsToday),
    changedLinesToday: normalizeNonNegativeInteger(raw.changedLinesToday),
    netLinesToday:
      typeof raw.netLinesToday === 'number' && Number.isFinite(raw.netLinesToday)
        ? Math.round(raw.netLinesToday)
        : 0,
    commitCountInRange: normalizeNonNegativeInteger(raw.commitCountInRange),
    filesChangedInRange: normalizeNonNegativeInteger(raw.filesChangedInRange),
    additionsInRange: normalizeNonNegativeInteger(raw.additionsInRange),
    deletionsInRange: normalizeNonNegativeInteger(raw.deletionsInRange),
    changedLinesInRange: normalizeNonNegativeInteger(raw.changedLinesInRange),
    dailyPoints,
  }
}

function normalizeCodeStats(raw: unknown): GitWorklogCachedCodeStats | null {
  if (!isRecord(raw)) {
    return null
  }

  return {
    totalCodeFiles: normalizeNonNegativeInteger(raw.totalCodeFiles),
    totalCodeLines: normalizeNonNegativeInteger(raw.totalCodeLines),
  }
}

function normalizeHeatmapStats(raw: unknown): GitWorklogCachedHeatmapStats | null {
  if (!isRecord(raw)) {
    return null
  }

  const dailyPoints = Array.isArray(raw.dailyPoints)
    ? raw.dailyPoints
        .map(normalizeDailyPoint)
        .filter((point): point is GitWorklogDailyPointDto => point !== null)
    : []

  return {
    dailyPoints,
  }
}

function normalizeDailyHistory(raw: unknown): GitWorklogCachedDailyHistory | null {
  if (!isRecord(raw)) {
    return null
  }

  return {
    refsSnapshot: normalizeRefsSnapshot(raw.refsSnapshot),
    dailyPoints: Array.isArray(raw.dailyPoints)
      ? raw.dailyPoints
          .map(item => {
            const point = normalizeDailyPoint(item)
            if (!point || !isRecord(item)) {
              return null
            }

            const files = Array.isArray(item.files)
              ? item.files.filter(
                  (file): file is string => typeof file === 'string' && file.trim().length > 0,
                )
              : []

            return {
              ...point,
              files,
            }
          })
          .filter(
            (
              point,
            ): point is GitWorklogDailyPointDto & {
              files: string[]
            } => point !== null,
          )
      : [],
    builtAt: normalizeIsoDate(raw.builtAt),
    updatedAt: normalizeIsoDate(raw.updatedAt),
  }
}

function normalizeRangeValidation(raw: unknown): GitWorklogRangeCacheValidation | null {
  if (!isRecord(raw)) {
    return null
  }

  const refsFingerprint = typeof raw.refsFingerprint === 'string' ? raw.refsFingerprint.trim() : ''
  if (refsFingerprint.length === 0) {
    return null
  }

  const from = typeof raw.from === 'string' && raw.from.trim().length > 0 ? raw.from.trim() : null
  const until =
    typeof raw.until === 'string' && raw.until.trim().length > 0 ? raw.until.trim() : null

  return {
    authorFilter: typeof raw.authorFilter === 'string' ? raw.authorFilter.trim() : '',
    from,
    until,
    refsFingerprint,
  }
}

function normalizeCodeValidation(raw: unknown): GitWorklogCodeCacheValidation | null {
  if (!isRecord(raw)) {
    return null
  }

  const fileFingerprint = typeof raw.fileFingerprint === 'string' ? raw.fileFingerprint.trim() : ''
  if (fileFingerprint.length === 0) {
    return null
  }

  return { fileFingerprint }
}

function normalizeHeatmapValidation(raw: unknown): GitWorklogHeatmapCacheValidation | null {
  if (!isRecord(raw)) {
    return null
  }

  const refsFingerprint = typeof raw.refsFingerprint === 'string' ? raw.refsFingerprint.trim() : ''
  if (refsFingerprint.length === 0) {
    return null
  }

  return {
    authorFilter: typeof raw.authorFilter === 'string' ? raw.authorFilter.trim() : '',
    refsFingerprint,
  }
}

function createEmptyState(): GitWorklogHistoryStoreState {
  return {
    formatVersion: STORE_FORMAT_VERSION,
    repositories: [],
  }
}

function normalizeRangeEntries(raw: unknown): GitWorklogRangeCacheEntry[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const entries: GitWorklogRangeCacheEntry[] = []
  const seenKeys = new Set<string>()

  for (const item of raw) {
    if (!isRecord(item)) {
      continue
    }

    const key = typeof item.key === 'string' ? item.key.trim() : ''
    if (key.length === 0 || seenKeys.has(key)) {
      continue
    }

    const validation = normalizeRangeValidation(item.validation)
    const stats = normalizeRangeStats(item.stats)
    if (!validation || !stats) {
      continue
    }

    seenKeys.add(key)
    entries.push({
      key,
      validation,
      stats,
      updatedAt: normalizeIsoDate(item.updatedAt),
    })
  }

  return entries
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_RANGE_STATS_PER_REPO)
}

function normalizeCodeEntries(raw: unknown): GitWorklogCodeCacheEntry[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const entries: GitWorklogCodeCacheEntry[] = []
  const seenKeys = new Set<string>()

  for (const item of raw) {
    if (!isRecord(item)) {
      continue
    }

    const key = typeof item.key === 'string' ? item.key.trim() : ''
    if (key.length === 0 || seenKeys.has(key)) {
      continue
    }

    const validation = normalizeCodeValidation(item.validation)
    const stats = normalizeCodeStats(item.stats)
    if (!validation || !stats) {
      continue
    }

    seenKeys.add(key)
    entries.push({
      key,
      validation,
      stats,
      updatedAt: normalizeIsoDate(item.updatedAt),
    })
  }

  return entries
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_CODE_STATS_PER_REPO)
}

function normalizeHeatmapEntries(raw: unknown): GitWorklogHeatmapCacheEntry[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const entries: GitWorklogHeatmapCacheEntry[] = []
  const seenKeys = new Set<string>()

  for (const item of raw) {
    if (!isRecord(item)) {
      continue
    }

    const key = typeof item.key === 'string' ? item.key.trim() : ''
    if (key.length === 0 || seenKeys.has(key)) {
      continue
    }

    const validation = normalizeHeatmapValidation(item.validation)
    const stats = normalizeHeatmapStats(item.stats)
    if (!validation || !stats) {
      continue
    }

    seenKeys.add(key)
    entries.push({
      key,
      validation,
      stats,
      updatedAt: normalizeIsoDate(item.updatedAt),
    })
  }

  return entries
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, MAX_HEATMAP_STATS_PER_REPO)
}

function normalizeRepositoryEntries(raw: unknown): GitWorklogRepositoryCacheEntry[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const entries: GitWorklogRepositoryCacheEntry[] = []
  const seenRepoPaths = new Set<string>()

  for (const item of raw) {
    if (!isRecord(item)) {
      continue
    }

    const repoPath = typeof item.repoPath === 'string' ? item.repoPath.trim() : ''
    if (repoPath.length === 0) {
      continue
    }

    const normalizedRepoPath = normalizePathForCompare(repoPath)
    if (seenRepoPaths.has(normalizedRepoPath)) {
      continue
    }

    seenRepoPaths.add(normalizedRepoPath)
    entries.push({
      repoPath: normalizedRepoPath,
      rangeStats: normalizeRangeEntries(item.rangeStats),
      codeStats: normalizeCodeEntries(item.codeStats),
      heatmapStats: normalizeHeatmapEntries(item.heatmapStats),
      dailyHistory: normalizeDailyHistory(item.dailyHistory),
    })
  }

  return entries
    .sort((left, right) =>
      computeRepositoryLatestTimestamp(right).localeCompare(computeRepositoryLatestTimestamp(left)),
    )
    .slice(0, MAX_REPOSITORIES)
}

function computeRepositoryLatestTimestamp(entry: GitWorklogRepositoryCacheEntry): string {
  const rangeLatest = entry.rangeStats[0]?.updatedAt ?? ''
  const codeLatest = entry.codeStats[0]?.updatedAt ?? ''
  const heatmapLatest = entry.heatmapStats[0]?.updatedAt ?? ''
  const dailyHistoryLatest = entry.dailyHistory?.updatedAt ?? ''
  const latestCandidates = [rangeLatest, codeLatest, heatmapLatest, dailyHistoryLatest]
  return latestCandidates.sort((left, right) => right.localeCompare(left))[0] ?? ''
}

export function normalizeGitWorklogHistorySyncPayload(raw: unknown): GitWorklogHistorySyncPayload {
  if (!isRecord(raw)) {
    return {
      formatVersion: STORE_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      repositories: [],
    }
  }

  return {
    formatVersion: STORE_FORMAT_VERSION,
    exportedAt: normalizeIsoDate(raw.exportedAt),
    repositories: normalizeRepositoryEntries(raw.repositories),
  }
}

function normalizePersistedState(raw: unknown): GitWorklogHistoryStoreState {
  const payload = normalizeGitWorklogHistorySyncPayload(raw)
  return {
    formatVersion: STORE_FORMAT_VERSION,
    repositories: payload.repositories,
  }
}

export function buildGitWorklogRangeCacheKey(validation: GitWorklogRangeCacheValidation): string {
  const payload = JSON.stringify({
    authorFilter: validation.authorFilter.trim(),
    from: validation.from,
    until: validation.until,
    refsFingerprint: validation.refsFingerprint,
  })
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

export function buildGitWorklogCodeCacheKey(validation: GitWorklogCodeCacheValidation): string {
  const payload = JSON.stringify({
    fileFingerprint: validation.fileFingerprint,
  })
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

export function buildGitWorklogHeatmapCacheKey(
  validation: GitWorklogHeatmapCacheValidation,
): string {
  const payload = JSON.stringify({
    authorFilter: validation.authorFilter.trim(),
    refsFingerprint: validation.refsFingerprint,
  })
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}

export class GitWorklogHistoryStore {
  private state: GitWorklogHistoryStoreState = createEmptyState()
  private loadPromise: Promise<void> | null = null
  private flushPromise: Promise<void> = Promise.resolve()
  private dirty = false

  public constructor(private readonly filePath: string) {}

  public async dispose(): Promise<void> {
    await this.flush()
  }

  public async getRangeStats(
    repoPath: string,
    key: string,
  ): Promise<GitWorklogCachedRangeStats | null> {
    await this.ensureLoaded()
    const repository = this.findRepository(repoPath)
    if (!repository) {
      return null
    }

    return repository.rangeStats.find(entry => entry.key === key)?.stats ?? null
  }

  public async saveRangeStats(options: {
    repoPath: string
    key: string
    validation: GitWorklogRangeCacheValidation
    stats: GitWorklogCachedRangeStats
  }): Promise<void> {
    await this.ensureLoaded()
    const repository = this.getOrCreateRepository(options.repoPath)
    const now = new Date().toISOString()
    repository.rangeStats = [
      {
        key: options.key,
        validation: options.validation,
        stats: options.stats,
        updatedAt: now,
      },
      ...repository.rangeStats.filter(entry => entry.key !== options.key),
    ].slice(0, MAX_RANGE_STATS_PER_REPO)

    this.reorderAndTrimRepositories()
    this.dirty = true
  }

  public async getCodeStats(
    repoPath: string,
    key: string,
  ): Promise<GitWorklogCachedCodeStats | null> {
    await this.ensureLoaded()
    const repository = this.findRepository(repoPath)
    if (!repository) {
      return null
    }

    return repository.codeStats.find(entry => entry.key === key)?.stats ?? null
  }

  public async saveCodeStats(options: {
    repoPath: string
    key: string
    validation: GitWorklogCodeCacheValidation
    stats: GitWorklogCachedCodeStats
  }): Promise<void> {
    await this.ensureLoaded()
    const repository = this.getOrCreateRepository(options.repoPath)
    const now = new Date().toISOString()
    repository.codeStats = [
      {
        key: options.key,
        validation: options.validation,
        stats: options.stats,
        updatedAt: now,
      },
      ...repository.codeStats.filter(entry => entry.key !== options.key),
    ].slice(0, MAX_CODE_STATS_PER_REPO)

    this.reorderAndTrimRepositories()
    this.dirty = true
  }

  public async getHeatmapStats(
    repoPath: string,
    key: string,
  ): Promise<GitWorklogCachedHeatmapStats | null> {
    await this.ensureLoaded()
    const repository = this.findRepository(repoPath)
    if (!repository) {
      return null
    }

    return repository.heatmapStats.find(entry => entry.key === key)?.stats ?? null
  }

  public async saveHeatmapStats(options: {
    repoPath: string
    key: string
    validation: GitWorklogHeatmapCacheValidation
    stats: GitWorklogCachedHeatmapStats
  }): Promise<void> {
    await this.ensureLoaded()
    const repository = this.getOrCreateRepository(options.repoPath)
    const now = new Date().toISOString()
    repository.heatmapStats = [
      {
        key: options.key,
        validation: options.validation,
        stats: options.stats,
        updatedAt: now,
      },
      ...repository.heatmapStats.filter(entry => entry.key !== options.key),
    ].slice(0, MAX_HEATMAP_STATS_PER_REPO)

    this.reorderAndTrimRepositories()
    this.dirty = true
  }

  public async getDailyHistory(repoPath: string): Promise<GitWorklogCachedDailyHistory | null> {
    await this.ensureLoaded()
    const repository = this.findRepository(repoPath)
    if (!repository?.dailyHistory) {
      return null
    }

    return repository.dailyHistory
  }

  public async saveDailyHistory(options: {
    repoPath: string
    refsSnapshot: GitWorklogRefSnapshotEntry[]
    dailyPoints: Array<
      GitWorklogDailyPointDto & {
        files: string[]
      }
    >
    builtAt?: string
  }): Promise<void> {
    await this.ensureLoaded()
    const repository = this.getOrCreateRepository(options.repoPath)
    const now = new Date().toISOString()
    repository.dailyHistory = {
      refsSnapshot: normalizeRefsSnapshot(options.refsSnapshot),
      dailyPoints: options.dailyPoints
        .map(item => {
          const point = normalizeDailyPoint(item)
          if (!point) {
            return null
          }

          return {
            ...point,
            files: item.files
              .filter(file => typeof file === 'string')
              .map(file => file.trim())
              .filter(file => file.length > 0)
              .sort((left, right) => left.localeCompare(right)),
          }
        })
        .filter(
          (
            point,
          ): point is GitWorklogDailyPointDto & {
            files: string[]
          } => point !== null,
        )
        .sort((left, right) => left.day.localeCompare(right.day)),
      builtAt: normalizeIsoDate(options.builtAt, now),
      updatedAt: now,
    }

    this.reorderAndTrimRepositories()
    this.dirty = true
  }

  public async exportForSync(): Promise<GitWorklogHistorySyncPayload> {
    await this.ensureLoaded()
    return {
      formatVersion: STORE_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      repositories: this.state.repositories,
    }
  }

  public async importForSync(payload: GitWorklogHistorySyncPayload): Promise<void> {
    await this.ensureLoaded()
    this.state = normalizePersistedState(payload)
    this.dirty = true
    await this.flush()
  }

  public async flush(): Promise<void> {
    await this.ensureLoaded()
    if (!this.dirty) {
      return
    }

    this.flushPromise = this.flushPromise.then(async () => {
      if (!this.dirty) {
        return
      }

      await mkdir(dirname(this.filePath), { recursive: true })
      const payload: GitWorklogHistorySyncPayload = {
        formatVersion: STORE_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        repositories: this.state.repositories,
      }
      await writeFile(this.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
      this.dirty = false
    })

    await this.flushPromise
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadState()
    }

    await this.loadPromise
  }

  private async loadState(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf8')
      this.state = normalizePersistedState(JSON.parse(content))
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        this.state = createEmptyState()
        return
      }

      this.state = createEmptyState()
    }
  }

  private getOrCreateRepository(repoPath: string): GitWorklogRepositoryCacheEntry {
    const normalizedRepoPath = normalizePathForCompare(repoPath)
    const existing = this.state.repositories.find(entry => entry.repoPath === normalizedRepoPath)
    if (existing) {
      return existing
    }

    const next: GitWorklogRepositoryCacheEntry = {
      repoPath: normalizedRepoPath,
      rangeStats: [],
      codeStats: [],
      heatmapStats: [],
      dailyHistory: null,
    }
    this.state.repositories.push(next)
    return next
  }

  private findRepository(repoPath: string): GitWorklogRepositoryCacheEntry | null {
    const normalizedRepoPath = normalizePathForCompare(repoPath)
    return this.state.repositories.find(entry => entry.repoPath === normalizedRepoPath) ?? null
  }

  private reorderAndTrimRepositories(): void {
    this.state.repositories = this.state.repositories
      .sort((left, right) =>
        computeRepositoryLatestTimestamp(right).localeCompare(
          computeRepositoryLatestTimestamp(left),
        ),
      )
      .slice(0, MAX_REPOSITORIES)
  }
}
