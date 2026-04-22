import { createAppError } from '../../../../shared/errors/appError'
import type { BuiltinPluginId } from '../../domain/pluginManifest'
import {
  normalizeGitWorklogSettings,
  normalizeGitWorklogWorkspaces,
} from '../../domain/gitWorklogSettings'
import { normalizeInputStatsSettings } from '../../domain/inputStatsSettings'
import { normalizeOssBackupSettings } from '../../domain/ossBackupSettings'
import { normalizeQuotaMonitorSettings } from '../../domain/quotaMonitorSettings'
import { normalizeSystemMonitorSettings } from '../../domain/systemMonitorSettings'
import { normalizeWorkspaceAssistantSettings } from '../../domain/workspaceAssistantSettings'
import { normalizeBuiltinPluginIds } from '../../domain/pluginManifest'
import type {
  GitWorklogSettingsDto,
  GitWorklogWorkspaceDto,
  InputStatsSettingsDto,
  NotifyOssBackupPersistedSettingsInput,
  OssBackupSettingsDto,
  QuotaMonitorSettingsDto,
  ResolveGitWorklogRepositoryInput,
  SystemMonitorSettingsDto,
  SyncWorkspaceAssistantWorkspaceSnapshotInput,
  WorkspaceAssistantPromptInput,
  WorkspaceAssistantProjectFileSummaryDto,
  WorkspaceAssistantWorkspaceSnapshotDto,
  WorkspaceAssistantSettingsDto,
} from '@shared/contracts/dto'

export interface NormalizedSyncPluginRuntimeStatePayload {
  enabledPluginIds: BuiltinPluginId[]
}

export interface NormalizedSyncQuotaMonitorSettingsPayload {
  settings: QuotaMonitorSettingsDto
}

export interface NormalizedSyncInputStatsSettingsPayload {
  settings: InputStatsSettingsDto
}

export interface NormalizedSyncSystemMonitorSettingsPayload {
  settings: SystemMonitorSettingsDto
}

export interface NormalizedSyncGitWorklogSettingsPayload {
  settings: GitWorklogSettingsDto
}

export interface NormalizedSyncGitWorklogWorkspacesPayload {
  workspaces: GitWorklogWorkspaceDto[]
}

export interface NormalizedResolveGitWorklogRepositoryPayload
  extends ResolveGitWorklogRepositoryInput {}

export interface NormalizedSyncOssBackupSettingsPayload {
  settings: OssBackupSettingsDto
}

export interface NormalizedNotifyOssBackupPersistedSettingsPayload extends NotifyOssBackupPersistedSettingsInput {}

export interface NormalizedSyncWorkspaceAssistantSettingsPayload {
  settings: WorkspaceAssistantSettingsDto
}

export interface NormalizedSyncWorkspaceAssistantWorkspaceSnapshotPayload
  extends SyncWorkspaceAssistantWorkspaceSnapshotInput {}

export interface NormalizedWorkspaceAssistantPromptPayload extends WorkspaceAssistantPromptInput {}

export function normalizeSyncPluginRuntimeStatePayload(
  payload: unknown,
): NormalizedSyncPluginRuntimeStatePayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:sync-runtime-state',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    enabledPluginIds: normalizeBuiltinPluginIds(record.enabledPluginIds),
  }
}

export function normalizeSyncQuotaMonitorSettingsPayload(
  payload: unknown,
): NormalizedSyncQuotaMonitorSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:quota-monitor:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeQuotaMonitorSettings(record.settings),
  }
}

export function normalizeSyncInputStatsSettingsPayload(
  payload: unknown,
): NormalizedSyncInputStatsSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:input-stats:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeInputStatsSettings(record.settings),
  }
}

export function normalizeSyncSystemMonitorSettingsPayload(
  payload: unknown,
): NormalizedSyncSystemMonitorSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:system-monitor:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeSystemMonitorSettings(record.settings),
  }
}

export function normalizeSyncGitWorklogSettingsPayload(
  payload: unknown,
): NormalizedSyncGitWorklogSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:git-worklog:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeGitWorklogSettings(record.settings),
  }
}

export function normalizeSyncGitWorklogWorkspacesPayload(
  payload: unknown,
): NormalizedSyncGitWorklogWorkspacesPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:git-worklog:sync-workspaces',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    workspaces: normalizeGitWorklogWorkspaces(record.workspaces),
  }
}

export function normalizeResolveGitWorklogRepositoryPayload(
  payload: unknown,
): NormalizedResolveGitWorklogRepositoryPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:git-worklog:resolve-repository',
    })
  }

  const record = payload as Record<string, unknown>
  const path = typeof record.path === 'string' ? record.path.trim() : ''
  if (path.length === 0) {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid path for plugins:git-worklog:resolve-repository',
    })
  }

  return { path }
}

export function normalizeSyncOssBackupSettingsPayload(
  payload: unknown,
): NormalizedSyncOssBackupSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:oss-backup:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeOssBackupSettings(record.settings),
  }
}

export function normalizeNotifyOssBackupPersistedSettingsPayload(
  payload: unknown,
): NormalizedNotifyOssBackupPersistedSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:oss-backup:notify-persisted-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    changedPluginIds: normalizeBuiltinPluginIds(record.changedPluginIds),
  }
}

export function normalizeSyncWorkspaceAssistantSettingsPayload(
  payload: unknown,
): NormalizedSyncWorkspaceAssistantSettingsPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:workspace-assistant:sync-settings',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    settings: normalizeWorkspaceAssistantSettings(record.settings),
  }
}

function normalizeAssistantString(value: unknown, fallback = '', maxLength = 500): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized
}

function normalizeAssistantNullableString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    return null
  }

  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized
}

function normalizeAssistantCount(value: unknown): number {
  const count = Number(value)
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
}

function normalizeWorkspaceAssistantProjectFiles(
  value: unknown,
): WorkspaceAssistantProjectFileSummaryDto[] {
  if (!Array.isArray(value)) {
    return []
  }

  const supportedKinds = new Set([
    'readme',
    'package_json',
    'tsconfig',
    'pnpm_workspace',
    'gitignore',
    'other',
  ] as const)

  return value.slice(0, 20).map(fileValue => {
    if (!fileValue || typeof fileValue !== 'object') {
      throw createAppError('common.invalid_input', {
        debugMessage:
          'Invalid project file summary for plugins:workspace-assistant:sync-workspace-snapshot',
      })
    }

    const file = fileValue as Record<string, unknown>
    const kind = typeof file.kind === 'string' ? file.kind : 'other'

    return {
      kind: supportedKinds.has(kind as WorkspaceAssistantProjectFileSummaryDto['kind'])
        ? (kind as WorkspaceAssistantProjectFileSummaryDto['kind'])
        : 'other',
      name: normalizeAssistantString(file.name, 'unknown', 160),
      path: normalizeAssistantString(file.path, '', 400),
      summary: normalizeAssistantString(file.summary, '', 280),
    }
  })
}

function normalizeWorkspaceAssistantWorkspaceSnapshot(
  value: unknown,
): WorkspaceAssistantWorkspaceSnapshotDto | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid workspace snapshot for plugins:workspace-assistant:sync-workspace-snapshot',
    })
  }

  const record = value as Record<string, unknown>
  const taskStatuses = new Set(['todo', 'doing', 'ai_done', 'done'])
  const taskPriorities = new Set(['low', 'medium', 'high', 'urgent'])

  return {
    id: normalizeAssistantString(record.id, 'workspace'),
    name: normalizeAssistantString(record.name, '未命名项目', 120),
    path: normalizeAssistantString(record.path, '', 400),
    activeSpaceId: normalizeAssistantNullableString(record.activeSpaceId, 120),
    spaceCount: normalizeAssistantCount(record.spaceCount),
    nodeCount: normalizeAssistantCount(record.nodeCount),
    taskCount: normalizeAssistantCount(record.taskCount),
    agentCount: normalizeAssistantCount(record.agentCount),
    noteCount: normalizeAssistantCount(record.noteCount),
    terminalCount: normalizeAssistantCount(record.terminalCount),
    projectSummary: normalizeAssistantNullableString(record.projectSummary, 1000),
    projectFiles: normalizeWorkspaceAssistantProjectFiles(record.projectFiles),
    tasks: Array.isArray(record.tasks)
      ? record.tasks.slice(0, 50).map(taskValue => {
          if (!taskValue || typeof taskValue !== 'object') {
            throw createAppError('common.invalid_input', {
              debugMessage:
                'Invalid task snapshot for plugins:workspace-assistant:sync-workspace-snapshot',
            })
          }

          const task = taskValue as Record<string, unknown>
          const status = typeof task.status === 'string' ? task.status : 'todo'
          const priority = typeof task.priority === 'string' ? task.priority : 'medium'

          return {
            id: normalizeAssistantString(task.id, 'task'),
            title: normalizeAssistantString(task.title, '未命名任务', 160),
            status: taskStatuses.has(status) ? status : 'todo',
            priority: taskPriorities.has(priority) ? priority : 'medium',
            linkedAgentNodeId: normalizeAssistantNullableString(task.linkedAgentNodeId, 120),
            lastRunAt: normalizeAssistantNullableString(task.lastRunAt, 80),
          }
        })
      : [],
    agents: Array.isArray(record.agents)
      ? record.agents.slice(0, 50).map(agentValue => {
          if (!agentValue || typeof agentValue !== 'object') {
            throw createAppError('common.invalid_input', {
              debugMessage:
                'Invalid agent snapshot for plugins:workspace-assistant:sync-workspace-snapshot',
            })
          }

          const agent = agentValue as Record<string, unknown>
          return {
            id: normalizeAssistantString(agent.id, 'agent'),
            title: normalizeAssistantString(agent.title, '未命名 Agent', 160),
            status: normalizeAssistantNullableString(agent.status, 80),
            provider: normalizeAssistantNullableString(agent.provider, 80),
            taskId: normalizeAssistantNullableString(agent.taskId, 120),
            prompt: normalizeAssistantString(agent.prompt, '', 240),
            lastError: normalizeAssistantNullableString(agent.lastError, 240),
          }
        })
      : [],
    notes: Array.isArray(record.notes)
      ? record.notes.slice(0, 50).map(noteValue => {
          if (!noteValue || typeof noteValue !== 'object') {
            throw createAppError('common.invalid_input', {
              debugMessage:
                'Invalid note snapshot for plugins:workspace-assistant:sync-workspace-snapshot',
            })
          }

          const note = noteValue as Record<string, unknown>
          return {
            id: normalizeAssistantString(note.id, 'note'),
            title: normalizeAssistantString(note.title, '未命名笔记', 160),
            text: normalizeAssistantString(note.text, '', 280),
          }
        })
      : [],
    spaces: Array.isArray(record.spaces)
      ? record.spaces.slice(0, 20).map(spaceValue => {
          if (!spaceValue || typeof spaceValue !== 'object') {
            throw createAppError('common.invalid_input', {
              debugMessage:
                'Invalid space snapshot for plugins:workspace-assistant:sync-workspace-snapshot',
            })
          }

          const space = spaceValue as Record<string, unknown>
          return {
            id: normalizeAssistantString(space.id, 'space'),
            name: normalizeAssistantString(space.name, '未命名空间', 120),
            nodeCount: normalizeAssistantCount(space.nodeCount),
          }
        })
      : [],
  }
}

export function normalizeSyncWorkspaceAssistantWorkspaceSnapshotPayload(
  payload: unknown,
): NormalizedSyncWorkspaceAssistantWorkspaceSnapshotPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:workspace-assistant:sync-workspace-snapshot',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    snapshot: normalizeWorkspaceAssistantWorkspaceSnapshot(record.snapshot),
  }
}

export function normalizeWorkspaceAssistantPromptPayload(
  payload: unknown,
): NormalizedWorkspaceAssistantPromptPayload {
  if (!payload || typeof payload !== 'object') {
    throw createAppError('common.invalid_input', {
      debugMessage: 'Invalid payload for plugins:workspace-assistant:prompt',
    })
  }

  const record = payload as Record<string, unknown>
  return {
    prompt: typeof record.prompt === 'string' ? record.prompt : '',
    workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : null,
    workspaceSnapshot: normalizeWorkspaceAssistantWorkspaceSnapshot(record.workspaceSnapshot),
  }
}
