# FreeCli

FreeCli 是一个面向 AI Coding 工作流的空间化工作台。

它把 Agent、终端、任务和笔记放到同一张无限画布中，让你在并行工作时依然能看清上下文。

`FreeCli` 是原 `OpenCove` 项目的新公开仓库名称。

[版本发布](https://github.com/Aiden-727/FreeCli/releases) | [English README](./README.md) | [贡献指南](./CONTRIBUTING.md) | [支持说明](./SUPPORT.md)

## FreeCli 解决什么问题

传统 AI 编程工作流通常会在三个地方失控：

- 上下文被埋进很长的聊天记录和终端标签页里
- 多个会话难以并排比较，也很难持续跟踪
- 任务、执行和笔记分散在不同工具里，缺少统一工作现场

FreeCli 把“工作空间本身”做成了界面：

- Agent 始终可见
- 终端始终可查
- 任务和执行链路保持绑定
- 笔记放在工作现场旁边

## 核心能力

- 无限画布工作区，可承载终端、Agent、任务和笔记
- 面向 `Claude Code`、`Codex` 等终端式 Agent 工作流优化
- 工作区状态可持久恢复
- 支持搜索画布内容与终端输出
- 支持空间归档与回放
- 支持目录隔离和 Git Worktree 隔离
- 基于 Electron 的 macOS、Windows、Linux 桌面应用

## 适合什么场景

如果你希望：

- 并排运行多个 Agent 会话
- 让任务和执行上下文放在一起
- 关闭重开后仍保留现场
- 查看终端输出时不丢失全局视图

那 FreeCli 会比较适合你。

## 下载

预编译安装包发布在 [GitHub Releases](https://github.com/Aiden-727/FreeCli/releases)。

当前版本仍处于早期阶段，公开产物可能包含稳定版或测试版。

### macOS 说明

当前 macOS 构建没有签名和公证。如果 Gatekeeper 阻止打开：

```bash
xattr -dr com.apple.quarantine /Applications/FreeCli.app
```

## 从源码运行

### 环境要求

- Node.js `>= 22`
- pnpm `>= 9`

### 本地启动

```bash
git clone https://github.com/Aiden-727/FreeCli.git
cd FreeCli
pnpm install
pnpm dev
```

### 打包命令

```bash
pnpm build:mac
pnpm build:win
pnpm build:linux
```

更详细的打包与发版说明见 [docs/RELEASING.md](./docs/RELEASING.md)。

## 发布规则

- 稳定版使用 `v0.0.1` 这种 tag
- 测试版使用 `v0.0.2-nightly.20260418.1` 这种 tag
- 测试版内部继续沿用 `nightly` tag 后缀与更新元数据，以兼容现有发布链路
- 推送 `v*` tag 后会自动触发 GitHub Release 工作流

## 应用更新与发版摘要

- 自动更新依赖 `electron-builder` 生成并上传到 GitHub Releases 的更新元数据，例如 `latest.yml`、`nightly.yml`
- 应用内 `What's New` 说明来自 `release-manifest.json` 与 `build/release-notes/*`，它只负责展示更新内容，不负责判断是否有新版本
- 桌面端支持 `off / prompt / auto` 三种更新策略，以及 `stable / beta` 两种更新通道；界面里的“测试版”内部仍映射到 `nightly`

### Fork 后先改什么

如果你是从自己的 fork 发版，至少先检查这些字段：

- `package.json -> build.publish[0].owner`
- `package.json -> build.publish[0].repo`
- `package.json -> homepage / bugs.url / repository.url`
- 建议同步更新：`appId / productName / executableName / publisher`

### 稳定版发版

当版本已经可以作为公开推荐安装的正式基线时，使用稳定版：

```bash
pnpm release:patch
git add .
git commit -m "chore: release 0.0.2"
git tag v0.0.2
git push origin main --tags
```

发 tag 前至少确认：

- `package.json.version` 已是目标版本
- `CHANGELOG.md` 已更新
- `build/release-notes/stable/v<version>.json` 已存在
- 本地至少验证过一个目标平台打包

### 测试版发版

当你要验证自动更新链路，或者先给测试用户体验时，使用测试版：

先生成下一个可用的 nightly tag：

```bash
pnpm release:nightly:tag
```

```bash
git tag v0.0.2-nightly.20260418.1
git push origin v0.0.2-nightly.20260418.1
```

- 测试版通常不需要修改 `package.json.version`
- 测试版通常不需要更新 `CHANGELOG.md`
- 当前 nightly 工作流只保留手动触发路径；需要测试版时，手动 push nightly tag 或在 GitHub Actions 页面手动触发
- 如果当前工作区很脏，记住测试版永远是基于“某个已提交并已推送的 commit”构建，不会直接打包未提交文件

### 如何验证自动更新

推荐按下面的顺序验证：

1. 先安装一个已发布的旧版本。
2. 再发布一个更高版本的稳定版或测试版。
3. 在旧版本里手动执行“检查更新”。
4. 确认能正确检测、下载并提示安装。

## 技术栈

- Electron
- React
- TypeScript
- `@xyflow/react`
- `xterm.js`
- `node-pty`
- Vitest
- Playwright

## 仓库说明

- 公开仓库地址：`https://github.com/Aiden-727/FreeCli`
- 仓库默认忽略本地构建产物和敏感本地配置
- `build-resources/` 被视为本地构建输出，不纳入版本管理

## 参与贡献

请参考：

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)

## 许可证

本项目基于 [MIT License](./LICENSE) 发布。
