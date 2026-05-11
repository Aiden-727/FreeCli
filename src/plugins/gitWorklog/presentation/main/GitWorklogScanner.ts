import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import type {
  GitWorklogDailyPointDto,
  GitWorklogErrorDto,
  GitWorklogRepoStateDto,
  GitWorklogRepositoryDto,
  GitWorklogSettingsDto,
} from '@shared/contracts/dto'
import {
  buildGitWorklogCodeCacheKey,
  buildGitWorklogHeatmapCacheKey,
  buildGitWorklogRangeCacheKey,
  type GitWorklogCachedDailyHistory,
  type GitWorklogCodeCacheValidation,
  type GitWorklogRefSnapshotEntry,
  type GitWorklogHeatmapCacheValidation,
  type GitWorklogHistoryStore,
  type GitWorklogRangeCacheValidation,
} from '../../infrastructure/main/GitWorklogHistoryStore'

const execFileAsync = promisify(execFile)
const GIT_EXEC_MAX_BUFFER = 64 * 1024 * 1024
const COMMIT_PREFIX = '__COMMIT__'
const CODE_EXTENSIONS = new Set([
  'dart',
  'java',
  'kt',
  'kts',
  'go',
  'rs',
  'py',
  'js',
  'jsx',
  'ts',
  'tsx',
  'vue',
  'php',
  'rb',
  'swift',
  'm',
  'mm',
  'c',
  'h',
  'cc',
  'hh',
  'cpp',
  'hpp',
  'cs',
  'json',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'css',
  'scss',
  'less',
  'sql',
  'sh',
  'ps1',
  'bat',
  'cmd',
  'gradle',
  'properties',
  'lock',
])
const CODE_FILE_NAMES = new Set([
  'dockerfile',
  'makefile',
  'cmakelists.txt',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradlew',
  'gradlew.bat',
])
const TRACKABLE_CODE_PATH_SKIP_SEGMENTS = [
  '.git/',
  '.dart_tool/',
  'node_modules/',
  '.npm/',
  '.pnpm/',
  '.yarn/',
  '.cache/',
  '.turbo/',
  '.next/',
  '.nuxt/',
  '.svelte-kit/',
  '.parcel-cache/',
  '__pycache__/',
  '.venv/',
  'venv/',
  'env/',
  'build/',
  'dist/',
  'coverage/',
  'out/',
  'target/',
  'vendor/',
  'ios/pods/',
]
const TRACKABLE_CODE_FILE_SKIP_NAMES = new Set([
  '.npmrc',
  '.yarnrc',
  '.yarnrc.yml',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'cargo.lock',
  'composer.lock',
  'podfile.lock',
  'pubspec.lock',
])

export interface RepoRangeStats {
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

export interface RepoCodeStats {
  totalCodeFiles: number
  totalCodeLines: number
}

export interface RepoHeatmapStats {
  dailyPoints: GitWorklogDailyPointDto[]
}

interface ResolvedRange {
  from: Date | null
  until: Date | null
  todayKey: string
  dayKeys: string[]
}

interface MutableAggregate {
  commitCount: number
  additions: number
  deletions: number
  files: Set<string>
}

interface CommitScanAggregate {
  dayBuckets: Map<string, MutableAggregate>
}

interface CommitLogScanOptions {
  authorFilter: string
  since?: string[]
  until?: string[]
  excludeOids?: string[]
}

type DailyHistoryPoint = GitWorklogCachedDailyHistory['dailyPoints'][number]

type GitCommandResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; error: GitWorklogErrorDto }

function createError(
  type: GitWorklogErrorDto['type'],
  message: string,
  detail: string | null = null,
): GitWorklogErrorDto {
  return { type, message, detail }
}

function dayKey(value: Date): string {
  const year = `${value.getFullYear()}`.padStart(4, '0')
  const month = `${value.getMonth() + 1}`.padStart(2, '0')
  const day = `${value.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDayLabel(value: string): string {
  const parsed = parseDayKey(value)
  if (!parsed) {
    return value
  }

  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${month}/${day}`
}

function parseDayKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function endOfDay(value: Date): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
    23,
    59,
    59,
    999,
  )
}

function buildDayKeys(from: Date, until: Date): string[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const end = new Date(until.getFullYear(), until.getMonth(), until.getDate())
  const keys: string[] = []

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    keys.push(dayKey(cursor))
  }

  return keys
}

function resolveRange(settings: GitWorklogSettingsDto): ResolvedRange {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (settings.rangeMode === 'date_range') {
    const start = parseDayKey(settings.rangeStartDay)
    const end = parseDayKey(settings.rangeEndDay)
    if (start && end) {
      const normalizedStart = start <= end ? start : end
      const normalizedEnd = start <= end ? end : start
      return {
        from: normalizedStart,
        until: endOfDay(normalizedEnd),
        todayKey: dayKey(today),
        dayKeys: buildDayKeys(normalizedStart, normalizedEnd),
      }
    }
  }

  const recentDays = Math.max(1, settings.recentDays)
  const from = new Date(today)
  from.setDate(from.getDate() - (recentDays - 1))
  return {
    from,
    until: endOfDay(today),
    todayKey: dayKey(today),
    dayKeys: buildDayKeys(from, today),
  }
}

function parseNumstatValue(raw: string): number {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed === '-') {
    return 0
  }

  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function createMutableAggregate(): MutableAggregate {
  return {
    commitCount: 0,
    additions: 0,
    deletions: 0,
    files: new Set<string>(),
  }
}

function cloneDailyPoint(point: GitWorklogDailyPointDto): GitWorklogDailyPointDto {
  return {
    day: point.day,
    label: point.label,
    commitCount: point.commitCount,
    filesChanged: point.filesChanged,
    additions: point.additions,
    deletions: point.deletions,
    changedLines: point.changedLines,
  }
}

function buildDailyPoint(day: string, aggregate: MutableAggregate): GitWorklogDailyPointDto {
  return {
    day,
    label: formatDayLabel(day),
    commitCount: aggregate.commitCount,
    filesChanged: aggregate.files.size,
    additions: aggregate.additions,
    deletions: aggregate.deletions,
    changedLines: aggregate.additions + aggregate.deletions,
  }
}

function aggregateToDailyPoints(dayBuckets: Map<string, MutableAggregate>): DailyHistoryPoint[] {
  return [...dayBuckets.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([day, aggregate]) => ({
      ...buildDailyPoint(day, aggregate),
      files: [...aggregate.files].sort((left, right) => left.localeCompare(right)),
    }))
}

function mergeDailyPoints(
  base: DailyHistoryPoint[],
  appended: DailyHistoryPoint[],
): DailyHistoryPoint[] {
  const merged = new Map<string, MutableAggregate>()

  for (const point of base) {
    const bucket = createMutableAggregate()
    bucket.commitCount = point.commitCount
    bucket.additions = point.additions
    bucket.deletions = point.deletions
    bucket.files = new Set(point.files)
    merged.set(point.day, bucket)
  }

  for (const point of appended) {
    const bucket = merged.get(point.day) ?? createMutableAggregate()
    bucket.commitCount += point.commitCount
    bucket.additions += point.additions
    bucket.deletions += point.deletions
    point.files.forEach(file => bucket.files.add(file))
    merged.set(point.day, bucket)
  }

  return aggregateToDailyPoints(merged)
}

function buildRangeStatsFromDailyHistory(
  historyPoints: DailyHistoryPoint[],
  range: ResolvedRange,
): RepoRangeStats {
  const pointsByDay = new Map(historyPoints.map(point => [point.day, point]))
  const inRange = createMutableAggregate()
  const today = createMutableAggregate()

  for (const day of range.dayKeys) {
    const point = pointsByDay.get(day)
    if (!point) {
      continue
    }

    inRange.commitCount += point.commitCount
    inRange.additions += point.additions
    inRange.deletions += point.deletions
    point.files.forEach(file => inRange.files.add(file))

    if (day === range.todayKey) {
      today.commitCount += point.commitCount
      today.additions += point.additions
      today.deletions += point.deletions
      today.files = new Set(point.files)
    }
  }

  return {
    commitCountToday: today.commitCount,
    filesChangedToday: today.files.size,
    additionsToday: today.additions,
    deletionsToday: today.deletions,
    changedLinesToday: today.additions + today.deletions,
    netLinesToday: today.additions - today.deletions,
    commitCountInRange: inRange.commitCount,
    filesChangedInRange: inRange.files.size,
    additionsInRange: inRange.additions,
    deletionsInRange: inRange.deletions,
    changedLinesInRange: inRange.additions + inRange.deletions,
    dailyPoints: range.dayKeys.map(day => {
      const point = pointsByDay.get(day)
      return point
        ? cloneDailyPoint(point)
        : {
            day,
            label: formatDayLabel(day),
            commitCount: 0,
            filesChanged: 0,
            additions: 0,
            deletions: 0,
            changedLines: 0,
          }
    }),
  }
}

export function isTrackableGitWorklogFilePath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/').toLowerCase()
  for (const skip of TRACKABLE_CODE_PATH_SKIP_SEGMENTS) {
    if (normalized.includes(skip)) {
      return false
    }
  }

  const fileName = normalized.split('/').at(-1)
  if (!fileName) {
    return false
  }

  if (TRACKABLE_CODE_FILE_SKIP_NAMES.has(fileName)) {
    return false
  }

  if (fileName.startsWith('.env')) {
    return false
  }

  if (CODE_FILE_NAMES.has(fileName)) {
    return true
  }

  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex >= fileName.length - 1) {
    return false
  }

  return CODE_EXTENSIONS.has(fileName.slice(dotIndex + 1))
}

async function countTextFileLines(filePath: string): Promise<number | null> {
  try {
    const input = fs.createReadStream(filePath, { encoding: 'utf8' })
    const reader = createInterface({ input, crlfDelay: Infinity })
    let count = 0
    for await (const _line of reader) {
      count += 1
    }
    return count
  } catch {
    return null
  }
}

function createEmptyRepoState(
  repo: GitWorklogRepositoryDto,
  scannedAt: string | null,
  error: GitWorklogErrorDto | null = null,
): GitWorklogRepoStateDto {
  return {
    repoId: repo.id,
    label: repo.label,
    path: repo.path,
    origin: 'manual',
    parentWorkspaceId: null,
    parentWorkspaceName: null,
    parentWorkspacePath: null,
    commitCountToday: 0,
    filesChangedToday: 0,
    additionsToday: 0,
    deletionsToday: 0,
    changedLinesToday: 0,
    netLinesToday: 0,
    commitCountInRange: 0,
    filesChangedInRange: 0,
    additionsInRange: 0,
    deletionsInRange: 0,
    changedLinesInRange: 0,
    totalCodeFiles: 0,
    totalCodeLines: 0,
    dailyPoints: [],
    heatmapDailyPoints: [],
    lastScannedAt: scannedAt,
    error,
  }
}

export class GitWorklogScanner {
  private readonly historyStore: GitWorklogHistoryStore | null

  public constructor(options: { historyStore?: GitWorklogHistoryStore | null } = {}) {
    this.historyStore = options.historyStore ?? null
  }

  public async scan(
    settings: GitWorklogSettingsDto,
    repositories: GitWorklogRepositoryDto[],
  ): Promise<GitWorklogRepoStateDto[]> {
    const range = resolveRange(settings)
    const scannedAt = new Date().toISOString()
    try {
      const repoStates = await Promise.all(
        repositories.map(async repo => await this.scanRepository(settings, repo, range, scannedAt)),
      )

      return repoStates.sort((left, right) => left.label.localeCompare(right.label))
    } finally {
      await this.historyStore?.flush()
    }
  }

  public async resolveRepositoryRoot(
    candidatePath: string,
  ): Promise<{ ok: true; path: string; label: string } | { ok: false; error: GitWorklogErrorDto }> {
    const repoPath = candidatePath.trim()
    if (repoPath.length === 0) {
      return {
        ok: false,
        error: createError('invalid_path', '仓库路径为空'),
      }
    }

    try {
      const stat = await fs.promises.stat(repoPath)
      if (!stat.isDirectory()) {
        return {
          ok: false,
          error: createError('invalid_path', '仓库路径不是文件夹'),
        }
      }
    } catch (error) {
      return {
        ok: false,
        error: createError('invalid_path', '仓库路径不存在', this.toDetail(error)),
      }
    }

    const topLevel = await this.runGitCommand(
      ['-C', repoPath, 'rev-parse', '--show-toplevel'],
      '校验 Git 仓库失败',
    )
    if (!topLevel.ok) {
      return { ok: false, error: topLevel.error }
    }

    const resolvedPath = resolve(topLevel.stdout.trim())
    const label = resolvedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? resolvedPath
    return {
      ok: true,
      path: resolvedPath,
      label,
    }
  }

  private async scanRepository(
    settings: GitWorklogSettingsDto,
    repo: GitWorklogRepositoryDto,
    range: ResolvedRange,
    scannedAt: string,
  ): Promise<GitWorklogRepoStateDto> {
    const repoPath = repo.path.trim()
    if (repoPath.length === 0) {
      return createEmptyRepoState(repo, scannedAt, createError('invalid_path', '仓库路径为空'))
    }

    try {
      const stat = await fs.promises.stat(repoPath)
      if (!stat.isDirectory()) {
        return createEmptyRepoState(
          repo,
          scannedAt,
          createError('invalid_path', '仓库路径不是文件夹'),
        )
      }
    } catch (error) {
      return createEmptyRepoState(
        repo,
        scannedAt,
        createError('invalid_path', '仓库路径不存在', this.toDetail(error)),
      )
    }

    const repoCheck = await this.runGitCommand(
      ['-C', repoPath, 'rev-parse', '--is-inside-work-tree'],
      '校验 Git 仓库失败',
    )
    if (!repoCheck.ok) {
      return createEmptyRepoState(repo, scannedAt, repoCheck.error)
    }

    if (repoCheck.stdout.trim().toLowerCase() !== 'true') {
      return createEmptyRepoState(repo, scannedAt, createError('not_git_repo', '不是有效的 Git 仓库'))
    }

    const [rangeStats, codeStats, heatmapStats] = await Promise.all([
      this.scanRangeStats(repoPath, settings.authorFilter, range),
      this.scanCodeStats(repoPath),
      this.scanHeatmapStats(repoPath, settings.authorFilter),
    ])

    if ('error' in rangeStats) {
      return createEmptyRepoState(repo, scannedAt, rangeStats.error)
    }

    if ('error' in codeStats) {
      return createEmptyRepoState(repo, scannedAt, codeStats.error)
    }

    return {
      repoId: repo.id,
      label: repo.label,
      path: repo.path,
      origin: 'manual',
      parentWorkspaceId: null,
      parentWorkspaceName: null,
      parentWorkspacePath: null,
      lastScannedAt: scannedAt,
      error: null,
      ...rangeStats,
      ...codeStats,
      heatmapDailyPoints:
        'error' in heatmapStats ? rangeStats.dailyPoints : heatmapStats.dailyPoints,
    }
  }

  private async scanRangeStats(
    repoPath: string,
    authorFilter: string,
    range: ResolvedRange,
  ): Promise<RepoRangeStats | { error: GitWorklogErrorDto }> {
    if (authorFilter.trim().length === 0 && this.historyStore) {
      const history = await this.ensureDailyHistory(repoPath)
      if ('error' in history) {
        return { error: history.error }
      }

      return buildRangeStatsFromDailyHistory(history.dailyPoints, range)
    }

    const rangeValidation = await this.buildRangeCacheValidation(repoPath, authorFilter, range)
    if (rangeValidation && this.historyStore) {
      const key = buildGitWorklogRangeCacheKey(rangeValidation)
      const cached = await this.historyStore.getRangeStats(repoPath, key)
      if (cached) {
        return cached
      }
    }

    const args = [
      '-C',
      repoPath,
      'log',
      '--all',
      '--no-merges',
      '--date=iso-strict',
      `--pretty=format:${COMMIT_PREFIX}%H%x09%ad`,
      '--numstat',
    ]

    if (range.from) {
      args.push(`--since=${range.from.toISOString()}`)
    }
    if (range.until) {
      args.push(`--until=${range.until.toISOString()}`)
    }
    if (authorFilter.trim().length > 0) {
      args.push(`--author=${authorFilter.trim()}`)
    }

    const result = await this.runGitCommand(args, '读取 Git 提交记录失败')
    if (!result.ok) {
      return { error: result.error }
    }

    const inRange: MutableAggregate = {
      commitCount: 0,
      additions: 0,
      deletions: 0,
      files: new Set<string>(),
    }
    const today: MutableAggregate = {
      commitCount: 0,
      additions: 0,
      deletions: 0,
      files: new Set<string>(),
    }
    const dayBuckets = new Map<string, MutableAggregate>(
      range.dayKeys.map(day => [
        day,
        {
          commitCount: 0,
          additions: 0,
          deletions: 0,
          files: new Set<string>(),
        } satisfies MutableAggregate,
      ]),
    )

    let commitTime: Date | null = null
    let commitAdditions = 0
    let commitDeletions = 0
    let commitFiles = new Set<string>()

    const flushCommit = (): void => {
      if (!commitTime) {
        return
      }

      inRange.commitCount += 1
      inRange.additions += commitAdditions
      inRange.deletions += commitDeletions
      commitFiles.forEach(file => {
        inRange.files.add(file)
      })

      const commitDayKey = dayKey(commitTime)
      const bucket = dayBuckets.get(commitDayKey)
      if (bucket) {
        bucket.commitCount += 1
        bucket.additions += commitAdditions
        bucket.deletions += commitDeletions
        commitFiles.forEach(file => {
          bucket.files.add(file)
        })
      }

      if (commitDayKey === range.todayKey) {
        today.commitCount += 1
        today.additions += commitAdditions
        today.deletions += commitDeletions
        commitFiles.forEach(file => {
          today.files.add(file)
        })
      }
    }

    for (const rawLine of result.stdout.split(/\r?\n/)) {
      const line = rawLine.trimEnd()
      if (line.length === 0) {
        continue
      }

      if (line.startsWith(COMMIT_PREFIX)) {
        flushCommit()
        commitTime = this.parseCommitTime(line)
        commitAdditions = 0
        commitDeletions = 0
        commitFiles = new Set<string>()
        continue
      }

      if (!commitTime) {
        continue
      }

      const parts = line.split('\t')
      if (parts.length < 3) {
        continue
      }

      const filePath = parts.slice(2).join('\t').trim()
      if (filePath.length === 0) {
        continue
      }

      if (!isTrackableGitWorklogFilePath(filePath)) {
        continue
      }

      commitAdditions += parseNumstatValue(parts[0] ?? '')
      commitDeletions += parseNumstatValue(parts[1] ?? '')
      commitFiles.add(filePath)
    }

    flushCommit()

    const computed: RepoRangeStats = {
      commitCountToday: today.commitCount,
      filesChangedToday: today.files.size,
      additionsToday: today.additions,
      deletionsToday: today.deletions,
      changedLinesToday: today.additions + today.deletions,
      netLinesToday: today.additions - today.deletions,
      commitCountInRange: inRange.commitCount,
      filesChangedInRange: inRange.files.size,
      additionsInRange: inRange.additions,
      deletionsInRange: inRange.deletions,
      changedLinesInRange: inRange.additions + inRange.deletions,
      dailyPoints: range.dayKeys.map(day => {
        const bucket = dayBuckets.get(day)
        return {
          day,
          label: formatDayLabel(day),
          commitCount: bucket?.commitCount ?? 0,
          filesChanged: bucket?.files.size ?? 0,
          additions: bucket?.additions ?? 0,
          deletions: bucket?.deletions ?? 0,
          changedLines: (bucket?.additions ?? 0) + (bucket?.deletions ?? 0),
        }
      }),
    }

    if (rangeValidation && this.historyStore) {
      await this.historyStore.saveRangeStats({
        repoPath,
        key: buildGitWorklogRangeCacheKey(rangeValidation),
        validation: rangeValidation,
        stats: computed,
      })
    }

    return computed
  }

  private async scanCodeStats(
    repoPath: string,
  ): Promise<RepoCodeStats | { error: GitWorklogErrorDto }> {
    const result = await this.runGitCommand(['-C', repoPath, 'ls-files'], '读取仓库文件失败')
    if (!result.ok) {
      return { error: result.error }
    }

    const relativePaths = result.stdout
      .split(/\r?\n/)
      .map(value => value.trim())
      .filter(value => value.length > 0)
      .filter(isTrackableGitWorklogFilePath)

    const codeValidation = await this.buildCodeCacheValidation(repoPath, result.stdout)
    if (codeValidation && this.historyStore) {
      const key = buildGitWorklogCodeCacheKey(codeValidation)
      const cached = await this.historyStore.getCodeStats(repoPath, key)
      if (cached) {
        return cached
      }
    }

    let totalCodeFiles = 0
    let totalCodeLines = 0
    for (const relativePath of relativePaths) {
      const normalizedPath = relativePath.replaceAll('/', process.platform === 'win32' ? '\\' : '/')
      const absolutePath = resolve(repoPath, normalizedPath)
      const lineCount = await countTextFileLines(absolutePath)
      if (lineCount === null) {
        continue
      }

      totalCodeFiles += 1
      totalCodeLines += lineCount
    }

    const computed: RepoCodeStats = {
      totalCodeFiles,
      totalCodeLines,
    }

    if (codeValidation && this.historyStore) {
      await this.historyStore.saveCodeStats({
        repoPath,
        key: buildGitWorklogCodeCacheKey(codeValidation),
        validation: codeValidation,
        stats: computed,
      })
    }

    return computed
  }

  private async scanHeatmapStats(
    repoPath: string,
    authorFilter: string,
  ): Promise<RepoHeatmapStats | { error: GitWorklogErrorDto }> {
    if (authorFilter.trim().length === 0 && this.historyStore) {
      const history = await this.ensureDailyHistory(repoPath)
      if ('error' in history) {
        return { error: history.error }
      }

      return {
        dailyPoints: history.dailyPoints.map(point => cloneDailyPoint(point)),
      }
    }

    const heatmapValidation = await this.buildHeatmapCacheValidation(repoPath, authorFilter)
    if (heatmapValidation && this.historyStore) {
      const key = buildGitWorklogHeatmapCacheKey(heatmapValidation)
      const cached = await this.historyStore.getHeatmapStats(repoPath, key)
      if (cached) {
        return cached
      }
    }

    const args = [
      '-C',
      repoPath,
      'log',
      '--all',
      '--no-merges',
      '--date=iso-strict',
      `--pretty=format:${COMMIT_PREFIX}%H%x09%ad`,
      '--numstat',
    ]

    if (authorFilter.trim().length > 0) {
      args.push(`--author=${authorFilter.trim()}`)
    }

    const result = await this.runGitCommand(args, '读取 Git 热力图历史失败')
    if (!result.ok) {
      return { error: result.error }
    }

    const dayBuckets = new Map<string, MutableAggregate>()
    let commitTime: Date | null = null
    let commitAdditions = 0
    let commitDeletions = 0
    let commitFiles = new Set<string>()

    const flushCommit = (): void => {
      if (!commitTime) {
        return
      }

      const commitDayKey = dayKey(commitTime)
      const bucket =
        dayBuckets.get(commitDayKey) ??
        ({
          commitCount: 0,
          additions: 0,
          deletions: 0,
          files: new Set<string>(),
        } satisfies MutableAggregate)

      bucket.commitCount += 1
      bucket.additions += commitAdditions
      bucket.deletions += commitDeletions
      commitFiles.forEach(file => {
        bucket.files.add(file)
      })
      dayBuckets.set(commitDayKey, bucket)
    }

    for (const rawLine of result.stdout.split(/\r?\n/)) {
      const line = rawLine.trimEnd()
      if (line.length === 0) {
        continue
      }

      if (line.startsWith(COMMIT_PREFIX)) {
        flushCommit()
        commitTime = this.parseCommitTime(line)
        commitAdditions = 0
        commitDeletions = 0
        commitFiles = new Set<string>()
        continue
      }

      if (!commitTime) {
        continue
      }

      const parts = line.split('\t')
      if (parts.length < 3) {
        continue
      }

      const filePath = parts.slice(2).join('\t').trim()
      if (filePath.length === 0) {
        continue
      }

      if (!isTrackableGitWorklogFilePath(filePath)) {
        continue
      }

      commitAdditions += parseNumstatValue(parts[0] ?? '')
      commitDeletions += parseNumstatValue(parts[1] ?? '')
      commitFiles.add(filePath)
    }

    flushCommit()

    const computed: RepoHeatmapStats = {
      dailyPoints: [...dayBuckets.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([day, bucket]) => ({
          day,
          label: formatDayLabel(day),
          commitCount: bucket.commitCount,
          filesChanged: bucket.files.size,
          additions: bucket.additions,
          deletions: bucket.deletions,
          changedLines: bucket.additions + bucket.deletions,
        })),
    }

    if (heatmapValidation && this.historyStore) {
      await this.historyStore.saveHeatmapStats({
        repoPath,
        key: buildGitWorklogHeatmapCacheKey(heatmapValidation),
        validation: heatmapValidation,
        stats: computed,
      })
    }

    return computed
  }

  private async buildRangeCacheValidation(
    repoPath: string,
    authorFilter: string,
    range: ResolvedRange,
  ): Promise<GitWorklogRangeCacheValidation | null> {
    const refs = await this.runGitCommand(['-C', repoPath, 'show-ref'], '读取仓库引用失败')
    if (!refs.ok) {
      return null
    }

    return {
      authorFilter: authorFilter.trim(),
      from: range.from?.toISOString() ?? null,
      until: range.until?.toISOString() ?? null,
      refsFingerprint: this.hashContent(refs.stdout),
    }
  }

  private async buildCodeCacheValidation(
    repoPath: string,
    trackedFilesSnapshot: string,
  ): Promise<GitWorklogCodeCacheValidation | null> {
    const status = await this.runGitCommand(
      ['-C', repoPath, 'status', '--porcelain', '--untracked-files=no'],
      '读取仓库状态失败',
    )
    if (!status.ok) {
      return null
    }

    return {
      fileFingerprint: this.hashContent(`${trackedFilesSnapshot}\n---\n${status.stdout}`),
    }
  }

  private async buildHeatmapCacheValidation(
    repoPath: string,
    authorFilter: string,
  ): Promise<GitWorklogHeatmapCacheValidation | null> {
    const refs = await this.runGitCommand(['-C', repoPath, 'show-ref'], '读取仓库引用失败')
    if (!refs.ok) {
      return null
    }

    return {
      authorFilter: authorFilter.trim(),
      refsFingerprint: this.hashContent(refs.stdout),
    }
  }

  private hashContent(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex')
  }

  private async ensureDailyHistory(
    repoPath: string,
  ): Promise<GitWorklogCachedDailyHistory | { error: GitWorklogErrorDto }> {
    const currentRefs = await this.readRefsSnapshot(repoPath)
    if ('error' in currentRefs) {
      return { error: currentRefs.error }
    }

    const cached = await this.historyStore?.getDailyHistory(repoPath)
    if (!cached || cached.refsSnapshot.length === 0) {
      return await this.rebuildDailyHistory(repoPath, currentRefs)
    }

    const canAppend = await this.canAppendIncrementally(repoPath, cached.refsSnapshot, currentRefs)
    if (!canAppend.ok) {
      return await this.rebuildDailyHistory(repoPath, currentRefs)
    }

    if (!canAppend.hasNewCommits) {
      return cached
    }

    const appended = await this.scanCommitDailyHistory(repoPath, {
      authorFilter: '',
      excludeOids: cached.refsSnapshot.map(entry => entry.oid),
    })
    if ('error' in appended) {
      return { error: appended.error }
    }

    const mergedPoints = mergeDailyPoints(cached.dailyPoints, appended.dailyPoints)
    await this.historyStore?.saveDailyHistory({
      repoPath,
      refsSnapshot: currentRefs,
      dailyPoints: mergedPoints,
      builtAt: cached.builtAt,
    })

    return (await this.historyStore?.getDailyHistory(repoPath)) ?? {
      refsSnapshot: currentRefs,
      dailyPoints: mergedPoints,
      builtAt: cached.builtAt,
      updatedAt: new Date().toISOString(),
    }
  }

  private async rebuildDailyHistory(
    repoPath: string,
    refsSnapshot: GitWorklogRefSnapshotEntry[],
  ): Promise<GitWorklogCachedDailyHistory | { error: GitWorklogErrorDto }> {
    const scanned = await this.scanCommitDailyHistory(repoPath, {
      authorFilter: '',
    })
    if ('error' in scanned) {
      return { error: scanned.error }
    }

    await this.historyStore?.saveDailyHistory({
      repoPath,
      refsSnapshot,
      dailyPoints: scanned.dailyPoints,
    })

    return (await this.historyStore?.getDailyHistory(repoPath)) ?? {
      refsSnapshot,
      dailyPoints: scanned.dailyPoints,
      builtAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  private async scanCommitDailyHistory(
    repoPath: string,
    options: CommitLogScanOptions,
  ): Promise<{ dailyPoints: DailyHistoryPoint[] } | { error: GitWorklogErrorDto }> {
    const args = [
      '-C',
      repoPath,
      'log',
      '--all',
      '--no-merges',
      '--date=iso-strict',
      `--pretty=format:${COMMIT_PREFIX}%H%x09%ad`,
      '--numstat',
    ]

    for (const sinceArg of options.since ?? []) {
      args.push(sinceArg)
    }
    for (const untilArg of options.until ?? []) {
      args.push(untilArg)
    }
    if (options.authorFilter.trim().length > 0) {
      args.push(`--author=${options.authorFilter.trim()}`)
    }
    for (const excluded of options.excludeOids ?? []) {
      args.push(`^${excluded}`)
    }

    const result = await this.runGitCommand(args, '读取 Git 提交记录失败')
    if (!result.ok) {
      return { error: result.error }
    }

    const scanned = this.parseCommitLogOutput(result.stdout)
    return {
      dailyPoints: aggregateToDailyPoints(scanned.dayBuckets),
    }
  }

  private parseCommitLogOutput(stdout: string): CommitScanAggregate {
    const dayBuckets = new Map<string, MutableAggregate>()
    let commitTime: Date | null = null
    let commitAdditions = 0
    let commitDeletions = 0
    let commitFiles = new Set<string>()

    const flushCommit = (): void => {
      if (!commitTime) {
        return
      }

      const commitDayKey = dayKey(commitTime)
      const bucket = dayBuckets.get(commitDayKey) ?? createMutableAggregate()
      bucket.commitCount += 1
      bucket.additions += commitAdditions
      bucket.deletions += commitDeletions
      commitFiles.forEach(file => bucket.files.add(file))
      dayBuckets.set(commitDayKey, bucket)
    }

    for (const rawLine of stdout.split(/\r?\n/)) {
      const line = rawLine.trimEnd()
      if (line.length === 0) {
        continue
      }

      if (line.startsWith(COMMIT_PREFIX)) {
        flushCommit()
        commitTime = this.parseCommitTime(line)
        commitAdditions = 0
        commitDeletions = 0
        commitFiles = new Set<string>()
        continue
      }

      if (!commitTime) {
        continue
      }

      const parts = line.split('\t')
      if (parts.length < 3) {
        continue
      }

      const filePath = parts.slice(2).join('\t').trim()
      if (filePath.length === 0 || !isTrackableGitWorklogFilePath(filePath)) {
        continue
      }

      commitAdditions += parseNumstatValue(parts[0] ?? '')
      commitDeletions += parseNumstatValue(parts[1] ?? '')
      commitFiles.add(filePath)
    }

    flushCommit()
    return { dayBuckets }
  }

  private async readRefsSnapshot(
    repoPath: string,
  ): Promise<GitWorklogRefSnapshotEntry[] | { error: GitWorklogErrorDto }> {
    const refs = await this.runGitCommand(['-C', repoPath, 'show-ref'], '读取仓库引用失败')
    if (!refs.ok) {
      return { error: refs.error }
    }

    return refs.stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const [oid, refName] = line.split(' ')
        return {
          oid: oid?.trim() ?? '',
          refName: refName?.trim() ?? '',
        }
      })
      .filter(entry => entry.oid.length > 0 && entry.refName.length > 0)
      .sort((left, right) => left.refName.localeCompare(right.refName))
  }

  private async canAppendIncrementally(
    repoPath: string,
    previousRefs: GitWorklogRefSnapshotEntry[],
    currentRefs: GitWorklogRefSnapshotEntry[],
  ): Promise<{ ok: true; hasNewCommits: boolean } | { ok: false }> {
    const currentByRef = new Map(currentRefs.map(entry => [entry.refName, entry.oid]))
    let hasNewCommits = currentRefs.length !== previousRefs.length

    for (const previous of previousRefs) {
      const currentOid = currentByRef.get(previous.refName)
      if (!currentOid) {
        return { ok: false }
      }

      if (currentOid !== previous.oid) {
        hasNewCommits = true
        const result = await this.runGitCommand(
          ['-C', repoPath, 'merge-base', '--is-ancestor', previous.oid, currentOid],
          '校验 Git 增量历史失败',
        )
        if (!result.ok) {
          return { ok: false }
        }
      }
    }

    return {
      ok: true,
      hasNewCommits,
    }
  }

  private parseCommitTime(line: string): Date | null {
    const payload = line.slice(COMMIT_PREFIX.length)
    const parts = payload.split('\t')
    const parsed = new Date(parts[1] ?? '')
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  private async runGitCommand(args: string[], failureMessage: string): Promise<GitCommandResult> {
    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        windowsHide: true,
        maxBuffer: GIT_EXEC_MAX_BUFFER,
      })
      return {
        ok: true,
        stdout: `${stdout ?? ''}`,
        stderr: `${stderr ?? ''}`,
      }
    } catch (error) {
      const detail = this.toDetail(error)
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return {
          ok: false,
          error: createError('git_unavailable', '本机未安装 Git 或 Git 不在 PATH 中', detail),
        }
      }

      const stderr =
        error && typeof error === 'object' && 'stderr' in error ? `${error.stderr ?? ''}`.trim() : ''
      return {
        ok: false,
        error: createError('command_failed', stderr || failureMessage, detail),
      }
    }
  }

  private toDetail(error: unknown): string | null {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message
    }

    return typeof error === 'string' && error.trim().length > 0 ? error : null
  }
}
