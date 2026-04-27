# Plugin Host

本文档定义 FreeCli 当前第一期 **仓内插件宿主** 的边界、生命周期和接入方式。

目标不是马上做开放式第三方扩展市场，而是先建立一套稳定的 `first-party plugin host`，让后续类似“额度监测”“Git 监测”这类能力能以插件形式接入，而不是继续把重逻辑直接堆进主应用壳层。

## 1. 当前定位

第一期插件宿主只覆盖：

- 仓库内置插件（代码仍在主仓库）
- 独立插件管理页启用 / 停用
- Main 进程 runtime 生命周期
- Renderer 贡献点懒加载

第一期明确 **不做**：

- 外部目录扫描任意 JS/TS 插件
- marketplace / 远程安装
- 独立 extension host 进程
- 任意动态 IPC 反射调用

## 2. 设计原则

### 2.1 插件不是“有开关的普通模块”

宿主必须同时满足两件事：

- 未启用插件时，不加载其 renderer 贡献组件。
- 未启用插件时，不启动其 main runtime。

只做 UI `if (enabled)` 而提前 import 组件、注册定时器或后台轮询，不算真正插件化。

### 2.2 宿主不拥有业务真相

插件宿主只负责：

- 插件 manifest
- 启停编排
- 贡献点装配

插件自己的 durable fact、runtime observation 和 UI projection，仍应落到具体 context / settings / persistence 结构中。

### 2.3 贡献点必须收敛

第一期只开放少量稳定 slot：

- `appHeader.widgets`
- `pluginManager.sections`
- `controlCenter.widgets`

不要让插件直接 patch `AppShell` 或任意注入 DOM。

## 3. 宿主结构

### 3.1 Manifest

文件：

- `src/contexts/plugins/domain/pluginManifest.ts`

当前 manifest 描述：

- `id`
- `defaultEnabled`
- `titleKey`
- `descriptionKey`
- `settingsKey`
- `cloudBackupRole`
- `contributes`

其中：

- `settingsKey` 用于声明该插件的 durable config 实际挂在 `agentSettings.plugins` 的哪个子结构下，避免宿主、云备份、同步链路各自再维护一份“插件 id -> 设置块”的映射。
- `cloudBackupRole` 当前分为：
  - `none`
  - `participant`
  - `owner`

Why：

- 这让“插件元数据、设置 owner、云备份参与范围”回到同一份注册源，减少后续新增插件时漏改多处硬编码的风险。

### 3.2 Settings

插件启用状态与插件级配置当前都挂在 `agentSettings.plugins` 下，并作为 `settings` JSON 写入 SQLite `app_settings` 表：

- `agentSettings.plugins.enabledIds`
- `agentSettings.plugins.inputStats`
- `agentSettings.plugins.quotaMonitor`
- `agentSettings.plugins.gitWorklog`
- `agentSettings.plugins.ossBackup`

Why：

- 第一阶段继续复用现有 app settings 持久化链路，而不是额外引入新的插件专属 schema。
- 仍然通过独立 `plugins` 子结构与现有 agent/settings 字段隔离，避免继续扁平污染。

### 3.3 Main Runtime Host

文件：

- `src/contexts/plugins/application/MainPluginRuntimeHost.ts`
- `src/contexts/plugins/presentation/main-ipc/register.ts`

宿主职责：

- 接收启用插件列表
- diff 当前 active runtime
- 调用插件 `activate()` / `deactivate()`

### 3.4 Renderer Contribution Host

文件：

- `src/contexts/plugins/presentation/renderer/PluginControlCenterSlot.tsx`
- `src/contexts/plugins/presentation/renderer/PluginSettingsSectionSlot.tsx`
- `src/contexts/plugins/presentation/renderer/PluginManagerPanel.tsx`
- `src/contexts/plugins/presentation/renderer/pluginContributionRegistry.ts`

当前策略：

- App Header 只有启用的插件才会进入头部状态入口解析
- Control Center 只有启用的插件才会进入贡献点解析
- 独立 Plugin Manager 顶部会列出全部内建插件，但只有启用的插件才会渲染下方详细 section
- 贡献组件通过 `React.lazy()` 动态导入
- 构建产物中会拆出独立 chunk，未启用时不进入主渲染路径
- 通用插件页当前额外会展示 `Host Diagnostics`，用于暴露最近一次 `runtime sync / settings sync / workspace sync` 失败，避免宿主链路继续静默失效
- `renderer` 侧的头部入口 / 控制中心卡片 / 设置页 section 当前已统一收口到同一份 contribution registry，不再由多个 `switch` 分散维护

## 4. 当前 IPC

第一期只暴露一个宿主级 runtime 同步接口：

- `plugins:sync-runtime-state`

对应 preload：

- `window.freecliApi.plugins.syncRuntimeState({ enabledPluginIds })`

Renderer 在设置 hydration 完成后，会把当前启用插件列表同步给 Main 宿主，由 Main 决定需要 activate/deactivate 哪些 runtime。
除 runtime sync 外，Renderer 还会分别同步 `input-stats / quota-monitor / git-worklog / oss-backup` 设置，以及 `git-worklog` 的 workspace 列表；这些同步失败不会阻塞主壳，但会进入插件宿主诊断区，下一次成功同步后自动清除。
这些同步任务当前也已收敛为统一 sync registry，由 `diagnostic code + signature + run()` 三元组驱动，`AppShell` 不再手写多段重复的同步 effect。
开发态补充说明：`pnpm dev` 默认会把 `userData` 切到 `%AppData%/freecli-dev`，不会直接读取已安装版本使用的 `%AppData%/freecli`。只有显式设置 `FREECLI_DEV_USE_SHARED_USER_DATA=1`、`--shared-user-data` 或 `FREECLI_DEV_USER_DATA_DIR` 时，开发态才会复用或重定向到另一套持久化目录。Why：近期 Git Worklog 的“页面列表与实际 data 目录不一致”排查里，第一层差异就来自 dev / packaged 使用的是两套不同的 durable 根目录。

## 5. 接入一个新插件的最小步骤

1. 在 `pluginManifest.ts` 注册插件 manifest。
2. 在 `pluginRuntimeRegistry.ts` 注册 main runtime factory（如果需要后台逻辑）。
3. 在 `pluginContributionRegistry.ts` 注册 renderer lazy loader（如果需要 UI 贡献点）。
4. 在 `src/plugins/<plugin-id>/` 下实现对应 runtime / renderer 组件。
5. 若插件需要设置项，优先挂在独立 settings 子结构，不要继续向 `AgentSettings` 平铺更多业务字段。

## 6. 当前示例插件

当前内建插件为：

- `input-stats`
- `quota-monitor`
- `git-worklog`
- `oss-backup`

## 7. 关键不变量

1. 未启用插件不得启动 runtime。
2. 未启用插件不得加载 renderer 贡献组件。
3. 插件不得直接写 renderer 全局 durable truth。
4. 插件的能力入口必须经宿主与现有边界层，不要旁路 preload / IPC / persistence。
5. `oss-backup` 只允许备份“已持久化的插件配置”，不允许上传 workspace / canvas / terminal 等其他 durable state。
6. `quota-monitor.keyProfiles[].apiKey`、`workspace-assistant.apiKey` 与 `oss-backup.accessKeySecret` 不得进入云端快照。
7. `input-stats` 的采集与聚合只允许 Main 持有；Renderer 只能同步设置、订阅状态和触发手动刷新。
8. `input-stats` 当前只在 Windows 支持真实输入采集；非 Windows 平台必须稳定降级为 `unsupported`，不能伪装成运行中。

## 8. 后续演进建议

当“额度监测”正式接入时，建议把它作为第一个真实业务插件落地：

- `settings`: API 地址、key profiles、启用状态
- `main runtime`: 拉取、重试、错误归一化
- `renderer`: Control Center 概要卡片 + 详情 section
- `persistence`: 后续如需趋势图，再单独评估是否进入 SQLite schema
- 诊断层建议至少补两类能力：
  - 对明显错误配置做基础校验，例如把接口 URL 误填进 API Key
  - 对服务端非 200 响应尽量透传具体 message，避免 renderer 只能看到笼统错误

## 8.1 当前稳定性补强（2026-04-04）

- `MainPluginRuntimeHost` 当前已补 activate 失败后的 rollback 回归测试，锁住“启动失败不能残留 active runtime”。
- `oss-backup` 当前已补 controller 级测试，覆盖：
  - 激活后上传脱敏快照
  - OSS 配置不完整时的错误态
  - 恢复失败时的错误保留
  - 自动备份仅对纳入云备份范围的插件配置变更生效
- `PluginManagerPanel` 当前已补宿主诊断展示测试，避免 Renderer 同步失败再次退回“静默无提示”状态。
- 2026-04-04 第二轮收敛后，`oss-backup` 的自动备份触发规则已补齐：不仅插件子配置变化会触发，`enabledIds` 的启用/停用变化也会被识别为插件配置变更并进入自动备份判断。
- 2026-04-25 已继续补一条插件宿主边界修复：`workspace-assistant` 现在只有在 `enabledIds` 明确包含该插件时，才允许 Renderer 构造 workspace snapshot，并注册 `workspace_assistant_sync / workspace_assistant_workspace_sync` 两条宿主同步任务。Why：上一版把工作流助手的快照构造与宿主同步无条件接进了项目打开主链，即使插件默认未启用，也会在打开某些项目时提前执行新链路，和“未启用插件不得加载 renderer/runtime”的宿主约束冲突，并可能放大为打开项目白屏的回归。

## 9. 当前 UI 组织（2026-04-02）

插件管理 UI 现已从 `SettingsPanel` 中拆出，改为独立入口：

- App Header 的插件按钮直接打开 `PluginManagerPanel`
- `SettingsPanel` 的 `Integrations` 页只保留应用级集成项，不再承担插件宿主管理
- `PluginManagerPanel` 当前采用两段结构：
  - 左侧导航：固定 `General Settings`，并为每个已启用插件追加一个独立导航项
  - 右侧内容：根据当前导航项切换显示通用插件开关页，或某个单独插件的详细配置页
- `AppHeader` 当前新增一个轻量级插件状态入口区，位于控制中心左侧；只有真正声明 `headerWidget` 的启用插件才会在这里渲染
- 独立插件页的外层壳仍然明确对齐现有 `SettingsPanel`：
  - 复用相同的 backdrop / panel / header / 左右栏导航语言
  - 插件页内部允许使用轻量 `overview + section cards` 结构展示状态，但不再回退到单独的一整套 dashboard 壳层
  - 插件自己的配置继续收敛到统一的 `settings-like rows + shared cards + field groups`

Why：

- 插件是一级管理对象，不应继续作为设置页里的附属 section 存在
- 关闭插件时保留 durable config，但不再加载 runtime 和专属 UI
- 后续新增真实插件时，可以保持同一管理结构和同一套面板语义，而不是在每个插件页各自发明新的 UI 语言

## 9.1 插件页视觉收敛（2026-04-04）

本轮继续对真实业务插件页做统一化收口，重点不是重做设计系统，而是把层级、信息密度和操作位置收敛到一套稳定模式。

- `PluginManagerPanel` 当前已扩展到更适合插件内容的宽度，并在右侧内容区增加统一背景层次，减少“大量表单直接堆叠”的观感。
- 新增共享容器 `PluginSectionCard`，作为插件配置区的统一卡片骨架；标题、说明和主操作被前置到卡片头部，避免每个插件页各自拼装 subsection。
- `quota-monitor` 当前页面结构统一为：
  - 顶部 `Quota Overview`
  - 下方 `连接与配置` 卡片
  - 下方 `Key 配置列表` 卡片
- `git-worklog` 当前页面结构统一为：
  - 顶部 `Worklog Overview`
  - 下方 `扫描与仓库配置` 卡片
  - 总览内部直接承载仓库卡片，并通过仓库级管理弹窗维护启用、改名、改路径和删除

### Git Worklog 前端分组与扫描解耦（2026-04-24）

- `git-worklog` 当前明确区分两类信息：
  - `Git 扫描事实`：哪些仓库参与扫描、每个仓库的原始统计值、扫描状态与错误。
  - `前端展示分组`：仓库在 Overview 中归属到哪个父项目组、组内顺序和父项目组顺序。
- 当前前端分组只影响 Renderer 层的聚合与展示，不再参与 Main 侧扫描输入判定。
- Git Worklog runtime `repo state` 当前不再把父项目/项目组归属当作 Main 侧事实暴露；Main 仅继续返回仓库扫描结果与自动发现候选。Overview 页面里的默认分组推断、拖拽后归组和组汇总，统一由 Renderer 基于 `availableWorkspaces + assignedWorkspaceId` 计算。
- 用户在插件页里拖拽仓库到其他父项目组、调整组顺序、调整仓库顺序，或修改仅用于展示的分组归属时：
  - Overview 上的父项目汇总会立即按当前前端分组结果重算；
  - Main 侧不会因此重新扫描 Git 仓库。
- Why：
  - 真实 Git 仓库是独立实体，扫描事实不应被页面分组容器反向影响。
  - “统计口径随前端分组调整而变化”属于展示投影，而不是 Git 扫描 owner。
  - 把扫描与展示解耦后，拖拽和重排不再触发无意义的后台重扫，响应更直接，也更符合用户心智。

### Git Worklog 首次导入全历史热力图（2026-04-25）

- `git-worklog` 当前已把“当前统计范围”与“热力图历史”拆成两条独立数据语义：
  - `区间统计`：仍按当前 `recent_days / date_range / authorFilter` 计算，用于概览卡片与趋势图。
  - `热力图历史`：首次导入仓库后，会额外解析该仓库的全历史按天改动，并单独缓存，供热力图按年份展示。
- 热力图当前不再只依赖 `overview.dailyPoints`；即使当前区间只看最近 7 天，只要仓库历史里存在更早年份的提交，热力图仍可切换到对应年份查看。
- Main 侧当前会把热力图历史作为独立缓存保存到 `git-worklog-history` 数据集中，并随现有 OSS 同步链路一起导入/导出。
- Why：
  - 用户对“首次导入仓库”的直觉是看到完整日历图，而不是只看到当前统计窗口。
  - 概览统计和热力图承载的是两种不同查询语义，继续共用一份 `dailyPoints` 会让历史仓库看起来像“没扫到”。
  - 把热力图历史独立成 durable cache 后，可以先解决首次导入体验问题，而不必一次性推翻现有区间统计链路。

### Git Worklog 仓库卡趋势视图收口（2026-04-26）

- `git-worklog` 的仓库卡当前已继续把顶部摘要和底部趋势图统一到“前端统计投影”语义：
  - 顶部小卡固定为 `今日新增 / 今日删除 / 累计改动` 三项；
  - 底部 `仓库节奏` 改为和总览 `每日汇总趋势` 同语义的双线趋势，绿色表示新增，红色表示删除；
  - 仓库级趋势当前支持 `7 天 / 15 天 / 30 天` 本地切换，只影响 Renderer 展示窗口，不改 Main 扫描结果或持久化设置。
- Why：
  - 仓库卡之前混用“改动总量 sparkline + 两张混合摘要卡”，和总览趋势图不是同一套阅读语义，用户很难快速对齐“仓库级今天发生了什么”和“最近一段时间节奏如何变化”。
  - 这次把仓库卡改成 `新增 / 删除` 双线后，仓库卡与总览趋势图的颜色、图例和统计口径保持一致，但 owner 仍然留在前端投影层，不反向影响 Git 扫描逻辑。

### Git Worklog 目录入库与待确认导入（2026-04-25）

- `git-worklog` 当前已把“左侧项目导入”与“正式 Git 仓库展示”拆成两步：
  - `目录入库`：用户把项目加入左侧后，Git Worklog 只把该目录当作待分析 workspace 记录下来。
  - `正式展示`：只有在后台扫描完成、并由用户确认后，扫描到的仓库才会写入正式仓库列表并进入前端展示。
- 2026-04-26 起，`pending import / dismissed import / workspace discovery error` 不再挂在 `agentSettings.plugins.gitWorklog` 内部字段上反复推导，已改为 Main 侧独立 `discovery-state` durable store 持有。
  - `settings.repositories` 只表示正式纳管仓库与其展示分组入口。
  - `discovery-state` 只表示“左侧项目导入后，系统最近发现到了什么、是否待确认、是否被放弃、上次错误是什么”。
  - Why：这两类状态的 owner、恢复语义和写入入口不同，继续混在同一份 settings JSON 中会造成“新工作区列表空白”“重复仓库”“重新读取无效”等问题。
- 2026-04-26 已继续把配置弹窗里的 `扫描结果` 与 `正式仓库配置` 拆成两块独立列表：
  - `仓库扫描清单` 现在只展示左侧项目的实时扫描结果，用于处理 `待确认 / 扫描失败 / 已放弃自动导入`。
  - `已纳管仓库列表` 单独展示已经进入正式统计的仓库配置及其当前前端分组归属。
  - Why：此前两类数据混在同一张表里时，开发态很容易出现“`freecli-dev` 的 discovery-state 只有一个项目，但页面却还显示旧仓库”的误判；拆表后可以明确区分“扫描快照”和“正式配置/前端分组”。
- 2026-04-26 已继续为 `已纳管仓库列表` 增加 `一键修复仓库配置 / 撤销上次修复`：
  - 修复入口当前只面向 `agentSettings.plugins.gitWorklog.repositories`、`repositoryOrder` 和 `workspaceOrder` 这三类正式配置，不改 `discovery-state`、Git 扫描事实或热力图历史缓存。
  - Main 侧当前会保守修复：重复真实 Git 根路径、仓库路径未归一到真实 Git 根、`assignedWorkspaceId` 指向失效 workspace；同时保留显式 `__external__` 基础仓库归属，不会自动把它改回路径推断分组。
  - `label` 当前只在保守条件下自动修：空名、默认名、或与其他仓库重名且当前 Git 根名称明显不同；不会覆盖用户明确自定义的名称。
  - 每次修复前都会在 `userData/plugins/git-worklog/repository-repair-backup.json` 记录一份上次快照，因此用户可以在同一区块直接撤销一次最近修复。
  - Why：正式仓库配置的错误 owner 是持久化 settings 本身，应该通过“诊断 + 生成修复结果 + 单次撤销”收口，而不是继续混用扫描快照或 runtime 残留状态去猜当前真相。
- 同一轮里，`git-worklog` 的仓库 id 生成与 settings 归一化也已收口为“全局唯一”：
  - 新增仓库不再按“当前数量 + 1”生成 `repo_x`，而是按现有最大序号继续递增。
  - settings 归一化时如果发现旧数据存在重复仓库 id，不再直接丢弃后续项，而是自动重写为新的唯一 id。
  - Why：旧实现会在“删除仓库 -> 新增仓库”后复用 `repo_3` 一类 id，进而触发 React 重复 key，最终把列表行复用错位，表现成“FastWrite / FreeCli 数据串线”。
- 后台扫描当前只在空闲时段执行。每个左侧项目目录默认只做一次自动扫描，输出是目录级 `pending import` 结构，而不是直接把仓库自动写进正式列表。
- `pending import` 的默认语义：
  - 一个左侧项目目录对应一个待确认项；
  - 该目录下扫描到的多个 Git 仓库会作为同一组结果展示给用户确认；
  - 用户确认后，组内仓库统一进入正式管理；用户放弃后，该目录进入 `dismissed imports` 历史，后续不会再次自动弹出。
- “重新读取”当前也已收口为 `workspace` 级定向重扫动作，而不是复用全局 `refresh`。Why：用户点击某个工作区的重新读取，期待的是刷新该目录的 Git 发现结果，而不是等待一次全局刷新调度。
- 被放弃的目录当前仍允许用户手动添加其中任意 Git 仓库；放弃只影响“自动纳管”，不影响手动纳管入口。
- Why：
  - 左侧项目导入的心智是“这个目录先进入系统”，而不是“立即成为正式 Git 统计对象”。
  - 多仓库父目录通常需要先给用户确认结构，否则系统直接自动纳管容易误伤。
  - 把“自动扫描”和“正式展示”拆开后，既保留了后台发现能力，又给用户保留最终确认权。
- `oss-backup` 当前页面结构统一为：
  - 顶部 `云备份概览`
  - 下方 `连接设置` 卡片
  - 下方 `备份范围 / 状态` 卡片

Why：

- 真实业务插件已经同时包含“运行态总览 + 配置项 + 手动操作”，继续全部塞进单一 section 会让视觉层级失真。
- 统一成 `overview + cards` 后，状态展示和配置维护可以共存，但不会让插件页退化成大段表单或说明文案。
- 共享卡片容器也减少了后续新增插件时的 UI 漂移风险，使插件体系在视觉上更接近同一个产品，而不是三个独立页面。

## 9.2 Git Worklog 仓库管理收口（2026-04-07）

- `git-worklog` 不再保留独立的“监控仓库管理”第三张卡片；仓库管理入口已并入 `Worklog Overview` 下方的仓库卡片列表。
- 每个已配置仓库当前都会在卡片右侧提供 `Manage` 入口，点击后打开统一管理弹窗。
- 管理弹窗内部继续沿用 `cove-window` 语义：
  - 左侧操作栏：启用开关、删除按钮
  - 右侧仓库胶囊：名称、路径、启用状态与仓库 id
  - 下方字段：仓库名称、仓库路径、选择文件夹
- 总览列表当前只展示“正式纳管仓库”，也就是 `agentSettings.plugins.gitWorklog.repositories` 中已经确认入库的仓库。
- 对每个正式仓库：
  - 若当前已有 runtime 扫描结果，则直接叠加展示最新统计与扫描时间。
  - 若当前暂时没有 runtime 数据，则保留该仓库卡片，但指标显示为占位态，便于继续管理与重新扫描。
- 当前不再把“仅存在于 runtime state、但未正式纳管”的残留仓库混入监控仓库卡片。
- Why：
  - 避免把“查看统计”和“维护仓库”拆成两块来回切换。
  - 停用仓库仍然需要保留可见入口，否则用户无法在 UI 中重新启用它。
  - `正式纳管仓库` 与 `扫描快照 / runtime 残留状态` owner 不同；总览继续混显两类数据，会让页面看起来比真实持久化配置多出旧仓库。
  - 管理动作集中在弹窗内后，总览列表可以继续保持信息卡片语义，而不是退回窄列表格。

## 10. 额度监测页面展示（2026-04-02）

额度监测插件页当前已经从“开发期配置说明块”收敛为生产态展示：

- 插件页顶部新增正式 `Quota Overview` 区，位置仍在插件页右侧内容区内部，不改变左右栏信息架构
- 总览区会显示：
  - 当前整体状态胶囊
  - 最近更新时间
  - 手动刷新入口
  - 每个已启用 profile 的额度卡片
- 单个 profile 卡片当前展示：
  - profile 名称与 key 类型
  - token 名称或错误态摘要
  - 剩余额度与剩余比例
  - 今日已用额度
  - 今日调用次数
  - 到期时间
  - 最近刷新时间
- 配置区被收敛为两段：
  - `连接设置`
  - `Key Profiles`
- 之前偏开发态的长说明、runtime ownership 提示和 profile 底部调试式摘要，已经从主路径移除；仅在真实错误出现时显示错误 banner

Why：

- Flutter dashboard 的“总览页”核心价值在于正式数据展示，而不是配置页里的说明文字
- FreeCli 当前还没有趋势图 / token model 统计 / SQLite snapshots，因此只迁移当前状态模型能支撑的正式概览层
- 继续把 runtime 提示、owner 解释和 profile 摘要堆在配置表单底部，会让插件页长期停留在开发态观感

## 11. Flutter 左侧卡片复刻（2026-04-02）

当前 `quota-monitor` 已额外对齐 Flutter dashboard 左侧总览卡片的核心要素：

- 圆环：按 `remainRatio` 绘制剩余比例环，并沿用 Flutter 的四色阈值语义
  - `>= 50%` 绿色
  - `>= 30%` 蓝色
  - `>= 10%` 橙色
  - `< 10%` 红色
- 今日剩余配额：使用归一化后的 `remainQuotaIntDisplay`
- 到期时间：直接显示接口返回的 `expiredTimeFormatted`
- 剩余几个小时的测算：当前在 Main 侧按“今日平均消耗速率”推导
- Renderer 当前额外保留了兼容回退：如果 Electron 开发态出现“新 renderer + 旧 main bundle”短暂混跑，页面会从 `remainQuotaDisplay / remainQuotaValue` 继续推导展示数字，避免左侧主数值直接掉成 `--`
- 头部当前新增一个圆环型 quota 入口：位于控制中心左侧，中间只显示剩余百分比，外圈使用单环按总剩余比例着色；点击后直接进入 `quota-monitor` 独立插件页

当前估算公式：

- `hourlyUsageRate = todayUsedQuota / hoursSinceStartOfDay`
- `estimatedRemainingHours = remainQuotaValue / hourlyUsageRate`
- renderer 展示格式为 `X时Y分`

Why：

- 这一层属于业务衍生状态，应由 Main owner 统一计算，而不是让 renderer 自己拼公式
- FreeCli 当前没有 Flutter 里的 snapshot repository / trend history，因此暂未复刻基于历史样本的更强估算；现阶段使用“当日平均消耗速率”作为最小可用近似

## 12. OSS 云备份插件（2026-04-04）

当前已新增 `oss-backup` 作为第三个真实业务插件，目标是为“插件配置”提供最小可用的云备份闭环，而不是把全应用数据一起推上云。

### 12.1 owner 划分

- 本地 durable truth 仍然是 `agentSettings.plugins`，继续随 app settings JSON 一起落到 Main 进程 SQLite。
- `oss-backup` 只负责：
  - OSS 连接配置
  - 参与备份的插件列表
  - 手动备份 / 手动恢复
  - 自动备份调度
  - 快照脱敏与格式校验
- 业务插件本身不持有上传 / 下载逻辑，只暴露“是否参与云备份”的配置入口。

Why：

- 避免把云同步逻辑散落到每个插件里。
- 保持“业务配置 owner”和“云端编排 owner”分离。
- 只从 Main 进程 persistence 读取已经落盘的设置，避免上传 renderer 临时态。

### 12.2 当前备份范围

当前 OSS 同步默认包含：

- `agentSettings.plugins.enabledIds`
- `agentSettings.plugins.quotaMonitor`
- `agentSettings.plugins.gitWorklog`
- `agentSettings.plugins.ossBackup` 的非敏感字段

当前可选同步（在 `oss-backup` 插件设置中单独开关）：

- `input-stats` 历史：`userData/plugins/input-stats/stats.json`
- `quota-monitor` 历史：`freecli.db` 中 `quota_monitor_snapshots` / `quota_monitor_model_logs`

当前仍明确不包含：

- workspaces
- canvas / nodes / scrollback
- tasks / notes / spaces
- quota / worklog 的 runtime state

### 12.2.1 冲突与自动同步策略

- 云端和本地都基于 `manifest + local sync-state` 维护每个数据集的 `version / sha256 / updatedAt / size`。
- 手动“立即备份”固定语义：`use_local`（本地覆盖云端，版本递增）。
- 手动“从云端恢复”固定语义：`use_remote`（云端覆盖本地）。
- 自动同步采用保守策略：
  仅当“云端仍等于本地基线，且本地确实有新变化”时才自动上传；
  只要发现基线不一致或双端都变化，就跳过自动上传，避免静默覆盖。

### 12.3 脱敏规则

- `quota-monitor.keyProfiles[].apiKey` 上传前统一清空为 `''`
- `workspace-assistant.apiKey` 上传前统一清空为 `''`
- `oss-backup.accessKeySecret` 不进入快照
- `oss-backup.accessKeyId` 当前也不进入快照，避免把云端快照继续当成敏感凭证容器

### 12.4 当前 UI 与自动备份语义

- `oss-backup` 自身有独立插件页，用于维护 `endpoint / region / bucket / objectKey(对象目录) / AccessKey`、手动备份、手动恢复和连接测试。
- OSS 连接设置已收口到弹窗；弹窗内新增三项自动化策略：`自动备份最小间隔（分钟）`、`启动时自动拉取`、`退出时自动推送`。
- `objectKey` 当前语义已经收口为“对象目录”，例如 `freecli/plugin-settings`；程序会自动在该目录下写入 `latest.json`、`manifest.json`、`input-stats-history.json`、`quota-monitor-history.json`、`git-worklog-history.json`。旧配置若仍保存为 `.../latest.json` 这类完整文件路径，归一化时会自动迁移回对应目录，但最终访问的 OSS 对象路径保持不变。
- 当前在 `oss-backup` 页面统一维护备份范围，`quota-monitor` 与 `git-worklog` 页面不再放置云备份入口。
- 自动备份不会在输入中实时触发；当前只在插件设置已经成功落盘后，由 renderer 通知 Main 插件 runtime 做防抖上传，防抖窗口由 `autoBackupMinIntervalSeconds` 决定。
- 启动自动拉取会在 `oss-backup` runtime 激活后触发一次恢复，并把恢复结果直接写回 persistence 的 `settings.plugins`，保证无 renderer 参与时也能生效。
- 退出自动推送通过 Main 进程 `before-quit` 拦截执行一次带超时保护的备份，完成后放行退出，避免关闭流程被长期阻塞。
- 当本地与云端发生冲突且无法安全自动决策时，renderer 会弹出选择框，由用户显式选择 `use_local` 或 `use_remote`。
- 设置页当前新增 `清除本地数据` 危险操作：会清空**当前实例**的 `userData` 目录（包括 `freecli.db`、插件缓存、日志与本地 OSS sync-state），然后自动重启。该操作只影响本地 durable state，不会直接删除云端 OSS 对象；若清空后仍需保留当前本地为权威基线，应在重启后重新执行一次手动“立即备份”。

Why：

- 避免把半成品表单状态直接同步到 OSS。
- 继续保证 persistence 是 single source of truth。
- 保持现有 `Main / Preload / Renderer` 边界不被绕开。

## 13. 键鼠统计插件（2026-04-04）

当前已新增 `input-stats` 作为第四个真实业务插件，用于承接 Flutter dashboard 中已有的键盘/鼠标统计能力。

### 13.1 owner 与状态分层

- Main 是唯一 owner，负责：
  - 启停输入采集 runtime
  - 聚合今日统计、Top Keys、历史序列、累计统计
  - 本地持久化与状态广播
- Renderer 只负责：
  - 同步 `inputStats` 设置
  - 展示控制中心摘要卡
  - 展示插件页里的概览、键盘热力图、历史趋势和累计统计

Why：

- 输入采集是高频副作用，不能交给 Renderer。
- 键盘热力图、趋势图和累计统计都属于投影层，应消费 Main 聚合结果，而不是各自再算一遍。

### 13.2 当前实现方式

- 设置 owner：`agentSettings.plugins.inputStats`
- Main 控制器：`src/plugins/inputStats/presentation/main/InputStatsPluginController.ts`
- 本地聚合存储：`src/plugins/inputStats/presentation/main/InputStatsStore.ts`
- Windows helper：`src/plugins/inputStats/presentation/main/windows/inputStatsHookHelper.ps1`
- Renderer 入口：
  - `src/plugins/inputStats/presentation/renderer/InputStatsControlCenterWidget.tsx`
  - `src/plugins/inputStats/presentation/renderer/InputStatsSettingsSection.tsx`

当前页面结构已按 Flutter 的输入统计页收口为：

- 顶部页头总览
- `今日统计` 四宫格
- `按键分布`（左侧排行榜 + 右侧热力图）
- `历史趋势`（指标切换 + 区间摘要 + 柱状图）
- `累计统计`
- `采集与展示设置`

当前采集链路：

- 仅 Windows 启动 PowerShell helper，并通过低级键盘/鼠标 hook 获取增量。
- Main 周期性拉取 helper 增量，写入 `userData/plugins/input-stats/stats.json`。
- Renderer 通过 preload 订阅 `plugins:input-stats:state`，接收 Main 广播快照。

### 13.3 当前限制与稳定性收口

- 当前只支持 Windows；macOS / Linux 仍然明确降级为 `unsupported`。
- 当前不做 SQLite DDL；输入统计继续以 `userData` 下 JSON 文件保存。
- 本轮已补两类高风险收口：
  - `InputStatsStore` 修正了并发初始化竞态，避免 `today` 正常但 `topKeys / history / cumulative` 因半初始化而读成 0。
  - `InputStatsHelperClient` 已补命令超时、stderr 收集与超时后自动杀进程，避免 helper 无响应时 UI 长时间卡在 `starting`。

### 13.4 当前验证资产

- `tests/unit/contexts/inputStatsStore.spec.ts`
- `tests/unit/contexts/inputStatsControlCenterWidget.spec.tsx`
- `tests/unit/contexts/inputStatsSettingsSection.spec.tsx`
- 本轮已通过：`pnpm check`、`pnpm build`、`pnpm test -- --run tests/unit/contexts/inputStatsStore.spec.ts tests/unit/contexts/inputStatsControlCenterWidget.spec.tsx tests/unit/contexts/pluginBackupSnapshot.spec.ts tests/unit/contexts/ossBackupPluginController.spec.ts`

### 13.5 交互增强（2026-04-04）

- `按键分布` 当前已从静态展示升级为可联动视图：
  - 点击左侧排行榜项后，会同步高亮键盘热力图中的对应按键。
  - 点击热力图中的按键后，也会反向切换当前选中项。
  - 详情区当前会展示：按键名称、触发次数、区间占比、当前排名和统计范围。
  - 再次点击已选中项会取消高亮，避免界面被锁死在单一 key 上。
- `历史趋势` 当前已从纯柱状图升级为可分析视图：
  - 点击某一天的柱状后，会锁定该日明细。
  - 详情区当前会展示：日期、当日数值、相对前一日变化、区间占比和是否峰值。
  - 再次点击已选中柱状会清空选中，恢复到无锁定态。

Why：

- Flutter 版本的输入统计页不仅是“看图”，更强调“点选某个对象后进入局部分析”；Electron 端如果停留在静态热力图和静态柱状图，用户很难真正用这些数据做判断。
- 这次把交互 state 收口在 renderer 组件 owner 内部，不改 Main 快照结构，就能把“查看趋势”和“查看单个 key”两类分析动作补完整，同时不破坏 `Main -> Preload -> Renderer` 的 owner 边界。

### 13.6 数据表达增强（2026-04-04）

- `按键分布` 当前已继续补充区间级摘要：
  - 覆盖按键数
  - Top10 占总按键次数的比例
  - 当前榜首按键
- `按键详情` 当前已继续补充分析字段：
  - 与榜首差距
  - 相对区间均值的倍数
  - 热度等级（核心高频 / 高频 / 常用 / 零散）
- `历史趋势` 当前已继续补充区间级摘要：
  - 峰值日
  - 低谷日
- `历史详情` 当前已继续补充分析字段：
  - 相对日均值的偏移
  - 距峰值差距
  - 当前日期在区间中的数值排名

Why：

- Flutter 侧除了图形本身，还会给用户足够的“解释性数据”；如果 Electron 端只有图和单点数值，用户仍然需要自己换算，数据价值会被打折。
- 这些字段全部来自现有 renderer 可推导状态，不引入新的 Main DTO，也不会改变持久化结构，适合当前阶段快速增强分析能力。

### 13.7 统计卡片细化（2026-04-04）

- `今日统计` 当前已补次级说明：
  - 键盘按键卡会展示其占今日离散输入的比例
  - 鼠标点击卡会展示左键 / 右键拆分
  - 鼠标移动卡会展示原始像素位移
  - 滚轮滚动卡会展示“每次点击约对应多少滚动格”
- `累计统计` 当前已补次级说明：
  - 四张卡都会展示当前累计范围下的日均值

Why：

- 统计页的四宫格如果只有主数值，用户需要来回切换不同区间和图表才能理解“结构”与“节奏”；补上次级说明后，卡片本身就能承担更多统计解释职责。
- 这些说明全部复用现有 `today` 和 `cumulativeTotals` 数据，不会额外拉高 Main 端复杂度。

### 13.8 统计页交互收口（2026-04-09）

- `PluginManagerPanel` 当前已继续放大，`input-stats` 页面会获得更宽的可用内容区，优先保证完整键盘布局与趋势图的首屏可读性。
- `按键分布` 当前已取消面向用户的“局部缩放”滑杆，改为由键盘热图组件自己按容器宽度自动缩放；当可用宽度继续不足时，再用横向滚动兜底，保持键盘比例稳定而不把布局控制权暴露给用户。
- 2026-04-10 已继续把键盘热图本体按 Flutter 的真实实现收口到更接近 `1:1`：
  - 主键区、导航区和数字小键盘当前使用与 Flutter 一致的三段式骨架，不再把导航键区和方向键区拆成两块独立容器。
  - 数字小键盘当前带有与 Flutter 一致的一行顶部下沉偏移，整体重心不再和主键区硬对齐。
  - 热度配色已从 Electron 端原先的离散渐变改为 Flutter 同款的连续插值色带，文本颜色也改为按背景亮度自动切换。
  - 键帽尺寸、圆角、阴影、左上角标签和右下角计数，当前都统一回到 Flutter 的 `44 / 6 / 7 / 16` 基准体系。
- `历史趋势` 当前已从“单指标柱状图”改为“同图四维折线趋势”：
  - 同时展示 `键盘按键 / 鼠标点击 / 鼠标移动 / 滚轮滚动` 四条按天趋势线。
  - 各维度按自身峰值归一化，仅用于观察趋势方向与联动关系，不表达绝对值可比性。
  - 2026-04-09 又继续按截图重做为“宽图主视图”结构：顶部保留彩色维度图例，右上保留区间切换，中部改为单张浅色折线大图，底部收口为“当前指标总计 + 当前选中日期摘要”，不再把右侧分析面板作为主结构。
  - 点击某一天后，当前仅围绕选中指标展示该日摘要，避免在同一块区域继续堆叠四维分析卡片，整体视觉更接近 Flutter 侧参考图。
  - 2026-04-10 已继续直接对照 `dashboard_flutter/lib/features/input_stats/input_stats_page.dart` 的真实实现收口：历史记录区的标题行、`7/30 天` 紧凑范围切换、彩色图例、四个指标切换 chip、`210px` 高的平滑折线图，以及底部“当前指标总计”文案，当前都优先跟随 Flutter 端已审核样式，而不是继续做 Electron 端自创变体。
- `累计统计` 的范围切换当前已从底部“采集与展示设置”表单中移到卡片头部，改为上下文内的快速范围按钮，避免用户“点了没反馈”。

Why：

- Flutter 原始模块本来就是“按天折线趋势 + 四维度关联观察”的表达；Electron 端继续维持单指标柱状图，会让趋势分析能力明显退化。
- 历史趋势和累计统计都属于投影层交互，适合把“当前范围”和“当前选中日期”收口在 renderer 本地 state 中，而不改变 Main 聚合 owner 与持久化结构。
