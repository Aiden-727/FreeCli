import type Database from 'better-sqlite3'
import type { DbAppMetaKey } from './schema'
import type { NormalizedPersistedAppState } from './normalize'
import { normalizeScrollback } from './normalize'
import { safeJsonStringify } from './utils'

function buildSqlitePlaceholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

function deleteRowsMissingIds(
  db: Database.Database,
  tableName: string,
  columnName: string,
  ids: string[],
): void {
  if (ids.length === 0) {
    db.prepare(`DELETE FROM ${tableName}`).run()
    return
  }

  db.prepare(
    `DELETE FROM ${tableName} WHERE ${columnName} NOT IN (${buildSqlitePlaceholders(ids.length)})`,
  ).run(...ids)
}

function deleteScopedRowsMissingIds(
  db: Database.Database,
  options: {
    tableName: string
    scopeColumnName: string
    scopeValue: string
    idColumnName: string
    ids: string[]
  },
): void {
  const { tableName, scopeColumnName, scopeValue, idColumnName, ids } = options

  if (ids.length === 0) {
    db.prepare(`DELETE FROM ${tableName} WHERE ${scopeColumnName} = ?`).run(scopeValue)
    return
  }

  db.prepare(
    `
      DELETE FROM ${tableName}
      WHERE ${scopeColumnName} = ?
        AND ${idColumnName} NOT IN (${buildSqlitePlaceholders(ids.length)})
    `,
  ).run(scopeValue, ...ids)
}

export function writeNormalizedAppState(
  db: Database.Database,
  state: NormalizedPersistedAppState,
): void {
  const upsertMeta = db.prepare(
    `
      INSERT INTO app_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
  )
  const upsertSettings = db.prepare(
    `
      INSERT INTO app_settings (id, value)
      VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET value = excluded.value
    `,
  )

  const insertWorkspace = db.prepare(
    `
      INSERT INTO workspaces (
        id, name, path, worktrees_root, pull_request_base_branch_options_json, space_archive_records_json,
        viewport_x, viewport_y, viewport_zoom,
        is_minimap_visible, active_space_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        path = excluded.path,
        worktrees_root = excluded.worktrees_root,
        pull_request_base_branch_options_json = excluded.pull_request_base_branch_options_json,
        space_archive_records_json = excluded.space_archive_records_json,
        viewport_x = excluded.viewport_x,
        viewport_y = excluded.viewport_y,
        viewport_zoom = excluded.viewport_zoom,
        is_minimap_visible = excluded.is_minimap_visible,
        active_space_id = excluded.active_space_id
    `,
  )

  const insertNode = db.prepare(
    `
      INSERT INTO nodes (
        id, workspace_id, title, title_pinned_by_user,
        position_x, position_y, width, height,
        kind, label_color_override,
        status, started_at, ended_at, exit_code, last_error,
        execution_directory, expected_directory, agent_json, hosted_agent_json, task_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        title = excluded.title,
        title_pinned_by_user = excluded.title_pinned_by_user,
        position_x = excluded.position_x,
        position_y = excluded.position_y,
        width = excluded.width,
        height = excluded.height,
        kind = excluded.kind,
        label_color_override = excluded.label_color_override,
        status = excluded.status,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        exit_code = excluded.exit_code,
        last_error = excluded.last_error,
        execution_directory = excluded.execution_directory,
        expected_directory = excluded.expected_directory,
        agent_json = excluded.agent_json,
        hosted_agent_json = excluded.hosted_agent_json,
        task_json = excluded.task_json
    `,
  )

  const insertSpace = db.prepare(
    `
      INSERT INTO workspace_spaces (
        id, workspace_id, name, directory_path, label_color,
        rect_x, rect_y, rect_width, rect_height
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        name = excluded.name,
        directory_path = excluded.directory_path,
        label_color = excluded.label_color,
        rect_x = excluded.rect_x,
        rect_y = excluded.rect_y,
        rect_width = excluded.rect_width,
        rect_height = excluded.rect_height
    `,
  )

  const insertSpaceNode = db.prepare(
    `
      INSERT INTO workspace_space_nodes (space_id, node_id, sort_order)
      VALUES (?, ?, ?)
      ON CONFLICT(space_id, node_id) DO UPDATE SET
        sort_order = excluded.sort_order
    `,
  )

  const writeTx = db.transaction(() => {
    upsertMeta.run('format_version' satisfies DbAppMetaKey, String(state.formatVersion))
    upsertMeta.run('active_workspace_id' satisfies DbAppMetaKey, state.activeWorkspaceId ?? '')

    upsertSettings.run(safeJsonStringify(state.settings ?? {}))

    const workspaceIds = state.workspaces.map(workspace => workspace.id)
    const nodeIds: string[] = []
    const spaceIds: string[] = []

    for (const workspace of state.workspaces) {
      insertWorkspace.run(
        workspace.id,
        workspace.name,
        workspace.path,
        workspace.worktreesRoot,
        safeJsonStringify(workspace.pullRequestBaseBranchOptions),
        safeJsonStringify(workspace.spaceArchiveRecords),
        workspace.viewport.x,
        workspace.viewport.y,
        workspace.viewport.zoom,
        workspace.isMinimapVisible ? 1 : 0,
        workspace.activeSpaceId,
      )

      for (const node of workspace.nodes) {
        nodeIds.push(node.id)
        insertNode.run(
          node.id,
          workspace.id,
          node.title,
          node.titlePinnedByUser === true ? 1 : 0,
          node.position.x,
          node.position.y,
          node.width,
          node.height,
          node.kind,
          node.labelColorOverride,
          node.status,
          node.startedAt,
          node.endedAt,
          node.exitCode,
          node.lastError,
          node.executionDirectory ?? null,
          node.expectedDirectory ?? null,
          node.agent ? safeJsonStringify(node.agent) : null,
          node.hostedAgent ? safeJsonStringify(node.hostedAgent) : null,
          node.task ? safeJsonStringify(node.task) : null,
        )
      }

      for (const space of workspace.spaces) {
        spaceIds.push(space.id)
        insertSpace.run(
          space.id,
          workspace.id,
          space.name,
          space.directoryPath,
          space.labelColor,
          space.rect?.x ?? null,
          space.rect?.y ?? null,
          space.rect?.width ?? null,
          space.rect?.height ?? null,
        )

        space.nodeIds.forEach((nodeId, index) => {
          insertSpaceNode.run(space.id, nodeId, index)
        })

        // Space membership is scoped to each space; remove only links missing from that space.
        deleteScopedRowsMissingIds(db, {
          tableName: 'workspace_space_nodes',
          scopeColumnName: 'space_id',
          scopeValue: space.id,
          idColumnName: 'node_id',
          ids: space.nodeIds,
        })
      }
    }

    deleteRowsMissingIds(db, 'workspaces', 'id', workspaceIds)
    deleteRowsMissingIds(db, 'nodes', 'id', nodeIds)
    deleteRowsMissingIds(db, 'workspace_spaces', 'id', spaceIds)
    deleteRowsMissingIds(db, 'workspace_space_nodes', 'space_id', spaceIds)

    // Keep scrollback only for still-present nodes.
    db.exec('DELETE FROM node_scrollback WHERE node_id NOT IN (SELECT id FROM nodes)')
  })

  writeTx()
}

export function writeNormalizedScrollbacks(
  db: Database.Database,
  state: NormalizedPersistedAppState,
): void {
  const insertScrollback = db.prepare(
    `
      INSERT INTO node_scrollback (node_id, scrollback, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(node_id) DO UPDATE SET
        scrollback = excluded.scrollback,
        updated_at = excluded.updated_at
      WHERE node_scrollback.scrollback <> excluded.scrollback
    `,
  )

  const now = new Date().toISOString()

  const writeTx = db.transaction(() => {
    const scrollbackNodeIds: string[] = []

    for (const workspace of state.workspaces) {
      for (const node of workspace.nodes) {
        const scrollback = normalizeScrollback(node.scrollback)
        if (!scrollback) {
          continue
        }

        scrollbackNodeIds.push(node.id)
        insertScrollback.run(node.id, scrollback, now)
      }
    }

    deleteRowsMissingIds(db, 'node_scrollback', 'node_id', scrollbackNodeIds)
  })

  writeTx()
}
