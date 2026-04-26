#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const rootDir = resolve(import.meta.dirname, '..')
const packageJsonPath = resolve(rootDir, 'package.json')

function readGitTags() {
  const raw = execFileSync('git', ['tag', '--list'], { encoding: 'utf8' })
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function resolveBeijingDateYmd() {
  // Use Intl instead of shelling out to bash so the helper works on Windows,
  // local PowerShell sessions, and GitHub Actions with the same result.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(new Date())
  const year = parts.find(part => part.type === 'year')?.value ?? ''
  const month = parts.find(part => part.type === 'month')?.value ?? ''
  const day = parts.find(part => part.type === 'day')?.value ?? ''
  return `${year}${month}${day}`
}

function parseArgs(argv) {
  const args = new Map()
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) {
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      continue
    }
    args.set(key.slice(2), value)
    index += 1
  }

  return args
}

const args = parseArgs(process.argv)
const date = (args.get('date') ?? resolveBeijingDateYmd()).trim()

if (!/^\d{8}$/.test(date)) {
  process.stderr.write(`Invalid date: ${date}\n`)
  process.exit(1)
}

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const baseVersion = typeof packageJson.version === 'string' ? packageJson.version.trim() : ''

if (!baseVersion) {
  process.stderr.write('package.json version is missing.\n')
  process.exit(1)
}

const tags = readGitTags()
const prefix = `v${baseVersion}-nightly.${date}.`
const matcher = new RegExp(`^v${baseVersion.replaceAll('.', '\\.')}-nightly\\.${date}\\.(\\d+)$`)

let maxBuild = 0
for (const tag of tags) {
  const match = matcher.exec(tag)
  if (!match) {
    continue
  }

  const value = Number.parseInt(match[1], 10)
  if (!Number.isFinite(value)) {
    continue
  }

  maxBuild = Math.max(maxBuild, value)
}

const nextBuild = maxBuild + 1
const tag = `${prefix}${nextBuild}`
process.stdout.write(`${tag}\n`)
