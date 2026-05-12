import React from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '@app/renderer/i18n'
import { AGENT_PROVIDER_LABEL } from '@contexts/settings/domain/agentSettings'
import { isAgentWorking } from '@contexts/workspace/presentation/renderer/components/workspaceCanvas/helpers'
import {
  hasLiveTerminalSession,
  resolveSidebarAgentRuntimeStatus,
  resolveSidebarTerminalRuntimeStatus,
} from '../utils/terminalRuntimeStatus'
import type {
  PersistNotice,
  ProjectContextMenuState,
  WorkspaceListKind,
  WorkspaceListPlacement,
  WorkspaceMoveIntent,
} from '../types'
import { toRelativeTime } from '../utils/format'
import type {
  AgentRuntimeStatus,
  TerminalNodeData,
  WorkspaceState,
} from '@contexts/workspace/presentation/renderer/types'
import { isWorkspaceArchived } from '../utils/workspaceArchive'

type SidebarAgentStatus = 'working' | 'standby' | 'stopped'

type SidebarStatusTone = 'working' | 'standby' | 'failed' | 'stopped'

type WorkspaceProjectStatusTone = 'done' | 'active' | 'error' | 'standby' | 'idle'

type WorkspaceProjectStatusMotion = 'steady' | 'pulse'

type AggregatedTerminalStatusKind = 'error' | 'active' | 'done' | 'standby' | 'mixed' | 'idle'

type WorkspaceGraphNode = WorkspaceState['nodes'][number]

type SidebarTerminalItem = {
  id: string
  title: string
  hasLiveSession: boolean
  status: AgentRuntimeStatus | null
  statusLabelKey: string
}

type SidebarDerivedAgentItem = {
  hasLiveSession: boolean
  node: WorkspaceGraphNode
  linkedTaskTitle: string | null
}

type DropTarget = {
  list: WorkspaceListKind
  anchorWorkspaceId: string | null
  placement: WorkspaceListPlacement
}

type ArchiveIngressAnimation = {
  workspaceId: string
  workspaceName: string
  workspacePath: string
  startRect: { left: number; top: number; width: number; height: number }
  endRect: { left: number; top: number; width: number; height: number }
  phase: 'prepare' | 'active'
}

type DragPreview = {
  workspaceId: string
  workspaceName: string
  workspacePath: string
  isArchived: boolean
  startClient: { x: number; y: number }
}

type ArchivePanelPosition = {
  left: number
  top: number
  maxHeight: number
}

const WORKSPACE_DRAG_START_DISTANCE_PX = 8
const ARCHIVE_INGRESS_ANIMATION_MS = 340

function resolveSidebarAgentStatus(runtimeStatus: TerminalNodeData['status']): SidebarAgentStatus {
  if (isAgentWorking(runtimeStatus)) {
    return 'working'
  }

  if (runtimeStatus === 'stopped') {
    return 'stopped'
  }

  return 'standby'
}

function resolveTerminalStatusLabelKey(status: AgentRuntimeStatus | null): string {
  switch (status) {
    case 'running':
      return 'agentRuntime.working'
    case 'restoring':
      return 'agentRuntime.restoring'
    case 'standby':
      return 'agentRuntime.standby'
    case 'failed':
      return 'agentRuntime.failed'
    case 'exited':
      return 'agentRuntime.exited'
    case 'stopped':
      return 'agentRuntime.stopped'
    default:
      return 'sidebar.aggregateStatus.unknown'
  }
}

function resolveWorkspaceTerminalAggregate(terminalStatuses: Array<AgentRuntimeStatus | null>): {
  kind: AggregatedTerminalStatusKind
  tone: WorkspaceProjectStatusTone
  motion: WorkspaceProjectStatusMotion
} {
  if (terminalStatuses.length === 0) {
    return {
      kind: 'idle',
      tone: 'idle',
      motion: 'steady',
    }
  }

  const hasFailedTerminal = terminalStatuses.some(status => status === 'failed')
  if (hasFailedTerminal) {
    return {
      kind: 'error',
      tone: 'error',
      motion: 'steady',
    }
  }

  const hasActiveTerminal = terminalStatuses.some(
    status => status === 'running' || status === 'restoring',
  )
  if (hasActiveTerminal) {
    return {
      kind: 'active',
      tone: 'active',
      motion: 'pulse',
    }
  }

  const allStandby = terminalStatuses.every(status => status === 'standby')
  if (allStandby) {
    return {
      kind: 'standby',
      tone: 'standby',
      motion: 'steady',
    }
  }

  const allDone = terminalStatuses.every(status => status === 'exited')
  if (allDone) {
    return {
      kind: 'done',
      tone: 'done',
      motion: 'steady',
    }
  }

  const allRecoverableMixed = terminalStatuses.every(
    status => status === 'standby' || status === 'exited' || status === 'stopped',
  )
  if (allRecoverableMixed) {
    return {
      kind: 'mixed',
      tone: 'standby',
      motion: 'steady',
    }
  }

  return {
    kind: 'mixed',
    tone: 'idle',
    motion: 'steady',
  }
}

function getWorkspaceNodeStartedAt(node: WorkspaceGraphNode): number {
  return node.data.startedAt ? Date.parse(node.data.startedAt) : 0
}

function deriveWorkspaceSidebarData(workspace: WorkspaceState): {
  agentCount: number
  hasAnyLiveRuntimeSession: boolean
  taskCount: number
  terminalCount: number
  workspaceAgents: SidebarDerivedAgentItem[]
  workspaceTerminalItems: SidebarTerminalItem[]
} {
  let agentCount = 0
  let taskCount = 0
  let terminalCount = 0
  let hasAnyLiveRuntimeSession = false
  const agentNodes: WorkspaceGraphNode[] = []
  const terminalNodes: WorkspaceGraphNode[] = []
  const taskNodeById = new Map<string, WorkspaceGraphNode>()
  const taskTitleByLinkedAgentId = new Map<string, string>()

  for (const node of workspace.nodes) {
    if (node.data.kind === 'agent') {
      agentCount += 1
      agentNodes.push(node)
      continue
    }

    if (node.data.kind === 'terminal') {
      terminalCount += 1
      terminalNodes.push(node)
      continue
    }

    if (node.data.kind === 'task') {
      taskCount += 1
      if (node.data.task) {
        taskNodeById.set(node.id, node)

        const linkedAgentNodeId = node.data.task.linkedAgentNodeId
        if (linkedAgentNodeId) {
          taskTitleByLinkedAgentId.set(linkedAgentNodeId, node.data.title)
        }
      }
    }
  }

  const workspaceAgents = [...agentNodes]
    .sort((left, right) => getWorkspaceNodeStartedAt(right) - getWorkspaceNodeStartedAt(left))
    .map(node => {
      const linkedTaskNode =
        (node.data.agent?.taskId ? (taskNodeById.get(node.data.agent.taskId) ?? null) : null) ??
        (taskTitleByLinkedAgentId.has(node.id)
          ? (taskTitleByLinkedAgentId.get(node.id) ?? null)
          : null)

      return {
        hasLiveSession: hasLiveTerminalSession(node.data),
        node,
        linkedTaskTitle:
          linkedTaskNode && typeof linkedTaskNode !== 'string'
            ? linkedTaskNode.data.title
            : linkedTaskNode,
      }
    })

  const workspaceTerminalItems = [...terminalNodes]
    .sort((left, right) => getWorkspaceNodeStartedAt(right) - getWorkspaceNodeStartedAt(left))
    .map(node => {
      const hasLiveSession = hasLiveTerminalSession(node.data)
      if (hasLiveSession) {
        hasAnyLiveRuntimeSession = true
      }

      const runtimeStatus = resolveSidebarTerminalRuntimeStatus(node.data)
      return {
        id: node.id,
        title: node.data.title,
        hasLiveSession,
        status: runtimeStatus,
        statusLabelKey: resolveTerminalStatusLabelKey(runtimeStatus),
      }
    })

  for (const { hasLiveSession } of workspaceAgents) {
    if (hasLiveSession) {
      hasAnyLiveRuntimeSession = true
      break
    }
  }

  return {
    agentCount,
    hasAnyLiveRuntimeSession,
    taskCount,
    terminalCount,
    workspaceAgents,
    workspaceTerminalItems,
  }
}

function WorkspaceSidebarItem({
  workspace,
  isActive,
  activeWorkspaceId,
  isDragging,
  isDropTarget,
  dropPlacement,
  dragOffset,
  onWorkspacePointerDown,
  onSelectWorkspace,
  onOpenProjectContextMenu,
  onSelectAgentNode,
  registerGroupRef,
}: {
  workspace: WorkspaceState
  isActive: boolean
  activeWorkspaceId: string | null
  isDragging: boolean
  isDropTarget: boolean
  dropPlacement: WorkspaceListPlacement | null
  dragOffset: { x: number; y: number }
  onWorkspacePointerDown: (workspaceId: string, event: React.MouseEvent<HTMLButtonElement>) => void
  onSelectWorkspace: (workspaceId: string) => void
  onOpenProjectContextMenu: (state: ProjectContextMenuState) => void
  onSelectAgentNode: (workspaceId: string, nodeId: string) => void
  registerGroupRef: (workspaceId: string, node: HTMLDivElement | null) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = React.useState(false)
  const {
    workspaceAgents,
    workspaceTerminalItems,
    terminalCount,
    agentCount,
    taskCount,
    hasAnyLiveRuntimeSession,
  } = React.useMemo(() => deriveWorkspaceSidebarData(workspace), [workspace])
  const isArchived = isWorkspaceArchived(workspace)
  const workspaceProjectStatus = resolveWorkspaceTerminalAggregate(
    hasAnyLiveRuntimeSession ? workspaceTerminalItems.map(item => item.status) : [],
  )
  const workspaceStatusSummaryText = isArchived
    ? t('sidebar.archivedStatus')
    : t(`sidebar.aggregateStatus.${workspaceProjectStatus.kind}`)
  const dragStyle = isDragging
    ? ({
        '--workspace-drag-offset-x': `${dragOffset.x}px`,
        '--workspace-drag-offset-y': `${dragOffset.y}px`,
      } as React.CSSProperties)
    : undefined

  const handleStatusAnchorBlur = React.useCallback((event: React.FocusEvent<HTMLSpanElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return
    }

    setIsStatusPopoverOpen(false)
  }, [])

  return (
    <div
      ref={node => {
        registerGroupRef(workspace.id, node)
      }}
      className={`workspace-item-group ${isDragging ? 'workspace-item-group--dragging' : ''} ${
        isDropTarget && dropPlacement ? `workspace-item-group--drop-${dropPlacement}` : ''
      }`}
      data-testid={`workspace-item-group-${workspace.id}`}
    >
      <button
        type="button"
        className={`workspace-item ${isActive ? 'workspace-item--active' : ''} ${
          isDragging ? 'workspace-item--dragging' : ''
        } ${isDropTarget ? 'workspace-item--drop-target' : ''} ${
          isArchived ? 'workspace-item--archived' : ''
        } ${isStatusPopoverOpen ? 'workspace-item--status-popover-open' : ''}`}
        style={dragStyle}
        aria-grabbed={isDragging}
        data-drop-placement={dropPlacement ?? undefined}
        onMouseDown={event => {
          onWorkspacePointerDown(workspace.id, event)
        }}
        data-testid={`workspace-item-${workspace.id}`}
        onClick={() => {
          if (isArchived) {
            return
          }
          onSelectWorkspace(workspace.id)
        }}
        onContextMenu={event => {
          event.preventDefault()
          onOpenProjectContextMenu({
            workspaceId: workspace.id,
            x: event.clientX,
            y: event.clientY,
          })
        }}
      >
        <span className="workspace-item__name">{workspace.name}</span>
        <span className="workspace-item__path">{workspace.path}</span>
        <span className="workspace-item__meta">
          <span className="workspace-item__meta-segment">
            <span
              className="workspace-item__status-anchor"
              onMouseEnter={() => {
                setIsStatusPopoverOpen(true)
              }}
              onMouseLeave={() => {
                setIsStatusPopoverOpen(false)
              }}
              onFocus={() => {
                setIsStatusPopoverOpen(true)
              }}
              onBlur={handleStatusAnchorBlur}
            >
              <span
                className="workspace-item__status-indicator"
                tabIndex={0}
                aria-label={t('sidebar.aggregateStatusAriaLabel', {
                  status: workspaceStatusSummaryText,
                })}
                data-testid={`workspace-status-trigger-${workspace.id}`}
              >
                <span
                  className={`workspace-item__status-dot workspace-item__status-dot--${
                    isArchived ? 'idle' : workspaceProjectStatus.tone
                  } workspace-item__status-dot--${
                    isArchived ? 'steady' : workspaceProjectStatus.motion
                  }`}
                  aria-hidden="true"
                  data-testid={`workspace-status-dot-${workspace.id}`}
                />
              </span>
              <span
                className={`workspace-item__status-popover ${
                  isStatusPopoverOpen ? 'workspace-item__status-popover--open' : ''
                }`}
                role="tooltip"
                hidden={!isStatusPopoverOpen}
                data-testid={`workspace-status-popover-${workspace.id}`}
              >
                <span className="workspace-item__status-popover-title">
                  {t('sidebar.aggregateStatusTitle', {
                    status: workspaceStatusSummaryText,
                  })}
                </span>
                {workspaceTerminalItems.length > 0 ? (
                  <span className="workspace-item__status-popover-list">
                    {workspaceTerminalItems.map(item => (
                      <span
                        key={`${workspace.id}:${item.id}`}
                        className="workspace-item__status-popover-item"
                      >
                        <span className="workspace-item__status-popover-name" title={item.title}>
                          {item.title}
                        </span>
                        <span className="workspace-item__status-popover-value">
                          {t(item.statusLabelKey)}
                        </span>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="workspace-item__status-popover-empty">
                    {t('sidebar.aggregateStatusEmpty')}
                  </span>
                )}
              </span>
            </span>
            <span>
              {isArchived
                ? t('sidebar.archivedBadge')
                : t('sidebar.terminals', { count: terminalCount })}
            </span>
          </span>
          <span className="workspace-item__meta-separator" aria-hidden="true">
            ·
          </span>
          <span className="workspace-item__meta-segment">
            {t('sidebar.agents', { count: agentCount })}
          </span>
          <span className="workspace-item__meta-separator" aria-hidden="true">
            ·
          </span>
          <span className="workspace-item__meta-segment">
            {t('sidebar.tasks', { count: taskCount })}
          </span>
        </span>
      </button>

      {!isArchived && workspaceAgents.length > 0 ? (
        <div className="workspace-item__agents">
          {workspaceAgents.map(({ node, linkedTaskTitle }) => {
            const provider = node.data.agent?.provider
            const providerText = provider
              ? AGENT_PROVIDER_LABEL[provider]
              : t('sidebar.fallbackAgentLabel')
            const sidebarAgentStatus = resolveSidebarAgentStatus(
              resolveSidebarAgentRuntimeStatus({
                sessionId: node.data.sessionId,
                status: node.data.status,
              }),
            )
            const sidebarAgentStatusTone: SidebarStatusTone =
              sidebarAgentStatus === 'working'
                ? 'working'
                : sidebarAgentStatus === 'stopped'
                  ? 'stopped'
                  : 'standby'
            const startedText = toRelativeTime(node.data.startedAt)
            const sidebarAgentStatusText =
              sidebarAgentStatus === 'working'
                ? t('sidebar.status.working')
                : sidebarAgentStatus === 'stopped'
                  ? t('agentRuntime.stopped')
                  : t('sidebar.status.standby')

            return (
              <button
                type="button"
                key={`${workspace.id}:${node.id}`}
                className="workspace-agent-item workspace-agent-item--nested"
                data-testid={`workspace-agent-item-${workspace.id}-${node.id}`}
                onClick={() => {
                  if (workspace.id !== activeWorkspaceId) {
                    onSelectWorkspace(workspace.id)
                  }
                  onSelectAgentNode(workspace.id, node.id)
                }}
              >
                <span className="workspace-agent-item__headline">
                  <span className="workspace-agent-item__title">{node.data.title}</span>
                </span>
                <span className="workspace-agent-item__meta">
                  <span className="workspace-agent-item__meta-text">
                    {providerText} · {startedText}
                  </span>
                  <span
                    className={`workspace-agent-item__status workspace-agent-item__status--agent workspace-agent-item__status--${sidebarAgentStatusTone}`}
                  >
                    {sidebarAgentStatusText}
                  </span>
                </span>
                {linkedTaskTitle ? (
                  <span className="workspace-agent-item__task" title={linkedTaskTitle}>
                    <span className="workspace-agent-item__task-text">{linkedTaskTitle}</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function resolveDropPlacementFromPointer(rect: DOMRect, clientY: number): WorkspaceListPlacement {
  return clientY >= rect.top + rect.height / 2 ? 'after' : 'before'
}

function isPointerInsideRect(rect: DOMRect, clientX: number, clientY: number): boolean {
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  )
}

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  persistNotice,
  onAddWorkspace,
  onSelectWorkspace,
  onMoveWorkspace,
  onOpenProjectContextMenu,
  onSelectAgentNode,
}: {
  workspaces: WorkspaceState[]
  activeWorkspaceId: string | null
  persistNotice: PersistNotice | null
  onAddWorkspace: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onMoveWorkspace: (intent: WorkspaceMoveIntent) => void
  onOpenProjectContextMenu: (state: ProjectContextMenuState) => void
  onSelectAgentNode: (workspaceId: string, nodeId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [isArchivePanelOpen, setIsArchivePanelOpen] = React.useState(false)
  const [draggedWorkspaceId, setDraggedWorkspaceId] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null)
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 })
  const [dragPreview, setDragPreview] = React.useState<DragPreview | null>(null)
  const [archivePanelPosition, setArchivePanelPosition] =
    React.useState<ArchivePanelPosition | null>(null)
  const [archiveIngressAnimation, setArchiveIngressAnimation] =
    React.useState<ArchiveIngressAnimation | null>(null)
  const sidebarRef = React.useRef<HTMLElement | null>(null)
  const activeWorkspaceGroupRefs = React.useRef(new Map<string, HTMLDivElement>())
  const archivedWorkspaceGroupRefs = React.useRef(new Map<string, HTMLDivElement>())
  const activeListRef = React.useRef<HTMLDivElement | null>(null)
  const archivedListRef = React.useRef<HTMLDivElement | null>(null)
  const archiveCardRef = React.useRef<HTMLButtonElement | null>(null)
  const pendingPointerDownRef = React.useRef<{
    workspaceId: string
    startX: number
    startY: number
    startedDragging: boolean
  } | null>(null)
  const draggedWorkspaceIdRef = React.useRef<string | null>(null)
  const dropTargetRef = React.useRef<DropTarget | null>(null)
  const suppressWorkspaceClickRef = React.useRef(false)
  const lastArchiveDragEndedAtRef = React.useRef(0)

  const activeWorkspaces = React.useMemo(
    () => workspaces.filter(workspace => !isWorkspaceArchived(workspace)),
    [workspaces],
  )
  const archivedWorkspaces = React.useMemo(
    () => workspaces.filter(workspace => isWorkspaceArchived(workspace)),
    [workspaces],
  )

  const activeWorkspaceIds = React.useMemo(
    () => new Set(activeWorkspaces.map(workspace => workspace.id)),
    [activeWorkspaces],
  )
  const archivedWorkspaceIds = React.useMemo(
    () => new Set(archivedWorkspaces.map(workspace => workspace.id)),
    [archivedWorkspaces],
  )

  const registerWorkspaceGroupRef = React.useCallback(
    (list: WorkspaceListKind, workspaceId: string, node: HTMLDivElement | null) => {
      const targetMap =
        list === 'archived' ? archivedWorkspaceGroupRefs.current : activeWorkspaceGroupRefs.current
      if (node) {
        targetMap.set(workspaceId, node)
        return
      }

      targetMap.delete(workspaceId)
    },
    [],
  )

  const setDraggedWorkspace = React.useCallback((workspaceId: string | null) => {
    draggedWorkspaceIdRef.current = workspaceId
    setDraggedWorkspaceId(workspaceId)
  }, [])

  const setResolvedDropTarget = React.useCallback((nextTarget: DropTarget | null) => {
    dropTargetRef.current = nextTarget
    setDropTarget(nextTarget)
  }, [])

  const resetDragOffset = React.useCallback(() => {
    setDragOffset({ x: 0, y: 0 })
  }, [])

  const activeDropTargetWorkspaceId =
    dropTarget?.list === 'active' ? dropTarget.anchorWorkspaceId : null
  const archivedDropTargetWorkspaceId =
    dropTarget?.list === 'archived' ? dropTarget.anchorWorkspaceId : null

  const activeDropPlacement = React.useMemo<WorkspaceListPlacement | null>(() => {
    if (
      !draggedWorkspaceId ||
      !activeDropTargetWorkspaceId ||
      draggedWorkspaceId === activeDropTargetWorkspaceId
    ) {
      return null
    }

    return dropTarget?.placement ?? null
  }, [activeDropTargetWorkspaceId, draggedWorkspaceId, dropTarget?.placement])

  const archivedDropPlacement = React.useMemo<WorkspaceListPlacement | null>(() => {
    if (
      !draggedWorkspaceId ||
      !archivedDropTargetWorkspaceId ||
      draggedWorkspaceId === archivedDropTargetWorkspaceId
    ) {
      return null
    }

    return dropTarget?.placement ?? null
  }, [archivedDropTargetWorkspaceId, draggedWorkspaceId, dropTarget?.placement])

  const updateArchivePanelPosition = React.useCallback(() => {
    const archiveCard = archiveCardRef.current
    if (!archiveCard || typeof window === 'undefined') {
      return
    }

    const archiveCardRect = archiveCard.getBoundingClientRect()
    const viewportPadding = 24
    const preferredLeft = archiveCardRect.right + 18
    const maxLeft = Math.max(viewportPadding, window.innerWidth - 344)
    const top = Math.min(
      Math.max(viewportPadding, archiveCardRect.top),
      Math.max(viewportPadding, window.innerHeight - 220),
    )

    setArchivePanelPosition({
      left: Math.min(preferredLeft, maxLeft),
      top,
      maxHeight: Math.max(240, window.innerHeight - top - viewportPadding),
    })
  }, [])

  React.useEffect(() => {
    if (!isArchivePanelOpen) {
      setArchivePanelPosition(null)
      return
    }

    updateArchivePanelPosition()
    window.addEventListener('resize', updateArchivePanelPosition)

    return () => {
      window.removeEventListener('resize', updateArchivePanelPosition)
    }
  }, [isArchivePanelOpen, updateArchivePanelPosition])

  React.useEffect(() => {
    if (!archiveIngressAnimation || archiveIngressAnimation.phase !== 'prepare') {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setArchiveIngressAnimation(current =>
        current
          ? {
              ...current,
              phase: 'active',
            }
          : null,
      )
    })
    const timeoutId = window.setTimeout(() => {
      setArchiveIngressAnimation(current =>
        current?.workspaceId === archiveIngressAnimation.workspaceId ? null : current,
      )
    }, ARCHIVE_INGRESS_ANIMATION_MS)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [archiveIngressAnimation])

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    document.body.classList.toggle('workspace-archive-panel-open', isArchivePanelOpen)

    return () => {
      document.body.classList.remove('workspace-archive-panel-open')
    }
  }, [isArchivePanelOpen])

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const blockedElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.workspace-main, .workspace-canvas, .react-flow, .react-flow__pane, .react-flow__viewport',
      ),
    )

    if (!isArchivePanelOpen) {
      for (const element of blockedElements) {
        const previous = element.dataset.archivePanelPointerEvents
        if (typeof previous === 'string') {
          if (previous.length > 0) {
            element.style.pointerEvents = previous
          } else {
            element.style.removeProperty('pointer-events')
          }
          delete element.dataset.archivePanelPointerEvents
        }
      }
      return
    }

    for (const element of blockedElements) {
      if (element.dataset.archivePanelPointerEvents === undefined) {
        element.dataset.archivePanelPointerEvents = element.style.pointerEvents
      }
      element.style.pointerEvents = 'none'
    }

    return () => {
      for (const element of blockedElements) {
        const previous = element.dataset.archivePanelPointerEvents
        if (typeof previous !== 'string') {
          continue
        }

        if (previous.length > 0) {
          element.style.pointerEvents = previous
        } else {
          element.style.removeProperty('pointer-events')
        }
        delete element.dataset.archivePanelPointerEvents
      }
    }
  }, [isArchivePanelOpen])

  const resolveDropTargetFromList = React.useCallback(
    (
      list: WorkspaceListKind,
      clientX: number,
      clientY: number,
      refs: Map<string, HTMLDivElement>,
      fallbackContainer: HTMLDivElement | null,
    ): DropTarget | null => {
      const fallbackRect = fallbackContainer?.getBoundingClientRect() ?? null
      const pointerInsideContainer =
        fallbackRect !== null ? isPointerInsideRect(fallbackRect, clientX, clientY) : false
      let nearestWorkspaceId: string | null = null
      let nearestPlacement: WorkspaceListPlacement = 'after'
      let nearestDistance = Number.POSITIVE_INFINITY

      for (const [workspaceId, element] of refs) {
        const rect = element.getBoundingClientRect()
        const placement = resolveDropPlacementFromPointer(rect, clientY)
        if (isPointerInsideRect(rect, clientX, clientY)) {
          return {
            list,
            anchorWorkspaceId: workspaceId,
            placement,
          }
        }

        if (!pointerInsideContainer) {
          continue
        }

        const anchorY = placement === 'before' ? rect.top : rect.bottom
        const distance = Math.abs(clientY - anchorY)
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestWorkspaceId = workspaceId
          nearestPlacement = placement
        }
      }

      if (pointerInsideContainer && nearestWorkspaceId) {
        return {
          list,
          anchorWorkspaceId: nearestWorkspaceId,
          placement: nearestPlacement,
        }
      }

      if (pointerInsideContainer) {
        return {
          list,
          anchorWorkspaceId: null,
          placement: 'after',
        }
      }

      return null
    },
    [],
  )

  const resolveWorkspaceDropTarget = React.useCallback(
    (clientX: number, clientY: number): DropTarget | null => {
      if (isArchivePanelOpen) {
        const archivedTarget = resolveDropTargetFromList(
          'archived',
          clientX,
          clientY,
          archivedWorkspaceGroupRefs.current,
          archivedListRef.current,
        )
        if (archivedTarget) {
          return archivedTarget
        }
      }

      const activeTarget = resolveDropTargetFromList(
        'active',
        clientX,
        clientY,
        activeWorkspaceGroupRefs.current,
        activeListRef.current,
      )
      if (activeTarget) {
        return activeTarget
      }

      if (archiveCardRef.current) {
        const rect = archiveCardRef.current.getBoundingClientRect()
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return {
            list: 'archived',
            anchorWorkspaceId: null,
            placement: 'after',
          }
        }
      }

      return null
    },
    [isArchivePanelOpen, resolveDropTargetFromList],
  )

  const finishWorkspaceDrag = React.useCallback(() => {
    const pendingPointerDown = pendingPointerDownRef.current
    const activeDragWorkspaceId = draggedWorkspaceIdRef.current
    const activeDropTarget = dropTargetRef.current

    pendingPointerDownRef.current = null
    setDraggedWorkspace(null)
    setResolvedDropTarget(null)
    resetDragOffset()

    if (!pendingPointerDown?.startedDragging || !activeDragWorkspaceId || !activeDropTarget) {
      return
    }

    suppressWorkspaceClickRef.current = true
    window.setTimeout(() => {
      suppressWorkspaceClickRef.current = false
    }, 0)
    lastArchiveDragEndedAtRef.current = Date.now()

    const sourceList: WorkspaceListKind = archivedWorkspaceIds.has(activeDragWorkspaceId)
      ? 'archived'
      : 'active'

    if (
      sourceList === 'active' &&
      activeDropTarget.list === 'archived' &&
      activeDropTarget.anchorWorkspaceId === null
    ) {
      const draggedGroup =
        activeWorkspaceGroupRefs.current.get(activeDragWorkspaceId) ??
        archivedWorkspaceGroupRefs.current.get(activeDragWorkspaceId) ??
        null
      const draggedCard = draggedGroup?.querySelector<HTMLElement>('.workspace-item') ?? null
      const draggedRect = draggedCard?.getBoundingClientRect() ?? null
      const archiveCardRect = archiveCardRef.current?.getBoundingClientRect() ?? null
      const draggedWorkspace =
        workspaces.find(workspace => workspace.id === activeDragWorkspaceId) ?? null

      if (draggedRect && archiveCardRect && draggedWorkspace) {
        setArchiveIngressAnimation({
          workspaceId: draggedWorkspace.id,
          workspaceName: draggedWorkspace.name,
          workspacePath: draggedWorkspace.path,
          startRect: {
            left: draggedRect.left,
            top: draggedRect.top,
            width: draggedRect.width,
            height: draggedRect.height,
          },
          endRect: {
            left: archiveCardRect.left + archiveCardRect.width * 0.16,
            top: archiveCardRect.top + archiveCardRect.height * 0.52,
            width: Math.max(archiveCardRect.width * 0.34, 92),
            height: Math.max(archiveCardRect.height * 0.22, 24),
          },
          phase: 'prepare',
        })
      }
    }

    if (
      activeDropTarget.list === sourceList &&
      activeDropTarget.anchorWorkspaceId === activeDragWorkspaceId
    ) {
      return
    }

    onMoveWorkspace({
      workspaceId: activeDragWorkspaceId,
      targetList: activeDropTarget.list,
      anchorWorkspaceId:
        activeDropTarget.anchorWorkspaceId === activeDragWorkspaceId
          ? null
          : activeDropTarget.anchorWorkspaceId,
      placement: activeDropTarget.placement,
    })
  }, [
    activeWorkspaceGroupRefs,
    archiveCardRef,
    archivedWorkspaceIds,
    archivedWorkspaceGroupRefs,
    onMoveWorkspace,
    resetDragOffset,
    setDraggedWorkspace,
    setResolvedDropTarget,
    workspaces,
  ])

  React.useEffect(() => {
    const handleWindowMouseMove = (event: MouseEvent) => {
      const pendingPointerDown = pendingPointerDownRef.current
      if (!pendingPointerDown) {
        return
      }

      const movedDistance = Math.hypot(
        event.clientX - pendingPointerDown.startX,
        event.clientY - pendingPointerDown.startY,
      )

      if (!pendingPointerDown.startedDragging && movedDistance < WORKSPACE_DRAG_START_DISTANCE_PX) {
        return
      }

      if (!pendingPointerDown.startedDragging) {
        pendingPointerDown.startedDragging = true
        const draggedWorkspace =
          workspaces.find(workspace => workspace.id === pendingPointerDown.workspaceId) ?? null
        if (draggedWorkspace) {
          setDragPreview({
            workspaceId: draggedWorkspace.id,
            workspaceName: draggedWorkspace.name,
            workspacePath: draggedWorkspace.path,
            isArchived: isWorkspaceArchived(draggedWorkspace),
            startClient: {
              x: pendingPointerDown.startX,
              y: pendingPointerDown.startY,
            },
          })
        }
        setDraggedWorkspace(pendingPointerDown.workspaceId)
      }

      setDragOffset({
        x: event.clientX - pendingPointerDown.startX,
        y: event.clientY - pendingPointerDown.startY,
      })
      setResolvedDropTarget(resolveWorkspaceDropTarget(event.clientX, event.clientY))
    }

    const handleWindowMouseUp = () => {
      setDragPreview(null)
      finishWorkspaceDrag()
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [finishWorkspaceDrag, resolveWorkspaceDropTarget, setDraggedWorkspace, setResolvedDropTarget])

  const handleWorkspacePointerDown = React.useCallback(
    (workspaceId: string, event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return
      }

      pendingPointerDownRef.current = {
        workspaceId,
        startX: event.clientX,
        startY: event.clientY,
        startedDragging: false,
      }

      setResolvedDropTarget({
        list: archivedWorkspaceIds.has(workspaceId) ? 'archived' : 'active',
        anchorWorkspaceId: workspaceId,
        placement: 'after',
      })
    },
    [archivedWorkspaceIds, setResolvedDropTarget],
  )

  const handleWorkspaceSelect = React.useCallback(
    (workspaceId: string) => {
      if (suppressWorkspaceClickRef.current) {
        return
      }

      onSelectWorkspace(workspaceId)
    },
    [onSelectWorkspace],
  )

  const archiveCardDropActive =
    draggedWorkspaceId !== null &&
    dropTarget?.list === 'archived' &&
    dropTarget.anchorWorkspaceId === null
  const activeListDropActive =
    draggedWorkspaceId !== null &&
    dropTarget?.list === 'active' &&
    dropTarget.anchorWorkspaceId === null
  const archiveGhostStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!archiveIngressAnimation) {
      return undefined
    }

    const dx = archiveIngressAnimation.endRect.left - archiveIngressAnimation.startRect.left
    const dy = archiveIngressAnimation.endRect.top - archiveIngressAnimation.startRect.top
    const scaleX =
      archiveIngressAnimation.startRect.width > 0
        ? archiveIngressAnimation.endRect.width / archiveIngressAnimation.startRect.width
        : 0.36
    const scaleY =
      archiveIngressAnimation.startRect.height > 0
        ? archiveIngressAnimation.endRect.height / archiveIngressAnimation.startRect.height
        : 0.3

    return {
      left: `${archiveIngressAnimation.startRect.left}px`,
      top: `${archiveIngressAnimation.startRect.top}px`,
      width: `${archiveIngressAnimation.startRect.width}px`,
      height: `${archiveIngressAnimation.startRect.height}px`,
      transform:
        archiveIngressAnimation.phase === 'active'
          ? `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`
          : 'translate(0px, 0px) scale(1)',
      opacity: archiveIngressAnimation.phase === 'active' ? 0.08 : 0.96,
    }
  }, [archiveIngressAnimation])
  const dragPreviewStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!dragPreview) {
      return undefined
    }

    return {
      left: `${dragPreview.startClient.x - 110 + dragOffset.x}px`,
      top: `${dragPreview.startClient.y - 42 + dragOffset.y}px`,
    }
  }, [dragOffset.x, dragOffset.y, dragPreview])
  const dragLayer =
    typeof document !== 'undefined' &&
    ((archiveIngressAnimation && archiveGhostStyle) ||
      (dragPreview && draggedWorkspaceId === dragPreview.workspaceId && dragPreviewStyle))
      ? createPortal(
          <div className="workspace-sidebar__drag-layer" data-testid="workspace-sidebar-drag-layer">
            {archiveIngressAnimation && archiveGhostStyle ? (
              <div
                className="workspace-sidebar__archive-ingress-ghost"
                data-testid="workspace-sidebar-archive-ingress-ghost"
                style={archiveGhostStyle}
              >
                <div className="workspace-sidebar__archive-ingress-card">
                  <span className="workspace-sidebar__archive-ingress-title">
                    {archiveIngressAnimation.workspaceName}
                  </span>
                  <span className="workspace-sidebar__archive-ingress-path">
                    {archiveIngressAnimation.workspacePath}
                  </span>
                </div>
              </div>
            ) : null}
            {dragPreview && draggedWorkspaceId === dragPreview.workspaceId && dragPreviewStyle ? (
              <div
                className="workspace-sidebar__drag-preview"
                data-testid="workspace-sidebar-drag-preview"
                style={dragPreviewStyle}
              >
                <div
                  className={`workspace-sidebar__drag-preview-card ${
                    dragPreview.isArchived ? 'workspace-sidebar__drag-preview-card--archived' : ''
                  }`}
                >
                  <span className="workspace-sidebar__drag-preview-title">
                    {dragPreview.workspaceName}
                  </span>
                  <span className="workspace-sidebar__drag-preview-path">
                    {dragPreview.workspacePath}
                  </span>
                </div>
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null

  return (
    <aside
      ref={sidebarRef}
      className={`workspace-sidebar ${draggedWorkspaceId ? 'workspace-sidebar--reordering' : ''}`}
    >
      <div className="workspace-sidebar__header">
        <div className="workspace-sidebar__header-main">
          <h1>{t('sidebar.projects')}</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            onAddWorkspace()
          }}
        >
          {t('sidebar.addProject')}
        </button>
      </div>

      <button
        ref={archiveCardRef}
        type="button"
        className={`workspace-sidebar__archive-card ${
          isArchivePanelOpen ? 'workspace-sidebar__archive-card--open' : ''
        } ${archiveCardDropActive ? 'workspace-sidebar__archive-card--drop-target' : ''}`}
        data-testid="workspace-sidebar-archive-card"
        onClick={() => {
          if (Date.now() - lastArchiveDragEndedAtRef.current < 250) {
            return
          }
          setIsArchivePanelOpen(open => !open)
        }}
      >
        <span className="workspace-sidebar__archive-card-label">{t('sidebar.archiveFolder')}</span>
        <strong className="workspace-sidebar__archive-card-title">
          {t('sidebar.archivedProjects')}
        </strong>
        <span className="workspace-sidebar__archive-card-description">
          {t('sidebar.archiveFolderDescription')}
        </span>
        <span className="workspace-sidebar__archive-card-meta">
          {t('sidebar.archivedCount', { count: archivedWorkspaces.length })}
        </span>
      </button>

      {persistNotice ? (
        <div
          className={`workspace-sidebar__persist-alert workspace-sidebar__persist-alert--${persistNotice.tone}`}
        >
          <strong>{t('sidebar.persistence')}</strong>
          <span>{persistNotice.message}</span>
        </div>
      ) : null}

      <div className="workspace-sidebar__body">
        <div
          ref={activeListRef}
          className={`workspace-sidebar__list ${
            activeListDropActive ? 'workspace-sidebar__list--drop-target' : ''
          }`}
        >
          {workspaces.length === 0 ? (
            <p className="workspace-sidebar__empty">{t('sidebar.noProjectYet')}</p>
          ) : null}

          {activeWorkspaces.map(workspace => {
            const isDragging = workspace.id === draggedWorkspaceId
            const isDropTarget =
              draggedWorkspaceId !== null &&
              workspace.id === activeDropTargetWorkspaceId &&
              workspace.id !== draggedWorkspaceId

            return (
              <WorkspaceSidebarItem
                key={workspace.id}
                workspace={workspace}
                isActive={workspace.id === activeWorkspaceId}
                activeWorkspaceId={activeWorkspaceId}
                isDragging={isDragging}
                isDropTarget={isDropTarget}
                dropPlacement={isDropTarget ? activeDropPlacement : null}
                dragOffset={dragOffset}
                onWorkspacePointerDown={handleWorkspacePointerDown}
                onSelectWorkspace={handleWorkspaceSelect}
                onOpenProjectContextMenu={onOpenProjectContextMenu}
                onSelectAgentNode={onSelectAgentNode}
                registerGroupRef={(workspaceId, node) => {
                  registerWorkspaceGroupRef('active', workspaceId, node)
                }}
              />
            )
          })}
        </div>

      </div>
      {isArchivePanelOpen && archivePanelPosition && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div
                className="workspace-sidebar__archive-panel-shield"
                aria-hidden="true"
                style={{
                  left: `${Math.max(archivePanelPosition.left - 28, 0)}px`,
                }}
              />
              <div
                className="workspace-sidebar__archive-panel"
                data-testid="workspace-sidebar-archive-panel"
                style={{
                  left: `${archivePanelPosition.left}px`,
                  top: `${archivePanelPosition.top}px`,
                  maxHeight: `${archivePanelPosition.maxHeight}px`,
                }}
              >
                <div className="workspace-sidebar__archive-panel-header">
                  <div className="workspace-sidebar__archive-panel-copy">
                    <strong>{t('sidebar.archivedProjects')}</strong>
                    <span>{t('sidebar.openArchivedList')}</span>
                  </div>
                  <button
                    type="button"
                    className="workspace-sidebar__archive-panel-close"
                    onClick={() => {
                      setIsArchivePanelOpen(false)
                    }}
                    aria-label={t('common.close')}
                  >
                    ×
                  </button>
                </div>
                <div
                  ref={archivedListRef}
                  className={`workspace-sidebar__archive-panel-list ${
                    archiveCardDropActive
                      ? 'workspace-sidebar__archive-panel-list--drop-target'
                      : ''
                  }`}
                >
                  {archivedWorkspaces.length === 0 ? (
                    <p className="workspace-sidebar__archive-empty">
                      {t('sidebar.emptyArchivedProjects')}
                    </p>
                  ) : null}

                  {archivedWorkspaces.map(workspace => {
                    const isDragging = workspace.id === draggedWorkspaceId
                    const isDropTarget =
                      draggedWorkspaceId !== null &&
                      workspace.id === archivedDropTargetWorkspaceId &&
                      workspace.id !== draggedWorkspaceId

                    return (
                      <WorkspaceSidebarItem
                        key={workspace.id}
                        workspace={workspace}
                        isActive={false}
                        activeWorkspaceId={activeWorkspaceId}
                        isDragging={isDragging}
                        isDropTarget={isDropTarget}
                        dropPlacement={isDropTarget ? archivedDropPlacement : null}
                        dragOffset={dragOffset}
                        onWorkspacePointerDown={handleWorkspacePointerDown}
                        onSelectWorkspace={handleWorkspaceSelect}
                        onOpenProjectContextMenu={onOpenProjectContextMenu}
                        onSelectAgentNode={onSelectAgentNode}
                        registerGroupRef={(workspaceId, node) => {
                          registerWorkspaceGroupRef('archived', workspaceId, node)
                        }}
                      />
                    )
                  })}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
      {dragLayer}
    </aside>
  )
}
