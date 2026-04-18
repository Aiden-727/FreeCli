import type { MutableRefObject } from 'react'
import type { Node } from '@xyflow/react'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { TerminalNodeData, WorkspaceSpaceState } from '../../../types'
import type { WorkspaceCanvasActionRefs } from './useActionRefs'
import type { ShowWorkspaceCanvasMessage } from '../types'
import { useWorkspaceCanvasSelectNode } from './useSelectNode'
import { useWorkspaceCanvasNodeTypes } from '../nodeTypes'

export function useWorkspaceCanvasComposedNodeTypes({
  setNodes,
  setSelectedNodeIds,
  setSelectedSpaceIds,
  selectedNodeIdsRef,
  selectedSpaceIdsRef,
  spacesRef,
  workspacePath,
  agentSettings,
  actionRefs,
  onShowMessage,
}: {
  setNodes: (
    updater: (prevNodes: Node<TerminalNodeData>[]) => Node<TerminalNodeData>[],
    options?: { syncLayout?: boolean },
  ) => void
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>
  setSelectedSpaceIds: React.Dispatch<React.SetStateAction<string[]>>
  selectedNodeIdsRef: MutableRefObject<string[]>
  selectedSpaceIdsRef: MutableRefObject<string[]>
  spacesRef: MutableRefObject<WorkspaceSpaceState[]>
  workspacePath: string
  agentSettings: AgentSettings
  actionRefs: WorkspaceCanvasActionRefs
  onShowMessage?: ShowWorkspaceCanvasMessage
}) {
  const selectNode: (nodeId: string, options?: { toggle?: boolean }) => void =
    useWorkspaceCanvasSelectNode({
      setNodes,
      setSelectedNodeIds,
      setSelectedSpaceIds,
      selectedNodeIdsRef,
      selectedSpaceIdsRef,
      spacesRef,
    })

  return useWorkspaceCanvasNodeTypes({
    spacesRef,
    workspacePath,
    terminalFontSize: agentSettings.terminalFontSize,
    selectNode,
    onShowMessage,
    ...actionRefs,
  })
}
