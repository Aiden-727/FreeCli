import type { AgentLaunchMode, AgentProviderId } from './agent'

export interface PseudoTerminalSession {
  sessionId: string
}

export type TerminalRuntimeKind = 'windows' | 'wsl' | 'posix'

export interface TerminalProfile {
  id: string
  label: string
  runtimeKind: TerminalRuntimeKind
}

export interface ListTerminalProfilesResult {
  profiles: TerminalProfile[]
  defaultProfileId: string | null
}

export interface SpawnTerminalInput {
  cwd: string
  profileId?: string
  shell?: string
  credential?: {
    provider: 'codex' | 'claude-code'
    apiKey?: string
    baseUrl?: string
  }
  cols: number
  rows: number
}

export interface SpawnTerminalResult extends PseudoTerminalSession {
  profileId?: string | null
  runtimeKind?: TerminalRuntimeKind
}

export type TerminalWriteEncoding = 'utf8' | 'binary'

export interface WriteTerminalInput {
  sessionId: string
  data: string
  encoding?: TerminalWriteEncoding
}

export interface ResizeTerminalInput {
  sessionId: string
  cols: number
  rows: number
}

export interface KillTerminalInput {
  sessionId: string
}

export interface AttachTerminalInput {
  sessionId: string
}

export interface DetachTerminalInput {
  sessionId: string
}

export interface SnapshotTerminalInput {
  sessionId: string
}

export interface SnapshotTerminalResult {
  data: string
}

export interface TrackHostedTerminalAgentInput {
  sessionId: string
  bindingId: string
  provider: Extract<AgentProviderId, 'claude-code' | 'codex'>
  cwd: string
  launchMode: AgentLaunchMode
  resumeSessionId?: string | null
  startedAt: string
}

export interface TerminalDataEvent {
  sessionId: string
  data: string
}

export interface TerminalExitEvent {
  sessionId: string
  bindingId?: string | null
  exitCode: number
}

export type TerminalSessionState = 'working' | 'standby'

export type TerminalSessionAttentionReason = 'approval' | 'input' | 'recovery'

export interface TerminalSessionStateEvent {
  sessionId: string
  bindingId?: string | null
  state: TerminalSessionState
}

export interface TerminalSessionAttentionEvent {
  sessionId: string
  bindingId?: string | null
  reason: TerminalSessionAttentionReason
}

export interface TerminalSessionMetadataEvent {
  sessionId: string
  bindingId?: string | null
  resumeSessionId: string | null
  effectiveModel?: string | null
  reasoningEffort?: string | null
  displayModelLabel?: string | null
  profileId?: string | null
  runtimeKind?: TerminalRuntimeKind
}
