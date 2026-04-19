import React from 'react'
import { MiniMap, useReactFlow, useStore, type Edge, type Node } from '@xyflow/react'
import { useTranslation } from '@app/renderer/i18n'
import { Map as MapIcon } from 'lucide-react'
import type { TerminalNodeData } from '../../../types'
import {
  focusNodeInViewport,
} from '../helpers'
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

function selectViewportTransform(state: {
  transform: [number, number, number]
}): { x: number; y: number; zoom: number } {
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

  return (
    <div
      ref={dockRef}
      className={`workspace-canvas__minimap-dock${isMinimapVisible ? ' workspace-canvas__minimap-dock--expanded' : ''}`}
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
                  headerColor={
                    sourceNode
                      ? resolveWorkspaceMinimapNodeHeaderColor(sourceNode)
                      : undefined
                  }
                />
              )
            }}
            nodeBorderRadius={8}
            nodeStrokeWidth={1}
            maskColor="var(--cove-canvas-minimap-mask-surface)"
            maskStrokeColor="var(--cove-canvas-minimap-mask)"
            maskStrokeWidth={1.25}
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
