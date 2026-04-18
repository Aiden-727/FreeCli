import { mkdtempSync, rmSync } from 'node:fs'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  parseGraphicsModeFromSettingsValue,
  resolveLaunchGraphicsMode,
} from '../../../src/app/main/graphicsMode'

const tempDirs: string[] = []

function createUserDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'freecli-graphics-mode-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { force: true, recursive: true })
    }
  }
})

describe('resolveLaunchGraphicsMode', () => {
  it('falls back to system-default when there is no persisted database', () => {
    const userDataDir = createUserDataDir()

    expect(resolveLaunchGraphicsMode(userDataDir)).toBe('system-default')
  })

  it('normalizes power-saving from persisted settings JSON', () => {
    expect(
      parseGraphicsModeFromSettingsValue(JSON.stringify({ graphicsMode: 'power-saving' })),
    ).toBe('power-saving')
  })

  it('falls back to system-default for malformed persisted settings JSON', () => {
    expect(parseGraphicsModeFromSettingsValue('{oops')).toBe('system-default')
  })

  it('falls back to system-default when the database file is not a readable sqlite database', () => {
    const userDataDir = createUserDataDir()
    writeFileSync(join(userDataDir, 'freecli.db'), 'not-a-sqlite-db')

    expect(resolveLaunchGraphicsMode(userDataDir)).toBe('system-default')
  })
})
