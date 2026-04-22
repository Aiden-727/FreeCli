# DEVELOPMENT - 开发导航（Index）

本文档是本仓库的“开发入口/索引”。为避免一次性信息过载，详细规范已拆分到各模块目录下，请按需打开对应文档。

## 如何使用（给 Agent / 开发者）

1.  **每次任务先读本文件**：获取全局硬规则、文档地图、执行方法与常用入口。
2.  **职责分层**：`AGENTS.md` 只保留关键指令、决策门槛与非协商项；具体方法、步骤和例子优先写在本文件或 `docs/` 专项文档。
3.  **需要专题细节时**：按文档地图继续打开对应 `docs/` 文档。

## 开发与测试指南

### 核心编码原则 (Core Coding Principles)

只保留最容易在日常开发中被忽略、但一旦忽略就容易形成系统性问题的原则：

1.  **优先复用 (Prioritize Reuse)**: 在创建任何新代码、组件或工具函数之前，**必须**彻底搜索现有代码库以查找可复用组件。如无必要勿增实体，避免重复造轮子。
2.  **明确状态所有权 (State Ownership)**: 对会被持久化、恢复、同步或跨层传播的状态，必须明确唯一 owner 与 single source of truth。多个写入口默认视为设计风险。
3.  **边界内聚，副作用靠边 (Keep Boundaries Clean)**: `Main / Preload / Renderer / external CLI` 各司其职。状态决策不要跨层泄漏，IO / IPC / 文件系统等副作用尽量收敛在边界层。
4.  **封装横切关注点 (Encapsulate Cross-Cutting Concerns)**: IPC、日志、错误处理、watcher、persistence coordination 等横切逻辑要统一收口，避免调用方各自实现一份。
5.  **重复行为优先下沉到拥有者 (Logic Internalization)**: 若同一行为在多个调用方重复出现，优先下沉到真正拥有该行为的组件/模块，而不是在使用方复制。
6.  **把 SOLID 当作校准器，不当作教条 (Use SOLID as a Design Check)**:
    - `S`：模块如果同时承担状态决策、IO、UI、恢复策略，通常已经拆分过晚。
    - `O`：新增 `provider / adapter / watcher` 时，优先新增实现，而不是到处改稳定分发逻辑。
    - `L`：只有存在真实子类型替换时才考虑；不要为了“像 OO”强造继承层级。
    - `I`：`preload / service / bridge` 接口要小而专用，不暴露大而全 API。
    - `D`：高层依赖抽象端口和类型，不直接依赖 `Electron / PTY / CLI` 细节。
7.  **结构优先于补丁 (Prefer Structural Clarity over Patch Accumulation)**: 不要等问题复发后才升级。只要任务本身已经暴露出 `多个 mutable state owner`、`边界/权限含混`、`同一入口承载多套竞争语义或解释路径`、或 `局部修补会制造隐藏/矛盾状态`，就应先收敛结构而不是继续叠 patch。
8.  **Renderer 反馈统一用应用内消息，不用系统弹窗 (Use In-App Feedback, Not System Dialogs)**: Renderer 层禁止新增 `window.alert / confirm / prompt` 这类系统弹窗；统一复用应用内反馈组件，并按语义区分 `info / warning / error` 三个视觉层级，避免阻塞交互与平台观感割裂。

### 命名与前缀 (Naming)

- 对外/协议/持久化统一使用 `FreeCli` / `freecli`（例如 `window.freecliApi`、`FREECLI_*`、`.freecli/`、`freecli.db`）。
- UI 设计系统与样式命名空间保留 `cove` 前缀（例如 `--cove-*`、`data-cove-*`、`.cove-window`），作为稳定的内部约定。
- 历史版本的 localStorage key 可能仍使用 `cove:m0:*` 前缀；当前实现会兼容读取并迁移。

### 架构执行触发器 (Architecture Execution Triggers)

只保留最容易在代码演化中失控、且最值得前置约束的触发器：

1.  **先分离决策与编排**：状态迁移/业务判定属于 owner；`IO / IPC / CLI / watcher` 调用属于 orchestration。一个函数若同时承担两者，默认应先拆分。
2.  **出现以下组合时，先拆再改**：
    - 同一文件出现两个以上独立变更原因。
    - 同一函数同时包含 `状态判定 + 外部调用 + fallback/retry + 写回`。
    - 同一次改动同时触及 `lifecycle / persistence / hydration / resume / watcher` 中两项及以上。
3.  **高风险路径先写不变量**：启动、恢复、关闭、重试、fallback、异步乱序相关改动，先写 `1-3` 条 invariant，再决定实现位置与测试层级。
4.  **结构性风险先升级判断**：以下信号任中其一，就必须按 Large Change 处理，而不是直接以最小改动修补：`多个 mutable state owner`、`边界或 authority 难以解释`、`同一入口/输入/观测承载多套竞争语义或状态迁移`、`局部 patch 可能制造新的矛盾状态或隐藏状态`、`同一真相被 runtime observation 与 durable state 同时改写`。是否“已经复发”只作为额外证据，不作为触发前提。

### 高风险问题预防策略（只列最容易漏的）

以下内容是前文原则的落地建模方式；正式检查项统一见后文“风险与合规检查”，这里不重复展开检查清单。

1.  **先写状态/所有权表，再写流程**：对跨 `Main / Preload / Renderer / PTY / persistence / external CLI` 的改动，先明确四列：`state`、`owner`、`write entry`、`restart source of truth`。若同一真相存在多个写入口，默认高风险。
2.  **严格区分四类状态**：建模时至少先区分 `用户意图 / 持久化事实 / 运行时观测 / UI 派生展示` 四类状态；owner、恢复语义与写回约束按后文“风险与合规检查”执行。
3.  **优先验证不变量，不堆场景**：每个高风险改动至少先写出 1-3 条不变量。测试优先证明“哪些错误不会发生”，而不是只证明 happy path 能跑通。
4.  **默认过一遍故障模型**：重点考虑 `await` 中途关闭窗口/退出 app、事件重复/乱序/延迟、fallback 或 cleanup 比 happy path 更早写状态、部分成功/部分失败、旧数据恢复，以及跨平台路径/shell/权限差异。
5.  **测试按风险层分配，不按文件平均分配**：
    - `Unit`：状态迁移、normalize、纯逻辑不变量。
    - `Contract`：IPC payload、跨层边界、输入校验。
    - `Integration`：hydration、persistence、restart、lifecycle、watcher 协作。
    - `E2E`：关键用户路径与真实交互链路。
    - UI 手段选择、Playwright、截图 / 录屏等细节，统一见后文“UI 自动化与验证”。
6.  **结构分析先于实现**：凡命中结构性风险信号，实现前至少产出一份最小分析：`mutable state owner 表`、`边界/路由图（按场景可对应事件、消息、watcher、lifecycle）`、`1-3` 条 invariants，以及 `局部 patch vs 抽象收敛` 的 trade-off 说明。缺少这些信息时，不进入编码。
7.  **边界驱动系统先识别 source / route / owner**：涉及事件、消息、watcher、回调、lifecycle 或其他边界驱动系统的冲突时，先明确 `谁发出`、`谁路由`、`谁拥有默认行为`、`谁拥有状态写权`。任何需要靠隐式副作用才能维持正确性的实现，都默认视为结构问题。
8.  **每个真实 bug 都要资产化**：至少沉淀为以下之一：回归测试、运行时断言、文档规则、抽象收敛。若在分析阶段已经能看出同一结构弱点会导出多个相邻故障模式，就必须直接升级为系统性治理任务，目标是合并 owner、消除重复写入口或收敛交互抽象，而不是等待再次复发。

### 通用参考学习与方案生成法（Research -> Synthesize -> Adapt -> Verify）

凡是行业内大概率已有成熟做法、主流产品 / 框架 / 库已有先例、或问题明显不是 FreeCli 独有时，都应主动查找外部参考，再结合本仓约束提出方案，而不是等用户点名要求后才去看。

1.  **先识别问题类，不先写实现**：先写一句 `这是哪一类已有行业先例的问题`，再写一句 `FreeCli 当前真正不稳定 / 不清晰的承诺是什么`。
2.  **按四层查参考**：
    - `产品 / 帮助文档 / 规范`：确认外部世界对该问题类承诺的稳定行为。
    - `官方示例 / 源码 / 测试 / RFC`：确认默认策略、owner、边界和 fallback。
    - `issue / discussion / changelog / maintainer comment`：确认 trade-off、平台差异和已知坑。
    - `本仓现有实现`：确认哪些抽象可以复用，避免平行再造。
3.  **每个参考只提炼五类信息**：`承诺`、`state / authority owner`、`1-3 invariants`、`fallback / override`、`trade-off / 不直接照搬的部分`。
4.  **提出方案时必须做转译**：按 `行业共识 -> 可迁移原则 -> FreeCli 约束 -> 本地设计` 输出，不直接把外部实现贴进来。
5.  **自动化 / 启发式默认保守**：涉及 `auto-detect / auto-switch / auto-retry / auto-recover / heuristic` 时，高置信才切换，歧义保持稳定，并保留显式兜底。
6.  **验证仍遵循本文件前文的按风险分层原则**：重点把从外部参考提炼出的规则、不变量和 trade-off 落到最低 meaningful layer；UI 侧手段选择统一见后文“UI 自动化与验证”。
7.  **最后资产化**：把结论沉淀到 `专项文档 + 测试 + owner / invariant 说明 + review 要点`；否则视为未完成学习闭环。

### 风险与合规检查（Risk & Compliance System）

本节是前文状态、边界、owner 与恢复语义原则的正式检查清单。对 **Large Change** 或任何命中运行时高风险的改动，在进入实现前至少显式过一遍以下检查项：

#### 关键稳定性检查（Critical Stability Checklist）

- **Async Gap Safety**：所有 `await` 边界都要考虑组件卸载、窗口关闭、app 退出、对象失效后的行为。
- **Concurrency & Race**：防止快速连续输入、重复事件、异步乱序、重复回调带来的竞争与边界漂移。
- **State Ownership**：对持久化、恢复、同步或跨层传播的状态，必须明确唯一 authoritative owner，避免多层抢写同一真相。
- **Restart Semantics**：严格区分用户意图、durable fact、runtime observation、UI projection；关闭、watcher 噪声或 fallback 不得默默把可恢复状态降级成终态。
- **IPC Security**：Renderer 到 Main 的输入必须校验，禁止 blind trust。
- **Resource Lifecycle**：事件监听、订阅、child process、watcher、disposable 必须成对清理。
- **Performance**：避免阻塞 Main 线程；关注高频输入、重渲染、布局抖动、大文件和重 IO 路径。
- **Data Integrity**：任何持久化结构、schema 或恢复语义变动都必须考虑兼容、迁移与回滚。

#### 触发式合规门槛（Triggered Compliance Gates）

- **Architecture**：禁止 Main / Preload / Renderer 逻辑越界；边界暴露统一走 `preload` 或契约层。
- **Type Safety**：避免 `any`，IPC payload、跨层 DTO、边界返回值都要保持可校验、可推断。
- **Security**：保持 Context Isolation；Renderer 禁止 Node Integration；能启用 Sandbox 的路径不要随意放弃。

### 开源与发版数据安全门禁（Open-Source & Release Data Safety Gate）

以下要求适用于**所有**后续开发、重构、脚本修改、CI 调整、打包配置修改与发版操作；默认在每次任务中与其他安全检查一并执行，不需要用户重复提醒：

- **GitHub 源码上传门禁**：禁止把任何 secrets、tokens、API Key、AccessKey、私钥、证书、账号口令、用户本地配置、用户数据库、会话文件、诊断包、日志、截图、崩溃转储或其他个人数据提交到仓库。
- **发版打包门禁**：禁止把用户 `userData`、本地数据库、运行期缓存、控制面连接文件、日志、诊断输出、测试产物、开发临时文件或任何真实用户数据打进安装包、便携包或更新包。
- **新增文件/目录时先判断归属**：凡是 `.env`、`.db`、`.sqlite`、`.log`、会话导出、临时截图、崩溃文件、缓存目录、诊断目录、用户生成内容，默认视为**不得入仓/不得进包**，除非是脱敏后的固定测试夹具且已明确说明用途。
- **修改打包配置时必须复核输入面**：凡修改 `package.json` 的 `build`、`extraResources`、`files`、构建脚本、发布脚本、GitHub Actions、安装器配置时，必须显式确认新增输入不会把敏感信息或用户个人数据带入发布产物。
- **修改忽略规则时必须复核外泄风险**：凡修改 `.gitignore`、发布白名单、归档脚本、上传脚本时，必须检查是否会让本地数据库、日志、缓存、`.freecli/`、测试产物或其他用户文件进入 GitHub 或 release。
- **示例与测试数据必须脱敏**：文档、测试、fixture、截图、录屏、release notes、README 示例中禁止出现真实用户 API Key、真实 OSS 凭据、真实个人路径、真实账号、真实邮箱、真实令牌或可复用会话信息。
- **发布前最小安全检查**：发版前至少检查一次仓库 tracked 文件、构建输入、`extraResources`、发布脚本与工作区新增文件，确认本次源码上传和 release 产物均不包含敏感信息或用户个人数据。
- **默认结论表达**：若审查范围仅限“GitHub 源码上传 + 正常发版流程”，应明确区分“仓库/发版是否会外带数据”与“应用运行时本地如何存储数据”是两类不同问题，避免混淆。

### UI 自动化与验证（UI Automation & Verification）

对 UI 改动，尤其是 **Large Change**、高交互风险改动、或真实体验比纯逻辑更重要的改动，按以下方式选择验证手段：

- **Web/Renderer 优先用 Playwright**：主路径走 `pnpm test:e2e` 或最低 meaningful layer 的 Playwright 用例。
- **用户可感知变化必须跑 E2E**：新增功能、UX 改动、修复 bug、默认行为变化等，至少跑一条覆盖本次变更的 Playwright 用例（通常直接跑 `pnpm test:e2e`；或统一跑 `pnpm pre-commit`）。
- **主题/样式改动必须遵守 UI 规范**：新增颜色走 token，Light/Dark 都要验收可读性；优先在 E2E 中附带截图。详见 `docs/UI_STANDARD.md`。
- **复杂交互辅以截图 / 录屏**：当行为依赖拖拽、滚动、动画、命中点或视觉反馈时，用截图或录屏帮助确认真实体验。
- **提交前做一次 smoke 验证**：至少确认核心用户路径、关键视觉状态和交互目标没有回归。
- **开发中用视觉调试**：必要时主动看截图、边框、命中区域、选择框、hover/active 状态，而不是只看日志和断言。
- **非用户可感知改动优先低成本验证层**：纯内部重构、类型收敛、工具链/脚本调整等，优先跑目标明确的 unit/contract 测试；UI 回归风险较高时再补 E2E。

## 全局硬规则（摘要）

-   **架构基线**：本项目以 `DDD` 划分领域，以 `Clean` 约束依赖；`context` 是一级组织单位，每个 context 强制拆为 `domain / application / infrastructure / presentation`，`app/main`、`app/preload`、`app/renderer` 只做组合与边界。细则见 `docs/ARCHITECTURE.md`。
-   **Small vs Large**（详见 `AGENTS.md`）：
    -   **Small**：直接做，小步快反馈，跑针对性验证。
    -   **Large / 运行时高风险**：遵循 **Spec -> (Feasibility Check) -> Plan** 流程。
        -   **高风险触发器（最易漏）**：启动/重启恢复、hydration、持久化写回、退出生命周期、跨层状态同步、external CLI / watcher 回写、fallback/cleanup 改写状态、多写者共享同一真相、边界冲突、同一入口对应多套竞争语义。
        -   **Spec**：明确验收标准、风险点及验证手段，等待确认。
        -   **Feasibility Check**：针对新技术/高性能/核心重构，必须先调研并跑通 PoC。
        -   **Plan**：制定详细执行计划，等待确认。
        -   **验证**：用户可感知变化必须跑 E2E；UI 变更需提供截图/录屏；重大功能需跑通 `pnpm test:e2e`。
        -   **兼容与迁移**：改动 IPC 接口或数据结构时，必须考虑对现有功能的影响。
        -   **跨平台兼容**：开发默认应考虑 `macOS / Windows / Linux` 三平台；如本次只支持部分平台，必须在方案与交付说明中明确标注差异、限制与后续补齐计划。凡修复平台特有 bug，必须补对应平台的 E2E，并在 CI 的该平台 runner 上执行验证；Windows / macOS / Linux 专属用例优先使用 `*.windows.spec.ts` / `*.mac.spec.ts` / `*.linux.spec.ts` 命名收口。
-   **禁止手改**：
    -   lock 文件 (`pnpm-lock.yaml`) 必须由命令生成/更新。
    -   生成代码（如自动生成的类型定义等）禁止手改。
-   **提交前检查（与 CI 对齐的最低门槛）**：
    -   运行 `pnpm pre-commit` 前，必须先 `git add` 本次改动，再执行 `pnpm line-check:staged`，因为行数门禁只检查 staged 文件。
    -   若 staged 文件中存在超过 500 行的文件，先重构/拆分，过门禁后再继续，不要带着超长文件直接运行 `pnpm pre-commit`。
    -   `pnpm pre-commit` 会执行 `pnpm naming-check:staged`：禁止在新代码里重新引入 `cove:*`（对外/协议/持久化），仅允许显式 legacy 迁移用途；UI 设计系统前缀仍保留 `cove`（见上文命名约定）。
    -   若本次改动涉及打包配置、发布脚本、GitHub Actions、`.gitignore`、构建输入目录或新增资源归档逻辑，提交前必须额外确认：不会把 secrets、用户本地数据、数据库、日志、缓存、控制面连接文件、诊断文件或其他个人数据带入 GitHub 仓库或 release 产物。
    -   若本次改动包含用户可感知变化（新增功能、UX 改动、修复 bug、默认行为变化），应先提交代码并创建 PR；拿到 PR 链接/编号后，再更新 `CHANGELOG.md` 的 `## [Unreleased]` 并单独提交（每个变化一条，尽量附 `#PR` 编号）。`nightly` tag 不要求更新 changelog；发 `stable` 时再把 `Unreleased` 结算进新版本段。
    -   创建/更新 PR 时：若本次改动包含用户可感知变化，必须跑 Playwright E2E（通常 `pnpm test:e2e`，或统一跑 `pnpm pre-commit`）。
    -   若本次改动涉及 **Renderer 用户可见文案**，必须做好 i18n：禁止新增硬编码用户文案，新增/修改文案时同步更新 `src/app/renderer/i18n/locales/en.ts` 与 `src/app/renderer/i18n/locales/zh-CN.ts`，并在提交前做一次对应语言的最小 smoke/测试验证。
    -   通过上述检查后，再执行 `pnpm pre-commit` （type, lint, format, test）。
-   **测试失败排查前置**：
    -   凡遇到 `pnpm pre-commit`、`pnpm test -- --run`、`pnpm test:e2e` 或单独 `Playwright` 用例失败，继续排查前**必须先阅读** `docs/DEBUGGING.md`。
-   **安全（Electron Security）**：
    -   始终开启 Context Isolation。
    -   Renderer 进程禁止开启 Node Integration。
    -   IPC 通信必须校验参数类型 (validate ALL inputs)。
    -   生产环境 CSP 禁止 `style-src 'unsafe-inline'`（仅开发环境允许），配置入口：`electron.vite.config.ts`。

## 快速开始

-   **安装依赖**：`pnpm install`
-   **启动开发环境**：`pnpm dev`
    - 默认使用独立的 `userData` 目录（避免污染已安装版本的数据）
    - 如需临时复用已安装包的数据：`FREECLI_DEV_USE_SHARED_USER_DATA=1 pnpm dev` 或 `pnpm dev -- --shared-user-data`
    - 如需自定义 dev 的数据目录：`FREECLI_DEV_USER_DATA_DIR=/path/to/userData pnpm dev`
-   **运行单元测试**：`pnpm test -- --run`
-   **运行 E2E 测试**：`pnpm test:e2e`
    -   说明：`pnpm test:e2e` 已包含构建步骤，默认使用 `offscreen` 后台窗口模式；检测到 Electron 崩溃特征时，会按窗口模式链路自动降级并重跑失败用例（例如 `hidden -> offscreen`、`offscreen -> inactive`）。
    -   可通过 `FREECLI_E2E_WINDOW_MODE` 指定窗口模式（`inactive / offscreen / hidden`，禁止 `normal` 以避免抢占焦点）。
    -   如需关闭自动降级，可设置 `FREECLI_E2E_DISABLE_CRASH_FALLBACK=1`。
    -   若需单独执行 Playwright（如 `pnpm exec playwright test tests/e2e/xxx.spec.ts`），必须先执行 `pnpm build`，否则可能仍会使用旧的 `out/` 产物，导致结果与当前源码不一致。

## 文档地图（按问题找入口）

-   **Agent 关键指令与决策门槛**：`AGENTS.md`
-   **架构标准（DDD + Clean）**：`docs/ARCHITECTURE.md`
-   **Landing 重构落地规范**：`docs/LANDING_ARCHITECTURE.md`
-   **统一控制面（command/query/event）**：`docs/CONTROL_SURFACE.md`
-   **CLI 规范**：`docs/CLI.md`
-   **Filesystem（URI + providers + guardrails）**：`docs/FILESYSTEM.md`
-   **画布内文件编辑（Document Node）**：`docs/DOCUMENT_NODE.md`
-   **恢复模型与 owner 表**：`docs/RECOVERY_MODEL.md`
-   **持久化（SQLite schema / migrations）**：`docs/PERSISTENCE.md`
-   **插件宿主（first-party plugins）**：`docs/PLUGIN_HOST.md`
-   **UI 开发标准**：
    -   总体 UI 规范：`docs/UI_STANDARD.md`
    -   窗口 UI 标准：`docs/WINDOW_UI_STANDARD.md`
    -   任务 UI 标准：`docs/TASK_UI_STANDARD.md`
    -   视口导航标准：`docs/VIEWPORT_NAVIGATION_STANDARD.md`
    -   默认前端视觉基线：后续新增或重做的 renderer 页面、插件页、统计卡、配置卡、趋势图、弹窗表单，默认必须以 `quota-monitor` 已冻结设计语言为第一参考，不再允许各模块独立发明另一套卡片、按钮、图表与表单语义；详细规则见 `docs/UI_STANDARD.md` 中 `Quota-Monitor Default Design Baseline`
-   **终端渲染基准**：`docs/TERMINAL_TUI_RENDERING_BASELINE.md`
-   **参考优秀项目与方案调研法**：`docs/REFERENCE_RESEARCH_METHOD.md`
-   **调试指南**：`docs/DEBUGGING.md`
-   **贡献代码指南**：`CONTRIBUTING.md`
-   **API Client 生成与使用**：暂无，参考 `src/shared/contracts` 定义。

## 检索建议（避免一次性读完）

-   优先在 `AGENTS.md` 中查找开发及其流程规范。
-   若问题大概率已有行业成熟做法、主流产品先例或框架惯例，先读 `docs/REFERENCE_RESEARCH_METHOD.md`。
-   涉及具体 UI/功能模块时，检索 `docs/` 下的相关文档。
-   搜索现有代码中的实现模式，遵循 "Prioritize Reuse" 原则。
