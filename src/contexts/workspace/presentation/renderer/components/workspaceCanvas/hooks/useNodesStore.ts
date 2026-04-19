import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useReactFlow, type Edge, type Node } from '@xyflow/react'
import type { NodeLabelColorOverride } from '@shared/types/labelColor'
import type { NodeFrame, Point, Size, TerminalNodeData } from '../../../types'
import { useScrollbackStore } from '../../../store/useScrollbackStore'
import { findNearestFreePosition } from '../../../utils/collision'
import { cleanupNodeRuntimeArtifacts } from '../../../utils/nodeRuntimeCleanup'
import {
  clearNodeScrollbackWrite,
  scheduleNodeScrollbackWrite,
} from '../../../utils/persistence/scrollbackSchedule'
import { toAgentNodeTitle } from '@app/renderer/shell/utils/format'
import { parseHostedTerminalAgentCommand } from '@contexts/terminal/domain/hostedAgent'
import { TERMINAL_LAYOUT_SYNC_EVENT } from '../../terminalNode/constants'
import { centerNodeInViewport } from '../helpers'
import { syncWorkspaceCanvasTestState } from '../testHarness'
import { resolveCanonicalNodeMinSize } from '../../../utils/workspaceNodeSizing'
import { removeNodeWithRelations } from './useNodesStore.closeNode'
import { resolveWorkspaceLayoutAfterNodeResize } from './useNodesStore.resolveResizeLayout'
import { useWorkspaceCanvasNodeCreation } from './useNodesStore.createNodes'
import type {
  UseWorkspaceCanvasNodesStoreParams,
  UseWorkspaceCanvasNodesStoreResult,
} from './useNodesStore.types'

export function useWorkspaceCanvasNodesStore({
  nodes,
  spacesRef,
  onNodesChange,
  onSpacesChange,
  onRequestPersistFlush,
  onFlushPersistNow,
  onShowMessage,
  onNodeCreated,
  standardWindowSizeBucket,
}: UseWorkspaceCanvasNodesStoreParams): UseWorkspaceCanvasNodesStoreResult {
  const reactFlow = useReactFlow<Node<TerminalNodeData>, Edge>()
  const nodesRef = useRef(nodes)
  const agentLaunchTokenByNodeIdRef = useRef<Map<string, number>>(new Map())
  const pendingScrollbackByNodeRef = useRef<Map<string, string>>(new Map())
  const isNodeDraggingRef = useRef(false)
  const [fallbackCreatedNodeId, setFallbackCreatedNodeId] = useState<string | null>(null)
  const createdNodeViewportSettleTimerRef = useRef<number | null>(null)

  const fallbackOnNodeCreated = useCallback((nodeId: string) => {
    const normalizedNodeId = nodeId.trim()
    if (normalizedNodeId.length === 0) {
      return
    }

    setFallbackCreatedNodeId(normalizedNodeId)
  }, [])

  useLayoutEffect(() => {
    if (onNodeCreated) {
      return
    }

    if (!fallbackCreatedNodeId) {
      return
    }

    const targetNode =
      nodesRef.current.find(node => node.id === fallbackCreatedNodeId) ??
      reactFlow.getNode?.(fallbackCreatedNodeId) ??
      null

    if (!targetNode) {
      return
    }

    const viewport = reactFlow.getViewport?.() ?? null
    const zoom = viewport && Number.isFinite(viewport.zoom) && viewport.zoom > 0 ? viewport.zoom : 1

    centerNodeInViewport(reactFlow, targetNode, {
      duration: 180,
      zoom,
    })

    if (createdNodeViewportSettleTimerRef.current !== null) {
      window.clearTimeout(createdNodeViewportSettleTimerRef.current)
    }

    createdNodeViewportSettleTimerRef.current = window.setTimeout(() => {
      createdNodeViewportSettleTimerRef.current = null
      setFallbackCreatedNodeId(current => (current === fallbackCreatedNodeId ? null : current))
    }, 0)

    return () => {
      if (createdNodeViewportSettleTimerRef.current !== null) {
        window.clearTimeout(createdNodeViewportSettleTimerRef.current)
        createdNodeViewportSettleTimerRef.current = null
      }
    }
  }, [fallbackCreatedNodeId, nodes, onNodeCreated, reactFlow])

  useLayoutEffect(() => {
    nodesRef.current = nodes
    if (window.freecliApi?.meta?.isTest === true) {
      syncWorkspaceCanvasTestState(nodes)
    }
  }, [nodes])
  const setNodes = useCallback(
    (
      updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
      options: { syncLayout?: boolean } = {},
    ) => {
      const previousNodes = nodesRef.current
      const nextNodes = updater(previousNodes)
      if (nextNodes === previousNodes) {
        return
      }
      nodesRef.current = nextNodes
      if (window.freecliApi?.meta?.isTest === true) {
        syncWorkspaceCanvasTestState(nextNodes)
      }
      onNodesChange(nextNodes)

      if (options.syncLayout ?? true) {
        window.dispatchEvent(new Event(TERMINAL_LAYOUT_SYNC_EVENT))
      }
    },
    [onNodesChange],
  )
  const upsertNode = useCallback(
    (nextNode: Node<TerminalNodeData>) => {
      setNodes(prevNodes => prevNodes.map(node => (node.id === nextNode.id ? nextNode : node)))
    },
    [setNodes],
  )
  const bumpAgentLaunchToken = useCallback((nodeId: string): number => {
    const next = (agentLaunchTokenByNodeIdRef.current.get(nodeId) ?? 0) + 1
    agentLaunchTokenByNodeIdRef.current.set(nodeId, next)
    return next
  }, [])
  const clearAgentLaunchToken = useCallback((nodeId: string): void => {
    agentLaunchTokenByNodeIdRef.current.delete(nodeId)
  }, [])
  const isAgentLaunchTokenCurrent = useCallback((nodeId: string, token: number): boolean => {
    return (agentLaunchTokenByNodeIdRef.current.get(nodeId) ?? 0) === token
  }, [])
  const setNodeScrollback = useScrollbackStore(state => state.setNodeScrollback)

  const closeNode = useCallback(
    async (nodeId: string) => {
      clearAgentLaunchToken(nodeId)

      const target = nodesRef.current.find(node => node.id === nodeId)
      if (target && target.data.sessionId.length > 0) {
        cleanupNodeRuntimeArtifacts(nodeId, target.data.sessionId)
        await window.freecliApi.pty.kill({ sessionId: target.data.sessionId })
      }

      if (target?.data.kind === 'image' && target.data.image) {
        const deleteCanvasImage = window.freecliApi?.workspace?.deleteCanvasImage
        if (typeof deleteCanvasImage === 'function') {
          await deleteCanvasImage({ assetId: target.data.image.assetId }).catch(() => undefined)
        }
      }

      setNodes(prevNodes => {
        const now = new Date().toISOString()
        return removeNodeWithRelations({
          prevNodes,
          nodeId,
          target,
          now,
        })
      })
    },
    [clearAgentLaunchToken, setNodes],
  )

  const normalizePosition = useCallback((nodeId: string, desired: Point, size: Size): Point => {
    return findNearestFreePosition(desired, size, nodesRef.current, nodeId)
  }, [])

  const resizeNode = useCallback(
    (nodeId: string, desiredFrame: NodeFrame) => {
      const node = nodesRef.current.find(item => item.id === nodeId)
      if (!node) {
        return
      }

      const minSize = resolveCanonicalNodeMinSize(node.data.kind)
      const resolveDimension = (value: number, fallback: number): number =>
        typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback

      const normalizedFrame: NodeFrame = {
        position: {
          x: resolveDimension(desiredFrame.position.x, node.position.x),
          y: resolveDimension(desiredFrame.position.y, node.position.y),
        },
        size: {
          width: Math.max(
            minSize.width,
            resolveDimension(desiredFrame.size.width, node.data.width),
          ),
          height: Math.max(
            minSize.height,
            resolveDimension(desiredFrame.size.height, node.data.height),
          ),
        },
      }

      const resolved = resolveWorkspaceLayoutAfterNodeResize({
        nodeId,
        desiredFrame: normalizedFrame,
        nodes: nodesRef.current,
        spaces: spacesRef.current,
        gap: 0,
      })

      if (!resolved) {
        return
      }

      setNodes(() => resolved.nodes)

      if (resolved.spaces !== spacesRef.current) {
        onSpacesChange(resolved.spaces)
      }

      onRequestPersistFlush?.()
    },
    [onRequestPersistFlush, onSpacesChange, setNodes, spacesRef],
  )

  const applyPendingScrollbacks = useCallback(
    (targetNodes: Node<TerminalNodeData>[]) => {
      const pendingScrollbacks = pendingScrollbackByNodeRef.current
      if (pendingScrollbacks.size === 0) {
        return targetNodes
      }

      for (const [nodeId, pending] of pendingScrollbacks.entries()) {
        const node = targetNodes.find(candidate => candidate.id === nodeId)
        if (!node || node.data.kind === 'task') {
          continue
        }

        setNodeScrollback(nodeId, pending)
        if (node.data.kind === 'terminal' && node.data.persistenceMode === 'ephemeral') {
          clearNodeScrollbackWrite(nodeId)
        } else {
          scheduleNodeScrollbackWrite(nodeId, pending)
        }
      }

      pendingScrollbacks.clear()
      return targetNodes
    },
    [setNodeScrollback],
  )

  const updateNodeScrollback = useCallback(
    (nodeId: string, scrollback: string) => {
      const node = nodesRef.current.find(candidate => candidate.id === nodeId)
      if (!node || node.data.kind === 'task') {
        return
      }

      if (isNodeDraggingRef.current) {
        pendingScrollbackByNodeRef.current.set(nodeId, scrollback)
        return
      }

      setNodeScrollback(nodeId, scrollback)
      if (node.data.kind === 'terminal' && node.data.persistenceMode === 'ephemeral') {
        clearNodeScrollbackWrite(nodeId)
        return
      }

      scheduleNodeScrollbackWrite(nodeId, scrollback)
    },
    [setNodeScrollback],
  )

  const updateTerminalTitle = useCallback(
    (nodeId: string, title: string) => {
      const normalizedTitle = title.trim()
      if (normalizedTitle.length === 0) {
        return
      }

      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind !== 'terminal') {
              return node
            }

            if (node.data.titlePinnedByUser === true) {
              return node
            }

            if (node.data.title === normalizedTitle) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              data: {
                ...node.data,
                title: normalizedTitle,
              },
            }
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )
    },
    [setNodes],
  )

  const renameTerminalTitle = useCallback(
    (nodeId: string, title: string) => {
      const normalizedTitle = title.trim()
      if (normalizedTitle.length === 0) {
        return
      }

      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            if (
              node.id !== nodeId ||
              (node.data.kind !== 'terminal' && node.data.kind !== 'agent')
            ) {
              return node
            }

            const isPinned = node.data.titlePinnedByUser === true
            if (node.data.title === normalizedTitle && isPinned) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              data: {
                ...node.data,
                title: normalizedTitle,
                titlePinnedByUser: true,
              },
            }
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      onRequestPersistFlush?.()
      void onFlushPersistNow?.()
    },
    [onFlushPersistNow, onRequestPersistFlush, setNodes],
  )

  const setTerminalCredentialProfile = useCallback(
    (nodeId: string, credentialProfileId: string | null) => {
      let didChange = false

      setNodes(
        prevNodes => {
          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind !== 'terminal') {
              return node
            }

            const normalizedCredentialProfileId =
              typeof credentialProfileId === 'string' && credentialProfileId.trim().length > 0
                ? credentialProfileId.trim()
                : null
            if ((node.data.credentialProfileId ?? null) === normalizedCredentialProfileId) {
              return node
            }

            didChange = true
            return {
              ...node,
              data: {
                ...node.data,
                credentialProfileId: normalizedCredentialProfileId,
              },
            }
          })

          return didChange ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      if (didChange) {
        onRequestPersistFlush?.()
      }
    },
    [onRequestPersistFlush, setNodes],
  )

  const setTerminalActiveCredentialProfile = useCallback(
    (nodeId: string, credentialProfileId: string | null) => {
      let didChange = false

      setNodes(
        prevNodes => {
          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind !== 'terminal') {
              return node
            }

            const normalizedCredentialProfileId =
              typeof credentialProfileId === 'string' && credentialProfileId.trim().length > 0
                ? credentialProfileId.trim()
                : null
            if ((node.data.activeCredentialProfileId ?? null) === normalizedCredentialProfileId) {
              return node
            }

            didChange = true
            return {
              ...node,
              data: {
                ...node.data,
                activeCredentialProfileId: normalizedCredentialProfileId,
              },
            }
          })

          return didChange ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      if (didChange) {
        onRequestPersistFlush?.()
      }
    },
    [onRequestPersistFlush, setNodes],
  )

  const setTerminalPersistenceMode = useCallback(
    (nodeId: string, persistenceMode: TerminalNodeData['persistenceMode']) => {
      let didChange = false

      setNodes(
        prevNodes => {
          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind !== 'terminal') {
              return node
            }

            if ((node.data.persistenceMode ?? 'persistent') === persistenceMode) {
              return node
            }

            const nextHostedAgent = node.data.hostedAgent
              ? {
                  ...node.data.hostedAgent,
                  restoreIntent:
                    persistenceMode === 'persistent'
                      ? node.data.hostedAgent.state === 'active'
                        ? true
                        : node.data.hostedAgent.restoreIntent
                      : false,
                }
              : null

            didChange = true
            return {
              ...node,
              data: {
                ...node.data,
                persistenceMode,
                hostedAgent: nextHostedAgent,
              },
            }
          })

          return didChange ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      if (!didChange) {
        return
      }

      const pendingScrollback = pendingScrollbackByNodeRef.current.get(nodeId)
      const persistedScrollback = useScrollbackStore.getState().scrollbackByNodeId[nodeId] ?? null
      const currentScrollback = pendingScrollback ?? persistedScrollback

      if (persistenceMode === 'ephemeral') {
        clearNodeScrollbackWrite(nodeId)
      } else if (currentScrollback) {
        scheduleNodeScrollbackWrite(nodeId, currentScrollback)
      }

      onRequestPersistFlush?.()
    },
    [onRequestPersistFlush, setNodes],
  )

  const trackTerminalHostedAgent = useCallback(
    (nodeId: string, command: string) => {
      const normalizedCommand = command.trim()
      if (normalizedCommand.length === 0) {
        return
      }

      const parsed = parseHostedTerminalAgentCommand(normalizedCommand)
      if (!parsed) {
        return
      }

      let trackingRequest: {
        sessionId: string
        provider: 'claude-code' | 'codex'
        cwd: string
        launchMode: 'new' | 'resume'
        resumeSessionId: string | null
        startedAt: string
      } | null = null
      let didChange = false

      setNodes(
        prevNodes => {
          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind !== 'terminal') {
              return node
            }

            const cwd = node.data.executionDirectory ?? node.data.expectedDirectory ?? null
            if (!cwd || node.data.sessionId.trim().length === 0) {
              return node
            }

            const startedAt = new Date().toISOString()
            const nextResumeSessionId = parsed.resumeSessionId
            const nextResumeSessionIdVerified = nextResumeSessionId !== null
            const nextStatus: TerminalNodeData['status'] = 'running'
            const resolvedModel = parsed.model ?? null
            const nextHostedAgent: NonNullable<TerminalNodeData['hostedAgent']> = {
              provider: parsed.provider,
              launchMode: parsed.launchMode,
              resumeSessionId: nextResumeSessionId,
              resumeSessionIdVerified: nextResumeSessionIdVerified,
              model: resolvedModel,
              effectiveModel: null,
              reasoningEffort: null,
              displayModelLabel: null,
              cwd,
              command: parsed.command,
              startedAt,
              restoreIntent: true,
              state: 'active',
            }

            trackingRequest = {
              sessionId: node.data.sessionId,
              provider: parsed.provider,
              cwd,
              launchMode: parsed.launchMode,
              resumeSessionId: nextResumeSessionId,
              startedAt,
            }

            didChange = true
            return {
              ...node,
              data: {
                ...node.data,
                title:
                  node.data.titlePinnedByUser === true
                    ? node.data.title
                    : toAgentNodeTitle(parsed.provider, resolvedModel),
                status: nextStatus,
                startedAt,
                endedAt: null,
                exitCode: null,
                lastError: null,
                hostedAgent: nextHostedAgent,
              },
            }
          })

          return didChange ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      if (!didChange || !trackingRequest) {
        return
      }

      onRequestPersistFlush?.()
      void Promise.resolve(window.freecliApi.pty.trackHostedAgent?.(trackingRequest)).catch(
        () => undefined,
      )
    },
    [onRequestPersistFlush, setNodes],
  )

  const setTerminalHostedAgentActiveState = useCallback(
    (nodeId: string, active: boolean) => {
      let didChange = false

      setNodes(
        prevNodes => {
          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind !== 'terminal' || !node.data.hostedAgent) {
              return node
            }

            const nextState: NonNullable<TerminalNodeData['hostedAgent']>['state'] = active
              ? 'active'
              : 'inactive'
            const nextRestoreIntent = active
            const nextStatus: TerminalNodeData['status'] = active
              ? (node.data.status ?? 'running')
              : null
            if (
              node.data.hostedAgent.state === nextState &&
              node.data.hostedAgent.restoreIntent === nextRestoreIntent
            ) {
              return node
            }

            didChange = true
            return {
              ...node,
              data: {
                ...node.data,
                status: nextStatus,
                hostedAgent: {
                  ...node.data.hostedAgent,
                  state: nextState,
                  restoreIntent: nextRestoreIntent,
                },
              },
            }
          })

          return didChange ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      if (didChange) {
        onRequestPersistFlush?.()
      }
    },
    [onRequestPersistFlush, setNodes],
  )

  const updateNoteText = useCallback(
    (nodeId: string, text: string) => {
      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            if (node.id !== nodeId || node.data.kind !== 'note' || !node.data.note) {
              return node
            }

            if (node.data.note.text === text) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              data: {
                ...node.data,
                note: {
                  ...node.data.note,
                  text,
                },
              },
            }
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )
    },
    [setNodes],
  )

  const setNodeLabelColorOverride = useCallback(
    (nodeIds: string[], labelColorOverride: NodeLabelColorOverride) => {
      const normalizedIds = nodeIds.map(id => id.trim()).filter(id => id.length > 0)
      if (normalizedIds.length === 0) {
        return
      }

      const idSet = new Set(normalizedIds)
      setNodes(
        prevNodes => {
          let hasChanged = false

          const nextNodes = prevNodes.map(node => {
            if (!idSet.has(node.id)) {
              return node
            }

            const previous = node.data.labelColorOverride ?? null
            if (previous === labelColorOverride) {
              return node
            }

            hasChanged = true
            return {
              ...node,
              data: {
                ...node.data,
                labelColorOverride,
              },
            }
          })

          return hasChanged ? nextNodes : prevNodes
        },
        { syncLayout: false },
      )

      onRequestPersistFlush?.()
    },
    [onRequestPersistFlush, setNodes],
  )
  const { createNodeForSession, createNoteNode, createTaskNode, createImageNode } =
    useWorkspaceCanvasNodeCreation({
      nodesRef,
      spacesRef,
      onRequestPersistFlush,
      onShowMessage,
      onNodeCreated: onNodeCreated ?? fallbackOnNodeCreated,
      setNodes,
      standardWindowSizeBucket,
    })

  return {
    nodesRef,
    pendingScrollbackByNodeRef,
    isNodeDraggingRef,
    setNodes,
    upsertNode,
    bumpAgentLaunchToken,
    clearAgentLaunchToken,
    isAgentLaunchTokenCurrent,
    closeNode,
    normalizePosition,
    resizeNode,
    applyPendingScrollbacks,
    updateNodeScrollback,
    updateTerminalTitle,
    renameTerminalTitle,
    setTerminalCredentialProfile,
    setTerminalActiveCredentialProfile,
    setTerminalPersistenceMode,
    trackTerminalHostedAgent,
    setTerminalHostedAgentActiveState,
    setNodeLabelColorOverride,
    updateNoteText,
    createNodeForSession,
    createNoteNode,
    createTaskNode,
    createImageNode,
  }
}
