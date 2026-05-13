import React from 'react'
import type { Node } from '@xyflow/react'
import { resolveTerminalRuntimeStatus } from '@app/renderer/shell/utils/terminalRuntimeStatus'
import type { LabelColor } from '@shared/types/labelColor'
import type { TerminalNodeData } from '../../types'

export interface WorkspaceMinimapViewportWindowLayout {
  left: number
  top: number
  width: number
  height: number
  viewBoxX: number
  viewBoxY: number
  viewBoxWidth: number
  viewBoxHeight: number
  viewportX: number
  viewportY: number
  viewportWidth: number
  viewportHeight: number
  viewportRadiusX: number
  viewportRadiusY: number
}

export interface WorkspaceMinimapViewportWindowInput {
  nodes: Array<
    Pick<Node<TerminalNodeData>, 'position' | 'hidden'> & {
      data: Pick<TerminalNodeData, 'width' | 'height'>
    }
  >
  viewBounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  boundingRect?: {
    x: number
    y: number
    width: number
    height: number
  }
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
  renderSize?: {
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
  labelColor?: LabelColor | null
  selected: boolean
  onClick?: (event: React.MouseEvent, id: string) => void
}

interface WorkspaceMinimapFlowPosition {
  x: number
  y: number
}

interface WorkspaceMinimapProjection {
  viewBounds: {
    x: number
    y: number
    width: number
    height: number
  }
  minimapViewBox: {
    x: number
    y: number
    width: number
    height: number
  }
}

type WorkspaceMinimapTaskState = 'todo' | 'doing' | 'done'
type WorkspaceMinimapRuntimeState = 'running' | 'standby' | 'inactive' | 'idle'

function resolveWorkspaceMinimapNodeEffectiveLabelColor(
  node: Node<TerminalNodeData>,
): LabelColor | null {
  const effectiveLabelColor = (
    node.data as TerminalNodeData & {
      effectiveLabelColor?: LabelColor | null
    }
  ).effectiveLabelColor
  return effectiveLabelColor ?? null
}

function resolveWorkspaceMinimapLabelColorVar(labelColor: LabelColor): string {
  return `var(--cove-label-${labelColor})`
}

function blendWorkspaceMinimapRuntimeAndIdentity(
  runtimeColor: string,
  labelColor: LabelColor | null,
  runtimeWeight: number,
): string {
  if (!labelColor) {
    return runtimeColor
  }

  return `color-mix(in srgb, ${runtimeColor} ${runtimeWeight}%, ${resolveWorkspaceMinimapLabelColorVar(labelColor)} ${100 - runtimeWeight}%)`
}

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

function resolveWorkspaceMinimapAgentState(
  node: Node<TerminalNodeData>,
): WorkspaceMinimapRuntimeState {
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
  const runtimeColor = (() => {
    switch (resolveWorkspaceMinimapAgentState(node)) {
      case 'running':
        return 'var(--cove-canvas-minimap-node-agent-running)'
      case 'standby':
        return 'var(--cove-canvas-minimap-node-agent-standby)'
      case 'inactive':
      default:
        return 'var(--cove-canvas-minimap-node-agent-inactive)'
    }
  })()

  return blendWorkspaceMinimapRuntimeAndIdentity(
    runtimeColor,
    resolveWorkspaceMinimapNodeEffectiveLabelColor(node),
    72,
  )
}

function resolveWorkspaceMinimapTerminalColor(node: Node<TerminalNodeData>): string {
  const runtimeColor = (() => {
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
  })()

  return blendWorkspaceMinimapRuntimeAndIdentity(
    runtimeColor,
    resolveWorkspaceMinimapNodeEffectiveLabelColor(node),
    68,
  )
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
  const runtimeColor = (() => {
    switch (resolveWorkspaceMinimapAgentState(node)) {
      case 'running':
        return 'var(--cove-canvas-minimap-node-agent-running-header)'
      case 'standby':
        return 'var(--cove-canvas-minimap-node-agent-standby-header)'
      case 'inactive':
      default:
        return 'var(--cove-canvas-minimap-node-agent-inactive-header)'
    }
  })()

  return blendWorkspaceMinimapRuntimeAndIdentity(
    runtimeColor,
    resolveWorkspaceMinimapNodeEffectiveLabelColor(node),
    60,
  )
}

function resolveWorkspaceMinimapTerminalHeaderColor(node: Node<TerminalNodeData>): string {
  const runtimeColor = (() => {
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
  })()

  return blendWorkspaceMinimapRuntimeAndIdentity(
    runtimeColor,
    resolveWorkspaceMinimapNodeEffectiveLabelColor(node),
    56,
  )
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
    case 'agent': {
      const runtimeColor = (() => {
        switch (resolveWorkspaceMinimapAgentState(node)) {
          case 'running':
            return 'var(--cove-canvas-minimap-node-agent-running-stroke)'
          case 'standby':
            return 'var(--cove-canvas-minimap-node-agent-standby-stroke)'
          case 'inactive':
          default:
            return 'var(--cove-canvas-minimap-node-agent-inactive-stroke)'
        }
      })()

      return blendWorkspaceMinimapRuntimeAndIdentity(
        runtimeColor,
        resolveWorkspaceMinimapNodeEffectiveLabelColor(node),
        68,
      )
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
    case 'terminal': {
      const runtimeColor = (() => {
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
      })()

      return blendWorkspaceMinimapRuntimeAndIdentity(
        runtimeColor,
        resolveWorkspaceMinimapNodeEffectiveLabelColor(node),
        64,
      )
    }
    default:
      return 'var(--cove-canvas-minimap-node-default-stroke)'
  }
}

export function resolveWorkspaceMinimapNodeLabelColor(
  node: Node<TerminalNodeData>,
): LabelColor | null {
  return resolveWorkspaceMinimapNodeEffectiveLabelColor(node)
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
    [...nodes].reverse().find(node => {
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

export function resolveWorkspaceMinimapProjection({
  nodes,
  viewBounds: explicitViewBounds,
  boundingRect: explicitBoundingRect,
  viewport,
  flowSize,
  minimapSize,
  renderSize,
  offsetScale = 5,
}: WorkspaceMinimapViewportWindowInput): WorkspaceMinimapProjection | null {
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

  const viewBounds = explicitViewBounds ?? {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: flowSize.width / viewport.zoom,
    height: flowSize.height / viewport.zoom,
  }

  let boundingRect = explicitBoundingRect

  if (!boundingRect) {
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

    boundingRect = {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    }
  }

  const effectiveRenderWidth =
    renderSize && renderSize.width > 0 ? renderSize.width : Math.max(1, minimapSize.width)
  const effectiveRenderHeight =
    renderSize && renderSize.height > 0 ? renderSize.height : Math.max(1, minimapSize.height)
  const scaledWidth = boundingRect.width / effectiveRenderWidth
  const scaledHeight = boundingRect.height / effectiveRenderHeight
  const viewScale = Math.max(scaledWidth, scaledHeight, Number.EPSILON)
  const viewWidth = viewScale * effectiveRenderWidth
  const viewHeight = viewScale * effectiveRenderHeight
  const offset = offsetScale * viewScale
  const minimapViewBox = {
    x: boundingRect.x - (viewWidth - boundingRect.width) / 2 - offset,
    y: boundingRect.y - (viewHeight - boundingRect.height) / 2 - offset,
    width: viewWidth + offset * 2,
    height: viewHeight + offset * 2,
  }

  return {
    viewBounds,
    minimapViewBox,
  }
}

export function resolveWorkspaceMinimapViewportWindowLayout({
  minimapSize,
  ...input
}: WorkspaceMinimapViewportWindowInput): WorkspaceMinimapViewportWindowLayout | null {
  const projection = resolveWorkspaceMinimapProjection({
    ...input,
    minimapSize,
  })
  if (!projection) {
    return null
  }

  const { viewBounds, minimapViewBox } = projection
  const viewportCornerRadiusPx = 12
  const viewportRadiusX = Math.min(
    viewBounds.width / 2,
    (viewportCornerRadiusPx / Math.max(1, minimapSize.width)) * minimapViewBox.width,
  )
  const viewportRadiusY = Math.min(
    viewBounds.height / 2,
    (viewportCornerRadiusPx / Math.max(1, minimapSize.height)) * minimapViewBox.height,
  )

  return {
    left: ((viewBounds.x - minimapViewBox.x) / minimapViewBox.width) * 100,
    top: ((viewBounds.y - minimapViewBox.y) / minimapViewBox.height) * 100,
    width: (viewBounds.width / minimapViewBox.width) * 100,
    height: (viewBounds.height / minimapViewBox.height) * 100,
    viewBoxX: minimapViewBox.x,
    viewBoxY: minimapViewBox.y,
    viewBoxWidth: minimapViewBox.width,
    viewBoxHeight: minimapViewBox.height,
    viewportX: viewBounds.x,
    viewportY: viewBounds.y,
    viewportWidth: viewBounds.width,
    viewportHeight: viewBounds.height,
    viewportRadiusX,
    viewportRadiusY,
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
  labelColor,
  selected,
  onClick,
}: WorkspaceMinimapNodeComponentProps): React.JSX.Element {
  const headerHeight = Math.max(6, Math.min(18, height * 0.2))
  const bodyBorderRadius = Math.min(borderRadius, Math.max(3, Math.min(width, height) * 0.18))
  const headerRadius = Math.min(bodyBorderRadius, headerHeight)
  const labelAccentRadius = Math.max(2.6, Math.min(5.2, headerHeight * 0.26))
  const labelAccentInset = Math.max(4, Math.min(8, width * 0.08))
  const labelAccentCenterX = Math.min(
    Math.max(headerRadius + labelAccentRadius, width - headerRadius - labelAccentRadius),
    width - labelAccentInset,
  )
  const labelAccentCenterY = Math.max(headerRadius, headerHeight / 2)
  const headerPath = [
    `M 0 ${headerHeight}`,
    `L 0 ${headerRadius}`,
    `Q 0 0 ${headerRadius} 0`,
    `L ${Math.max(headerRadius, width - headerRadius)} 0`,
    `Q ${width} 0 ${width} ${headerRadius}`,
    `L ${width} ${headerHeight}`,
    'Z',
  ].join(' ')
  const setGroupHovered = React.useCallback((target: EventTarget | null, hovered: boolean) => {
    if (!(target instanceof SVGElement)) {
      return
    }

    const group = target.closest('.workspace-canvas__minimap-node')
    if (!(group instanceof SVGGElement)) {
      return
    }

    group.classList.toggle('hovered', hovered)
  }, [])

  return (
    <g
      className={`${className}${selected ? ' selected' : ''}`}
      data-minimap-node-id={id}
      data-testid={`workspace-minimap-group-${id}`}
      transform={`translate(${x} ${y})`}
    >
      <rect
        className="workspace-canvas__minimap-node-hitbox"
        data-testid={`workspace-minimap-hitbox-${id}`}
        width={width}
        height={height}
        rx={bodyBorderRadius}
        ry={bodyBorderRadius}
        fill="rgba(255, 255, 255, 0.001)"
        shapeRendering={shapeRendering}
        pointerEvents="all"
        onPointerEnter={event => {
          setGroupHovered(event.currentTarget, true)
        }}
        onPointerLeave={event => {
          setGroupHovered(event.currentTarget, false)
        }}
        onPointerCancel={event => {
          setGroupHovered(event.currentTarget, false)
        }}
        onPointerDown={event => {
          // Keep node clicks from being interpreted as minimap panning gestures.
          event.preventDefault()
          event.stopPropagation()
        }}
        onPointerMove={event => {
          event.stopPropagation()
        }}
        onPointerUp={event => {
          event.stopPropagation()
        }}
        onClick={
          onClick
            ? event => {
                event.stopPropagation()
                onClick(event, id)
              }
            : undefined
        }
      />
      <rect
        className="workspace-canvas__minimap-node-shadow"
        x={0}
        y={0}
        width={width}
        height={height}
        rx={bodyBorderRadius}
        ry={bodyBorderRadius}
        fill="var(--cove-canvas-minimap-node-shadow-fill)"
        shapeRendering={shapeRendering}
        pointerEvents="none"
      />
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
      <path
        className="workspace-canvas__minimap-node-header"
        d={headerPath}
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
      {labelColor ? (
        <circle
          className="workspace-canvas__minimap-node-label-accent"
          data-cove-label-color={labelColor}
          data-testid={`workspace-minimap-label-accent-${id}`}
          cx={labelAccentCenterX}
          cy={labelAccentCenterY}
          r={labelAccentRadius}
          fill="var(--cove-label-color)"
          stroke="rgba(255, 255, 255, 0.72)"
          strokeWidth={Math.max(0.8, (strokeWidth ?? 1) * 0.9)}
          shapeRendering={shapeRendering}
          pointerEvents="none"
        />
      ) : null}
    </g>
  )
}
