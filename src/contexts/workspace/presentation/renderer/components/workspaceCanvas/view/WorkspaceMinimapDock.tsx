import React from 'react'
import { MiniMap, useReactFlow, useStore, type Edge, type Node } from '@xyflow/react'
import { useTranslation } from '@app/renderer/i18n'
import { Map as MapIcon } from 'lucide-react'
import type { TerminalNodeData } from '../../../types'
import { focusNodeInViewport } from '../helpers'
import {
  resolveWorkspaceMinimapNodeHeaderColor,
  resolveWorkspaceMinimapNodeAtPosition,
  resolveWorkspaceMinimapViewportWindowLayout,
  WorkspaceMinimapNode,
} from '../minimap'

interface WorkspaceMinimapDockProps {
  isMinimapVisible: boolean
  minimapNodeColor: (node: Node<TerminalNodeData>) => string
  minimapNodeStrokeColor: (node: Node<TerminalNodeData>) => string
  minimapNodeClassName: (node: Node<TerminalNodeData>) => string
  setIsMinimapVisible: React.Dispatch<React.SetStateAction<boolean>>
  onMinimapVisibilityChange: (isVisible: boolean) => void
  focusNodeTargetZoom: number
}

function selectViewportTransform(state: { transform: [number, number, number] }): {
  x: number
  y: number
  zoom: number
} {
  return {
    x: state.transform[0],
    y: state.transform[1],
    zoom: state.transform[2],
  }
}

export function WorkspaceMinimapDock({
  isMinimapVisible,
  minimapNodeColor,
  minimapNodeStrokeColor,
  minimapNodeClassName,
  setIsMinimapVisible,
  onMinimapVisibilityChange,
  focusNodeTargetZoom,
}: WorkspaceMinimapDockProps): React.JSX.Element {
  const { t } = useTranslation()
  const reactFlow = useReactFlow<Node<TerminalNodeData>, Edge>()
  const dockRef = React.useRef<HTMLDivElement | null>(null)
  const viewport = useStore(selectViewportTransform)
  const nodes = useStore(state => state.nodes as Node<TerminalNodeData>[])
  const flowSize = useStore(state => ({
    width: state.width,
    height: state.height,
  }))
  const [dockSize, setDockSize] = React.useState({ width: 0, height: 0 })
  const [hoveredNodeId, setHoveredNodeId] = React.useState<string | null>(null)

  React.useLayoutEffect(() => {
    if (!dockRef.current || !isMinimapVisible) {
      return
    }

    const element = dockRef.current
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) {
        return
      }

      setDockSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(element)
    return () => observer.disconnect()
  }, [isMinimapVisible])

  const focusMinimapNode = React.useCallback(
    (node: Node<TerminalNodeData> | null) => {
      if (!node) {
        return
      }

      focusNodeInViewport(reactFlow, node, {
        duration: 180,
        zoom: focusNodeTargetZoom,
      })
    },
    [focusNodeTargetZoom, reactFlow],
  )

  const resolvedViewportWindow = React.useMemo(() => {
    return resolveWorkspaceMinimapViewportWindowLayout({
      nodes,
      viewport,
      flowSize,
      minimapSize: dockSize,
    })
  }, [dockSize, flowSize, nodes, viewport])

  const minimapNodesById = React.useMemo(() => {
    return new Map(nodes.map(node => [node.id, node] as const))
  }, [nodes])

  const handleMinimapHoverChange = React.useCallback((nodeId: string | null) => {
    setHoveredNodeId(previous => (previous === nodeId ? previous : nodeId))
  }, [])

  const handleMinimapPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isMinimapVisible) {
        return
      }

      const minimapElement = dockRef.current?.querySelector('.workspace-canvas__minimap')
      if (!(minimapElement instanceof HTMLElement)) {
        return
      }

      const bounds = minimapElement.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) {
        return
      }
      const minimapSize = {
        width: bounds.width,
        height: bounds.height,
      }

      const relativeX = (event.clientX - bounds.left) / bounds.width
      const relativeY = (event.clientY - bounds.top) / bounds.height
      if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) {
        handleMinimapHoverChange(null)
        return
      }

      let minX = -viewport.x / viewport.zoom
      let minY = -viewport.y / viewport.zoom
      let maxX = minX + flowSize.width / viewport.zoom
      let maxY = minY + flowSize.height / viewport.zoom

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
      const offset = 5 * viewScale
      const minimapViewBox = {
        x: boundingRect.x - (viewWidth - boundingRect.width) / 2 - offset,
        y: boundingRect.y - (viewHeight - boundingRect.height) / 2 - offset,
        width: viewWidth + offset * 2,
        height: viewHeight + offset * 2,
      }

      const hoveredNode = resolveWorkspaceMinimapNodeAtPosition(nodes, {
        x: minimapViewBox.x + relativeX * minimapViewBox.width,
        y: minimapViewBox.y + relativeY * minimapViewBox.height,
      })

      handleMinimapHoverChange(hoveredNode?.id ?? null)
    },
    [flowSize, handleMinimapHoverChange, isMinimapVisible, nodes, viewport],
  )

  return (
    <div
      ref={dockRef}
      className={`workspace-canvas__minimap-dock${isMinimapVisible ? ' workspace-canvas__minimap-dock--expanded' : ''}`}
      onPointerMove={handleMinimapPointerMove}
      onMouseLeave={() => {
        setHoveredNodeId(null)
      }}
    >
      {isMinimapVisible ? (
        <>
          <MiniMap
            className="workspace-canvas__minimap"
            pannable
            zoomable
            nodeColor={minimapNodeColor}
            nodeStrokeColor={minimapNodeStrokeColor}
            nodeClassName={minimapNodeClassName}
            nodeComponent={props => {
              const sourceNode = minimapNodesById.get(props.id)
              return (
                <WorkspaceMinimapNode
                  {...props}
                  hovered={hoveredNodeId === props.id}
                  headerColor={
                    sourceNode ? resolveWorkspaceMinimapNodeHeaderColor(sourceNode) : undefined
                  }
                  onHoverChange={handleMinimapHoverChange}
                />
              )
            }}
            nodeBorderRadius={8}
            nodeStrokeWidth={1}
            maskColor="transparent"
            maskStrokeColor="transparent"
            maskStrokeWidth={0}
            offsetScale={5}
            onClick={(_event, position) => {
              focusMinimapNode(resolveWorkspaceMinimapNodeAtPosition(nodes, position))
            }}
            onNodeClick={(event, node) => {
              event.stopPropagation()
              focusMinimapNode(node)
            }}
            ariaLabel={t('workspaceCanvas.minimapAriaLabel')}
          />
          {resolvedViewportWindow ? (
            <div
              className="workspace-canvas__minimap-viewport-mask"
              aria-hidden="true"
              style={{
                left: `${resolvedViewportWindow.left}%`,
                top: `${resolvedViewportWindow.top}%`,
                width: `${resolvedViewportWindow.width}%`,
                height: `${resolvedViewportWindow.height}%`,
              }}
            />
          ) : null}
        </>
      ) : null}

      <button
        type="button"
        className="workspace-canvas__minimap-toggle"
        data-testid="workspace-minimap-toggle"
        aria-label={
          isMinimapVisible ? t('workspaceCanvas.hideMinimap') : t('workspaceCanvas.showMinimap')
        }
        title={
          isMinimapVisible ? t('workspaceCanvas.hideMinimap') : t('workspaceCanvas.showMinimap')
        }
        onClick={event => {
          event.stopPropagation()
          setIsMinimapVisible(previous => {
            const nextValue = !previous
            onMinimapVisibilityChange(nextValue)
            return nextValue
          })
        }}
      >
        <MapIcon aria-hidden="true" />
      </button>
    </div>
  )
}
