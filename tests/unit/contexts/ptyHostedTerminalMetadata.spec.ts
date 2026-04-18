import { describe, expect, it } from 'vitest'
import { updateWorkspacesWithHostedTerminalMetadata } from '../../../src/app/renderer/shell/hooks/usePtyWorkspaceRuntimeSync'
import type { WorkspaceState } from '../../../src/contexts/workspace/presentation/renderer/types'

describe('updateWorkspacesWithHostedTerminalMetadata', () => {
  it('writes runtime model metadata back into hosted terminal nodes', () => {
    const workspaces: WorkspaceState[] = [
      {
        id: 'workspace-1',
        name: 'Workspace',
        path: '/tmp/workspace',
        worktreesRoot: '',
        pullRequestBaseBranchOptions: [],
        nodes: [
          {
            id: 'terminal-1',
            type: 'terminalNode',
            position: { x: 0, y: 0 },
            data: {
              kind: 'terminal',
              title: 'codex',
              sessionId: 'session-1',
              status: 'running',
              startedAt: null,
              endedAt: null,
              exitCode: null,
              lastError: null,
              scrollback: null,
              executionDirectory: '/tmp/workspace',
              expectedDirectory: '/tmp/workspace',
              agent: null,
              hostedAgent: {
                provider: 'codex',
                launchMode: 'new',
                resumeSessionId: null,
                resumeSessionIdVerified: false,
                model: null,
                effectiveModel: null,
                reasoningEffort: null,
                displayModelLabel: null,
                cwd: '/tmp/workspace',
                command: 'codex',
                startedAt: '2026-04-12T00:00:00.000Z',
                restoreIntent: true,
                state: 'active',
              },
              task: null,
              note: null,
              image: null,
              width: 520,
              height: 320,
            },
          },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
        isMinimapVisible: true,
        spaces: [],
        activeSpaceId: null,
        spaceArchiveRecords: [],
      },
    ]

    const result = updateWorkspacesWithHostedTerminalMetadata({
      workspaces,
      sessionId: 'session-1',
      excludeWorkspaceId: null,
      resumeSessionId: 'resume-1',
      effectiveModel: 'gpt-5.4',
      reasoningEffort: 'high',
      displayModelLabel: 'gpt-5.4 high',
    })

    expect(result.didChange).toBe(true)
    expect(result.nextWorkspaces[0]?.nodes[0]?.data.hostedAgent).toMatchObject({
      resumeSessionId: 'resume-1',
      resumeSessionIdVerified: true,
      effectiveModel: 'gpt-5.4',
      reasoningEffort: 'high',
      displayModelLabel: 'gpt-5.4 high',
    })
  })
})
