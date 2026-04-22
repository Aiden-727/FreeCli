import { describe, expect, it } from 'vitest'
import {
  writeNormalizedAppState,
  writeNormalizedScrollbacks,
} from '../../../src/platform/persistence/sqlite/write'
import type { NormalizedPersistedAppState } from '../../../src/platform/persistence/sqlite/normalize'

type ScrollbackRow = {
  nodeId: string
  scrollback: string
  updatedAt: string
}

class FakeStatement {
  public constructor(private readonly runner: (...params: unknown[]) => void) {}

  public run(...params: unknown[]): void {
    this.runner(...params)
  }
}

class FakeDb {
  public readonly meta = new Map<string, string>()
  public settingsJson = '{}'
  public readonly workspaces = new Map<string, { activeSpaceId: string | null }>()
  public readonly nodes = new Set<string>()
  public readonly spaces = new Set<string>()
  public readonly spaceLinks = new Map<string, Set<string>>()
  public readonly scrollbacks = new Map<string, ScrollbackRow>()

  public prepare(sql: string): FakeStatement {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim()

    if (normalizedSql.startsWith('INSERT INTO app_meta')) {
      return new FakeStatement((...params) => {
        this.meta.set(String(params[0]), String(params[1]))
      })
    }

    if (normalizedSql.startsWith('INSERT INTO app_settings')) {
      return new FakeStatement((...params) => {
        this.settingsJson = String(params[0])
      })
    }

    if (normalizedSql.startsWith('INSERT INTO workspaces')) {
      return new FakeStatement((...params) => {
        this.workspaces.set(String(params[0]), { activeSpaceId: (params[10] as string | null) ?? null })
      })
    }

    if (normalizedSql.startsWith('INSERT INTO nodes')) {
      return new FakeStatement((...params) => {
        this.nodes.add(String(params[0]))
      })
    }

    if (normalizedSql.startsWith('INSERT INTO workspace_spaces')) {
      return new FakeStatement((...params) => {
        this.spaces.add(String(params[0]))
      })
    }

    if (normalizedSql.startsWith('INSERT INTO workspace_space_nodes')) {
      return new FakeStatement((...params) => {
        const spaceId = String(params[0])
        const nodeId = String(params[1])
        const bucket = this.spaceLinks.get(spaceId) ?? new Set<string>()
        bucket.add(nodeId)
        this.spaceLinks.set(spaceId, bucket)
      })
    }

    if (normalizedSql.startsWith('INSERT INTO node_scrollback')) {
      return new FakeStatement((...params) => {
        const nodeId = String(params[0])
        const scrollback = String(params[1])
        const updatedAt = String(params[2])
        const existing = this.scrollbacks.get(nodeId)
        if (existing && existing.scrollback === scrollback) {
          return
        }

        this.scrollbacks.set(nodeId, { nodeId, scrollback, updatedAt })
      })
    }

    if (normalizedSql === 'DELETE FROM workspaces') {
      return new FakeStatement(() => {
        this.workspaces.clear()
      })
    }

    if (normalizedSql === 'DELETE FROM nodes') {
      return new FakeStatement(() => {
        this.nodes.clear()
      })
    }

    if (normalizedSql === 'DELETE FROM workspace_spaces') {
      return new FakeStatement(() => {
        this.spaces.clear()
      })
    }

    if (normalizedSql === 'DELETE FROM workspace_space_nodes') {
      return new FakeStatement(() => {
        this.spaceLinks.clear()
      })
    }

    if (normalizedSql === 'DELETE FROM node_scrollback') {
      return new FakeStatement(() => {
        this.scrollbacks.clear()
      })
    }

    if (normalizedSql.startsWith('DELETE FROM workspaces WHERE id NOT IN')) {
      return new FakeStatement((...params) => {
        const keepIds = new Set(params.map(value => String(value)))
        for (const id of [...this.workspaces.keys()]) {
          if (!keepIds.has(id)) {
            this.workspaces.delete(id)
          }
        }
      })
    }

    if (normalizedSql.startsWith('DELETE FROM nodes WHERE id NOT IN')) {
      return new FakeStatement((...params) => {
        const keepIds = new Set(params.map(value => String(value)))
        for (const id of [...this.nodes]) {
          if (!keepIds.has(id)) {
            this.nodes.delete(id)
          }
        }
      })
    }

    if (normalizedSql.startsWith('DELETE FROM workspace_spaces WHERE id NOT IN')) {
      return new FakeStatement((...params) => {
        const keepIds = new Set(params.map(value => String(value)))
        for (const id of [...this.spaces]) {
          if (!keepIds.has(id)) {
            this.spaces.delete(id)
            this.spaceLinks.delete(id)
          }
        }
      })
    }

    if (normalizedSql.startsWith('DELETE FROM workspace_space_nodes WHERE space_id NOT IN')) {
      return new FakeStatement((...params) => {
        const keepSpaceIds = new Set(params.map(value => String(value)))
        for (const spaceId of [...this.spaceLinks.keys()]) {
          if (!keepSpaceIds.has(spaceId)) {
            this.spaceLinks.delete(spaceId)
          }
        }
      })
    }

    if (normalizedSql.startsWith('DELETE FROM workspace_space_nodes WHERE space_id = ? AND node_id NOT IN')) {
      return new FakeStatement((...params) => {
        const spaceId = String(params[0])
        const keepNodeIds = new Set(params.slice(1).map(value => String(value)))
        const existing = this.spaceLinks.get(spaceId) ?? new Set<string>()
        const next = new Set<string>()

        for (const nodeId of existing) {
          if (keepNodeIds.has(nodeId)) {
            next.add(nodeId)
          }
        }

        this.spaceLinks.set(spaceId, next)
      })
    }

    if (normalizedSql === 'DELETE FROM workspace_space_nodes WHERE space_id = ?') {
      return new FakeStatement((...params) => {
        this.spaceLinks.delete(String(params[0]))
      })
    }

    if (normalizedSql.startsWith('DELETE FROM node_scrollback WHERE node_id NOT IN')) {
      return new FakeStatement((...params) => {
        const keepIds = new Set(params.map(value => String(value)))
        for (const nodeId of [...this.scrollbacks.keys()]) {
          if (!keepIds.has(nodeId)) {
            this.scrollbacks.delete(nodeId)
          }
        }
      })
    }

    throw new Error(`Unsupported SQL in fake db: ${normalizedSql}`)
  }

  public exec(sql: string): void {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim()
    if (normalizedSql === 'DELETE FROM node_scrollback WHERE node_id NOT IN (SELECT id FROM nodes)') {
      for (const nodeId of [...this.scrollbacks.keys()]) {
        if (!this.nodes.has(nodeId)) {
          this.scrollbacks.delete(nodeId)
        }
      }
      return
    }

    throw new Error(`Unsupported exec SQL in fake db: ${normalizedSql}`)
  }

  public transaction<T>(fn: () => T): () => T {
    return () => fn()
  }
}

function createState(
  options: {
    nodeIds?: string[]
    scrollbackByNodeId?: Record<string, string | null>
  } = {},
): NormalizedPersistedAppState {
  const nodeIds = options.nodeIds ?? ['node-1']
  const scrollbackByNodeId = options.scrollbackByNodeId ?? {}

  return {
    formatVersion: 1,
    activeWorkspaceId: 'workspace-1',
    settings: {},
    workspaces: [
      {
        id: 'workspace-1',
        name: 'Workspace',
        path: '/tmp/workspace',
        worktreesRoot: '/tmp',
        pullRequestBaseBranchOptions: [],
        spaceArchiveRecords: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        isMinimapVisible: true,
        activeSpaceId: nodeIds.length > 0 ? 'space-1' : null,
        spaces:
          nodeIds.length > 0
            ? [
                {
                  id: 'space-1',
                  name: 'Space',
                  directoryPath: '/tmp/workspace',
                  labelColor: null,
                  nodeIds,
                  rect: null,
                },
              ]
            : [],
        nodes: nodeIds.map((nodeId, index) => ({
          id: nodeId,
          title: `Node ${index + 1}`,
          titlePinnedByUser: false,
          position: { x: index * 10, y: index * 10 },
          width: 320,
          height: 240,
          kind: 'terminal',
          labelColorOverride: null,
          status: null,
          startedAt: null,
          endedAt: null,
          exitCode: null,
          lastError: null,
          executionDirectory: '/tmp/workspace',
          expectedDirectory: '/tmp/workspace',
          agent: null,
          hostedAgent: null,
          task: null,
          scrollback: scrollbackByNodeId[nodeId] ?? null,
        })),
      },
    ],
  }
}

describe('sqlite write helpers', () => {
  it('keeps unchanged scrollback timestamps stable and removes deleted node records', () => {
    const db = new FakeDb()

    const initialState = createState({
      nodeIds: ['node-1', 'node-2'],
      scrollbackByNodeId: {
        'node-1': 'same output',
        'node-2': 'to be deleted',
      },
    })

    writeNormalizedAppState(db as never, initialState)
    writeNormalizedScrollbacks(db as never, initialState)

    const beforeRow = db.scrollbacks.get('node-1')
    expect(beforeRow?.updatedAt).toBeTypeOf('string')

    const sameState = createState({
      nodeIds: ['node-1'],
      scrollbackByNodeId: {
        'node-1': 'same output',
      },
    })

    writeNormalizedAppState(db as never, sameState)
    writeNormalizedScrollbacks(db as never, sameState)

    const afterRow = db.scrollbacks.get('node-1')
    expect(afterRow?.updatedAt).toBe(beforeRow?.updatedAt)
    expect(db.scrollbacks.has('node-2')).toBe(false)
    expect([...db.nodes]).toEqual(['node-1'])
    expect([...db.spaces]).toEqual(['space-1'])
    expect([...((db.spaceLinks.get('space-1') ?? new Set()).values())]).toEqual(['node-1'])
  })
})
