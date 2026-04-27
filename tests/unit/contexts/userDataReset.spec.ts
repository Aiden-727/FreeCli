import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  consumeAndResetUserDataIfNeeded,
  writeUserDataResetMarker,
} from '../../../src/app/main/userDataReset'

const createdDirs: string[] = []

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  createdDirs.push(dir)
  return dir
}

describe('userDataReset', () => {
  afterEach(async () => {
    for (const dir of createdDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('does nothing when no reset marker exists', async () => {
    const userDataDir = await createTempDir('freecli-userdata-')
    await writeFile(join(userDataDir, 'freecli.db'), 'db', 'utf8')

    await expect(consumeAndResetUserDataIfNeeded(userDataDir)).resolves.toBe(false)
    await expect(readFile(join(userDataDir, 'freecli.db'), 'utf8')).resolves.toBe('db')
  })

  it('clears only the current userData contents while preserving the directory itself', async () => {
    const rootDir = await createTempDir('freecli-root-')
    const userDataDir = join(rootDir, 'freecli')
    const siblingDir = join(rootDir, 'freecli-dev')

    await mkdir(join(userDataDir, 'plugins'), { recursive: true })
    await mkdir(siblingDir, { recursive: true })
    await writeFile(join(userDataDir, 'freecli.db'), 'db', 'utf8')
    await writeFile(join(userDataDir, 'plugins', 'cache.json'), '{}', 'utf8')
    await writeFile(join(siblingDir, 'keep.txt'), 'keep', 'utf8')

    await writeUserDataResetMarker(userDataDir)
    await expect(consumeAndResetUserDataIfNeeded(userDataDir)).resolves.toBe(true)

    await expect(readdir(userDataDir)).resolves.toEqual([])
    await expect(readFile(join(siblingDir, 'keep.txt'), 'utf8')).resolves.toBe('keep')
  })
})
