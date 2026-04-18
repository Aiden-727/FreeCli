import React from 'react'
import {
  useStoreApi,
  type Edge,
  type Node,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react'
import type { TerminalNodeData } from '../../../types'

interface MiddlePanState {
  pointerId: number
  startClientX: number
  startClientY: number
  startViewport: Viewport
}

export function useWorkspaceCanvasMiddlePan({
  reactFlow,
  reactFlowStore,
  onMoveEnd,
}: {
  reactFlow: ReactFlowInstance<Node<TerminalNodeData>, Edge>
  reactFlowStore: ReturnType<typeof useStoreApi>
  onMoveEnd: (_event: MouseEvent | TouchEvent | null, nextViewport: Viewport) => void
}): {
  isMiddlePanActive: boolean
  handleMiddlePanMouseDownCapture: React.MouseEventHandler<HTMLDivElement>
  handleMiddlePanAuxClick: React.MouseEventHandler<HTMLDivElement>
  handleMiddlePanPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => {
    handled: boolean
  }
  handleMiddlePanPointerMoveCapture: (event: React.PointerEvent<HTMLDivElement>) => {
    handled: boolean
  }
  handleMiddlePanPointerUpCapture: (event: React.PointerEvent<HTMLDivElement>) => {
    handled: boolean
  }
  handleMiddlePanPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => { handled: boolean }
} {
  const [isMiddlePanActive, setIsMiddlePanActive] = React.useState(false)
  const middlePanStateRef = React.useRef<MiddlePanState | null>(null)

  const setViewportInteractionActive = React.useCallback(
    (active: boolean) => {
      reactFlowStore.setState({
        coveViewportInteractionActive: active,
      } as unknown as Parameters<typeof reactFlowStore.setState>[0])
    },
    [reactFlowStore],
  )

  const finishMiddlePan = React.useCallback(
    (nextViewport?: Viewport) => {
      if (!middlePanStateRef.current && !isMiddlePanActive) {
        return
      }

      middlePanStateRef.current = null
      setIsMiddlePanActive(false)
      setViewportInteractionActive(false)
      onMoveEnd(null, nextViewport ?? reactFlow.getViewport())
    },
    [isMiddlePanActive, onMoveEnd, reactFlow, setViewportInteractionActive],
  )

  React.useEffect(() => {
    return () => {
      middlePanStateRef.current = null
      setViewportInteractionActive(false)
    }
  }, [setViewportInteractionActive])

  const handleMiddlePanMouseDownCapture = React.useCallback<
    React.MouseEventHandler<HTMLDivElement>
  >(event => {
    if (event.button === 1) {
      event.preventDefault()
    }
  }, [])

  const handleMiddlePanAuxClick = React.useCallback<React.MouseEventHandler<HTMLDivElement>>(
    event => {
      if (event.button === 1) {
        event.preventDefault()
      }
    },
    [],
  )

  const handleMiddlePanPointerDownCapture = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 1) {
        return { handled: false }
      }

      event.preventDefault()
      event.stopPropagation()
      middlePanStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startViewport: reactFlow.getViewport(),
      }
      setIsMiddlePanActive(true)
      setViewportInteractionActive(true)
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return { handled: true }
    },
    [reactFlow, setViewportInteractionActive],
  )

  const handleMiddlePanPointerMoveCapture = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const middlePanState = middlePanStateRef.current
      if (
        !middlePanState ||
        event.pointerId !== middlePanState.pointerId ||
        (event.buttons & 4) !== 4
      ) {
        return { handled: false }
      }

      event.preventDefault()
      event.stopPropagation()

      const nextViewport = {
        ...middlePanState.startViewport,
        x: middlePanState.startViewport.x + (event.clientX - middlePanState.startClientX),
        y: middlePanState.startViewport.y + (event.clientY - middlePanState.startClientY),
      }

      void reactFlow.setViewport(nextViewport, { duration: 0 })
      return { handled: true }
    },
    [reactFlow],
  )

  const handleMiddlePanPointerUpCapture = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const middlePanState = middlePanStateRef.current
      if (!middlePanState || event.pointerId !== middlePanState.pointerId) {
        return { handled: false }
      }

      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      finishMiddlePan()
      return { handled: true }
    },
    [finishMiddlePan],
  )

  const handleMiddlePanPointerCancel = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const middlePanState = middlePanStateRef.current
      if (!middlePanState || event.pointerId !== middlePanState.pointerId) {
        return { handled: false }
      }

      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      finishMiddlePan()
      return { handled: true }
    },
    [finishMiddlePan],
  )

  return {
    isMiddlePanActive,
    handleMiddlePanMouseDownCapture,
    handleMiddlePanAuxClick,
    handleMiddlePanPointerDownCapture,
    handleMiddlePanPointerMoveCapture,
    handleMiddlePanPointerUpCapture,
    handleMiddlePanPointerCancel,
  }
}
