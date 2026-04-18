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

当前版本仍处于早期阶段，公开产物可能包含 prerelease 或 nightly 版本。

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

- Stable 版本使用 `v0.0.1` 这种 tag
- Nightly 版本使用 `v0.0.2-nightly.20260418.1` 这种 tag
- 推送 `v*` tag 后会自动触发 GitHub Release 工作流

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
