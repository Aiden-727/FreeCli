import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_INPUT_STATS_SETTINGS } from '../../../src/contexts/plugins/domain/inputStatsSettings'
import { InputStatsStore } from '../../../src/plugins/inputStats/presentation/main/InputStatsStore'

describe('InputStatsStore', () => {
  const tempDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })),
    )
  })

  it('aggregates deltas across days and reloads persisted snapshots', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'freecli-input-stats-'))
    tempDirectories.push(directory)

    const store = new InputStatsStore(join(directory, 'stats.json'))
    await store.applyDelta(
      {
        keyPresses: 12,
        leftClicks: 3,
        rightClicks: 1,
        mouseDistancePx: 1_200,
        scrollSteps: 18,
        keyCounts: {
          A: 5,
          Enter: 2,
        },
      },
      new Date(2026, 3, 3, 9, 30, 0),
    )
    await store.applyDelta(
      {
        keyPresses: 20,
        leftClicks: 4,
        rightClicks: 2,
        mouseDistancePx: 2_500,
        scrollSteps: 24,
        keyCounts: {
          A: 6,
          B: 4,
        },
      },
      new Date(2026, 3, 4, 10, 15, 0),
    )
    await store.flush()

    const reloadedStore = new InputStatsStore(join(directory, 'stats.json'))
    const snapshot = await reloadedStore.buildSnapshot(
      {
        ...DEFAULT_INPUT_STATS_SETTINGS,
        topKeysRange: 7,
        historyRangeDays: 7,
        cumulativeRangeDays: 7,
      },
      new Date(2026, 3, 4, 18, 0, 0),
    )

    expect(snapshot.today).toMatchObject({
      day: '2026-04-04',
      keyPresses: 20,
      leftClicks: 4,
      rightClicks: 2,
      mouseDistancePx: 2_500,
      scrollSteps: 24,
    })
    expect(snapshot.topKeys.slice(0, 3)).toEqual([
      { key: 'A', count: 11 },
      { key: 'B', count: 4 },
      { key: 'Enter', count: 2 },
    ])
    expect(snapshot.allKeys).toEqual(snapshot.topKeys)
    expect(snapshot.cumulativeTotals).toEqual({
      clicks: 10,
      keys: 32,
      movement: 3_700,
      scroll: 42,
    })
    expect(snapshot.historySeriesByMetric.keys).toHaveLength(7)
    expect(snapshot.historySeriesByMetric.keys.at(-1)).toMatchObject({
      day: '2026-04-04',
      value: 20,
    })
  })
})
