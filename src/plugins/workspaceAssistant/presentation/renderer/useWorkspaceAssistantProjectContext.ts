import React from 'react'
import type { WorkspaceAssistantProjectFileSummaryDto } from '@shared/contracts/dto'
import {
  buildWorkspaceAssistantProjectSummary,
  collectWorkspaceAssistantProjectFiles,
} from './workspaceAssistantProjectContext'

export function useWorkspaceAssistantProjectContext(
  workspacePath: string | null,
  enabled: boolean,
): {
  projectFiles: WorkspaceAssistantProjectFileSummaryDto[]
  projectSummary: string | null
} {
  const [projectFiles, setProjectFiles] = React.useState<WorkspaceAssistantProjectFileSummaryDto[]>(
    [],
  )

  React.useEffect(() => {
    if (!enabled || !workspacePath || workspacePath.trim().length === 0) {
      setProjectFiles([])
      return
    }

    let active = true
    void collectWorkspaceAssistantProjectFiles(workspacePath)
      .then(nextFiles => {
        if (active) {
          setProjectFiles(previous => {
            const previousSignature = JSON.stringify(previous)
            const nextSignature = JSON.stringify(nextFiles)
            return previousSignature === nextSignature ? previous : nextFiles
          })
        }
      })
      .catch(() => {
        if (active) {
          setProjectFiles([])
        }
      })

    return () => {
      active = false
    }
  }, [enabled, workspacePath])

  const projectSummary = React.useMemo(
    () => buildWorkspaceAssistantProjectSummary(projectFiles),
    [projectFiles],
  )

  return {
    projectFiles,
    projectSummary,
  }
}
