import type {
  WorkspaceAssistantAgentSnapshotDto,
  WorkspaceAssistantInsightDto,
  WorkspaceAssistantNoteSnapshotDto,
  WorkspaceAssistantProjectFileSummaryDto,
  WorkspaceAssistantSpaceSnapshotDto,
  WorkspaceAssistantStateDto,
  WorkspaceAssistantTaskSnapshotDto,
  WorkspaceAssistantWorkspaceSnapshotDto,
} from '@shared/contracts/dto'
import type {
  TaskNodeData,
  WorkspaceState,
} from '@contexts/workspace/presentation/renderer/types'

function truncateText(text: string, maxLength: number): string {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
}

function normalizeNodeTitle(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

function extractTaskTitleFromNode(nodeTitle: string, task: TaskNodeData | null): string {
  const title = normalizeNodeTitle(nodeTitle, '')
  if (title.length > 0) {
    return title
  }

  if (!task) {
    return '未命名任务'
  }

  const requirement = truncateText(task.requirement, 30)
  return requirement.length > 0 ? requirement : '未命名任务'
}

export function buildWorkspaceAssistantSnapshot(
  workspace: WorkspaceState | null,
  projectFiles: WorkspaceAssistantProjectFileSummaryDto[] = [],
  projectSummary: string | null = null,
): WorkspaceAssistantWorkspaceSnapshotDto | null {
  if (!workspace) {
    return null
  }

  const tasks: WorkspaceAssistantTaskSnapshotDto[] = []
  const agents: WorkspaceAssistantAgentSnapshotDto[] = []
  const notes: WorkspaceAssistantNoteSnapshotDto[] = []

  let terminalCount = 0

  for (const node of workspace.nodes) {
    switch (node.data.kind) {
      case 'task':
        if (node.data.task) {
          tasks.push({
            id: node.id,
            title: extractTaskTitleFromNode(node.data.title, node.data.task),
            status: node.data.task.status,
            priority: node.data.task.priority,
            linkedAgentNodeId: node.data.task.linkedAgentNodeId,
            lastRunAt: node.data.task.lastRunAt,
          })
        }
        break
      case 'agent':
        agents.push({
          id: node.id,
          title: normalizeNodeTitle(node.data.title, '未命名 Agent'),
          status: node.data.status,
          provider: node.data.agent?.provider ?? null,
          taskId: node.data.agent?.taskId ?? null,
          prompt: truncateText(node.data.agent?.prompt ?? '', 80),
          lastError: node.data.lastError,
        })
        break
      case 'note':
        notes.push({
          id: node.id,
          title: normalizeNodeTitle(node.data.title, '未命名笔记'),
          text: truncateText(node.data.note?.text ?? '', 120),
        })
        break
      case 'terminal':
        terminalCount += 1
        break
      default:
        break
    }
  }

  const spaces: WorkspaceAssistantSpaceSnapshotDto[] = workspace.spaces.map(space => ({
    id: space.id,
    name: space.name,
    nodeCount: space.nodeIds.length,
  }))

  return {
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    activeSpaceId: workspace.activeSpaceId,
    spaceCount: workspace.spaces.length,
    nodeCount: workspace.nodes.length,
    taskCount: tasks.length,
    agentCount: agents.length,
    noteCount: notes.length,
    terminalCount,
    projectSummary,
    projectFiles,
    tasks,
    agents,
    notes,
    spaces,
  }
}

function createInsight(
  id: string,
  tone: WorkspaceAssistantInsightDto['tone'],
  title: string,
  body: string,
  source: string,
): WorkspaceAssistantInsightDto {
  return {
    id,
    tone,
    title,
    body,
    source,
    createdAt: new Date().toISOString(),
    actionLabel: null,
  }
}

export function buildWorkspaceAssistantInsights(
  snapshot: WorkspaceAssistantWorkspaceSnapshotDto | null,
): WorkspaceAssistantInsightDto[] {
  if (!snapshot) {
    return [
      createInsight(
        'no-workspace',
        'neutral',
        '尚未打开项目',
        '先打开一个项目目录，我会开始整理项目结构、画布现场和当前任务脉络。',
        'workspace',
      ),
    ]
  }

  const insights: WorkspaceAssistantInsightDto[] = []
  const doingTasks = snapshot.tasks.filter(task => task.status === 'doing')
  const todoTasks = snapshot.tasks.filter(task => task.status === 'todo')
  const tasksWithoutAgent = snapshot.tasks.filter(
    task => task.status !== 'done' && task.status !== 'ai_done' && !task.linkedAgentNodeId,
  )
  const failedAgents = snapshot.agents.filter(agent => agent.status === 'failed' || agent.lastError)

  insights.push(
    createInsight(
      'workspace-summary',
      'helpful',
      `当前项目现场：${snapshot.name}`,
      `画布中共有 ${snapshot.nodeCount} 个节点，包括 ${snapshot.taskCount} 个任务、${snapshot.agentCount} 个 Agent、${snapshot.noteCount} 条笔记和 ${snapshot.terminalCount} 个终端。`,
      'workspace',
    ),
  )

  if (snapshot.projectSummary) {
    insights.push(
      createInsight(
        'project-summary',
        'helpful',
        '项目基础结构已整理',
        snapshot.projectSummary,
        'project',
      ),
    )
  }

  if (doingTasks.length > 0) {
    insights.push(
      createInsight(
        'doing-tasks',
        'helpful',
        '当前正在推进的工作',
        `有 ${doingTasks.length} 个任务处于进行中，优先关注：${doingTasks
          .slice(0, 3)
          .map(task => task.title)
          .join('、')}。`,
        'task',
      ),
    )
  } else if (todoTasks.length > 0) {
    insights.push(
      createInsight(
        'todo-next',
        'neutral',
        '还没有明确的进行中任务',
        `当前有 ${todoTasks.length} 个待办任务，建议先挑一个最重要的 task 标记为进行中，再绑定对应 Agent 或执行路径。`,
        'task',
      ),
    )
  }

  if (tasksWithoutAgent.length > 0) {
    insights.push(
      createInsight(
        'tasks-without-agent',
        'urgent',
        '存在没有执行主体的任务',
        `有 ${tasksWithoutAgent.length} 个未完成任务还没有关联 Agent，这通常意味着计划与执行链路还没闭环。`,
        'task',
      ),
    )
  }

  if (failedAgents.length > 0) {
    insights.push(
      createInsight(
        'failed-agents',
        'urgent',
        '检测到异常 Agent 会话',
        `当前有 ${failedAgents.length} 个 Agent 处于失败或报错状态，建议优先检查最近错误并决定是否重启或归档。`,
        'agent',
      ),
    )
  }

  if (snapshot.spaceCount > 0) {
    const crowdedSpaces = snapshot.spaces.filter(space => space.nodeCount >= 8)
    if (crowdedSpaces.length > 0) {
      insights.push(
        createInsight(
          'crowded-space',
          'neutral',
          '部分空间已经开始拥挤',
          `${crowdedSpaces
            .slice(0, 2)
            .map(space => `${space.name}（${space.nodeCount} 个节点）`)
            .join('、')} 建议拆分、归档或重新整理。`,
          'space',
        ),
      )
    }
  }

  return insights.slice(0, 4)
}

export function buildWorkspaceAssistantFallbackState(): WorkspaceAssistantStateDto {
  return {
    isEnabled: false,
    isDockCollapsed: false,
    isAutoOpenOnStartup: true,
    status: 'disabled',
    lastUpdatedAt: null,
    unreadInsights: 0,
    currentWorkspace: null,
    insights: buildWorkspaceAssistantInsights(null),
    conversation: [],
    settings: {
      enabled: false,
      dockCollapsed: false,
      autoOpenOnStartup: true,
      proactiveRemindersEnabled: true,
      proactiveReminderIntervalMinutes: 12,
      modelProvider: 'openai-compatible',
      aiEnabled: true,
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      modelName: 'gpt-4.1-mini',
      allowProjectScan: true,
      allowWorkspaceSummary: true,
      allowTaskInsight: true,
      allowFollowUpQuestions: true,
      allowSuggestionToasts: true,
      assistantNotes: '',
    },
  }
}

export function answerWorkspaceAssistantPrompt(
  prompt: string,
  snapshot: WorkspaceAssistantWorkspaceSnapshotDto | null,
): { reply: string; suggestions: string[] } {
  const normalized = prompt.trim()
  if (!snapshot) {
    return {
      reply: '当前还没有打开任何项目。我建议先导入项目目录，然后我可以帮你总结项目结构、梳理画布内容并给出下一步建议。',
      suggestions: ['如何导入项目？', '打开项目后你会做什么？'],
    }
  }

  if (normalized.includes('项目') || normalized.includes('代码库')) {
    const projectSummary = snapshot.projectSummary ? ` 项目摘要：${snapshot.projectSummary}` : ''
    return {
      reply: `当前项目是 ${snapshot.name}，工作区里有 ${snapshot.taskCount} 个任务、${snapshot.agentCount} 个 Agent 和 ${snapshot.noteCount} 条笔记。${projectSummary} 你可以继续让我解释“当前在做什么”或“下一步建议”。`,
      suggestions: ['当前我在做什么？', '下一步建议是什么？'],
    }
  }

  if (normalized.includes('当前') || normalized.includes('在做什么') || normalized.includes('进度')) {
    const doingTasks = snapshot.tasks.filter(task => task.status === 'doing')
    const focusText =
      doingTasks.length > 0
        ? `目前最明确的进行中任务有：${doingTasks.slice(0, 3).map(task => task.title).join('、')}。`
        : '目前还没有明确标记为进行中的 task，说明当前执行焦点还不够清晰。'

    return {
      reply: `${focusText} 另外，当前画布上共有 ${snapshot.nodeCount} 个节点，活跃工作现场分布在 ${snapshot.spaceCount} 个空间中。`,
      suggestions: ['帮我梳理任务优先级', '哪些任务没有执行主体？'],
    }
  }

  if (normalized.includes('下一步') || normalized.includes('建议') || normalized.includes('怎么做')) {
    const tasksWithoutAgent = snapshot.tasks.filter(
      task => task.status !== 'done' && task.status !== 'ai_done' && !task.linkedAgentNodeId,
    )
    const reply =
      tasksWithoutAgent.length > 0
        ? `我建议先给 ${tasksWithoutAgent[0].title} 这样的未完成任务绑定执行主体，再把一个核心任务明确标记为进行中，避免任务和 Agent 脱节。`
        : '建议优先整理当前进行中任务的产出，把关键结果沉淀到 note 或 task 更新里，再决定是否开启新的 Agent 会话。'

    return {
      reply,
      suggestions: ['帮我整理当前画布', '哪些 Agent 需要关注？'],
    }
  }

  if (normalized.includes('freecli') || normalized.includes('软件') || normalized.includes('怎么用')) {
    return {
      reply: 'FreeCli 最有价值的用法是把 task、agent、terminal、note 保持在同一个工作现场里。建议先以 task 为中心组织执行链，再用 space 管理不同主题，并用 note 沉淀结果。',
      suggestions: ['如何组织画布更合理？', 'task 和 agent 怎么配合？'],
    }
  }

  if (
    normalized.includes('readme') ||
    normalized.includes('package') ||
    normalized.includes('tsconfig') ||
    normalized.includes('配置文件')
  ) {
    if (snapshot.projectFiles.length === 0) {
      return {
        reply: '当前还没有拿到项目文件摘要。请确认当前项目根目录下有 README、package.json 或 tsconfig 等文件，并保持项目扫描开启。',
        suggestions: ['帮我总结当前项目', '下一步建议是什么？'],
      }
    }

    return {
      reply: `我当前读到的项目基础文件有：${snapshot.projectFiles
        .slice(0, 4)
        .map(file => `${file.name}（${file.summary}）`)
        .join('、')}。`,
      suggestions: ['帮我总结当前项目', '当前我在做什么？'],
    }
  }

  return {
    reply: `我已经拿到了当前工作现场摘要。你可以继续问我项目理解、当前进度、下一步规划，或者直接问 FreeCli 的使用方式。当前项目 ${snapshot.name} 有 ${snapshot.taskCount} 个任务和 ${snapshot.agentCount} 个 Agent。${snapshot.projectSummary ? ` 项目基础结构：${snapshot.projectSummary}` : ''}`,
    suggestions: ['帮我总结当前项目', '告诉我下一步建议'],
  }
}
