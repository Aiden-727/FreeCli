import type { AgentProviderId } from './agent'

export type AgentExtensionProviderId = Extract<AgentProviderId, 'claude-code' | 'codex'>
export type AgentExtensionScope = 'global'
export type AgentExtensionKind = 'mcp' | 'skill'
export type AgentMcpTransport = 'stdio' | 'http' | 'sse' | 'unknown'

export interface AgentExtensionSummary {
  provider: AgentExtensionProviderId
  scope: AgentExtensionScope
  skillsDirectoryPath: string
  configPath: string | null
  cliAvailable: boolean
  supportsMcpWrite: boolean
  supportsSkillWrite: boolean
}

export interface AgentMcpServerEntry {
  name: string
  enabled: boolean
  transport: AgentMcpTransport
  command: string | null
  args: string[]
  url: string | null
  env: Record<string, string>
  source: 'cli' | 'file'
}

export interface AgentSkillEntry {
  name: string
  path: string
  hasSkillManifest: boolean
}

export interface GetAgentExtensionsInput {
  provider: AgentExtensionProviderId
  scope: AgentExtensionScope
}

export interface GetAgentExtensionsResult {
  summary: AgentExtensionSummary
  mcpServers: AgentMcpServerEntry[]
  skills: AgentSkillEntry[]
}

export interface AddAgentMcpServerInput {
  provider: AgentExtensionProviderId
  scope: AgentExtensionScope
  name: string
  transport: Extract<AgentMcpTransport, 'stdio' | 'http'>
  command?: string | null
  args?: string[]
  url?: string | null
  env?: Record<string, string>
}

export interface RemoveAgentMcpServerInput {
  provider: AgentExtensionProviderId
  scope: AgentExtensionScope
  name: string
}

export interface CreateAgentSkillInput {
  provider: AgentExtensionProviderId
  scope: AgentExtensionScope
  name: string
}

export interface CreateAgentSkillResult {
  skill: AgentSkillEntry
}
