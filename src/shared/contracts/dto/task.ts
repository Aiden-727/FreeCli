import type { AgentProviderId } from './agent'

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface SuggestTaskTitleInput {
  provider: AgentProviderId
  cwd: string
  requirement: string
  model?: string | null
  availableTags?: string[]
}

export interface SuggestTaskTitleResult {
  title: string
  priority: TaskPriority
  tags: string[]
  provider: AgentProviderId
  effectiveModel: string | null
}
