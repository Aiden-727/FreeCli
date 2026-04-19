# FreeCli

FreeCli is a spatial workspace for AI coding workflows.

It keeps agents, terminals, tasks, and notes on one infinite canvas so you can run parallel work without losing context.

`FreeCli` is the new public home of the project previously developed as `OpenCove`.

[Releases](https://github.com/Aiden-727/FreeCli/releases) | [中文说明](./README_ZH.md) | [Contributing](./CONTRIBUTING.md) | [Support](./SUPPORT.md)

## What FreeCli Solves

Traditional AI coding workflows usually break down in three places:

- Context gets buried inside long chat history and scattered terminal tabs.
- Parallel sessions are hard to compare and easy to lose track of.
- Tasks, execution, and notes live in different tools with no shared spatial memory.

FreeCli treats the workspace itself as the interface:

- Agents stay visible.
- Terminals stay inspectable.
- Tasks stay attached to execution.
- Notes stay next to the work they describe.

## Core Capabilities

- Infinite canvas workspace for terminals, agents, tasks, and notes
- Built for `Claude Code`, `Codex`, and similar terminal-native agent workflows
- Persistent workspace state across restarts
- Search across canvas content and terminal output
- Space archives for revisiting previous workspace states
- Directory and Git worktree isolation for multi-project work
- Native Electron desktop app for macOS, Windows, and Linux

## When To Use It

FreeCli is a good fit if you want to:

- run multiple agent sessions side by side
- keep a task and its execution context in one place
- preserve layout and state between sessions
- inspect terminal output without hiding the rest of your workflow

## Install

Prebuilt binaries are published on the [GitHub Releases](https://github.com/Aiden-727/FreeCli/releases) page.

Current builds are still early-stage and may include stable or beta artifacts.

### macOS Note

Current macOS builds are not signed or notarized. If Gatekeeper blocks the app:

```bash
xattr -dr com.apple.quarantine /Applications/FreeCli.app
```

## Build From Source

### Requirements

- Node.js `>= 22`
- pnpm `>= 9`

### Run Locally

```bash
git clone https://github.com/Aiden-727/FreeCli.git
cd FreeCli
pnpm install
pnpm dev
```

### Build Packages

```bash
pnpm build:mac
pnpm build:win
pnpm build:linux
```

Detailed packaging notes are in [docs/RELEASING.md](./docs/RELEASING.md).

## Release Model

- Stable releases use tags like `v0.0.1`
- Beta releases use tags like `v0.0.2-nightly.20260418.1`
- The beta channel keeps the existing `nightly` tag suffix and update metadata for compatibility
- Pushing a `v*` tag triggers the GitHub Release workflow

## Tech Stack

- Electron
- React
- TypeScript
- `@xyflow/react`
- `xterm.js`
- `node-pty`
- Vitest
- Playwright

## Repository Notes

- Public repository: `https://github.com/Aiden-727/FreeCli`
- The repo ignores local build outputs and sensitive local config by default
- `build-resources/` is treated as local build output and is not tracked

## Contributing

See:

- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- [SECURITY.md](./SECURITY.md)

## License

Released under the [MIT License](./LICENSE).
