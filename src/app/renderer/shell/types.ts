import type { AgentProvider } from '@contexts/settings/domain/agentSettings'

export interface ProviderModelCatalogEntry {
  models: string[]
  source: string | null
  fetchedAt: string | null
  isLoading: boolean
  error: string | null
}

export type ProviderModelCatalog = Record<AgentProvider, ProviderModelCatalogEntry>

export interface FocusRequest {
  workspaceId: string
  nodeId: string
  sequence: number
}

export interface PersistNotice {
  tone: 'warning' | 'error'
  message: string
  kind?: 'recovery' | 'write'
}

export interface ProjectContextMenuState {
  workspaceId: string
  x: number
  y: number
}

export type WorkspaceListKind = 'active' | 'archived'

export type WorkspaceListPlacement = 'before' | 'after'

export interface WorkspaceMoveIntent {
  workspaceId: string
  targetList: WorkspaceListKind
  anchorWorkspaceId: string | null
  placement: WorkspaceListPlacement
}

export interface ProjectDeleteConfirmationState {
  workspaceId: string
  workspaceName: string
}
