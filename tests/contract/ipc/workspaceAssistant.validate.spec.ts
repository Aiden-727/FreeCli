import { describe, expect, it } from 'vitest'

describe('workspace assistant validation', () => {
  it('preserves project summary and project files when normalizing prompt payload', async () => {
    const { normalizeWorkspaceAssistantPromptPayload } =
      await import('../../../src/contexts/plugins/presentation/main-ipc/validate')

    const normalized = normalizeWorkspaceAssistantPromptPayload({
      prompt: '请总结当前项目',
      workspaceId: 'workspace_1',
      workspaceSnapshot: {
        id: 'workspace_1',
        name: 'FreeCli',
        path: 'D:\\Project\\FreeCli',
        activeSpaceId: 'space_1',
        spaceCount: 1,
        nodeCount: 3,
        taskCount: 1,
        agentCount: 1,
        noteCount: 0,
        terminalCount: 1,
        projectSummary: 'README 和 package.json 已识别。',
        projectFiles: [
          {
            kind: 'package_json',
            name: 'package.json',
            path: 'D:\\Project\\FreeCli\\package.json',
            summary: '包含 dev、build、test 脚本。',
          },
        ],
        tasks: [],
        agents: [],
        notes: [],
        spaces: [],
      },
    })

    expect(normalized.workspaceSnapshot?.projectSummary).toBe('README 和 package.json 已识别。')
    expect(normalized.workspaceSnapshot?.projectFiles).toEqual([
      {
        kind: 'package_json',
        name: 'package.json',
        path: 'D:\\Project\\FreeCli\\package.json',
        summary: '包含 dev、build、test 脚本。',
      },
    ])
  })
})
