<div align="center">

# FreeCli 🌌

**An infinite canvas for Claude Code, Codex, terminals, tasks, and notes.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)]()
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)]()
[![简体中文](https://img.shields.io/badge/Language-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-blue)](./README_ZH.md)

Keep every agent, terminal, task, and note on one infinite canvas.

See parallel work at a glance, keep context visible, and resume exactly where you left off.

FreeCli is the new public home of the project formerly developed as `OpenCove`. The current release, issue, and security entry points are all maintained in this repository.

[Download the latest builds](https://github.com/Aiden-727/FreeCli/releases) · [Read the Chinese README](./README_ZH.md)

<img src="./assets/images/opencove_header_readme.jpg" alt="FreeCli Header" width="100%" />

</div>

## 📖 What is FreeCli?

FreeCli is a **spatial development workspace** for people who work with AI coding agents every day.

Instead of burying work inside tabs, sidebars, and long chat threads, FreeCli puts your **AI agents**, **terminals**, **tasks**, and **notes** on the same infinite 2D canvas, so the full state of your work stays visible.

It is built for workflows like:

- Running multiple `Claude Code` or `Codex` sessions side by side
- Keeping task plans, notes, and terminal output in one shared workspace
- Switching projects without losing layout, context, or execution history

<img src="./assets/images/opencove_app_preview_readme.jpg" alt="FreeCli App Preview" width="100%" />

## ✨ Highlights

- **🌌 Infinite spatial canvas**: Arrange terminals, notes, tasks, and agent sessions the way you actually think.
- **🤖 Built for CLI agents**: Optimized for `Claude Code`, `Codex`, and similar terminal-native agent workflows.
- **🧠 Context stays visible**: Planning, execution, and results live together instead of getting buried in linear chat history.
- **💾 Persistent workspaces**: Restore your viewport, layout, terminal output, and agent state after restarts.
- **🗂️ Space archives**: Snapshot and revisit previous workspace states when you need to jump back into old contexts.
- **🖼️ Rich media and smart layouts**: Paste images, multi-select nodes, use label colors, and tidy messy boards quickly.
- **🔍 Global search and control center**: Search across the canvas and terminal output, then manage active sessions from one place.
- **🗂️ Workspace isolation**: Separate projects cleanly with directories and git worktrees.

## 🧭 Concept Guide

Several entry points in FreeCli look similar at first glance, but they solve different problems:

| Entry | What it creates | Starts a process immediately | Has built-in agent semantics | Bound to a task | Best for |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **New Terminal** | A plain terminal window | Yes | No | No | You just want a shell and full command freedom |
| **Persistent terminal + manually run `codex` / `claude`** | A plain terminal window that can be recognized as a hosted CLI agent | The terminal starts immediately; the agent starts when you type the command | Partially | No | You prefer to control the command yourself but still want basic recovery and status tracking |
| **Run Agent** | A native agent window | Yes | Yes | No | You want a standalone managed agent session right away |
| **New Task** | A task card | No | No | The task itself is the record | You want to capture scope, title, priority, and tags before execution |
| **Task -> Run Agent** | A task card plus an agent window linked to it | Yes | Yes | Yes | You want execution to stay attached to a task and preserve that relationship |

### How should you think about Terminal vs Agent?

- A **terminal** is a general execution container. You can run anything in it, and FreeCli does not assume it is an AI session.
- An **agent** also runs on terminal infrastructure, but FreeCli manages it as a first-class object with `provider`, `model`, `prompt`, and resumable session semantics.
- In other words, `Run Agent` is not just "a terminal with a nicer title". It is a system-managed agent session.

### Is a persistent terminal basically the same as `Run Agent`?

**Not exactly, although the experience can be close in some workflows.**

- If you open a terminal, enable **persistence**, and then manually run `codex` or `claude`, FreeCli will try to recognize it as a hosted CLI agent.
- That usually gives you basic status tracking, recovery behavior, model-aware titles, and agent-style actions such as copying the last message.
- But it is still fundamentally a `terminal`, not a native `agent` window created by the system.

A simple rule of thumb:

- **I just want a shell**: use `New Terminal`
- **I want to type the agent command myself, but still want FreeCli to track it**: use a `persistent terminal`
- **I want FreeCli to launch and manage the session for me**: use `Run Agent`
- **I want execution to stay anchored to a work item**: use `New Task`, then `Run Agent` from the task

### One important difference

Today, "persistent terminal + manual agent CLI" is best understood as a **tracked terminal session**, not as a full replacement for a native agent window.

That means it can be good enough for many workflows, but if you need:

- system-owned prompt and model semantics
- explicit task linkage
- clearer session semantics
- the most predictable system-managed behavior

then `Run Agent` or `Task -> Run Agent` is the better fit.

## 💡 Why FreeCli?

FreeCli is designed around a simple idea: **agent workflows are easier to reason about when context is spatial, not hidden**.

| Pain Point (Traditional) | The FreeCli Workspace |
| :--- | :--- |
| **Linear amnesia**: context disappears into long chat histories. | **Spatial context**: important tasks, notes, and execution stay visible on the canvas. |
| **Single-pane bottlenecks**: tabs and split panes force constant context switching. | **Parallel execution**: compare and monitor multiple agents without losing your place. |
| **Opaque automation**: background agent work feels like a black box. | **Transparent actions**: terminals and side effects stay visible while work is happening. |

## 🚀 Getting Started

*FreeCli is currently in Alpha. We recommend it for early adopters and power users who want to explore spatial AI workflows.*

### Download

Prebuilt binaries are available on the [GitHub Releases](https://github.com/Aiden-727/FreeCli/releases) page.

At the moment, most public builds are **nightly / prerelease builds**, which means:

- You get the newest features first
- You should expect rough edges
- Feedback and bug reports are especially valuable

Downloads are available for macOS, Windows, and Linux.

> **⚠️ macOS note**
> Current macOS builds are **not signed or notarized** with an Apple Developer ID. If Gatekeeper blocks the app, run this in your terminal:
> ```bash
> xattr -dr com.apple.quarantine /Applications/FreeCli.app
> ```

### Building from Source

#### Prerequisites
- Node.js `>= 22`
- pnpm `>= 9`
- (Recommended) Globally install `Claude Code` or `Codex` to experience full agent workflows.

#### Build Instructions

```bash
# 1. Clone the repository
git clone https://github.com/Aiden-727/FreeCli.git
cd freecli

# 2. Install dependencies
pnpm install

# 3. Start the dev environment
pnpm dev
```

> See [RELEASING.md](docs/RELEASING.md) for more packager and build documentation.

## 🏗️ Technical Architecture

FreeCli is built with modern, high-performance web standards:

- **Framework**: Electron + React + TypeScript (via `electron-vite`)
- **Canvas Engine**: `@xyflow/react` for buttery smooth infinite canvas interactions.
- **Underlying Terminal**: `xterm.js` and `node-pty` powering full-fledged PTY runtimes.
- **Testing**: `Vitest` and `Playwright` for robust unit and E2E regression testing.

## 🤝 Contributing

FreeCli is open source. We need your help to define what the IDE of the AI intelligence era should look like.
Read our guidelines below:

- [Contributing Guidelines (CONTRIBUTING.md)](./CONTRIBUTING.md)
- [Code of Conduct (CODE_OF_CONDUCT.md)](./CODE_OF_CONDUCT.md)
- [Support (SUPPORT.md)](./SUPPORT.md)

## 💬 Community Group

Scan the QR code below to join the FreeCli community group and chat with other users.

<div align="center">
  <img src="./assets/images/opencove_qrcode.png" alt="FreeCli Community Group QR Code" width="320" />
</div>

---

<div align="center">

<p>Redefining dev environments for the modern web.<br>Built with ❤️ by the FreeCli Team.</p>

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

</div>
