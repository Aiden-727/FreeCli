# Workspace Assistant

本文档定义 `workspace-assistant` 插件的第一版定位、边界与当前实现。

## 1. 定位

`workspace-assistant` 是一个面向 FreeCli 工作现场的常驻型轻量助手。

它的职责不是替代现有 `agent` 主能力，而是：

- 理解当前项目与 workspace
- 理解当前画布中的 task / agent / terminal / note 结构
- 理解当前正在推进的工作状态
- 为用户提供下一步建议、提醒与软件使用辅导

## 2. 第一版目标

当前 V1 只做：

- 插件页总览与配置
- Header 入口
- Control Center 入口
- 常驻右上角聊天浮层
- 基于本地上下文的项目/工作现场摘要
- 当前活动 workspace 快照同步到 Main 插件 runtime
- 当前项目关键文件摘要（README / package.json / tsconfig / pnpm-workspace / .gitignore）
- 最小 conversation 历史
- 基于规则的提醒与问答 fallback
- 配置完整后自动启用的 OpenAI-compatible `/responses` 真实 AI 回答

当前 V1 明确不做：

- 自动改代码
- 自动启动 Agent
- 长周期自治规划循环
- 重型索引 / embedding / 外部模型依赖
- 流式输出与模型工具调用

## 3. Owner 划分

- 插件配置 owner：`agentSettings.plugins.workspaceAssistant`
- 插件 runtime state owner：`WorkspaceAssistantPluginController`
- 工作现场事实 owner：仍然是现有 `workspace / task / agent / terminal` contexts
- `workspace snapshot -> plugin host` 的同步 owner：插件宿主 sync registry
- 助手 insight：属于 derived insight，不得反向覆盖 durable truth

## 4. 当前实现说明

### 4.1 Renderer

- `WorkspaceAssistantOverlay`
  - 提供常驻右上角浮层，位置与 Header 机器人按钮保持同一侧语义
  - 支持随时提问
  - 使用聊天气泡展示 conversation：助手回答在左侧，用户提问在右侧，并用不同底色区分
  - 显示当前项目摘要与重点 insight
  - 对 urgent insight 做最小去重与时间节流，避免重复 toast
  - 启用判定当前以插件宿主 `enabledIds` 为准，不再依赖 `workspaceAssistant.enabled` 这类重复开关字段，避免头部入口、浮层渲染和项目扫描出现状态分叉
- `WorkspaceAssistantSettingsSection`
  - 维护自动展开、主动提醒、建议消息、提醒间隔、助手偏好说明
  - 参照 `quota-monitor` 的表单语义维护 AI 设置：API 地址、API Key、模型名称
- `WorkspaceAssistantHeaderWidget`
  - 在头部展示助手入口
  - 当前已收口为纯机器人头像按钮，并通过右上角点击直接展开/收起助手浮层
  - 插件详情配置入口保留在浮层内部按钮和插件管理页，不再与头部即时交互入口混用
- `WorkspaceAssistantControlCenterWidget`
  - 在控制中心展示当前任务与 insight 摘要
- `pluginHostSyncRegistry`
  - 将当前活动 workspace 的派生快照纳入插件宿主同步链
  - 统一走宿主诊断与错误收口，而不是额外散落独立 effect
- `useWorkspaceAssistantProjectContext`
  - 只对当前活动项目做受控文件摘要读取
  - 目前只扫描少量关键文件，不做全量目录索引

### 4.2 Main

- `WorkspaceAssistantPluginController`
  - 承接插件启停
  - 接收 renderer 派生的 workspace 快照并广播运行态
  - 暴露最小状态同步与 prompt 接口
  - 当前会记录最小 conversation 历史
  - 当前支持 OpenAI-compatible `/responses` 非流式请求；未配置、请求失败或返回空文本时自动回退 rules-first fallback

### 4.3 AI 接入

当前真实 AI 接入采用 OpenAI-compatible HTTP 方式，不新增 SDK 依赖：

- 配置来源：`agentSettings.plugins.workspaceAssistant`
- 触发条件：`apiBaseUrl / apiKey / modelName` 均有效；插件启用后会直接使用该配置发起真实 AI 请求
- 请求端点：`${apiBaseUrl}/responses`
- 请求位置：Main 进程 `WorkspaceAssistantPluginController`
- 请求输入：系统提示 + 当前 workspace/project/canvas/task/agent 摘要 + 用户问题
- 输出解析：优先读取 `output_text`，再兼容 `output[].content[].text`
- 失败策略：捕获错误并回退本地规则回答，不让助手交互中断

Why：

- OpenAI 官方当前把 Responses API 作为统一模型响应接口；第一阶段直接使用 `/responses` 能兼容后续工具调用、状态和流式能力扩展。
- 真实请求必须在 Main 侧发起，避免 Renderer 直接承担网络和凭据调用边界。
- 非流式先落地能先验证配置、上下文拼装、失败回退和 conversation owner；后续再补 SSE 流式增量。

## 5. 当前限制

- 当前 prompt 支持真实 AI；只要配置完整就会直接使用，未配置时会提示用户先完成配置
- 当前 workspace 快照只同步“活动项目”的轻量摘要，不做全量项目索引或跨项目记忆
- 当前项目扫描只覆盖少量关键文件，不递归分析源码目录
- 主动提醒当前仍是轻量级本地策略，仅有最小去重和时间节流，不含复杂忽略机制或用户反馈学习
- `currentWorkspace / insights` 仍主要由 renderer 派生，本轮同步到 Main 的目标是让宿主 runtime、提示链和后续模型接入有统一上下文入口
- conversation 当前只保留有限长度的问答历史，还没有做上下文压缩与长期记忆
- 当前 AI 回复为非流式完整响应，不显示 token 级增量
- `workspace-assistant.apiKey` 属于本地敏感配置；云备份快照会清空该字段

## 6. 后续演进建议

下一阶段建议补：

1. 把“当前活动 workspace 快照”进一步扩展到项目源码入口和关键目录结构
2. 更细粒度的提醒规则、忽略机制和状态记忆
3. 对 AI 回复补流式输出、取消请求和错误可视化
4. 对 conversation 做上下文压缩、摘要与长期记忆
5. 更强的软件使用辅导和画布整理建议
