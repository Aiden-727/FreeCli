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
  buildGitWorklogRangeCacheKey,
  type GitWorklogCodeCacheValidation,
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

    const [rangeStats, codeStats] = await Promise.all([
      this.scanRangeStats(repoPath, settings.authorFilter, range),
      this.scanCodeStats(repoPath),
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
    }
  }

  private async scanRangeStats(
    repoPath: string,
    authorFilter: string,
    range: ResolvedRange,
  ): Promise<RepoRangeStats | { error: GitWorklogErrorDto }> {
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

  private hashContent(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex')
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
