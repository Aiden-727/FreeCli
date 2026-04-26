import { integer, real, sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core'

export type DbAppMetaKey = 'format_version' | 'active_workspace_id'

export const appMeta = sqliteTable('app_meta', {
  key: text('key').$type<DbAppMetaKey>().primaryKey(),
  value: text('value').notNull(),
})

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey(),
  value: text('value').notNull(),
})

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  sortOrder: integer('sort_order').notNull(),
  name: text('name').notNull(),
  path: text('path').notNull(),
  worktreesRoot: text('worktrees_root').notNull(),
  lifecycleState: text('lifecycle_state').notNull(),
  archivedAt: text('archived_at'),
  pullRequestBaseBranchOptionsJson: text('pull_request_base_branch_options_json').notNull(),
  spaceArchiveRecordsJson: text('space_archive_records_json').notNull(),
  viewportX: real('viewport_x').notNull(),
  viewportY: real('viewport_y').notNull(),
  viewportZoom: real('viewport_zoom').notNull(),
  isMinimapVisible: integer('is_minimap_visible', { mode: 'boolean' }).notNull(),
  activeSpaceId: text('active_space_id'),
})

export const nodes = sqliteTable('nodes', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  title: text('title').notNull(),
  titlePinnedByUser: integer('title_pinned_by_user', { mode: 'number' }).notNull(),
  positionX: real('position_x').notNull(),
  positionY: real('position_y').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  kind: text('kind').notNull(),
  labelColorOverride: text('label_color_override'),
  status: text('status'),
  startedAt: text('started_at'),
  endedAt: text('ended_at'),
  exitCode: integer('exit_code'),
  lastError: text('last_error'),
  executionDirectory: text('execution_directory'),
  expectedDirectory: text('expected_directory'),
  agentJson: text('agent_json'),
  hostedAgentJson: text('hosted_agent_json'),
  taskJson: text('task_json'),
})

export const spaces = sqliteTable('workspace_spaces', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull(),
  name: text('name').notNull(),
  directoryPath: text('directory_path').notNull(),
  labelColor: text('label_color'),
  rectX: real('rect_x'),
  rectY: real('rect_y'),
  rectWidth: real('rect_width'),
  rectHeight: real('rect_height'),
})

export const spaceNodes = sqliteTable(
  'workspace_space_nodes',
  {
    spaceId: text('space_id').notNull(),
    nodeId: text('node_id').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  table => ({
    pk: primaryKey({ columns: [table.spaceId, table.nodeId] }),
  }),
)

export const nodeScrollback = sqliteTable('node_scrollback', {
  nodeId: text('node_id').primaryKey(),
  scrollback: text('scrollback').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const quotaMonitorSnapshots = sqliteTable('quota_monitor_snapshots', {
  id: integer('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  tokenName: text('token_name').notNull(),
  fetchedAt: text('fetched_at').notNull(),
  todayUsedQuota: real('today_used_quota').notNull(),
  todayUsageCount: integer('today_usage_count').notNull(),
  remainQuotaValue: real('remain_quota_value').notNull(),
  remainQuotaDisplay: text('remain_quota_display').notNull(),
  expiredTimeFormatted: text('expired_time_formatted').notNull(),
  statusText: text('status_text').notNull(),
  remainRatio: real('remain_ratio').notNull(),
})

export const quotaMonitorModelLogs = sqliteTable('quota_monitor_model_logs', {
  id: integer('id').primaryKey(),
  profileId: text('profile_id').notNull(),
  tokenName: text('token_name').notNull(),
  modelName: text('model_name').notNull(),
  createdAtEpoch: integer('created_at_epoch').notNull(),
  createdTimeText: text('created_time_text').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  quota: real('quota').notNull(),
  fetchedAt: text('fetched_at').notNull(),
})
