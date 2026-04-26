import { describe, expect, it } from 'vitest'
import { readAppStateFromDb } from '../../../src/platform/persistence/sqlite/read'
import {
  appMeta,
  appSettings,
  nodes,
  spaceNodes,
  spaces,
  workspaces,
} from '../../../src/platform/persistence/sqlite/schema'

class FakeQuery<TResult> {
  private table: unknown

  public constructor(
    private readonly resolver: (table: unknown, mode: 'all' | 'get') => TResult[] | TResult | undefined,
  ) {
    this.table = null
  }

  public from(table: unknown): this {
    this.table = table
    return this
  }

  public where(): this {
    return this
  }

  public orderBy(): this {
    return this
  }

  public all(): TResult[] {
    const result = this.resolver(this.table, 'all')
    return Array.isArray(result) ? result : []
  }

  public get(): TResult | undefined {
    const result = this.resolver(this.table, 'get')
    return Array.isArray(result) ? result[0] : result
  }
}

class FakeDb {
  public constructor(
    private readonly tables: {
      metaRows: Array<{ key: string; value: string }>
      settingsRow: { value: string }
      workspaceRows: Array<{
        id: string
        sortOrder: number
        name: string
        path: string
        worktreesRoot: string
        lifecycleState: string
        archivedAt: string | null
        pullRequestBaseBranchOptionsJson: string
        spaceArchiveRecordsJson: string
        viewportX: number
        viewportY: number
        viewportZoom: number
        isMinimapVisible: boolean
        activeSpaceId: string | null
      }>
      nodeRows: Array<{
        id: string
        workspaceId: string
        title: string
        titlePinnedByUser: number
        positionX: number
        positionY: number
        width: number
        height: number
        kind: string
        labelColorOverride: string | null
        status: string | null
        startedAt: string | null
        endedAt: string | null
        exitCode: number | null
        lastError: string | null
        executionDirectory: string | null
        expectedDirectory: string | null
        agentJson: string | null
        hostedAgentJson: string | null
        taskJson: string | null
      }>
      spaceRows: Array<{
        id: string
        workspaceId: string
        name: string
        directoryPath: string
        labelColor: string | null
        rectX: number | null
        rectY: number | null
        rectWidth: number | null
        rectHeight: number | null
      }>
      spaceNodeRows: Array<{
        spaceId: string
        nodeId: string
        sortOrder: number
      }>
    },
  ) {}

  public select(): FakeQuery<unknown>
  public select(_selection: unknown): FakeQuery<unknown>
  public select(_selection?: unknown): FakeQuery<unknown> {
    return new FakeQuery((table, mode) => {
      if (table === appMeta) {
        return this.tables.metaRows
      }
      if (table === appSettings) {
        return mode === 'get' ? this.tables.settingsRow : [this.tables.settingsRow]
      }
      if (table === workspaces) {
        return [...this.tables.workspaceRows].sort((left, right) => left.sortOrder - right.sortOrder)
      }
      if (table === nodes) {
        return this.tables.nodeRows
      }
      if (table === spaces) {
        return this.tables.spaceRows
      }
      if (table === spaceNodes) {
        return this.tables.spaceNodeRows
      }
      return []
    })
  }
}

describe('sqlite read helpers', () => {
  it('restores workspace order from sort_order', () => {
    const db = new FakeDb({
      metaRows: [
        { key: 'format_version', value: '1' },
        { key: 'active_workspace_id', value: 'workspace-c' },
      ],
      settingsRow: { value: '{}' },
      workspaceRows: [
        {
          id: 'workspace-a',
          sortOrder: 1,
          name: 'workspace-a',
          path: '/tmp/workspace-a',
          worktreesRoot: '/tmp',
          lifecycleState: 'active',
          archivedAt: null,
          pullRequestBaseBranchOptionsJson: '[]',
          spaceArchiveRecordsJson: '[]',
          viewportX: 0,
          viewportY: 0,
          viewportZoom: 1,
          isMinimapVisible: true,
          activeSpaceId: null,
        },
        {
          id: 'workspace-b',
          sortOrder: 2,
          name: 'workspace-b',
          path: '/tmp/workspace-b',
          worktreesRoot: '/tmp',
          lifecycleState: 'active',
          archivedAt: null,
          pullRequestBaseBranchOptionsJson: '[]',
          spaceArchiveRecordsJson: '[]',
          viewportX: 0,
          viewportY: 0,
          viewportZoom: 1,
          isMinimapVisible: true,
          activeSpaceId: null,
        },
        {
          id: 'workspace-c',
          sortOrder: 0,
          name: 'workspace-c',
          path: '/tmp/workspace-c',
          worktreesRoot: '/tmp',
          lifecycleState: 'active',
          archivedAt: null,
          pullRequestBaseBranchOptionsJson: '[]',
          spaceArchiveRecordsJson: '[]',
          viewportX: 0,
          viewportY: 0,
          viewportZoom: 1,
          isMinimapVisible: true,
          activeSpaceId: null,
        },
      ],
      nodeRows: [],
      spaceRows: [],
      spaceNodeRows: [],
    })

    const result = readAppStateFromDb(db as never)

    expect(result?.workspaces.map(workspace => workspace.id)).toEqual([
      'workspace-c',
      'workspace-a',
      'workspace-b',
    ])
  })

  it('falls back to safe node titles when persisted rows are malformed', () => {
    const db = new FakeDb({
      metaRows: [
        { key: 'format_version', value: '1' },
        { key: 'active_workspace_id', value: 'workspace-1' },
      ],
      settingsRow: { value: '{}' },
      workspaceRows: [
        {
          id: 'workspace-1',
          sortOrder: 0,
          name: 'workspace-1',
          path: '/tmp/workspace-1',
          worktreesRoot: '/tmp',
          lifecycleState: 'active',
          archivedAt: null,
          pullRequestBaseBranchOptionsJson: '[]',
          spaceArchiveRecordsJson: '[]',
          viewportX: 0,
          viewportY: 0,
          viewportZoom: 1,
          isMinimapVisible: true,
          activeSpaceId: null,
        },
      ],
      nodeRows: [
        {
          id: 'agent-1',
          workspaceId: 'workspace-1',
          title: undefined as unknown as string,
          titlePinnedByUser: 0,
          positionX: 0,
          positionY: 0,
          width: 480,
          height: 320,
          kind: 'agent',
          labelColorOverride: null,
          status: 'running',
          startedAt: null,
          endedAt: null,
          exitCode: null,
          lastError: null,
          executionDirectory: null,
          expectedDirectory: null,
          agentJson: null,
          hostedAgentJson: null,
          taskJson: null,
        },
        {
          id: 'note-1',
          workspaceId: 'workspace-1',
          title: undefined as unknown as string,
          titlePinnedByUser: 0,
          positionX: 24,
          positionY: 24,
          width: 320,
          height: 200,
          kind: 'note',
          labelColorOverride: null,
          status: null,
          startedAt: null,
          endedAt: null,
          exitCode: null,
          lastError: null,
          executionDirectory: null,
          expectedDirectory: null,
          agentJson: null,
          hostedAgentJson: null,
          taskJson: null,
        },
      ],
      spaceRows: [],
      spaceNodeRows: [],
    })

    const result = readAppStateFromDb(db as never)

    expect(result?.workspaces[0]?.nodes[0]?.title).toBe('未命名 Agent')
    expect(result?.workspaces[0]?.nodes[1]?.title).toBe('未命名笔记')
  })
})
