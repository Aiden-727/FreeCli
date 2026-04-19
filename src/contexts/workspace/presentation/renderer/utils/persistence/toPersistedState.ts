import { DEFAULT_AGENT_SETTINGS, type AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { PersistedAppState, PersistedWorkspaceState, WorkspaceState } from '../../types'
import { DEFAULT_WORKSPACE_MINIMAP_VISIBLE } from '../../types'
import { PERSISTED_APP_STATE_FORMAT_VERSION } from './constants'
import {
  normalizeOptionalString,
  normalizePullRequestBaseBranchOptions,
  normalizeWorkspaceSpaceNodeIds,
  normalizeWorkspaceSpaceRect,
  normalizeWorkspaceViewport,
} from './normalize'
import { normalizeLabelColor, normalizeNodeLabelColorOverride } from '@shared/types/labelColor'

export function toPersistedWorkspaceState(workspace: WorkspaceState): PersistedWorkspaceState {
  const persistedNodes = workspace.nodes.filter(
    node => !(node.data.kind === 'terminal' && node.data.persistenceMode === 'ephemeral'),
  )
  const persistedNodeIds = new Set(persistedNodes.map(node => node.id))
  const persistedSpaces = workspace.spaces.map(space => ({
    id: space.id,
    name: space.name,
    directoryPath:
      normalizeOptionalString(space.directoryPath) ??
      normalizeOptionalString(workspace.path) ??
      workspace.path,
    labelColor: normalizeLabelColor(space.labelColor),
    nodeIds: normalizeWorkspaceSpaceNodeIds(space.nodeIds).filter(nodeId =>
      persistedNodeIds.has(nodeId),
    ),
    rect: normalizeWorkspaceSpaceRect(space.rect),
  }))

  return {
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    worktreesRoot: normalizeOptionalString(workspace.worktreesRoot) ?? '',
    pullRequestBaseBranchOptions: normalizePullRequestBaseBranchOptions(
      workspace.pullRequestBaseBranchOptions,
    ),
    viewport: normalizeWorkspaceViewport(workspace.viewport),
    isMinimapVisible:
      typeof workspace.isMinimapVisible === 'boolean'
        ? workspace.isMinimapVisible
        : DEFAULT_WORKSPACE_MINIMAP_VISIBLE,
    spaces: persistedSpaces,
    activeSpaceId:
      workspace.activeSpaceId && persistedSpaces.some(space => space.id === workspace.activeSpaceId)
        ? workspace.activeSpaceId
        : null,
    spaceArchiveRecords: Array.isArray(workspace.spaceArchiveRecords)
      ? workspace.spaceArchiveRecords.slice(0, 50)
      : [],
    nodes: persistedNodes.map(node => ({
      id: node.id,
      title: node.data.title,
      titlePinnedByUser: node.data.titlePinnedByUser === true,
      position: node.position,
      width: node.data.width,
      height: node.data.height,
      kind: node.data.kind,
      profileId: normalizeOptionalString(node.data.profileId),
      credentialProfileId: normalizeOptionalString(node.data.credentialProfileId),
      activeCredentialProfileId: normalizeOptionalString(node.data.activeCredentialProfileId),
      runtimeKind: node.data.runtimeKind,
      labelColorOverride: normalizeNodeLabelColorOverride(node.data.labelColorOverride),
      status: node.data.status,
      startedAt: node.data.startedAt,
      endedAt: node.data.endedAt,
      exitCode: node.data.exitCode,
      lastError: node.data.lastError,
      scrollback: null,
      executionDirectory: normalizeOptionalString(node.data.executionDirectory),
      expectedDirectory: normalizeOptionalString(node.data.expectedDirectory),
      agent: node.data.agent,
      hostedAgent: node.data.hostedAgent,
      task:
        node.data.kind === 'note'
          ? node.data.note
          : node.data.kind === 'image'
            ? node.data.image
            : node.data.task,
    })),
  }
}

export function toPersistedState(
  workspaces: WorkspaceState[],
  activeWorkspaceId: string | null,
  settings: AgentSettings = DEFAULT_AGENT_SETTINGS,
): PersistedAppState {
  return {
    formatVersion: PERSISTED_APP_STATE_FORMAT_VERSION,
    activeWorkspaceId,
    workspaces: workspaces.map(toPersistedWorkspaceState),
    settings,
  }
}
