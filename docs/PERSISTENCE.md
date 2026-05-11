# Persistence (SQLite) Guide

本文档描述 FreeCli 的持久化实现（Main 进程 SQLite）以及 **Schema 变更** 时的流程性工作。

## 1) 架构边界（必须）

- Renderer 不允许直接访问文件系统/数据库。
- 持久化能力位于 **Main**，Renderer 通过 **Preload 白名单 API + IPC** 访问。

路径参考：

- Main store：`src/platform/persistence/sqlite/PersistenceStore.ts`
- Schema 定义（Drizzle）：`src/platform/persistence/sqlite/schema.ts`
- 迁移与建表（embedded SQL + user_version）：`src/platform/persistence/sqlite/migrate.ts`
- Schema 版本常量：`src/platform/persistence/sqlite/constants.ts`（`DB_SCHEMA_VERSION`）
- IPC channels：`src/shared/constants/ipc.ts`
- IPC handlers：`src/platform/persistence/sqlite/ipc/register.ts`
- Preload 暴露：`src/app/preload/index.ts`

## 2) Schema 版本机制（当前实现）

本项目 **不依赖 drizzle-kit 的 migrations** 来在用户机器上跑迁移。

当前策略：

- 使用 SQLite 的 `PRAGMA user_version` 作为 schema 版本号。
- `DB_SCHEMA_VERSION` 作为目标版本（应用启动时自动迁移到该版本）。
- `migrate()`（`migrate.ts`）负责：
  - 创建/更新表结构（embedded SQL）
  - 必要时执行数据迁移
  - 最终写入 `PRAGMA user_version = <DB_SCHEMA_VERSION>`

## 3) Schema 变更流程（必须执行）

任何对 `src/platform/persistence/sqlite/schema.ts` 中表结构的变更，都必须视为 **Large Change**（运行时高风险），并执行以下流程：

### 3.1 变更前：Spec & Plan

- 写清楚变更原因、影响范围、回滚/恢复策略。
- 明确旧版本数据如何迁移到新结构（包括边界数据与容错）。
- 明确验证手段（至少包含平台层 contract/unit 测试，必要时补 E2E 覆盖回归路径）。

### 3.2 实现：迁移代码（核心）

1. 修改 Drizzle schema：更新 `schema.ts`（用于查询/类型约束）。
2. 更新 `migrate.ts`：
   - `createTables()` 必须反映新表结构（新表/新列/索引等）。
   - 为 **每个旧版本** 提供向新版本迁移的路径（建议按版本分支处理），迁移尽量放在事务内。
3. 提升目标版本：在 `constants.ts` 中递增 `DB_SCHEMA_VERSION`。

迁移要求：

- **幂等**：重复执行不会破坏数据（`CREATE TABLE IF NOT EXISTS` / 保护性检查）。
- **可恢复**：迁移失败时应用必须仍能启动（本项目会将 db 移走并重建；见下节）。
- **兼容读取**：迁移期间不要依赖 Renderer 侧旧格式；IPC payload 需要 runtime 校验。

### 3.3 测试：必须新增/更新

- 为迁移行为添加/更新平台层测试（优先 contract）：
  - `tests/contract/platform/persistenceStore.spec.ts`（建议覆盖：备份触发、迁移结果、失败恢复路径）
  - `tests/contract/ipc/persistenceIpcHandlers.spec.ts`（建议覆盖：IPC payload 校验与 max bytes 限制）
  - 若涉及数据搬运：新增用例验证关键字段的迁移正确性（例如 workspace/nodes/spaces/scrollback）。

### 3.4 提交前门禁（与 CI 对齐）

- 必须跑：`pnpm pre-commit`

## 4) 备份与损坏恢复（现有行为）

应用启动创建 persistence store 时：

- 当检测到需要从旧版本升级（`user_version < DB_SCHEMA_VERSION`）：
  - 会先备份 `freecli.db`（同目录 `freecli.db.bak-<timestamp>`），再执行迁移。
- 若打开数据库失败或迁移抛错：
  - 会将原 db 重命名为 `freecli.db.corrupt-<timestamp>` 并创建新库继续启动；
  - Renderer 会显示一次性恢复提示（提示原因：`corrupt_db` / `migration_failed`）。

以上机制保证“应用可启动”，但 **不等于迁移可以随意失败**。Schema 变更仍需严格测试与回归覆盖。

## 5) App-State 兼容迁移（非 SQLite Schema 变更）

并非所有“持久化结构变化”都会触发 SQLite schema migration。

对于 renderer `app state / workspace state` 这类 JSON durable state，本仓允许在 **读取归一化阶段** 做兼容迁移，只要同时满足：

- 不涉及 SQLite 表结构、索引或 `user_version`。
- 可以在 `normalize / ensure` 阶段为旧数据补出新字段。
- 旧数据补全后能立即被最新恢复模型消费。

典型例子：

- 为旧 `agent node / hosted terminal / task session record` 补出 durable `bindingId`
- 为旧 task 补出 `linkedAgentBindingId`
- 把旧的“按 `sessionId` 猜归属”恢复为“按 `bindingId` 明确归属”

这种场景下必须遵守：

1. 在读取层做幂等补全，不能要求用户手动清库。
2. 在对应恢复文档中明确新旧语义差异与 owner。
3. 至少补 `unit / integration` 回归，证明旧 payload 读入后会得到完整新字段。
4. 明确说明“这是 app-state 兼容迁移，不是 SQLite schema migration”，避免误触发 `DB_SCHEMA_VERSION` 升级。
