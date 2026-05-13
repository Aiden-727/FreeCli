import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import process from 'node:process'

const projectDir = resolve(
  process.cwd(),
  'src',
  'plugins',
  'systemMonitor',
  'windowsHelper',
  'WindowsMonitorHelper',
)
const helperResourcesRoot = resolve(process.cwd(), 'build-resources')
const outputDir = resolve(process.cwd(), 'build-resources', 'system-monitor-helper')
const publishTempDir = mkdtempSync(resolve(tmpdir(), 'freecli-system-monitor-helper-'))
mkdirSync(helperResourcesRoot, { recursive: true })
const stagingDir = mkdtempSync(resolve(tmpdir(), 'freecli-system-monitor-helper-stage-'))
const backupDir = `${outputDir}.bak`
const requiredPublishedFiles = [
  'WindowsMonitorHelper.exe',
  'WindowsMonitorHelper.dll',
  'WindowsMonitorHelper.deps.json',
  'WindowsMonitorHelper.runtimeconfig.json',
  'hostpolicy.dll',
  'hostfxr.dll',
]
mkdirSync(outputDir, { recursive: true })

function hasRequiredPublishedFiles(directory) {
  return requiredPublishedFiles.every(fileName => existsSync(resolve(directory, fileName)))
}

const restoreResult = spawnSync(
  'dotnet',
  [
    'restore',
    resolve(projectDir, 'WindowsMonitorHelper.csproj'),
    '-r',
    'win-x64',
    '--ignore-failed-sources',
  ],
  {
    cwd: process.cwd(),
    shell: process.platform === 'win32',
    stdio: 'inherit',
  },
)

if (restoreResult.status !== 0) {
  rmSync(publishTempDir, { recursive: true, force: true })
  rmSync(stagingDir, { recursive: true, force: true })
  process.exit(restoreResult.status ?? 1)
}

const result = spawnSync(
  'dotnet',
  [
    'publish',
    resolve(projectDir, 'WindowsMonitorHelper.csproj'),
    '-c',
    'Release',
    '-r',
    'win-x64',
    '--no-restore',
    '--self-contained',
    'true',
    '-p:PublishSingleFile=false',
    '-o',
    publishTempDir,
  ],
  {
    cwd: process.cwd(),
    shell: process.platform === 'win32',
    stdio: 'inherit',
  },
)

if (result.status !== 0) {
  rmSync(publishTempDir, { recursive: true, force: true })
  rmSync(stagingDir, { recursive: true, force: true })
  const allowFallbackToExistingOutput =
    process.env.CI !== 'true' &&
    process.env.FREECLI_STRICT_SYSTEM_MONITOR_HELPER_BUILD !== '1' &&
    hasRequiredPublishedFiles(outputDir)

  if (allowFallbackToExistingOutput) {
    process.exit(0)
  }

  process.exit(result.status ?? 1)
}

for (const fileName of requiredPublishedFiles) {
  if (!existsSync(resolve(publishTempDir, fileName))) {
    rmSync(publishTempDir, { recursive: true, force: true })
    rmSync(stagingDir, { recursive: true, force: true })
    throw new Error(`System monitor helper publish output is incomplete: missing ${fileName}`)
  }
}

cpSync(publishTempDir, stagingDir, { recursive: true, force: true })
rmSync(publishTempDir, { recursive: true, force: true })
rmSync(backupDir, { recursive: true, force: true })

try {
  if (existsSync(outputDir)) {
    renameSync(outputDir, backupDir)
  }

  try {
    renameSync(stagingDir, outputDir)
  } catch (error) {
    const isCrossDeviceRename =
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'string' &&
      error.code === 'EXDEV'
    if (!isCrossDeviceRename) {
      throw error
    }

    cpSync(stagingDir, outputDir, { recursive: true, force: true })
    rmSync(stagingDir, { recursive: true, force: true })
  }

  rmSync(backupDir, { recursive: true, force: true })
} catch (error) {
  try {
    if (!existsSync(outputDir) && existsSync(backupDir)) {
      renameSync(backupDir, outputDir)
    }
  } catch {
    // Best-effort rollback. Keep the original error below.
  }

  rmSync(stagingDir, { recursive: true, force: true })
  const detail = error instanceof Error ? error.message : String(error)
  throw new Error(
    [
      'System monitor helper output directory is busy or locked.',
      'Close any running FreeCli instance and terminate WindowsMonitorHelper.exe before building again.',
      `target=${outputDir}`,
      `detail=${detail}`,
    ].join(' '),
    { cause: error },
  )
}
