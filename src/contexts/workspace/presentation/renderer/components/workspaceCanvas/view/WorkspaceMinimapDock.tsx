import React from 'react'
import { MiniMap, useReactFlow, useStore, type Edge, type Node } from '@xyflow/react'
import { useTranslation } from '@app/renderer/i18n'
import { Map as MapIcon } from 'lucide-react'
import type { TerminalNodeData } from '../../../types'
import { focusNodeInViewport } from '../helpers'
import {
  resolveWorkspaceMinimapNodeHeaderColor,
  resolveWorkspaceMinimapNodeLabelColor,
  resolveWorkspaceMinimapNodeAtPosition,
  resolveWorkspaceMinimapViewportWindowLayout,
  type WorkspaceMinimapViewportWindowLayout,
  WorkspaceMinimapNode,
} from '../minimap'

const WORKSPACE_MINIMAP_FALLBACK_SIZE = {
  width: 200,
  height: 136,
}

interface WorkspaceMinimapLookupNode {
  hidden?: boolean
  measured?: {
    width?: number
    height?: number
  }
  width?: number
  height?: number
  initialWidth?: number
  initialHeight?: number
  internals?: {
    positionAbsolute?: {
      x: number
      y: number
    }
    userNode?: {
      width?: number
      height?: number
      initialWidth?: number
      initialHeight?: number
    }
  }
}

interface WorkspaceMinimapDockProps {
  isMinimapVisible: boolean
  minimapNodeColor: (node: Node<TerminalNodeData>) => string
  minimapNodeStrokeColor: (node: Node<TerminalNodeData>) => string
  minimapNodeClassName: (node: Node<TerminalNodeData>) => string
  setIsMinimapVisible: React.Dispatch<React.SetStateAction<boolean>>
  onMinimapVisibilityChange: (isVisible: boolean) => void
  focusNodeTargetZoom: number
}

function ensureWorkspaceMinimapViewportMask(dockElement: HTMLDivElement): SVGRectElement | null {
  const minimapSvg = dockElement.querySelector('.react-flow__minimap-svg') as SVGSVGElement | null
  if (!minimapSvg) {
    return null
  }

  let overlayGroup = minimapSvg.querySelector(
    '.workspace-canvas__minimap-viewport-overlay',
  ) as SVGGElement | null
  if (!overlayGroup) {
    overlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    overlayGroup.setAttribute('class', 'workspace-canvas__minimap-viewport-overlay')
    overlayGroup.setAttribute('aria-hidden', 'true')
    overlayGroup.setAttribute('pointer-events', 'none')
    minimapSvg.appendChild(overlayGroup)
  } else if (overlayGroup.parentNode !== minimapSvg || overlayGroup !== minimapSvg.lastChild) {
    minimapSvg.appendChild(overlayGroup)
  }

  let viewportMask = overlayGroup.querySelector(
    '.workspace-canvas__minimap-viewport-mask',
  ) as SVGRectElement | null
  if (!viewportMask) {
    viewportMask = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    viewportMask.setAttribute('class', 'workspace-canvas__minimap-viewport-mask')
    viewportMask.setAttribute('pointer-events', 'none')
    overlayGroup.appendChild(viewportMask)
  }

  return viewportMask
}

function applyWorkspaceMinimapViewportMaskLayout(
  viewportMask: SVGRectElement,
  layout: WorkspaceMinimapViewportWindowLayout,
): void {
  viewportMask.setAttribute('x', `${layout.viewportX}`)
  viewportMask.setAttribute('y', `${layout.viewportY}`)
  viewportMask.setAttribute('width', `${layout.viewportWidth}`)
  viewportMask.setAttribute('height', `${layout.viewportHeight}`)
  viewportMask.setAttribute('rx', `${layout.viewportRadiusX}`)
  viewportMask.setAttribute('ry', `${layout.viewportRadiusY}`)
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
  const viewport = useStore(state => ({
    x: state.transform[0],
    y: state.transform[1],
    zoom: state.transform[2],
  }))
  const nodes = useStore(state => state.nodes as Node<TerminalNodeData>[])
  const nodeLookup = useStore(state => state.nodeLookup as Map<string, WorkspaceMinimapLookupNode>)
  const flowSize = useStore(state => ({
    width: state.width,
    height: state.height,
  }))
  const [dockSize, setDockSize] = React.useState({ width: 0, height: 0 })
  const minimapRenderSize = React.useMemo(
    () => ({
      width:
        dockSize.width > 0 ? Math.round(dockSize.width) : WORKSPACE_MINIMAP_FALLBACK_SIZE.width,
      height:
        dockSize.height > 0 ? Math.round(dockSize.height) : WORKSPACE_MINIMAP_FALLBACK_SIZE.height,
    }),
    [dockSize.height, dockSize.width],
  )

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

  const resolvedViewportWindow = React.useMemo(() => {
    const viewBounds = {
      x: -viewport.x / viewport.zoom,
      y: -viewport.y / viewport.zoom,
      width: flowSize.width / viewport.zoom,
      height: flowSize.height / viewport.zoom,
    }

    let boundingRect = viewBounds
    if (nodeLookup.size > 0) {
      let minX = viewBounds.x
      let minY = viewBounds.y
      let maxX = viewBounds.x + viewBounds.width
      let maxY = viewBounds.y + viewBounds.height

      for (const node of nodeLookup.values()) {
        if (node.hidden) {
          continue
        }

        const positionAbsolute = node.internals?.positionAbsolute
        if (!positionAbsolute) {
          continue
        }

        const userNode = node.internals?.userNode
        const width =
          node.measured?.width ??
          userNode?.width ??
          userNode?.initialWidth ??
          node.width ??
          node.initialWidth ??
          0
        const height =
          node.measured?.height ??
          userNode?.height ??
          userNode?.initialHeight ??
          node.height ??
          node.initialHeight ??
          0

        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          continue
        }

        minX = Math.min(minX, positionAbsolute.x)
        minY = Math.min(minY, positionAbsolute.y)
        maxX = Math.max(maxX, positionAbsolute.x + width)
        maxY = Math.max(maxY, positionAbsolute.y + height)
      }

      boundingRect = {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      }
    }

    return resolveWorkspaceMinimapViewportWindowLayout({
      nodes,
      viewBounds,
      boundingRect,
      viewport,
      flowSize,
      minimapSize: dockSize,
      renderSize: minimapRenderSize,
    })
  }, [dockSize, flowSize, minimapRenderSize, nodeLookup, nodes, viewport])

  React.useLayoutEffect(() => {
    if (!isMinimapVisible || !dockRef.current) {
      return
    }

    const dockElement = dockRef.current
    let frameId = 0

    const syncViewportMaskPresence = () => {
      const viewportMask = ensureWorkspaceMinimapViewportMask(dockElement)
      if (!viewportMask || !resolvedViewportWindow) {
        return
      }

      // Why: keep the same SVG rect node alive across viewport updates so React Flow's
      // own animated transform can move it continuously; tearing the rect down on every
      // jump creates a blank frame that reads as flicker.
      applyWorkspaceMinimapViewportMaskLayout(viewportMask, resolvedViewportWindow)
    }

    const scheduleSync = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      frameId = window.requestAnimationFrame(syncViewportMaskPresence)
    }

    const observer = new MutationObserver(scheduleSync)
    observer.observe(dockElement, {
      subtree: true,
      childList: true,
    })

    scheduleSync()

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId)
      }
      observer.disconnect()
      const overlayGroup = dockElement.querySelector('.workspace-canvas__minimap-viewport-overlay')
      overlayGroup?.remove()
    }
  }, [isMinimapVisible, resolvedViewportWindow])

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
            style={minimapRenderSize}
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
                    sourceNode ? resolveWorkspaceMinimapNodeHeaderColor(sourceNode) : undefined
                  }
                  labelColor={sourceNode ? resolveWorkspaceMinimapNodeLabelColor(sourceNode) : null}
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
