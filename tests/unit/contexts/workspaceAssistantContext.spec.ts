import { describe, expect, it } from 'vitest'
import {
  answerWorkspaceAssistantPrompt,
  buildWorkspaceAssistantInsights,
} from '../../../src/plugins/workspaceAssistant/presentation/renderer/workspaceAssistantContext'
import { buildWorkspaceAssistantProjectSummary } from '../../../src/plugins/workspaceAssistant/presentation/renderer/workspaceAssistantProjectContext'
import type { WorkspaceAssistantWorkspaceSnapshotDto } from '../../../src/shared/contracts/dto'

function createSnapshot(): WorkspaceAssistantWorkspaceSnapshotDto {
  return {
    id: 'workspace_1',
    name: 'FreeCli',
    path: 'D:\\Project\\FreeCli',
    activeSpaceId: 'space_1',
    spaceCount: 2,
    nodeCount: 8,
    taskCount: 2,
    agentCount: 1,
    noteCount: 1,
    terminalCount: 1,
    projectSummary:
      'README：FreeCli 是一个无限画布开发环境；package.json：包名 freecli；tsconfig：extends base config',
    projectFiles: [
      {
        kind: 'readme',
        name: 'README.md',
        path: 'D:\\Project\\FreeCli\\README.md',
        summary: 'FreeCli 是一个无限画布开发环境。',
      },
      {
        kind: 'package_json',
        name: 'package.json',
        path: 'D:\\Project\\FreeCli\\package.json',
        summary: '包名 freecli；脚本 dev, build, test。',
      },
    ],
    tasks: [
      {
        id: 'task_1',
        title: '补齐工作流助手',
        status: 'doing',
        priority: 'high',
        linkedAgentNodeId: null,
        lastRunAt: null,
      },
      {
        id: 'task_2',
        title: '补测试',
        status: 'todo',
        priority: 'medium',
        linkedAgentNodeId: 'agent_1',
        lastRunAt: null,
      },
    ],
    agents: [
      {
        id: 'agent_1',
        title: '主执行 Agent',
        status: 'running',
        provider: 'codex',
        taskId: 'task_2',
        prompt: '实现功能',
        lastError: null,
      },
    ],
    notes: [
      {
        id: 'note_1',
        title: '方案记录',
        text: '记录本轮设计。',
      },
    ],
    spaces: [
      {
        id: 'space_1',
        name: '当前执行',
        nodeCount: 5,
      },
      {
        id: 'space_2',
        name: '规划',
        nodeCount: 3,
      },
    ],
  }
}

describe('workspaceAssistantContext', () => {
  it('builds project summary from prioritized project files', () => {
    const summary = buildWorkspaceAssistantProjectSummary([
      {
        kind: 'package_json',
        name: 'package.json',
        path: 'D:\\Project\\FreeCli\\package.json',
        summary: '包名 freecli；脚本 dev, build, test。',
      },
      {
        kind: 'readme',
        name: 'README.md',
        path: 'D:\\Project\\FreeCli\\README.md',
        summary: 'FreeCli 是一个无限画布开发环境。',
      },
      {
        kind: 'tsconfig',
        name: 'tsconfig.json',
        path: 'D:\\Project\\FreeCli\\tsconfig.json',
        summary: 'extends base config',
      },
    ])

    expect(summary).toContain('README')
    expect(summary).toContain('package.json')
    expect(summary).toContain('tsconfig')
  })

  it('includes project summary as an insight when available', () => {
    const insights = buildWorkspaceAssistantInsights(createSnapshot())
    expect(insights.some(insight => insight.id === 'project-summary')).toBe(true)
  })

  it('answers project file questions with summarized file context', () => {
    const result = answerWorkspaceAssistantPrompt('帮我看看 package 和 tsconfig', createSnapshot())
    expect(result.reply).toContain('README.md')
    expect(result.reply).toContain('package.json')
  })
})
