import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { GitWorklogHistoryStore } from '../../../src/plugins/gitWorklog/infrastructure/main/GitWorklogHistoryStore'

describe('GitWorklogHistoryStore', () => {
  const tempDirs = new Set<string>()

  afterEach(async () => {
    await Promise.all([...tempDirs].map(dir => rm(dir, { recursive: true, force: true })))
    tempDirs.clear()
  })

  it('persists repo daily history with refs snapshot and keeps it in sync export payload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'git-worklog-history-store-'))
    tempDirs.add(root)
    const filePath = join(root, 'history-cache.json')
    const store = new GitWorklogHistoryStore(filePath)

    await store.saveDailyHistory({
      repoPath: 'D:\\Project\\FreeCli',
      refsSnapshot: [
        {
          refName: 'refs/heads/main',
          oid: '1111111111111111111111111111111111111111',
        },
      ],
      dailyPoints: [
        {
          day: '2026-05-01',
          label: '05/01',
          commitCount: 2,
          filesChanged: 2,
          additions: 30,
          deletions: 10,
          changedLines: 40,
          files: ['src/a.ts', 'src/b.ts'],
        },
      ],
      builtAt: '2026-05-01T08:00:00.000Z',
    })
    await store.flush()

    const reloaded = new GitWorklogHistoryStore(filePath)
    const dailyHistory = await reloaded.getDailyHistory('D:\\Project\\FreeCli')
    const syncPayload = await reloaded.exportForSync()
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as {
      repositories: Array<{ dailyHistory?: unknown }>
    }

    expect(dailyHistory).toMatchObject({
      refsSnapshot: [
        {
          refName: 'refs/heads/main',
          oid: '1111111111111111111111111111111111111111',
        },
      ],
      dailyPoints: [
        {
          day: '2026-05-01',
          additions: 30,
          deletions: 10,
          files: ['src/a.ts', 'src/b.ts'],
        },
      ],
    })
    expect(syncPayload.repositories[0]?.dailyHistory).toMatchObject({
      refsSnapshot: [
        {
          refName: 'refs/heads/main',
          oid: '1111111111111111111111111111111111111111',
        },
      ],
    })
    expect(raw.repositories[0]?.dailyHistory).toBeTruthy()

    await reloaded.dispose()
    await store.dispose()
  })
})
