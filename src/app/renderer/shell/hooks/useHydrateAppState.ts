import type { Node } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_AGENT_SETTINGS,
  type AgentSettings,
  type StandardWindowSizeBucket,
} from '@contexts/settings/domain/agentSettings'
import { buildHostedTerminalAgentResumeCommand } from '@contexts/terminal/domain/hostedAgent'
import { applyUiLanguage, translate } from '@app/renderer/i18n'
import type {
  PersistedWorkspaceState,
  TerminalNodeData,
  WorkspaceState,
} from '@contexts/workspace/presentation/renderer/types'
import { toErrorMessage } from '@app/renderer/shell/utils/format'
import { useScrollbackStore } from '@contexts/workspace/presentation/renderer/store/useScrollbackStore'
import { readPersistedStateWithMeta } from '@contexts/workspace/presentation/renderer/utils/persistence'
import { getPersistencePort } from '@contexts/workspace/presentation/renderer/utils/persistence/port'
import { toPersistedWorkspaceState } from '@contexts/workspace/presentation/renderer/utils/persistence/toPersistedState'
import { toRuntimeNodes } from '@contexts/workspace/presentation/renderer/utils/nodeTransform'
import { resolveCanvasCanonicalBucketFromViewport } from '@contexts/workspace/presentation/renderer/utils/workspaceNodeSizing'
import { sanitizeWorkspaceSpaces } from '@contexts/workspace/presentation/renderer/utils/workspaceSpaces'
import { hydrateAgentNode } from '@contexts/agent/presentation/renderer/hydrateAgentNode'
import { useAppStore } from '../store/useAppStore'

function toShellWorkspaceState(workspace: PersistedWorkspaceState): WorkspaceState {
  const nodes = toRuntimeNodes(workspace)
  const validNodeIds = new Set(nodes.map(node => node.id))
  const sanitizedSpaces = sanitizeWorkspaceSpaces(
    workspace.spaces.map(space => ({
      ...space,
      nodeIds: space.nodeIds.filter(nodeId => validNodeIds.has(nodeId)),
    })),
  )
  const hasActiveSpace =
    workspace.activeSpaceId !== null &&
    sanitizedSpaces.some(space => space.id === workspace.activeSpaceId)

  return {
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    worktreesRoot: workspace.worktreesRoot,
    pullRequestBaseBranchOptions: workspace.pullRequestBaseBranchOptions ?? [],
    nodes,
    viewport: {
      x: workspace.viewport.x,
      y: workspace.viewport.y,
      zoom: workspace.viewport.zoom,
    },
    isMinimapVisible: workspace.isMinimapVisible,
    spaces: sanitizedSpaces,
    activeSpaceId: hasActiveSpace ? workspace.activeSpaceId : null,
    spaceArchiveRecords: workspace.spaceArchiveRecords,
  }
}

function requiresRuntimeHydration(node: Node<TerminalNodeData>): boolean {
  return node.data.kind === 'terminal' || node.data.kind === 'agent'
}

function mergeHydratedAgentData(
  currentAgent: TerminalNodeData['agent'],
  hydratedAgent: TerminalNodeData['agent'],
): TerminalNodeData['agent'] {
  if (!currentAgent || !hydratedAgent) {
    return hydratedAgent
  }

  return {
    ...currentAgent,
    provider: hydratedAgent.provider,
    prompt: hydratedAgent.prompt,
    model: hydratedAgent.model,
    effectiveModel: hydratedAgent.effectiveModel,
    launchMode: hydratedAgent.launchMode,
    resumeSessionId: hydratedAgent.resumeSessionId,
    resumeSessionIdVerified: hydratedAgent.resumeSessionIdVerified,
  }
}

function mergeHydratedHostedAgentData(
  currentHostedAgent: TerminalNodeData['hostedAgent'],
  hydratedHostedAgent: TerminalNodeData['hostedAgent'],
): TerminalNodeData['hostedAgent'] {
  if (!currentHostedAgent || !hydratedHostedAgent) {
    return hydratedHostedAgent
  }

  return {
    ...currentHostedAgent,
    provider: hydratedHostedAgent.provider,
    launchMode: hydratedHostedAgent.launchMode,
    resumeSessionId: hydratedHostedAgent.resumeSessionId,
    resumeSessionIdVerified: hydratedHostedAgent.resumeSessionIdVerified,
    model:
      hydratedHostedAgent.model !== undefined
        ? hydratedHostedAgent.model
        : currentHostedAgent.model,
    effectiveModel:
      hydratedHostedAgent.effectiveModel !== undefined
        ? hydratedHostedAgent.effectiveModel
        : currentHostedAgent.effectiveModel,
    reasoningEffort:
      hydratedHostedAgent.reasoningEffort !== undefined
        ? hydratedHostedAgent.reasoningEffort
        : currentHostedAgent.reasoningEffort,
    displayModelLabel:
      hydratedHostedAgent.displayModelLabel !== undefined
        ? hydratedHostedAgent.displayModelLabel
        : currentHostedAgent.displayModelLabel,
    cwd: hydratedHostedAgent.cwd,
    command: hydratedHostedAgent.command,
    startedAt: hydratedHostedAgent.startedAt,
    restoreIntent: hydratedHostedAgent.restoreIntent,
    state: hydratedHostedAgent.state,
  }
}

function mergeHydratedNode(
  currentNode: Node<TerminalNodeData>,
  hydratedNode: Node<TerminalNodeData>,
): Node<TerminalNodeData> {
  if (currentNode.id !== hydratedNode.id) {
    return currentNode
  }

  return {
    ...currentNode,
    data: {
      ...currentNode.data,
      kind: hydratedNode.data.kind,
      title:
        hydratedNode.data.kind === 'agent' && currentNode.data.titlePinnedByUser !== true
          ? hydratedNode.data.title
          : currentNode.data.title,
      sessionId: hydratedNode.data.sessionId,
      profileId: hydratedNode.data.profileId ?? currentNode.data.profileId ?? null,
      runtimeKind: hydratedNode.data.runtimeKind ?? currentNode.data.runtimeKind,
      status: hydratedNode.data.status,
      startedAt: hydratedNode.data.startedAt,
      endedAt: hydratedNode.data.endedAt,
      exitCode: hydratedNode.data.exitCode,
      lastError: hydratedNode.data.lastError,
      scrollback: hydratedNode.data.scrollback,
      agent: mergeHydratedAgentData(currentNode.data.agent, hydratedNode.data.agent),
      hostedAgent: mergeHydratedHostedAgentData(
        currentNode.data.hostedAgent,
        hydratedNode.data.hostedAgent,
      ),
      task: hydratedNode.data.task ?? currentNode.data.task,
      note: hydratedNode.data.note ?? currentNode.data.note,
    },
  }
}

export function resolveTerminalHydrationCwd(
  node: Node<TerminalNodeData>,
  workspacePath: string,
): string {
  if (node.data.kind !== 'terminal') {
    return workspacePath
  }

  const executionDirectory =
    typeof node.data.executionDirectory === 'string' ? node.data.executionDirectory.trim() : ''
  if (executionDirectory.length > 0) {
    return executionDirectory
  }

  const expectedDirectory =
    typeof node.data.expectedDirectory === 'string' ? node.data.expectedDirectory.trim() : ''
  if (expectedDirectory.length > 0) {
    return expectedDirectory
  }

  return workspacePath
}

async function inferInitialStandardWindowSizeBucket(): Promise<StandardWindowSizeBucket> {
  const getter = window.freecliApi?.windowMetrics?.getDisplayInfo
  if (typeof getter !== 'function') {
    return DEFAULT_AGENT_SETTINGS.standardWindowSizeBucket
  }

  try {
    return resolveCanvasCanonicalBucketFromViewport(undefined, await getter())
  } catch {
    return DEFAULT_AGENT_SETTINGS.standardWindowSizeBucket
  }
}

export async function hydrateRuntimeNode({
  node,
  workspacePath,
  agentFullAccess,
  defaultTerminalProfileId,
}: {
  node: Node<TerminalNodeData>
  workspacePath: string
  agentFullAccess: boolean
  defaultTerminalProfileId?: string | null
}): Promise<Node<TerminalNodeData>> {
  if (node.data.kind === 'agent' && node.data.agent) {
    return hydrateAgentNode({
      node,
      workspacePath,
      agentFullAccess,
    })
  }

  if (node.data.kind !== 'terminal') {
    return node
  }

  try {
    const spawned = await window.freecliApi.pty.spawn({
      cwd: resolveTerminalHydrationCwd(node, workspacePath),
      profileId: node.data.profileId ?? defaultTerminalProfileId ?? undefined,
      cols: 80,
      rows: 24,
    })

    const hostedAgent = node.data.hostedAgent
    if (hostedAgent?.restoreIntent === true) {
      const persistedResumeSessionId =
        typeof hostedAgent.resumeSessionId === 'string' &&
        hostedAgent.resumeSessionId.trim().length > 0
          ? hostedAgent.resumeSessionId.trim()
          : null
      const resolvedResumeSessionId =
        persistedResumeSessionId ??
        (await (async () => {
          const resolveResumeSessionId = window.freecliApi.agent.resolveResumeSessionId
          if (typeof resolveResumeSessionId !== 'function') {
            return null
          }

          try {
            const result = await resolveResumeSessionId({
              provider: hostedAgent.provider,
              cwd: hostedAgent.cwd,
              startedAt: hostedAgent.startedAt,
            })

            return typeof result.resumeSessionId === 'string' &&
              result.resumeSessionId.trim().length > 0
              ? result.resumeSessionId.trim()
              : null
          } catch {
            return null
          }
        })())

      const resumeCommand = resolvedResumeSessionId
        ? buildHostedTerminalAgentResumeCommand({
            provider: hostedAgent.provider,
            resumeSessionId: resolvedResumeSessionId,
          })
        : null

      if (!resumeCommand) {
        return {
          ...node,
          data: {
            ...node.data,
            sessionId: spawned.sessionId,
            profileId: spawned.profileId,
            runtimeKind: spawned.runtimeKind,
            status: null,
            startedAt: null,
            endedAt: null,
            exitCode: null,
            lastError: translate('messages.hostedTerminalResumeUnavailable'),
            scrollback: node.data.scrollback,
            agent: null,
            hostedAgent: {
              ...hostedAgent,
              restoreIntent: false,
              state: 'unavailable',
              resumeSessionId: resolvedResumeSessionId,
              resumeSessionIdVerified: resolvedResumeSessionId !== null,
            },
            task: null,
          },
        }
      }

      try {
        await window.freecliApi.pty.write({
          sessionId: spawned.sessionId,
          data: `${resumeCommand}\r`,
        })
        await window.freecliApi.pty.trackHostedAgent?.({
          sessionId: spawned.sessionId,
          provider: hostedAgent.provider,
          cwd: hostedAgent.cwd,
          launchMode: 'resume',
          resumeSessionId: resolvedResumeSessionId,
          startedAt: hostedAgent.startedAt,
        })

        return {
          ...node,
          data: {
            ...node.data,
            sessionId: spawned.sessionId,
            profileId: spawned.profileId,
            runtimeKind: spawned.runtimeKind,
            kind: 'terminal' as const,
            status: 'restoring',
            startedAt: hostedAgent.startedAt,
            endedAt: null,
            exitCode: null,
            lastError: null,
            scrollback: node.data.scrollback,
            agent: null,
            hostedAgent: {
              ...hostedAgent,
              launchMode: 'resume',
              resumeSessionId: resolvedResumeSessionId,
              resumeSessionIdVerified: true,
              restoreIntent: true,
              state: 'active',
            },
            task: null,
          },
        }
      } catch (error) {
        return {
          ...node,
          data: {
            ...node.data,
            sessionId: spawned.sessionId,
            profileId: spawned.profileId,
            runtimeKind: spawned.runtimeKind,
            kind: 'terminal' as const,
            status: null,
            startedAt: null,
            endedAt: null,
            exitCode: null,
            lastError: translate('messages.hostedTerminalResumeFailed', {
              message: toErrorMessage(error),
            }),
            scrollback: node.data.scrollback,
            agent: null,
            hostedAgent: {
              ...hostedAgent,
              restoreIntent: false,
              state: 'unavailable',
              resumeSessionId: resolvedResumeSessionId,
              resumeSessionIdVerified: resolvedResumeSessionId !== null,
            },
            task: null,
          },
        }
      }
    }

    return {
      ...node,
      data: {
        ...node.data,
        sessionId: spawned.sessionId,
        profileId: spawned.profileId,
        runtimeKind: spawned.runtimeKind,
        kind: 'terminal' as const,
        status: null,
        startedAt: null,
        endedAt: null,
        exitCode: null,
        lastError: null,
        scrollback: node.data.scrollback,
        agent: null,
        hostedAgent: node.data.hostedAgent ?? null,
        task: null,
      },
    }
  } catch {
    return node
  }
}

export function useHydrateAppState({
  workspaces,
  activeWorkspaceId,
  setAgentSettings,
  setWorkspaces,
  setActiveWorkspaceId,
}: {
  workspaces: WorkspaceState[]
  activeWorkspaceId: string | null
  setAgentSettings: React.Dispatch<React.SetStateAction<AgentSettings>>
  setWorkspaces: React.Dispatch<React.SetStateAction<WorkspaceState[]>>
  setActiveWorkspaceId: React.Dispatch<React.SetStateAction<string | null>>
}): { isHydrated: boolean; isPersistReady: boolean } {
  const [isHydrated, setIsHydrated] = useState(false)
  const [isPersistReady, setIsPersistReady] = useState(false)
  const isCancelledRef = useRef(false)
  const persistedWorkspaceByIdRef = useRef<Map<string, PersistedWorkspaceState>>(new Map())
  const hydratedWorkspaceIdsRef = useRef<Set<string>>(new Set())
  const hydratingWorkspacePromisesRef = useRef<Map<string, Promise<void>>>(new Map())
  const scrollbackLoadedWorkspaceIdsRef = useRef<Set<string>>(new Set())
  const initialHydrationWorkspaceIdRef = useRef<string | null>(null)
  const initialHydrationCompletedRef = useRef(false)
  const previousActiveWorkspaceIdRef = useRef<string | null>(null)
  const workspacesRef = useRef<WorkspaceState[]>(workspaces)

  const markInitialHydrationComplete = useCallback((workspaceId: string | null): void => {
    if (initialHydrationCompletedRef.current) {
      return
    }

    if (initialHydrationWorkspaceIdRef.current !== workspaceId) {
      return
    }

    if (isCancelledRef.current) {
      return
    }

    initialHydrationCompletedRef.current = true
    setIsHydrated(true)
  }, [])

  const loadWorkspaceScrollbacks = useCallback(async (workspace: PersistedWorkspaceState) => {
    if (scrollbackLoadedWorkspaceIdsRef.current.has(workspace.id)) {
      return
    }

    scrollbackLoadedWorkspaceIdsRef.current.add(workspace.id)

    const port = getPersistencePort()
    if (!port) {
      return
    }

    const nodeIds = workspace.nodes.filter(node => node.kind !== 'task').map(node => node.id)
    if (nodeIds.length === 0) {
      return
    }

    const scrollbackResults = await Promise.allSettled(
      nodeIds.map(nodeId => port.readNodeScrollback(nodeId)),
    )

    if (isCancelledRef.current) {
      return
    }

    const scrollbacks: Record<string, string> = {}
    scrollbackResults.forEach((result, index) => {
      if (result.status !== 'fulfilled' || !result.value) {
        return
      }

      scrollbacks[nodeIds[index] as string] = result.value
    })

    if (Object.keys(scrollbacks).length === 0) {
      return
    }

    useScrollbackStore.setState(state => ({
      scrollbackByNodeId: {
        ...state.scrollbackByNodeId,
        ...scrollbacks,
      },
    }))
  }, [])

  const applyHydratedNode = useCallback(
    (workspaceId: string, hydratedNode: Node<TerminalNodeData>): void => {
      if (isCancelledRef.current) {
        return
      }

      setWorkspaces(previous =>
        previous.map(workspace => {
          if (workspace.id !== workspaceId) {
            return workspace
          }

          return {
            ...workspace,
            nodes: workspace.nodes.map(node =>
              node.id === hydratedNode.id ? mergeHydratedNode(node, hydratedNode) : node,
            ),
          }
        }),
      )
    },
    [setWorkspaces],
  )

  useEffect(() => {
    workspacesRef.current = workspaces
    if (persistedWorkspaceByIdRef.current.size === 0) {
      return
    }

    const nextPersistedWorkspaces = new Map(persistedWorkspaceByIdRef.current)
    workspaces.forEach(workspace => {
      nextPersistedWorkspaces.set(workspace.id, toPersistedWorkspaceState(workspace))
    })
    persistedWorkspaceByIdRef.current = nextPersistedWorkspaces
  }, [workspaces])

  const dehydrateWorkspaceRuntime = useCallback(
    async (workspaceId: string): Promise<void> => {
      if (!hydratedWorkspaceIdsRef.current.has(workspaceId)) {
        return
      }

      const workspace = workspacesRef.current.find(candidate => candidate.id === workspaceId)
      if (!workspace) {
        return
      }

      const dehydratedSessionIds: string[] = []
      const nextNodes = workspace.nodes.map(node => {
        const sessionId = node.data.sessionId.trim()
        if (
          node.data.kind !== 'terminal' ||
          node.data.hostedAgent ||
          sessionId.length === 0 ||
          node.data.persistenceMode === 'ephemeral'
        ) {
          return node
        }

        dehydratedSessionIds.push(sessionId)
        return {
          ...node,
          data: {
            ...node.data,
            sessionId: '',
            status: null,
            startedAt: null,
            endedAt: null,
            exitCode: null,
            lastError: null,
          },
        }
      })

      if (dehydratedSessionIds.length === 0) {
        return
      }

      const nextWorkspace: WorkspaceState = {
        ...workspace,
        nodes: nextNodes,
      }

      persistedWorkspaceByIdRef.current.set(workspaceId, toPersistedWorkspaceState(nextWorkspace))
      hydratedWorkspaceIdsRef.current.delete(workspaceId)
      workspacesRef.current = workspacesRef.current.map(candidate =>
        candidate.id === workspaceId ? nextWorkspace : candidate,
      )
      setWorkspaces(previous =>
        previous.map(candidate => (candidate.id === workspaceId ? nextWorkspace : candidate)),
      )

      await Promise.allSettled(
        dehydratedSessionIds.map(sessionId =>
          Promise.resolve(window.freecliApi.pty.kill?.({ sessionId })),
        ),
      )
    },
    [setWorkspaces],
  )

  const ensureWorkspaceHydrated = useCallback(
    async (workspaceId: string | null): Promise<void> => {
      if (!workspaceId) {
        markInitialHydrationComplete(null)
        return
      }

      const persistedWorkspace = persistedWorkspaceByIdRef.current.get(workspaceId)
      if (!persistedWorkspace) {
        markInitialHydrationComplete(workspaceId)
        return
      }

      if (hydratedWorkspaceIdsRef.current.has(workspaceId)) {
        void loadWorkspaceScrollbacks(persistedWorkspace)
        markInitialHydrationComplete(workspaceId)
        return
      }

      const existingPromise = hydratingWorkspacePromisesRef.current.get(workspaceId)
      if (existingPromise) {
        await existingPromise
        markInitialHydrationComplete(workspaceId)
        return
      }

      void loadWorkspaceScrollbacks(persistedWorkspace)

      const runtimeNodes = toRuntimeNodes(persistedWorkspace).filter(requiresRuntimeHydration)
      if (runtimeNodes.length === 0) {
        hydratedWorkspaceIdsRef.current.add(workspaceId)
        markInitialHydrationComplete(workspaceId)
        return
      }

      const hydrationPromise = Promise.allSettled(
        runtimeNodes.map(async node => {
          const { agentFullAccess, defaultTerminalProfileId } = useAppStore.getState().agentSettings
          const hydratedNode = await hydrateRuntimeNode({
            node,
            workspacePath: persistedWorkspace.path,
            agentFullAccess,
            defaultTerminalProfileId,
          })

          applyHydratedNode(workspaceId, hydratedNode)
        }),
      )
        .then(() => {
          hydratedWorkspaceIdsRef.current.add(workspaceId)
        })
        .finally(() => {
          hydratingWorkspacePromisesRef.current.delete(workspaceId)
          markInitialHydrationComplete(workspaceId)
        })

      hydratingWorkspacePromisesRef.current.set(workspaceId, hydrationPromise)
      await hydrationPromise
    },
    [applyHydratedNode, loadWorkspaceScrollbacks, markInitialHydrationComplete],
  )

  useEffect(() => {
    isCancelledRef.current = false
    initialHydrationCompletedRef.current = false
    initialHydrationWorkspaceIdRef.current = null
    persistedWorkspaceByIdRef.current = new Map()
    hydratedWorkspaceIdsRef.current = new Set()
    hydratingWorkspacePromisesRef.current = new Map()
    scrollbackLoadedWorkspaceIdsRef.current = new Set()
    useScrollbackStore.getState().clearAllScrollbacks()
    setIsHydrated(false)
    setIsPersistReady(false)

    const hydrateAppState = async (): Promise<void> => {
      const {
        state: persisted,
        recovery,
        hasStandardWindowSizeBucket,
      } = await readPersistedStateWithMeta()
      if (isCancelledRef.current) {
        return
      }

      let resolvedSettings = persisted?.settings ?? DEFAULT_AGENT_SETTINGS
      if (!hasStandardWindowSizeBucket) {
        resolvedSettings = {
          ...resolvedSettings,
          standardWindowSizeBucket: await inferInitialStandardWindowSizeBucket(),
        }
      }

      if (isCancelledRef.current) {
        return
      }

      if (persisted) {
        await applyUiLanguage(resolvedSettings.language)
      }

      if (recovery) {
        const recoveryMessage =
          recovery === 'corrupt_db'
            ? translate('persistence.recoveryCorruptDb')
            : translate('persistence.recoveryMigrationFailed')
        useAppStore
          .getState()
          .setPersistNotice({ tone: 'warning', message: recoveryMessage, kind: 'recovery' })
      }

      if (!persisted) {
        setAgentSettings(resolvedSettings)
        setIsHydrated(true)
        setIsPersistReady(true)
        return
      }

      setAgentSettings(resolvedSettings)

      if (persisted.workspaces.length === 0) {
        setIsHydrated(true)
        setIsPersistReady(true)
        return
      }

      const hasActiveWorkspace = persisted.workspaces.some(
        workspace => workspace.id === persisted.activeWorkspaceId,
      )
      const resolvedActiveWorkspaceId = hasActiveWorkspace
        ? persisted.activeWorkspaceId
        : (persisted.workspaces[0]?.id ?? null)

      persistedWorkspaceByIdRef.current = new Map(
        persisted.workspaces.map(workspace => [workspace.id, workspace]),
      )
      initialHydrationWorkspaceIdRef.current = resolvedActiveWorkspaceId

      setWorkspaces(persisted.workspaces.map(workspace => toShellWorkspaceState(workspace)))
      setActiveWorkspaceId(resolvedActiveWorkspaceId)
      setIsPersistReady(true)

      if (!resolvedActiveWorkspaceId) {
        setIsHydrated(true)
        return
      }

      void ensureWorkspaceHydrated(resolvedActiveWorkspaceId)
    }

    void hydrateAppState()

    return () => {
      isCancelledRef.current = true
    }
  }, [ensureWorkspaceHydrated, setAgentSettings, setWorkspaces, setActiveWorkspaceId])

  useEffect(() => {
    const previousActiveWorkspaceId = previousActiveWorkspaceIdRef.current
    previousActiveWorkspaceIdRef.current = activeWorkspaceId

    if (!activeWorkspaceId) {
      return
    }

    if (persistedWorkspaceByIdRef.current.size === 0) {
      return
    }

    let isCancelled = false

    const syncWorkspaceRuntime = async (): Promise<void> => {
      if (previousActiveWorkspaceId && previousActiveWorkspaceId !== activeWorkspaceId) {
        await dehydrateWorkspaceRuntime(previousActiveWorkspaceId)
      }

      if (isCancelled) {
        return
      }

      await ensureWorkspaceHydrated(activeWorkspaceId)
    }

    void syncWorkspaceRuntime()

    return () => {
      isCancelled = true
    }
  }, [activeWorkspaceId, dehydrateWorkspaceRuntime, ensureWorkspaceHydrated])

  return { isHydrated, isPersistReady }
}
