import React, { type JSX } from 'react'
import { Handle, Position } from '@xyflow/react'
import { TerminalNodeHeader } from './TerminalNodeHeader'
import { TerminalNodeFindBar } from './TerminalNodeFindBar'
import { NodeResizeHandles } from '../shared/NodeResizeHandles'
import { resolveTerminalNodeInteraction } from './interaction'
import { shouldStopWheelPropagation } from './wheel'
import type { AgentRuntimeStatus, TerminalPersistenceMode, WorkspaceNodeKind } from '../../types'
import type { LabelColor } from '@shared/types/labelColor'
import type { TerminalThemeMode } from './theme'
import { resolveTerminalUiTheme } from './theme'
import type { TerminalNodeInteractionOptions } from '../TerminalNode.types'
import type { ResizeEdges } from '../../utils/nodeFrameResize'

interface TerminalNodeFrameProps {
  title: string
  modelLabel?: string | null
  kind: WorkspaceNodeKind
  isAgentLike?: boolean
  labelColor?: LabelColor | null
  terminalThemeMode: TerminalThemeMode
  credentialProfileId?: string | null
  activeCredentialProfileId?: string | null
  terminalCredentialProfiles?: Array<{
    id: string
    label: string
    provider: 'codex' | 'claude-code'
  }>
  activeCredentialProvider?: 'codex' | 'claude-code' | null
  isSelected: boolean
  isDragging: boolean
  status: AgentRuntimeStatus | null
  directoryMismatch?: { executionDirectory: string; expectedDirectory: string } | null
  lastError: string | null
  persistenceMode: TerminalPersistenceMode
  sessionId: string
  isTerminalHydrated: boolean
  isPasteIndicatorVisible: boolean
  pasteIndicatorLabel: string
  sizeStyle: React.CSSProperties
  containerRef: React.RefObject<HTMLDivElement | null>
  handleTerminalBodyPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => void
  handleTerminalBodyPointerMoveCapture: (event: React.PointerEvent<HTMLDivElement>) => void
  handleTerminalBodyPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
  handleTerminalBodyPaste: (event: React.ClipboardEvent<HTMLDivElement>) => void
  handleTerminalBodyDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  handleTerminalBodyDrop: (event: React.DragEvent<HTMLDivElement>) => void
  consumeIgnoredTerminalBodyClick: (target: EventTarget | null) => boolean
  onInteractionStart?: (options?: TerminalNodeInteractionOptions) => void
  onTitleCommit?: (title: string) => void
  onCredentialProfileChange?: (credentialProfileId: string | null) => void
  onPersistenceModeChange?: (mode: TerminalPersistenceMode) => void
  onClose: () => void
  onCopyLastMessage?: () => Promise<void>
  find: {
    isOpen: boolean
    query: string
    resultIndex: number
    resultCount: number
  }
  onFindQueryChange: (query: string) => void
  onFindNext: () => void
  onFindPrevious: () => void
  onFindClose: () => void
  handleResizePointerDown: (edges: ResizeEdges) => (event: React.PointerEvent<HTMLElement>) => void
}

export function TerminalNodeFrame({
  title,
  modelLabel,
  kind,
  isAgentLike = false,
  labelColor,
  terminalThemeMode,
  credentialProfileId,
  activeCredentialProfileId,
  terminalCredentialProfiles,
  activeCredentialProvider,
  isSelected,
  isDragging,
  status,
  directoryMismatch,
  lastError,
  persistenceMode,
  sessionId,
  isTerminalHydrated,
  isPasteIndicatorVisible,
  pasteIndicatorLabel,
  sizeStyle,
  containerRef,
  handleTerminalBodyPointerDownCapture,
  handleTerminalBodyPointerMoveCapture,
  handleTerminalBodyPointerUp,
  handleTerminalBodyPaste,
  handleTerminalBodyDragOver,
  handleTerminalBodyDrop,
  consumeIgnoredTerminalBodyClick,
  onInteractionStart,
  onTitleCommit,
  onCredentialProfileChange,
  onPersistenceModeChange,
  onClose,
  onCopyLastMessage,
  find,
  onFindQueryChange,
  onFindNext,
  onFindPrevious,
  onFindClose,
  handleResizePointerDown,
}: TerminalNodeFrameProps): JSX.Element {
  const isAgentNode = kind === 'agent'
  const showAgentChrome = isAgentNode || isAgentLike
  const hasSelectedDragSurface = isSelected || isDragging
  const resolvedTerminalUiTheme = resolveTerminalUiTheme(terminalThemeMode)

  return (
    <div
      className={`terminal-node nowheel ${hasSelectedDragSurface ? 'terminal-node--selected-surface' : ''}`.trim()}
      data-cove-terminal-node-theme={resolvedTerminalUiTheme}
      style={sizeStyle}
      onPointerDownCapture={handleTerminalBodyPointerDownCapture}
      onPointerMoveCapture={handleTerminalBodyPointerMoveCapture}
      onPointerUp={handleTerminalBodyPointerUp}
      onClickCapture={event => {
        if (event.button !== 0) {
          return
        }

        if (
          event.target instanceof Element &&
          !event.target.closest('.terminal-node__terminal') &&
          document.activeElement instanceof HTMLElement &&
          document.activeElement.closest('[data-cove-focus-scope=terminal]')
        ) {
          // Clicking terminal chrome (header/badges/close) should release terminal focus so that
          // workspace-level shortcuts work deterministically (especially in E2E where terminals
          // auto-focus on mount).
          document.activeElement.blur()
        }

        if (
          event.detail === 2 &&
          event.target instanceof Element &&
          event.target.closest('.terminal-node__header') &&
          !event.target.closest('.nodrag')
        ) {
          return
        }

        if (consumeIgnoredTerminalBodyClick(event.target)) {
          event.stopPropagation()
          return
        }

        const interaction = resolveTerminalNodeInteraction(event.target)
        if (!interaction) {
          return
        }

        event.stopPropagation()
        onInteractionStart?.({
          normalizeViewport: interaction.normalizeViewport,
          selectNode: interaction.selectNode || event.shiftKey,
          shiftKey: event.shiftKey,
        })
      }}
      onWheel={event => {
        if (shouldStopWheelPropagation(event.currentTarget)) {
          event.stopPropagation()
        }
      }}
    >
      <Handle type="target" position={Position.Left} className="workspace-node-handle" />
      <Handle type="source" position={Position.Right} className="workspace-node-handle" />

      <TerminalNodeHeader
        title={title}
        modelLabel={modelLabel}
        kind={kind}
        isAgentLike={showAgentChrome}
        status={status}
        labelColor={labelColor ?? null}
        directoryMismatch={directoryMismatch}
        credentialProfileId={credentialProfileId}
        activeCredentialProfileId={activeCredentialProfileId}
        terminalCredentialProfiles={terminalCredentialProfiles}
        activeCredentialProvider={activeCredentialProvider}
        persistenceMode={kind === 'terminal' ? persistenceMode : undefined}
        onTitleCommit={onTitleCommit}
        onCredentialProfileChange={onCredentialProfileChange}
        onPersistenceModeChange={onPersistenceModeChange}
        onClose={onClose}
        onCopyLastMessage={onCopyLastMessage}
      />

      {showAgentChrome && lastError ? (
        <div className="terminal-node__error">{lastError}</div>
      ) : null}

      <TerminalNodeFindBar
        isOpen={find.isOpen}
        query={find.query}
        resultIndex={find.resultIndex}
        resultCount={find.resultCount}
        onQueryChange={onFindQueryChange}
        onFindNext={onFindNext}
        onFindPrevious={onFindPrevious}
        onClose={onFindClose}
      />

      <div
        ref={containerRef}
        className={`terminal-node__terminal nodrag ${isTerminalHydrated ? '' : 'terminal-node__terminal--hydrating'}`.trim()}
        data-cove-focus-scope="terminal"
        aria-busy={sessionId.trim().length > 0 && isTerminalHydrated ? 'false' : 'true'}
        onPaste={handleTerminalBodyPaste}
        onDragOver={handleTerminalBodyDragOver}
        onDrop={handleTerminalBodyDrop}
      >
        {isPasteIndicatorVisible ? (
          <div className="terminal-node__paste-indicator" role="status" aria-live="polite">
            <span className="terminal-node__paste-indicator-dot" aria-hidden="true" />
            <span>{pasteIndicatorLabel}</span>
          </div>
        ) : null}
      </div>

      <NodeResizeHandles
        classNamePrefix="terminal-node"
        testIdPrefix="terminal-resizer"
        handleResizePointerDown={handleResizePointerDown}
      />
    </div>
  )
}
