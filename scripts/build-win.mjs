import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const PNPM_COMMAND = 'pnpm'
const ELECTRON_BUILDER_BASE_ARGS = ['exec', 'electron-builder', '--win', '--publish', 'never']
const ELECTRON_BUILDER_DIR_ARGS = [
  'exec',
  'electron-builder',
  '--win',
  '--dir',
  '--publish',
  'never',
  '--config.win.signAndEditExecutable=false',
]
const ELECTRON_BUILDER_PREPACKAGED_ARGS = [
  'exec',
  'electron-builder',
  '--win',
  'nsis',
  '--publish',
  'never',
  '--prepackaged',
  'dist/win-unpacked',
  '--config.win.signAndEditExecutable=false',
]

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    shell: process.platform === 'win32',
    encoding: 'utf8',
    ...options,
  })

  if (result.error) {
    const message = `[build:win] 无法执行命令: ${command} ${args.join(' ')}\n${result.error.message}\n`
    process.stderr.write(message)
    process.exit(1)
  }

  return result
}

function runPnpm(args, options = {}) {
  return run(PNPM_COMMAND, args, options)
}

function exitWithResult(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout)
  }
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }
  process.exit(result.status ?? 1)
}

function assertSuccess(stepArgs) {
  const result = runPnpm(stepArgs, { stdio: 'inherit' })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function canUseLocalFallback(output) {
  return (
    /winCodeSign/i.test(output) &&
    (/Cannot create symbolic link/i.test(output) ||
      /DownloadWinCodeSign/i.test(output) ||
      /app-builder\/pkg\/rcedit/i.test(output))
  )
}

function getPackageMetadata() {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
  const buildConfig = packageJson.build ?? {}
  const executableName =
    buildConfig.executableName ?? buildConfig.productName ?? packageJson.productName ?? 'FreeCli'
  const productName = buildConfig.productName ?? packageJson.productName ?? executableName
  const companyName =
    buildConfig.publisher ?? packageJson.publisher ?? packageJson.author?.name ?? productName

  return {
    version: packageJson.version,
    description: packageJson.description ?? productName,
    executableName,
    productName,
    companyName,
    iconPath: resolve(process.cwd(), buildConfig.win?.icon ?? 'build/icon.ico'),
    executablePath: resolve(process.cwd(), 'dist', 'win-unpacked', `${executableName}.exe`),
  }
}

function collectFilesRecursively(rootDir, fileName, results = []) {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      collectFilesRecursively(fullPath, fileName, results)
      continue
    }

    if (entry.isFile() && entry.name === fileName) {
      results.push(fullPath)
    }
  }

  return results
}

function findCachedRceditPath() {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) {
    return null
  }

  const cacheRoot = resolve(localAppData, 'electron-builder', 'Cache', 'winCodeSign')
  let candidates = []

  try {
    candidates = collectFilesRecursively(cacheRoot, 'rcedit-x64.exe')
  } catch {
    return null
  }

  if (candidates.length === 0) {
    return null
  }

  return (
    candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0] ?? null
  )
}

function applyWindowsExecutableMetadata() {
  const metadata = getPackageMetadata()
  const rceditPath = findCachedRceditPath()
  if (!rceditPath) {
    process.stderr.write(
      [
        '[build:win] 未找到本机可用的 rcedit-x64.exe 缓存，无法保留 Windows 图标写入步骤。',
        '[build:win] 请先在可联网且具备标准 electron-builder 环境的机器上成功执行一次标准 Windows 打包，或显式设置 FREECLI_WIN_FORCE_STANDARD_BUILD=1。',
        '',
      ].join('\n'),
    )
    process.exit(1)
  }

  const rceditArgs = [
    metadata.executablePath,
    '--set-icon',
    metadata.iconPath,
    '--set-file-version',
    metadata.version,
    '--set-product-version',
    metadata.version,
    '--set-version-string',
    'CompanyName',
    metadata.companyName,
    '--set-version-string',
    'FileDescription',
    metadata.description,
    '--set-version-string',
    'ProductName',
    metadata.productName,
    '--set-version-string',
    'InternalName',
    metadata.executableName,
    '--set-version-string',
    'OriginalFilename',
    `${metadata.executableName}.exe`,
  ]

  const rceditResult = run(rceditPath, rceditArgs, { stdio: 'pipe', shell: false })
  if (rceditResult.status !== 0) {
    exitWithResult(rceditResult)
  }
}

assertSuccess(['build'])
assertSuccess(['build:release-manifest'])

const shouldUseStandardWindowsBuild =
  process.env.CI === 'true' || process.env.FREECLI_WIN_FORCE_STANDARD_BUILD === '1'

if (process.platform === 'win32' && !shouldUseStandardWindowsBuild) {
  process.stderr.write(
    [
      '[build:win] 当前为本机 Windows 构建，将改用本地三段式流程保留 rcedit：先生成 win-unpacked，再手动写入 exe 图标/版本资源，最后基于 prepackaged 目录生成安装包。',
      '[build:win] 如需强制走 electron-builder 标准 Windows metadata 链路，可设置 FREECLI_WIN_FORCE_STANDARD_BUILD=1 后重新执行。',
      '',
    ].join('\n'),
  )

  const unpackedResult = runPnpm(ELECTRON_BUILDER_DIR_ARGS, { stdio: 'pipe' })
  if (unpackedResult.status !== 0) {
    exitWithResult(unpackedResult)
  }

  process.stdout.write(unpackedResult.stdout ?? '')
  process.stderr.write(unpackedResult.stderr ?? '')

  applyWindowsExecutableMetadata()

  const packagedResult = runPnpm(ELECTRON_BUILDER_PREPACKAGED_ARGS, { stdio: 'pipe' })
  exitWithResult(packagedResult)
}

const primaryResult = runPnpm(ELECTRON_BUILDER_BASE_ARGS, { stdio: 'pipe' })
const primaryOutput = `${primaryResult.stdout ?? ''}\n${primaryResult.stderr ?? ''}`

if (primaryResult.status === 0) {
  exitWithResult(primaryResult)
}

if (
  process.env.CI === 'true' ||
  process.platform !== 'win32' ||
  !canUseLocalFallback(primaryOutput)
) {
  exitWithResult(primaryResult)
}

process.stdout.write(primaryResult.stdout ?? '')
process.stderr.write(primaryResult.stderr ?? '')
process.stderr.write(
  [
    '',
    '[build:win] 检测到本机 Windows 无法下载或解压 winCodeSign（常见原因是网络波动或符号链接权限不足）。',
    '[build:win] 将自动回退到本地验包模式：禁用 signAndEditExecutable，继续生成安装包。',
    '[build:win] 注意：该回退模式不会给 win-unpacked/FreeCli.exe 写入最终的 Windows 图标和版本元数据；CI/正式发布仍应使用标准构建链路。',
    '',
  ].join('\n'),
)

const fallbackResult = runPnpm(
  [...ELECTRON_BUILDER_BASE_ARGS, '--config.win.signAndEditExecutable=false'],
  { stdio: 'pipe' },
)

exitWithResult(fallbackResult)
