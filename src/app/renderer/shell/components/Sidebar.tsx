import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import { AGENT_PROVIDER_LABEL } from '@contexts/settings/domain/agentSettings'
import { isAgentWorking } from '@contexts/workspace/presentation/renderer/components/workspaceCanvas/helpers'
import { resolveTerminalRuntimeStatus } from '../utils/terminalRuntimeStatus'
import type { PersistNotice, ProjectContextMenuState } from '../types'
import { toRelativeTime } from '../utils/format'
import type {
  AgentRuntimeStatus,
  TerminalNodeData,
  WorkspaceState,
} from '@contexts/workspace/presentation/renderer/types'

type SidebarAgentStatus = 'working' | 'standby'

type SidebarStatusTone = 'working' | 'standby' | 'failed' | 'stopped'

type WorkspaceProjectStatusTone = 'done' | 'active' | 'error' | 'standby' | 'idle'

type WorkspaceProjectStatusMotion = 'steady' | 'pulse'

type WorkspaceDropPlacement = 'before' | 'after'

type AggregatedTerminalStatusKind = 'error' | 'active' | 'done' | 'standby' | 'mixed' | 'idle'

const WORKSPACE_DRAG_START_DISTANCE_PX = 8

function resolveSidebarAgentStatus(runtimeStatus: TerminalNodeData['status']): SidebarAgentStatus {
  if (isAgentWorking(runtimeStatus)) {
    return 'working'
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
  dropPlacement: WorkspaceDropPlacement | null
  dragOffset: { x: number; y: number }
  onWorkspacePointerDown: (workspaceId: string, event: React.MouseEvent<HTMLButtonElement>) => void
  onSelectWorkspace: (workspaceId: string) => void
  onOpenProjectContextMenu: (state: ProjectContextMenuState) => void
  onSelectAgentNode: (workspaceId: string, nodeId: string) => void
  registerGroupRef: (workspaceId: string, node: HTMLDivElement | null) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [isStatusPopoverOpen, setIsStatusPopoverOpen] = React.useState(false)
  const workspaceAgents = workspace.nodes
    .filter(node => node.data.kind === 'agent')
    .sort((left, right) => {
      const leftTime = left.data.startedAt ? Date.parse(left.data.startedAt) : 0
      const rightTime = right.data.startedAt ? Date.parse(right.data.startedAt) : 0
      return rightTime - leftTime
    })
  const workspaceTerminals = workspace.nodes
    .filter(node => node.data.kind === 'terminal')
    .sort((left, right) => {
      const leftTime = left.data.startedAt ? Date.parse(left.data.startedAt) : 0
      const rightTime = right.data.startedAt ? Date.parse(right.data.startedAt) : 0
      return rightTime - leftTime
    })
  const workspaceTerminalItems = workspaceTerminals.map(node => {
    const runtimeStatus = resolveTerminalRuntimeStatus(node.data)
    return {
      id: node.id,
      title: node.data.title,
      status: runtimeStatus,
      statusLabelKey: resolveTerminalStatusLabelKey(runtimeStatus),
    }
  })
  const terminalCount = workspace.nodes.filter(node => node.data.kind === 'terminal').length
  const agentCount = workspace.nodes.filter(node => node.data.kind === 'agent').length
  const taskCount = workspace.nodes.filter(node => node.data.kind === 'task').length
  const workspaceProjectStatus = resolveWorkspaceTerminalAggregate(
    workspaceTerminalItems.map(item => item.status),
  )
  const workspaceStatusSummaryText = t(`sidebar.aggregateStatus.${workspaceProjectStatus.kind}`)
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
        } ${isDropTarget ? 'workspace-item--drop-target' : ''}`}
        style={dragStyle}
        aria-grabbed={isDragging}
        data-drop-placement={dropPlacement ?? undefined}
        onMouseDown={event => {
          onWorkspacePointerDown(workspace.id, event)
        }}
        data-testid={`workspace-item-${workspace.id}`}
        onClick={() => {
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
                  className={`workspace-item__status-dot workspace-item__status-dot--${workspaceProjectStatus.tone} workspace-item__status-dot--${workspaceProjectStatus.motion}`}
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
            <span>{t('sidebar.terminals', { count: terminalCount })}</span>
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

      {workspaceAgents.length > 0 ? (
        <div className="workspace-item__agents">
          {workspaceAgents.map(node => {
            const provider = node.data.agent?.provider
            const providerText = provider
              ? AGENT_PROVIDER_LABEL[provider]
              : t('sidebar.fallbackAgentLabel')
            const linkedTaskNode =
              (node.data.agent?.taskId
                ? (workspace.nodes.find(
                    candidate =>
                      candidate.id === node.data.agent?.taskId &&
                      candidate.data.kind === 'task' &&
                      candidate.data.task,
                  ) ?? null)
                : null) ??
              workspace.nodes.find(
                candidate =>
                  candidate.data.kind === 'task' &&
                  candidate.data.task?.linkedAgentNodeId === node.id,
              ) ??
              null
            const sidebarAgentStatus = resolveSidebarAgentStatus(node.data.status)
            const sidebarAgentStatusTone: SidebarStatusTone =
              sidebarAgentStatus === 'working' ? 'working' : 'standby'
            const startedText = toRelativeTime(node.data.startedAt)
            const sidebarAgentStatusText =
              sidebarAgentStatus === 'working'
                ? t('sidebar.status.working')
                : t('sidebar.status.standby')
            const taskTitle =
              linkedTaskNode && linkedTaskNode.data.kind === 'task'
                ? linkedTaskNode.data.title
                : null

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
                {taskTitle ? (
                  <span className="workspace-agent-item__task" title={taskTitle}>
                    <span className="workspace-agent-item__task-text">{taskTitle}</span>
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

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  activeProviderLabel,
  activeProviderModel,
  persistNotice,
  onAddWorkspace,
  onSelectWorkspace,
  onReorderWorkspaces,
  onOpenProjectContextMenu,
  onSelectAgentNode,
}: {
  workspaces: WorkspaceState[]
  activeWorkspaceId: string | null
  activeProviderLabel: string
  activeProviderModel: string
  persistNotice: PersistNotice | null
  onAddWorkspace: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onReorderWorkspaces: (activeWorkspaceId: string, overWorkspaceId: string) => void
  onOpenProjectContextMenu: (state: ProjectContextMenuState) => void
  onSelectAgentNode: (workspaceId: string, nodeId: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const [draggedWorkspaceId, setDraggedWorkspaceId] = React.useState<string | null>(null)
  const [dropTargetWorkspaceId, setDropTargetWorkspaceId] = React.useState<string | null>(null)
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 })
  const workspaceGroupRefs = React.useRef(new Map<string, HTMLDivElement>())
  const pendingPointerDownRef = React.useRef<{
    workspaceId: string
    startX: number
    startY: number
    startedDragging: boolean
  } | null>(null)
  const draggedWorkspaceIdRef = React.useRef<string | null>(null)
  const dropTargetWorkspaceIdRef = React.useRef<string | null>(null)
  const suppressWorkspaceClickRef = React.useRef(false)

  const setDraggedWorkspace = React.useCallback((workspaceId: string | null) => {
    draggedWorkspaceIdRef.current = workspaceId
    setDraggedWorkspaceId(workspaceId)
  }, [])

  const setDropTargetWorkspace = React.useCallback((workspaceId: string | null) => {
    dropTargetWorkspaceIdRef.current = workspaceId
    setDropTargetWorkspaceId(workspaceId)
  }, [])

  const activeDropPlacement = React.useMemo<WorkspaceDropPlacement | null>(() => {
    if (
      !draggedWorkspaceId ||
      !dropTargetWorkspaceId ||
      draggedWorkspaceId === dropTargetWorkspaceId
    ) {
      return null
    }

    const draggedIndex = workspaces.findIndex(workspace => workspace.id === draggedWorkspaceId)
    const targetIndex = workspaces.findIndex(workspace => workspace.id === dropTargetWorkspaceId)
    if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
      return null
    }

    // reorderWorkspaces inserts at the hovered item's array index; after removing a higher item,
    // this appears visually as inserting after the hovered target.
    return draggedIndex < targetIndex ? 'after' : 'before'
  }, [draggedWorkspaceId, dropTargetWorkspaceId, workspaces])

  const resetDragOffset = React.useCallback(() => {
    setDragOffset({ x: 0, y: 0 })
  }, [])

  const registerGroupRef = React.useCallback((workspaceId: string, node: HTMLDivElement | null) => {
    if (node) {
      workspaceGroupRefs.current.set(workspaceId, node)
      return
    }

    workspaceGroupRefs.current.delete(workspaceId)
  }, [])

  const resolveWorkspaceDropTarget = React.useCallback(
    (clientY: number): string | null => {
      let nearestWorkspaceId: string | null = null
      let nearestDistance = Number.POSITIVE_INFINITY

      for (const workspace of workspaces) {
        const element = workspaceGroupRefs.current.get(workspace.id)
        if (!element) {
          continue
        }

        const rect = element.getBoundingClientRect()
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return workspace.id
        }

        const distance = Math.abs(clientY - (rect.top + rect.height / 2))
        if (distance < nearestDistance) {
          nearestDistance = distance
          nearestWorkspaceId = workspace.id
        }
      }

      return nearestWorkspaceId
    },
    [workspaces],
  )

  const finishWorkspaceDrag = React.useCallback(() => {
    const pendingPointerDown = pendingPointerDownRef.current
    const activeDragWorkspaceId = draggedWorkspaceIdRef.current
    const activeDropTargetWorkspaceId = dropTargetWorkspaceIdRef.current

    pendingPointerDownRef.current = null
    setDraggedWorkspace(null)
    setDropTargetWorkspace(null)
    resetDragOffset()

    if (!pendingPointerDown?.startedDragging || !activeDragWorkspaceId) {
      return
    }

    suppressWorkspaceClickRef.current = true
    window.setTimeout(() => {
      suppressWorkspaceClickRef.current = false
    }, 0)

    if (activeDropTargetWorkspaceId && activeDropTargetWorkspaceId !== activeDragWorkspaceId) {
      onReorderWorkspaces(activeDragWorkspaceId, activeDropTargetWorkspaceId)
    }
  }, [onReorderWorkspaces, resetDragOffset, setDraggedWorkspace, setDropTargetWorkspace])

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
        setDraggedWorkspace(pendingPointerDown.workspaceId)
      }

      setDragOffset({
        x: event.clientX - pendingPointerDown.startX,
        y: event.clientY - pendingPointerDown.startY,
      })
      setDropTargetWorkspace(resolveWorkspaceDropTarget(event.clientY))
    }

    const handleWindowMouseUp = () => {
      finishWorkspaceDrag()
    }

    window.addEventListener('mousemove', handleWindowMouseMove)
    window.addEventListener('mouseup', handleWindowMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove)
      window.removeEventListener('mouseup', handleWindowMouseUp)
    }
  }, [finishWorkspaceDrag, resolveWorkspaceDropTarget, setDraggedWorkspace, setDropTargetWorkspace])

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
      setDropTargetWorkspace(workspaceId)
    },
    [setDropTargetWorkspace],
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

  return (
    <aside
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

      <div className="workspace-sidebar__agent">
        <span className="workspace-sidebar__agent-label">{t('sidebar.defaultAgent')}</span>
        <strong className="workspace-sidebar__agent-provider">{activeProviderLabel}</strong>
        <span className="workspace-sidebar__agent-model">{activeProviderModel}</span>
      </div>

      {persistNotice ? (
        <div
          className={`workspace-sidebar__persist-alert workspace-sidebar__persist-alert--${persistNotice.tone}`}
        >
          <strong>{t('sidebar.persistence')}</strong>
          <span>{persistNotice.message}</span>
        </div>
      ) : null}

      <div className="workspace-sidebar__list">
        {workspaces.length === 0 ? (
          <p className="workspace-sidebar__empty">{t('sidebar.noProjectYet')}</p>
        ) : null}

        {workspaces.map(workspace => {
          const isDragging = workspace.id === draggedWorkspaceId
          const isDropTarget =
            draggedWorkspaceId !== null &&
            workspace.id === dropTargetWorkspaceId &&
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
              registerGroupRef={registerGroupRef}
            />
          )
        })}
      </div>
    </aside>
  )
}
