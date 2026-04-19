import React from 'react'
import type { Node } from '@xyflow/react'
import { resolveTerminalRuntimeStatus } from '@app/renderer/shell/utils/terminalRuntimeStatus'
import type { TerminalNodeData } from '../../types'

export interface WorkspaceMinimapViewportWindowLayout {
  left: number
  top: number
  width: number
  height: number
}

export interface WorkspaceMinimapViewportWindowInput {
  nodes: Array<
    Pick<Node<TerminalNodeData>, 'position' | 'hidden'> & {
      data: Pick<TerminalNodeData, 'width' | 'height'>
    }
  >
  viewport: {
    x: number
    y: number
    zoom: number
  }
  flowSize: {
    width: number
    height: number
  }
  minimapSize: {
    width: number
    height: number
  }
  offsetScale?: number
}

interface WorkspaceMinimapNodeComponentProps {
  id: string
  x: number
  y: number
  width: number
  height: number
  borderRadius: number
  className: string
  color?: string
  shapeRendering: string
  strokeColor?: string
  strokeWidth?: number
  headerColor?: string
  selected: boolean
  onClick?: (event: React.MouseEvent, id: string) => void
}

interface WorkspaceMinimapFlowPosition {
  x: number
  y: number
}

type WorkspaceMinimapTaskState = 'todo' | 'doing' | 'done'
type WorkspaceMinimapRuntimeState = 'running' | 'standby' | 'inactive' | 'idle'

function resolveWorkspaceMinimapTaskState(node: Node<TerminalNodeData>): WorkspaceMinimapTaskState {
  switch (node.data.task?.status) {
    case 'doing':
      return 'doing'
    case 'ai_done':
    case 'done':
      return 'done'
    case 'todo':
    default:
      return 'todo'
  }
}

function resolveWorkspaceMinimapAgentState(node: Node<TerminalNodeData>): WorkspaceMinimapRuntimeState {
  switch (node.data.status) {
    case 'running':
    case 'restoring':
      return 'running'
    case 'standby':
      return 'standby'
    case 'failed':
    case 'exited':
    case 'stopped':
    default:
      return 'inactive'
  }
}

function resolveWorkspaceMinimapTerminalState(
  node: Node<TerminalNodeData>,
): WorkspaceMinimapRuntimeState {
  switch (resolveTerminalRuntimeStatus(node.data)) {
    case 'running':
    case 'restoring':
      return 'running'
    case 'standby':
      return 'standby'
    case 'failed':
    case 'exited':
    case 'stopped':
      return 'inactive'
    case null:
    default:
      return 'idle'
  }
}

function resolveWorkspaceMinimapTaskColor(node: Node<TerminalNodeData>): string {
  switch (resolveWorkspaceMinimapTaskState(node)) {
    case 'doing':
      return 'var(--cove-canvas-minimap-node-task-doing)'
    case 'done':
      return 'var(--cove-canvas-minimap-node-task-done)'
    case 'todo':
    default:
      return 'var(--cove-canvas-minimap-node-task-todo)'
  }
}

function resolveWorkspaceMinimapAgentColor(node: Node<TerminalNodeData>): string {
  switch (resolveWorkspaceMinimapAgentState(node)) {
    case 'running':
      return 'var(--cove-canvas-minimap-node-agent-running)'
    case 'standby':
      return 'var(--cove-canvas-minimap-node-agent-standby)'
    case 'inactive':
    default:
      return 'var(--cove-canvas-minimap-node-agent-inactive)'
  }
}

function resolveWorkspaceMinimapTerminalColor(node: Node<TerminalNodeData>): string {
  switch (resolveWorkspaceMinimapTerminalState(node)) {
    case 'running':
      return 'var(--cove-canvas-minimap-node-terminal-running)'
    case 'standby':
      return 'var(--cove-canvas-minimap-node-terminal-standby)'
    case 'inactive':
      return 'var(--cove-canvas-minimap-node-terminal-inactive)'
    case 'idle':
    default:
      return 'var(--cove-canvas-minimap-node-terminal)'
  }
}

function resolveWorkspaceMinimapTaskHeaderColor(node: Node<TerminalNodeData>): string {
  switch (resolveWorkspaceMinimapTaskState(node)) {
    case 'doing':
      return 'var(--cove-canvas-minimap-node-task-doing-header)'
    case 'done':
      return 'var(--cove-canvas-minimap-node-task-done-header)'
    case 'todo':
    default:
      return 'var(--cove-canvas-minimap-node-task-todo-header)'
  }
}

function resolveWorkspaceMinimapAgentHeaderColor(node: Node<TerminalNodeData>): string {
  switch (resolveWorkspaceMinimapAgentState(node)) {
    case 'running':
      return 'var(--cove-canvas-minimap-node-agent-running-header)'
    case 'standby':
      return 'var(--cove-canvas-minimap-node-agent-standby-header)'
    case 'inactive':
    default:
      return 'var(--cove-canvas-minimap-node-agent-inactive-header)'
  }
}

function resolveWorkspaceMinimapTerminalHeaderColor(node: Node<TerminalNodeData>): string {
  switch (resolveWorkspaceMinimapTerminalState(node)) {
    case 'running':
      return 'var(--cove-canvas-minimap-node-terminal-running-header)'
    case 'standby':
      return 'var(--cove-canvas-minimap-node-terminal-standby-header)'
    case 'inactive':
      return 'var(--cove-canvas-minimap-node-terminal-inactive-header)'
    case 'idle':
    default:
      return 'var(--cove-canvas-minimap-node-terminal-header)'
  }
}

export function resolveWorkspaceMinimapNodeColor(node: Node<TerminalNodeData>): string {
  switch (node.data.kind) {
    case 'agent':
      return resolveWorkspaceMinimapAgentColor(node)
    case 'task':
      return resolveWorkspaceMinimapTaskColor(node)
    case 'note':
      return 'var(--cove-canvas-minimap-node-note)'
    case 'image':
      return 'var(--cove-canvas-minimap-node-image)'
    case 'terminal':
      return resolveWorkspaceMinimapTerminalColor(node)
    default:
      return 'var(--cove-canvas-minimap-node-default)'
  }
}

export function resolveWorkspaceMinimapNodeHeaderColor(node: Node<TerminalNodeData>): string {
  switch (node.data.kind) {
    case 'agent':
      return resolveWorkspaceMinimapAgentHeaderColor(node)
    case 'task':
      return resolveWorkspaceMinimapTaskHeaderColor(node)
    case 'note':
      return 'var(--cove-canvas-minimap-node-note-header)'
    case 'image':
      return 'var(--cove-canvas-minimap-node-image-header)'
    case 'terminal':
      return resolveWorkspaceMinimapTerminalHeaderColor(node)
    default:
      return 'var(--cove-canvas-minimap-node-default-header)'
  }
}

export function resolveWorkspaceMinimapNodeStrokeColor(node: Node<TerminalNodeData>): string {
  switch (node.data.kind) {
    case 'agent':
      switch (resolveWorkspaceMinimapAgentState(node)) {
        case 'running':
          return 'var(--cove-canvas-minimap-node-agent-running-stroke)'
        case 'standby':
          return 'var(--cove-canvas-minimap-node-agent-standby-stroke)'
        case 'inactive':
        default:
          return 'var(--cove-canvas-minimap-node-agent-inactive-stroke)'
      }
    case 'task':
      switch (resolveWorkspaceMinimapTaskState(node)) {
        case 'doing':
          return 'var(--cove-canvas-minimap-node-task-doing-stroke)'
        case 'done':
          return 'var(--cove-canvas-minimap-node-task-done-stroke)'
        case 'todo':
        default:
          return 'var(--cove-canvas-minimap-node-task-todo-stroke)'
      }
    case 'note':
      return 'var(--cove-canvas-minimap-node-note-stroke)'
    case 'image':
      return 'var(--cove-canvas-minimap-node-image-stroke)'
    case 'terminal':
      switch (resolveWorkspaceMinimapTerminalState(node)) {
        case 'running':
          return 'var(--cove-canvas-minimap-node-terminal-running-stroke)'
        case 'standby':
          return 'var(--cove-canvas-minimap-node-terminal-standby-stroke)'
        case 'inactive':
          return 'var(--cove-canvas-minimap-node-terminal-inactive-stroke)'
        case 'idle':
        default:
          return 'var(--cove-canvas-minimap-node-terminal-stroke)'
      }
    default:
      return 'var(--cove-canvas-minimap-node-default-stroke)'
  }
}

export function resolveWorkspaceMinimapNodeClassName(node: Node<TerminalNodeData>): string {
  if (node.data.kind === 'task') {
    return `workspace-canvas__minimap-node workspace-canvas__minimap-node--task workspace-canvas__minimap-node--task-${resolveWorkspaceMinimapTaskState(node)}`
  }

  if (node.data.kind === 'agent') {
    return `workspace-canvas__minimap-node workspace-canvas__minimap-node--agent workspace-canvas__minimap-node--agent-${resolveWorkspaceMinimapAgentState(node)}`
  }

  if (node.data.kind === 'terminal') {
    return `workspace-canvas__minimap-node workspace-canvas__minimap-node--terminal workspace-canvas__minimap-node--terminal-${resolveWorkspaceMinimapTerminalState(node)}`
  }

  return `workspace-canvas__minimap-node workspace-canvas__minimap-node--${node.data.kind}`
}

export function resolveWorkspaceMinimapNodeAtPosition(
  nodes: Node<TerminalNodeData>[],
  position: WorkspaceMinimapFlowPosition,
): Node<TerminalNodeData> | null {
  return (
    [...nodes]
      .reverse()
      .find(node => {
        if (node.hidden) {
          return false
        }

        return (
          position.x >= node.position.x &&
          position.x <= node.position.x + node.data.width &&
          position.y >= node.position.y &&
          position.y <= node.position.y + node.data.height
        )
      }) ?? null
  )
}

export function resolveWorkspaceMinimapViewportWindowLayout({
  nodes,
  viewport,
  flowSize,
  minimapSize,
  offsetScale = 5,
}: WorkspaceMinimapViewportWindowInput): WorkspaceMinimapViewportWindowLayout | null {
  if (
    flowSize.width <= 0 ||
    flowSize.height <= 0 ||
    minimapSize.width <= 0 ||
    minimapSize.height <= 0 ||
    !Number.isFinite(viewport.zoom) ||
    viewport.zoom <= 0
  ) {
    return null
  }

  const viewBounds = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: flowSize.width / viewport.zoom,
    height: flowSize.height / viewport.zoom,
  }

  let minX = viewBounds.x
  let minY = viewBounds.y
  let maxX = viewBounds.x + viewBounds.width
  let maxY = viewBounds.y + viewBounds.height

  for (const node of nodes) {
    if (node.hidden) {
      continue
    }

    const width = Number.isFinite(node.data.width) ? node.data.width : 0
    const height = Number.isFinite(node.data.height) ? node.data.height : 0
    if (width <= 0 || height <= 0) {
      continue
    }

    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
    maxX = Math.max(maxX, node.position.x + width)
    maxY = Math.max(maxY, node.position.y + height)
  }

  const boundingRect = {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  }

  const scaledWidth = boundingRect.width / minimapSize.width
  const scaledHeight = boundingRect.height / minimapSize.height
  const viewScale = Math.max(scaledWidth, scaledHeight, Number.EPSILON)
  const viewWidth = viewScale * minimapSize.width
  const viewHeight = viewScale * minimapSize.height
  const offset = offsetScale * viewScale
  const minimapViewBox = {
    x: boundingRect.x - (viewWidth - boundingRect.width) / 2 - offset,
    y: boundingRect.y - (viewHeight - boundingRect.height) / 2 - offset,
    width: viewWidth + offset * 2,
    height: viewHeight + offset * 2,
  }

  return {
    left: ((viewBounds.x - minimapViewBox.x) / minimapViewBox.width) * 100,
    top: ((viewBounds.y - minimapViewBox.y) / minimapViewBox.height) * 100,
    width: (viewBounds.width / minimapViewBox.width) * 100,
    height: (viewBounds.height / minimapViewBox.height) * 100,
  }
}

export function WorkspaceMinimapNode({
  id,
  x,
  y,
  width,
  height,
  borderRadius,
  className,
  color,
  shapeRendering,
  strokeColor,
  strokeWidth,
  headerColor,
  selected,
  onClick,
}: WorkspaceMinimapNodeComponentProps): React.JSX.Element {
  const headerHeight = Math.max(6, Math.min(18, height * 0.2))
  const bodyBorderRadius = Math.min(borderRadius, Math.max(3, Math.min(width, height) * 0.18))

  return (
    <g
      className={`${className}${selected ? ' selected' : ''}`}
      transform={`translate(${x} ${y})`}
      onClick={onClick ? event => onClick(event, id) : undefined}
    >
      <rect
        className="workspace-canvas__minimap-node-frame"
        data-testid={`workspace-minimap-node-${id}`}
        width={width}
        height={height}
        rx={bodyBorderRadius}
        ry={bodyBorderRadius}
        fill={color}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        shapeRendering={shapeRendering}
        pointerEvents="none"
      />
      <rect
        className="workspace-canvas__minimap-node-header"
        width={width}
        height={headerHeight}
        rx={bodyBorderRadius}
        ry={bodyBorderRadius}
        fill={headerColor ?? 'var(--cove-canvas-minimap-window-header)'}
        shapeRendering={shapeRendering}
        pointerEvents="none"
      />
      <line
        className="workspace-canvas__minimap-node-divider"
        x1={0}
        y1={headerHeight}
        x2={width}
        y2={headerHeight}
        stroke="var(--cove-canvas-minimap-window-divider)"
        strokeWidth={Math.max(0.6, (strokeWidth ?? 1) * 0.8)}
        shapeRendering={shapeRendering}
        pointerEvents="none"
      />
    </g>
  )
}
