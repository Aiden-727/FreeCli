# Releasing / Packaging

## 本地打包

- 生成安装包：`pnpm build:mac`
- 生成 Windows 安装包：`pnpm build:win`
- 生成 Linux 安装包：`pnpm build:linux`
- 生成“明确不签名”的安装包：`pnpm build:mac:unsigned`
- 生成解包目录（适合本地直接运行验证）：`pnpm build:unpack`

产物默认在 `dist/`：
- `*.dmg`
- `*-mac.zip`
- `*.exe`
- `*.AppImage` / 其他 Linux 包格式（取决于 electron-builder 实际输出）

## 本地自测流程

如果你的目标是先在本机验证“能否正常启动、能否正常持久化数据、打包后能否运行”，建议按下面顺序执行。

### 1. 开发模式快速验证

先安装依赖，然后直接启动开发环境：

```bash
pnpm install
pnpm dev
```

默认情况下，开发模式会使用独立的 `userData` 目录，避免污染你已安装版本的数据。

如果你希望 `pnpm dev` 临时复用已安装版本的数据，可使用：

```bash
pnpm dev -- --shared-user-data
```

或显式设置环境变量：

```powershell
$env:FREECLI_DEV_USE_SHARED_USER_DATA="1"
pnpm dev
```

如果你希望开发模式使用自定义数据目录：

```powershell
$env:FREECLI_DEV_USER_DATA_DIR="D:\\tmp\\freecli-userdata"
pnpm dev
```

### 2. 本地打包验证

Windows 本地自测推荐：

```bash
pnpm install
pnpm build:win
```

补充说明：

- `pnpm build:win` 在本机 Windows 当前会走三段式本地构建：先用 `signAndEditExecutable=false` 生成 `win-unpacked`，再复用本机已有的 `rcedit-x64.exe` 手动写入 `FreeCli.exe` 的图标与版本资源，最后基于 `--prepackaged dist/win-unpacked` 生成 NSIS 安装包。
- 这样做的原因是：`electron-builder` 内置的 `winCodeSign` 下载/解压在部分 Windows 环境会因为网络超时或符号链接权限不足失败，但这些错误只影响它的内置 `rcedit` 准备步骤，不影响本机已存在的 `rcedit` 工具本身。
- CI 仍会走标准 Windows 构建；如果你需要在本机强制测试 electron-builder 原生链路，可先设置 `FREECLI_WIN_FORCE_STANDARD_BUILD=1` 再执行 `pnpm build:win`。

打包完成后，可用两种方式验证：

- 直接运行 `dist/` 下的安装包（通常是 `*.exe`）
- 或先运行 `pnpm build:unpack`，然后直接启动解包目录中的可执行文件（通常类似 `dist/win-unpacked/FreeCli.exe`）

补充说明：

- Windows 安装包当前使用 `electron-builder` 的 NSIS assisted 安装模式；双击 `dist/*.exe` 后会先进入安装向导，并允许手动选择安装目录。
- 如果你只是本机快速验包，优先直接运行 `dist/win-unpacked/FreeCli.exe`；但必须保留整个 `win-unpacked/` 目录，不能只单独复制一个 `FreeCli.exe`。

macOS / Linux 对应命令：

```bash
pnpm build:mac
pnpm build:linux
```

### 3. 推荐的完整自测顺序

建议使用下面这套顺序，而不是一上来只看打包结果：

1. `pnpm install`
2. `pnpm dev`
3. 在开发模式下验证核心路径：
   - 新建终端 / Agent / Task
   - 关闭并重开应用后能否恢复
   - 持久化终端中的 `codex` / `claude` 是否能被识别
4. `pnpm build:win`（或当前平台对应的 build 命令）
5. 运行安装包或解包目录中的可执行文件，再重复做一次最小 smoke test

## 本地数据与版本升级

### 升级后数据是否会保留

正常情况下，会保留。

打包后的正式应用使用稳定的 `userData` 目录，并将持久化数据库写入该目录下的 `freecli.db`。只要后续升级的还是同一个应用身份，并且你没有手动删除数据目录，本地工作区、画布节点、恢复信息等数据都应继续存在。

### 为什么开发模式和安装版的数据有时不一致

这是刻意设计的：

- `pnpm dev` 默认使用独立的开发数据目录
- 已安装版本使用正式的稳定 `userData` 目录

这样做是为了避免开发调试误伤你真实在用的数据。

如果你确实需要让开发模式复用安装版数据，可以使用前面提到的：

- `pnpm dev -- --shared-user-data`
- `FREECLI_DEV_USE_SHARED_USER_DATA=1`

### 升级或迁移失败时会发生什么

当前实现不会在迁移失败时直接静默覆盖原始数据库：

- 若检测到需要升级 schema，会先备份旧库为 `freecli.db.bak-<timestamp>`
- 若数据库损坏或迁移失败，会将旧库移到 `freecli.db.corrupt-<timestamp>`，然后创建新库继续启动

这保证了“应用尽量还能启动”，同时把旧数据文件留在本地，便于后续排查或手动恢复。

## 发布渠道

本项目当前只区分两个发行渠道：

- 稳定版（内部 channel: `stable`）：给普通用户安装的正式版，使用纯版本 tag，如 `v0.2.0`
- 测试版 / Beta（内部 channel: `nightly`）：给你自己和早期测试者抢先试用的预发布版，继续使用带 `nightly` 后缀的 tag，如 `v0.2.0-nightly.20260312.1`

> [!note]
> “测试版 / Beta”是面向用户和 Release 页面展示的名称；内部仍沿用 `nightly` channel、tag 后缀、`nightly.yml` metadata 和脚本文件名，以兼容已有自动更新链路。

## Fork 后先改哪些配置

如果这是从上游仓库 fork 出来的二开版本，想让应用内自动更新连接到你自己的 GitHub Releases，而不是继续连接上游仓库，至少先改以下配置：

1. `package.json -> build.publish[0].owner`
2. `package.json -> build.publish[0].repo`
3. `package.json -> homepage / bugs.url / repository.url`
4. 建议一并更新 `package.json -> appId / productName / executableName / publisher`

注意：

- 自动更新运行时读取的是 `electron-builder` 发布配置生成的 channel metadata，不是 Git remote。
- 只改本地 `origin` 或 GitHub 仓库地址，不会自动切换应用内更新源。
- `release-manifest` 与 `ReleaseNotesService` 中涉及 GitHub Release / CHANGELOG 的兜底链接，也应同步指向你的仓库。

建议的判断标准：

- 发布测试版 / Beta
  - `main` 上有值得提前验证的新功能、重构或高风险修复
  - 你想先给少量测试者试，不想立刻推荐给所有人
- 发布稳定版
  - 这批改动已经过你自己的实际使用验证
  - `pnpm pre-commit` 全绿
  - 你能清楚说明这次更新为什么值得普通用户安装

## GitHub：打 Tag 自动打包（unsigned）

本仓库已配置 GitHub Actions：当你 push 形如 `v*` 的 tag 时，会自动构建 `macOS / Windows / Linux` 三端产物，并自动创建对应的 GitHub Release。无需手动打包或手动上传产物。上传内容包括：
- macOS 产物（如 `*.dmg`, `*.zip`）
- Windows 产物（如 `*.exe`）
- Linux 产物（如 `*.AppImage`）
- 汇总校验文件 `SHA256SUMS.txt`

其中：

- `v0.2.0` 会创建正式 `stable` release
- `v0.2.0-nightly.20260312.1` 会创建测试版 / Beta prerelease

### 稳定版流程

流程建议：

1) 用脚本准备版本与 changelog 模板

```bash
pnpm release:patch
# 或
pnpm release:minor
# 或显式版本
pnpm release:version 0.2.0
```

2) 填好 `CHANGELOG.md` 新增版本段落
   - 若本次为 `major` 或 `minor` 版本（例如 `0.1.0 -> 0.2.0`、`0.x -> 1.0.0`），必须补一段 `### ✨ Highlights`
   - 若本次为 `patch` 版本（例如 `0.2.0 -> 0.2.1`），不强制要求 `Highlights`
3) 为该 stable 版本补一份结构化 `What's New` manifest：
   - 路径：`build/release-notes/stable/v<version>.json`
   - 要求：至少提供 `en`；若有对外中文体验，则同步补 `zh-CN`
   - 该文件是应用内 `What's New` 的版本真相源；`CHANGELOG.md` 负责历史文档，二者不再互相解析
4) 更新 README 顶部的 `Important Announcement / 重要公告`，用 1-3 句短文概括这次对外想传达的重点
5) 运行 `pnpm pre-commit`
6) 提交 release 准备改动到 `main`
7) 创建并 push tag

```bash
git tag v0.2.0
git push origin main --tags
```

如需先预览下一版而不落盘：

```bash
node scripts/prepare-release.mjs 0.2.0 --dry-run
```

### 测试版 / Beta 流程

测试版默认不改 `package.json` 版本号，也不要求更新 `CHANGELOG.md`。它的作用是把当前 `main` 的某个快照发给测试者。
只有稳定版 release 才需要在仓库里 bump `package.json.version`；测试版只是开发快照，不是新的正式版本承诺。
内部实现仍使用 `nightly` tag 作为兼容协议名。为了让应用内更新检测能正确比较版本，CI 在构建测试版 tag 时会临时把 `package.json.version` 改成对应的 `nightly` tag 版本；这个改动只发生在 CI 构建目录，不会回写仓库。
应用内 `What's New` 不再在运行时抓 GitHub compare；测试版会在构建前自动生成一份版本级 manifest，并嵌入安装包。

推荐流程：

1) 确认当前 `main` 已经推到远端
2) 用当天日期 + 递增序号创建测试版 tag

```bash
git tag v0.2.0-nightly.20260312.1
git push origin v0.2.0-nightly.20260312.1
```

约定建议：

- 同一天第一次测试版用 `.1`
- 同一天第二次测试版用 `.2`
- 如果下一次稳定版准备发 `v0.2.1`，测试版也可以提前切到 `v0.2.1-nightly.20260313.1`

补充说明：

- 稳定版路径可以先运行 `pnpm release:version 0.2.0`，自动更新 `package.json` 和 `CHANGELOG.md` 模板。
- `prepare-release` 会在 `major / minor` 版本自动插入 `✨ Highlights` 模板；`patch` 版本不会插入。
- 测试版路径不需要运行 release 准备脚本；只要 push 合规 tag，CI 就会自动打包并发布 GitHub prerelease。
- 如需手动覆写某个测试版的应用内 `What's New`，可新增 `build/release-notes/nightly/v<version>.json`；存在时会优先于自动生成结果。
- Auto Update 依赖 release assets 中的 channel metadata（如 `latest.yml` / `nightly.yml`），GitHub Actions 会随构建一起上传。
- 构建命令会自动生成 `release/release-manifest.json`，并将其嵌入安装包，同时作为 GitHub Release asset 上传。

## 测试版定时发布（每天 04:00 北京时间）

仓库提供一个定时任务：每天北京时间 `04:00` 自动从 `main` 打包并发布最新测试版（GitHub prerelease）。

- Workflow: `.github/workflows/nightly.yml`
- Tag 形如：`v<package.json.version>-nightly.<YYYYMMDD>.<N>`

## 未签名/未公证的安装说明（给用户）

当前 Release 构建未做 Apple Developer ID 签名/公证，macOS 可能会拦截首次打开。

可选处理方式：
- Finder：右键 App → 打开 → 再次确认
- 或终端（拷贝到 Applications 后）：`xattr -dr com.apple.quarantine /Applications/FreeCli.app`

## 后续启用签名 + 公证（可选）

当你开通 Apple Developer Program 后，可以在 CI 中注入签名证书与 notarize 凭据，让 Release 自动完成签名与公证。
