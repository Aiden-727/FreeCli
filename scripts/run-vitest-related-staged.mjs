#!/usr/bin/env node

import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const WINDOWS_UNSUPPORTED_TEST_GLOBS = [
  'tests/contract/ipc/ipcApprovedWorkspaceGuard.spec.ts',
  'tests/integration/recovery/agentResolveResumeSession.ipc.spec.ts',
  'tests/integration/recovery/agentSessionLocator.polling.spec.ts',
  'tests/unit/contexts/agentCliInvocation.spec.ts',
  'tests/unit/contexts/agentModelService.spec.ts',
  'tests/unit/contexts/agentSessionLocator.codex.spec.ts',
  'tests/unit/contexts/agentSessionLocator.opencode.spec.ts',
  'tests/unit/contexts/agentSessionLocator.spec.ts',
  'tests/unit/contexts/gitWorktreeService.spec.ts',
  'tests/unit/contexts/sessionFileResolver.spec.ts',
]
const TEST_RELATED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
])
const WINDOWS_MAX_COMMAND_ARGUMENT_CHARS = 6000

function resolveFilesFromStaged() {
  const result = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(result.stderr)
    } else {
      process.stderr.write('Failed to list staged files.\n')
    }

    process.exit(1)
  }

  return result.stdout
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

function shouldCheck(filePath) {
  if (
    filePath.includes('node_modules/') ||
    filePath.includes('dist/') ||
    filePath.includes('out/') ||
    filePath.includes('coverage/') ||
    filePath.includes('playwright-report/') ||
    filePath.includes('test-results/')
  ) {
    return false
  }

  const dotIndex = filePath.lastIndexOf('.')
  if (dotIndex === -1) {
    return false
  }

  const extension = filePath.slice(dotIndex).toLowerCase()
  return TEST_RELATED_EXTENSIONS.has(extension)
}

const targetFiles = process.argv.length > 2 ? process.argv.slice(2) : resolveFilesFromStaged()
const files = targetFiles.filter(shouldCheck)

if (files.length === 0) {
  process.exit(0)
}

const baseArgs = ['exec', 'vitest', 'related', '--run', '--passWithNoTests']

if (process.platform === 'win32') {
  for (const excludedGlob of WINDOWS_UNSUPPORTED_TEST_GLOBS) {
    baseArgs.push('--exclude', excludedGlob)
  }
}

function normalizeWindowsPath(value) {
  return value.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}

function resolveWindowsSubstDriveForCwd() {
  if (process.platform !== 'win32') {
    return null
  }

  const substResult = spawnSync('subst', { encoding: 'utf8', shell: true })
  if (substResult.status !== 0) {
    return null
  }

  const cwdRealpath = normalizeWindowsPath(realpathSync.native(process.cwd()))
  const lines = substResult.stdout.split(/\r\n|\r|\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    const match = line.match(/^([A-Z]:)\\: => (.+)$/i)
    if (!match) {
      continue
    }

    const driveRoot = `${match[1]}\\`
    const target = normalizeWindowsPath(match[2])
    if (target === cwdRealpath) {
      return driveRoot
    }
  }

  return null
}

function resolveWindowsVitestInvocation() {
  const driveRoot = resolveWindowsSubstDriveForCwd()
  if (!driveRoot) {
    return null
  }

  const pnpmRoot = path.join(driveRoot, 'node_modules', '.pnpm')
  if (!existsSync(pnpmRoot)) {
    return null
  }

  const vitestPackageDir = readdirSync(pnpmRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('vitest@'))
    .map(entry => path.join(pnpmRoot, entry.name, 'node_modules', 'vitest'))
    .find(candidate => existsSync(path.join(candidate, 'vitest.mjs')))

  if (!vitestPackageDir) {
    return null
  }

  return {
    command: process.execPath,
    baseArgs: [
      path.join(vitestPackageDir, 'vitest.mjs'),
      'related',
      '--run',
      '--passWithNoTests',
      '--config',
      path.join(driveRoot, 'vitest.config.ts'),
      ...WINDOWS_UNSUPPORTED_TEST_GLOBS.flatMap(excludedGlob => ['--exclude', excludedGlob]),
    ],
  }
}

function chunkFilesForWindows(filePaths, baseArgLength) {
  if (process.platform !== 'win32') {
    return [filePaths]
  }

  const chunks = []
  let currentChunk = []
  let currentLength = baseArgLength

  for (const file of filePaths) {
    const nextLength = currentLength + file.length + 1
    if (currentChunk.length > 0 && nextLength > WINDOWS_MAX_COMMAND_ARGUMENT_CHARS) {
      chunks.push(currentChunk)
      currentChunk = [file]
      currentLength = baseArgLength + file.length + 1
      continue
    }

    currentChunk.push(file)
    currentLength = nextLength
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

const windowsVitestInvocation = resolveWindowsVitestInvocation()
const command = windowsVitestInvocation?.command ?? PNPM_COMMAND
const invocationBaseArgs = windowsVitestInvocation?.baseArgs ?? baseArgs
const fileChunks = chunkFilesForWindows(
  files,
  invocationBaseArgs.reduce((sum, arg) => sum + arg.length + 1, 0),
)

for (const fileChunk of fileChunks) {
  const result = spawnSync(command, [...invocationBaseArgs, ...fileChunk], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1)
  }
}

process.exit(0)
