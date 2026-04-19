# UI Standard

本规范定义 FreeCli 的 **统一 UI 语言** 与 **实现约束**，用于保证：

- Light / Dark / System 三种主题下都可读、克制、层级清晰；
- 组件风格一致（像同一个“系统”）；
- 后续开发/改动可持续（可复用、可测试、可演进）。

命名约定：
- 产品/对外接口统一使用 `FreeCli` / `freecli`。
- UI 设计系统与样式命名空间保留 `cove` 前缀（例如 `--cove-*`、`data-cove-*`、`.cove-window`），作为稳定的内部约定，不随产品命名调整而变更。

> 关联专项规范：
> - Window：`docs/WINDOW_UI_STANDARD.md`
> - Task：`docs/TASK_UI_STANDARD.md`
> - Viewport：`docs/VIEWPORT_NAVIGATION_STANDARD.md`

---

## 1) 设计原则（Apple-level 基线）

1. **层级优先**：标题/主信息/次信息/辅助信息必须一眼可分（字体、颜色、间距共同实现）。
2. **克制的对比**：Light 模式避免“白底+纯黑+强边框”；Dark 模式避免“大面积纯黑+纯白字”导致刺眼。
3. **少即是多**：阴影、描边、渐变只在“解释结构/层级”时使用；不是装饰。
4. **一致的交互反馈**：hover/focus/active/disabled 的反馈强度在全局一致，且必须可预测。
5. **可访问性**：
   - 文字与背景保持足够对比；
   - `:focus-visible` 必须清晰（键盘可用）；
   - 不用颜色作为唯一信息通道（错误/警告配合图标/文案/布局）。

---

## 2) 主题系统（必须遵循）

### 2.1 单一真相

- 持久化设置：`settings.uiTheme: 'system' | 'light' | 'dark'`
- Renderer 主题入口：`<html data-cove-theme="light|dark">`（`system` 会跟随 `prefers-color-scheme` 计算出 light/dark）
- 必须设置 `color-scheme`，让原生控件在主题下正确渲染。

### 2.2 Token 优先（禁止硬编码颜色）

- 全局 Token 定义在：`src/app/renderer/styles/base.css`
  - `:root` 作为默认（暗色基线）
  - `:root[data-cove-theme='light']` 覆盖浅色
- 组件样式必须使用 `var(--cove-*)` Token：
  - ✅ `color: var(--cove-text-muted)`
  - ✅ `border-color: var(--cove-border-subtle)`
  - ❌ `color: #fff`
  - ❌ `background: rgba(255,255,255,0.08)`

> 例外：极少数与业务语义绑定、且跨主题一致的品牌色/状态色允许硬编码，但必须在规范评审中说明原因；优先新增 token。

### 2.3 CSS 写法约定

- Token/主题差异 **集中在 `base.css`**，组件 CSS 不写分支主题选择器，除非确有必要。
- 避免在 React 里用 inline `style` 写颜色；布局/定位可以，但能 class 化就 class 化。

---

## 3) 组件与层级（统一规则）

### 3.1 Surface / Border / Shadow

- Surface 必须有“可解释层级”：背景（app） < 面板/窗口（surface） < 强化面板（surface-strong）
- Border 默认使用 `--cove-border-subtle`，hover/active 才提高对比。
- Shadow 必须服务于层级，不得用极黑/极硬的阴影压住内容。

### 3.1.1 Card Visual Baseline

当前已把 `quota-monitor` 试点中的卡片视觉参数冻结为后续卡片设计基线。未来新增或重做卡片时，默认先复用这组参数，再根据场景微调；不要重新发明另一套边框、圆角和阴影语言。

目前第一轮复用已落到：
- `quota-monitor`
- `input-stats`
- `git-worklog`

- `Shell / Overview 容器`
  - `border-radius: 24px`
  - `padding: 20px`
  - `gap: 16px`
  - `border: 1px solid`
  - `shadow`: 三层叠加，主阴影 + 中距离阴影 + 轻微落地阴影
- `Primary Card / Hero / 主面板`
  - `border-radius: 22px`
  - `padding: 18px`
  - `gap: 16px`
  - `border: 1px solid`
  - `shadow`: 三层叠加，强度低于 Shell，但仍需明显可感知
- `Secondary Card / Summary / Trend 内嵌容器`
  - `border-radius: 20px / 18px / 16px`
  - `padding: 16px-18px`
  - `border: 1px solid`
  - `shadow`: 轻于 Primary Card，但不能退化成纯平盒子
- `Pill / Capsule 控件`
  - `border-radius: 999px`
  - `min-height: 32px`
  - `padding-inline: 12px`
  - `border: 1px solid`
  - 激活态优先用“浅强调底 + 轻投影”，不要只改字体颜色

当前试点 token 入口：
- `src/app/renderer/styles/base.css`
  - `--cove-quota-shell-*`
  - `--cove-quota-card-*`
  - `--cove-quota-subcard-*`
  - `--cove-quota-pill-*`
- 未来若确认全局推广，应把这组试点 token 收敛为通用 `--cove-card-*` 家族，而不是继续长期保留业务专属命名。

浅色模式卡片阴影当前推荐模型：
- `Shell`: `0 30px 64px`, `0 14px 30px`, `0 3px 8px`, 外加 `inset 0 1px 0`
- `Primary Card`: `0 24px 46px`, `0 10px 24px`, `0 2px 6px`, 外加 `inset 0 1px 0`
- `Secondary Card`: `0 18px 34px`, `0 8px 18px`, `0 2px 5px`, 外加 `inset 0 1px 0`

使用约束：
- Light 模式靠“柔和多层阴影 + 冷灰细边框”建立体积感，不用重黑阴影。
- Dark 模式保留同样的层级关系，但总体阴影范围可以更收敛，避免脏和糊。
- 新卡片如果只是信息密度不同，优先调整 `padding / gap / 文本层级`，不要随意改阴影体系。

### 3.1.2 Quota-Monitor Default Design Baseline

从 2026-04-12 起，`quota-monitor` 不再只是一个插件试点，而是 **FreeCli 默认前端视觉基线**。后续所有 renderer 侧新页面、改版页面、插件页、总览卡、配置卡、趋势图、弹窗中的统计区与表单区，默认都必须先对齐这套设计语言，再讨论是否需要偏离。

这条规则的目标不是“所有页面都长得一样”，而是：
- 一眼看出属于同一系统；
- 不再出现同一应用里同时存在三四套卡片、按钮、图表和表单语言；
- Light / Dark 都稳定可读；
- 新页面可以直接复用现成参数，而不是继续凭感觉调边框、阴影和颜色。

#### A. 整体气质

- 关键词：`简约`、`立体`、`冷静`、`专业`、`克制`
- 明确禁止：
  - 玻璃拟态式大面积高透明背景
  - 厚重、发黑、发脏的阴影
  - 纯装饰性渐变、炫光、发光描边
  - 一个页面里并存多套圆角、边框和按钮语义
- 允许的强调方式：
  - 通过层级、边框、阴影、轻渐变表达体积感
  - 用蓝色作为默认强调色，但蓝色只服务于重点信息、状态与交互，不允许整页泛蓝

#### B. 色彩与主题

- 默认基调：
  - Dark：深蓝灰底 + 冷灰边框 + 柔和阴影
  - Light：冷白底 + 浅灰蓝层级 + 多层柔和阴影
- 主题承诺：
  - Dark / Light 不允许是两套割裂设计，只允许是同一层级关系的两种映射
  - Light 模式不允许退化成“白底 + 黑字 + 几乎无阴影”
  - Dark 模式不允许退化成“纯黑底 + 纯白字 + 重阴影”
- 强调色规则：
  - 默认主强调：蓝色，延续 `quota-monitor` 的 `--cove-accent` 语义
  - 新增、确认、添加类动作：绿色
  - 删除、危险、不可逆动作：红色
  - 警告态：沿用现有 warning/danger token，不新增自定义橙黄系统
- 实现要求：
  - 优先使用 token
  - 不允许在业务 CSS 中反复硬编码随机颜色
  - 若需要新增颜色语义，先新增 token，再进组件 CSS

#### C. 卡片系统

- `Shell`：承担整块总览或面板容器
  - 必须明显高于页面背景
  - 必须有完整圆角、边框、阴影与内部留白
- `Primary Card`：Hero、主指标卡、主趋势卡、主配置卡
  - 必须有稳定体积感
  - 必须明显强于 `Secondary Card`
- `Secondary Card`：摘要卡、内嵌趋势容器、配置子卡、表单分组
  - 可以更轻，但不能扁平到像普通 `div`
- `Pill / Capsule`
  - 统一承担状态、切换、轻操作
  - 默认不允许再造矩形小按钮替代它

强制规则：
- 同一页面内圆角只能在同一体系内变化，例如 `24 / 22 / 20 / 18 / 16 / 999`
- 阴影必须是多层柔和叠加，不允许单层重黑阴影
- 边框必须细且克制，不能靠粗描边制造层级

#### D. 文本层级

- 标题规则：
  - 主页面/主插件标题：普通文本标题，不做胶囊
  - 趋势卡标题：普通深色/浅色文本，不再使用装饰性 pill kicker
  - 只有真正的状态标签、过滤器、切换器才使用胶囊
- 信息层级：
  - 主数值：最大、最重、最靠近视觉中心
  - 标签说明：次一级
  - 辅助说明：只保留必要信息，默认能删则删
- 明确要求：
  - 禁止为了“显得丰富”堆砌副标题、摘要句、重复说明
  - 如果标题已经表达清楚语义，下方描述默认删除
  - 数值卡优先展示数值，不要让解释文案压住主信息

#### E. 趋势图基线

后续所有折线/趋势图默认参考 `quota-monitor` 的当前实现，而不是旧版 polyline 卡片。

强制结构：
- 左侧 `y-axis`
- 中间独立 `chart shell`
- SVG 内统一 grid line
- SVG 下方对齐 `x-axis`
- tooltip 与 hover 指示必须服从同一坐标骨架

强制视觉：
- 曲线必须平滑，禁止生硬折线
- 线宽必须一致
- hover 点必须是正圆，且必须落在线段上
- tooltip 要轻量、克制，不允许喧宾夺主
- 多线图右上角提供图例；单线图默认不展示图例

强制交互：
- 区间切换优先做“线条本身”的几何过渡
- 禁止整卡闪动、整卡淡入淡出、整卡缩放来假装过渡
- 小时图默认区间：`6 / 12 / 24`
- 天图默认区间：`3 / 7 / 15 / 30`
- 轴标签必须做稀疏化，禁止密到不可读

#### F. 表单与配置区基线

从现在开始，配置页不再允许回退到“普通设置面板行 + 默认按钮 + 扁平输入框”的弱层级方案。默认参照 `quota-monitor` 当前“连接与配置 / 密钥配置列表”。

强制规则：
- 配置分组要下沉成可解释的 `Secondary Card / Subcard`
- 输入区与说明区的纵向间距要紧凑，不允许松散到像原型稿
- 常用配置优先单屏内快速完成，不要拉得过长
- 操作按钮必须有明确视觉语义：
  - 新增/创建：绿色实体按钮
  - 删除/危险：红色实体按钮
  - 普通辅助动作：按统一 secondary/ghost 语义
- 表单标题、字段标题、帮助文案必须做层级区分：
  - 字段标题可读但克制
  - 帮助文案尽量短
  - 能通过布局表达的，不要再写一段解释文字

#### G. 按钮基线

- `primary`：默认蓝色系主动作
- `success/add`：绿色实体按钮
- `danger/remove`：红色实体按钮
- `secondary/ghost`：仅用于普通辅助动作

强制规则：
- 不允许出现“语义是新增/删除，但视觉仍像普通透明按钮”的情况
- 按钮可以保留渐变、高光、边框和阴影，但外圈彩色光晕必须克制
- 视觉目标是“实体按钮 + 轻立体”，不是“发光按钮”

#### H. 文案与 i18n

- 新设计语言下，文案也要一起收口，不能只改颜色不改表达
- 中文环境显示中文，英文环境显示英文，由现有 i18n 机制统一驱动
- 禁止在中文界面残留大段 `Profile / Snapshot / Breakdown` 这类未本地化词汇
- 除必要缩写外，默认优先使用直白、简短、可扫描的文案
- 原则：
  - 能短就短
  - 能删就删
  - 能合并就不要拆成两行说明

#### I. 偏离规则

若某个页面不能直接复用 `quota-monitor` 设计语言，必须至少回答：
- 为什么不能复用
- 偏离的是哪一层：卡片、图表、按钮还是表单
- 为什么偏离后仍然属于 FreeCli 同一系统

没有明确理由时，默认视为不允许偏离。

### 3.2 文本系统

- 主文字：`--cove-text`
- 次文字：`--cove-text-muted`
- 辅助/弱化：`--cove-text-faint`
- 禁止在 Light 模式出现“白字”（除非在深色 surface 上，且由 token 驱动）。

### 3.3 交互状态

- `hover`：轻量，优先用 `--cove-surface-hover`
- `focus-visible`：必须可见且不刺眼（建议 1px ring + 轻外发光）
- `disabled`：降低对比/透明度，但仍可读、可理解

---

## 4) Canvas 特化约束

### 4.1 MiniMap（可读 + 不抢戏）

- 默认态（idle）必须 **半透明**：使用 `--cove-canvas-minimap-opacity-idle`
- hover / focus-within 时提高可读性：使用 `--cove-canvas-minimap-opacity-hover`
- 节点颜色、mask、描边必须 token 化，避免 Light 模式“看不清/刺眼”。

实现锚点：
- 样式：`src/app/renderer/styles/workspace-canvas.css`
- Token：`src/app/renderer/styles/base.css`

---

## 5) Settings（可读性硬约束）

- 所有文本/边框/输入框必须基于 token；尤其避免 `#fff` / `#ccc` 这类暗色假设。
- provider/card 标题与错误信息必须可读（Light/Dark 都可读）。

实现锚点：
- 面板样式：`src/app/renderer/styles/settings-panel.css`
- 主题选择：`src/contexts/settings/presentation/renderer/settingsPanel/GeneralSection.tsx`

---

## 6) 测试与验收（UI 变更必须做）

### 6.1 最低验收

- Light / Dark 下主要页面可读（至少：Sidebar / Canvas / Settings / Node chrome）
- MiniMap idle/hover 层级正确（默认不抢眼，hover 可读）

### 6.2 E2E 要求（有 UI 回归风险时必须）

- Playwright 用例必须：
  - 对关键样式做 **可解释** 的断言（例如 opacity / color-scheme / dataset）；
  - 附带截图（`testInfo.attach`）。

### 6.3 提交前门禁（与 CI 对齐）

- `git add -A`
- `pnpm line-check:staged`
- `pnpm pre-commit`

---

## 7) 参考实现（可复用入口）

- Theme 应用：`src/app/renderer/shell/hooks/useApplyUiTheme.ts`
- Theme Token：`src/app/renderer/styles/base.css`
- Card 视觉试点：`src/app/renderer/styles/plugin-manager.css` 中 `quota-monitor-overview`
- Terminal 主题映射：`src/contexts/workspace/presentation/renderer/components/terminalNode/theme.ts`
