import type {
  AgentRuntimeStatus,
  NodeFrame,
  Point,
  TerminalPersistenceMode,
  WorkspaceNodeKind,
} from '../types'
import type { TerminalRuntimeKind } from '@shared/contracts/dto'
import type { LabelColor } from '@shared/types/labelColor'
import type { TerminalThemeMode } from './terminalNode/theme'

export interface TerminalNodeInteractionOptions {
  normalizeViewport?: boolean
  selectNode?: boolean
  shiftKey?: boolean
}

export interface TerminalNodeProps {
  nodeId: string
  sessionId: string
  title: string
  modelLabel?: string | null
  kind: WorkspaceNodeKind
  isAgentLike?: boolean
  labelColor?: LabelColor | null
  terminalThemeMode?: TerminalThemeMode
  profileId?: string | null
  runtimeKind?: TerminalRuntimeKind
  credentialProfileId?: string | null
  activeCredentialProfileId?: string | null
  terminalCredentialProfiles?: Array<{
    id: string
    label: string
    provider: 'codex' | 'claude-code'
  }>
  activeCredentialProvider?: 'codex' | 'claude-code' | null
  isSelected?: boolean
  isDragging?: boolean
  status: AgentRuntimeStatus | null
  directoryMismatch?: { executionDirectory: string; expectedDirectory: string } | null
  lastError: string | null
  position: Point
  width: number
  height: number
  terminalFontSize: number
  scrollback: string | null
  persistenceMode: TerminalPersistenceMode
  onClose: () => void
  onCopyLastMessage?: () => Promise<void>
  onResize: (frame: NodeFrame) => void
  onScrollbackChange?: (scrollback: string) => void
  onTitleCommit?: (title: string) => void
  onCredentialProfileChange?: (credentialProfileId: string | null) => void
  onPersistenceModeChange?: (mode: TerminalPersistenceMode) => void
  onCommandRun?: (command: string) => void
  onAlternateScreenChange?: (active: boolean) => void
  onInteractionStart?: (options?: TerminalNodeInteractionOptions) => void
  onShowMessage?: (message: string, tone?: 'info' | 'warning' | 'error') => void
}
