import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveRuntimeIconPath } from '../../../src/app/main/runtimeIcon'

describe('resolveRuntimeIconPath', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('prefers the Windows .ico when both icon files exist', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'freecli-runtime-icon-'))
    tempDirs.push(rootDir)

    const appMainDir = join(rootDir, 'app', 'main')
    const buildDir = join(rootDir, 'build')
    mkdirSync(appMainDir, { recursive: true })
    mkdirSync(buildDir, { recursive: true })
    writeFileSync(join(buildDir, 'icon.png'), 'png')
    writeFileSync(join(buildDir, 'icon.ico'), 'ico')

    expect(resolveRuntimeIconPath(appMainDir, 'win32')).toBe(join(buildDir, 'icon.ico'))
  })

  it('falls back to the png on Windows when the ico is missing', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'freecli-runtime-icon-'))
    tempDirs.push(rootDir)

    const appMainDir = join(rootDir, 'app', 'main')
    const buildDir = join(rootDir, 'build')
    mkdirSync(appMainDir, { recursive: true })
    mkdirSync(buildDir, { recursive: true })
    writeFileSync(join(buildDir, 'icon.png'), 'png')

    expect(resolveRuntimeIconPath(appMainDir, 'win32')).toBe(join(buildDir, 'icon.png'))
  })

  it('uses the png on non-Windows platforms', () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'freecli-runtime-icon-'))
    tempDirs.push(rootDir)

    const appMainDir = join(rootDir, 'app', 'main')
    const buildDir = join(rootDir, 'build')
    mkdirSync(appMainDir, { recursive: true })
    mkdirSync(buildDir, { recursive: true })
    writeFileSync(join(buildDir, 'icon.png'), 'png')
    writeFileSync(join(buildDir, 'icon.ico'), 'ico')

    expect(resolveRuntimeIconPath(appMainDir, 'darwin')).toBe(join(buildDir, 'icon.png'))
  })
})
