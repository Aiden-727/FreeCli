import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { shell } from 'electron'
import type { WorkspacePathOpener, WorkspacePathOpenerId } from '../../../../shared/contracts/dto'

const execFileAsync = promisify(execFile)

type ResolvedWorkspacePathOpener = WorkspacePathOpener & {
  open: (path: string) => Promise<void>
}

type MacApplicationWorkspacePathOpenerCandidate = WorkspacePathOpener & {
  applications: readonly string[]
}

type CommandWorkspacePathOpenerCandidate = WorkspacePathOpener & {
  commands: readonly string[]
  buildInvocation?: (
    path: string,
    command: string,
  ) => {
    command: string
    args: string[]
    cwd?: string
    shell?: boolean
  }
}

const MAC_APPLICATION_OPENERS: readonly MacApplicationWorkspacePathOpenerCandidate[] = [
  { id: 'vscode', label: 'VS Code', applications: ['Visual Studio Code'] },
  { id: 'cursor', label: 'Cursor', applications: ['Cursor'] },
  { id: 'windsurf', label: 'Windsurf', applications: ['Windsurf'] },
  { id: 'zed', label: 'Zed', applications: ['Zed'] },
  { id: 'antigravity', label: 'Antigravity', applications: ['Antigravity'] },
  {
    id: 'vscode-insiders',
    label: 'VS Code Insiders',
    applications: ['Visual Studio Code - Insiders'],
  },
  { id: 'vscodium', label: 'VSCodium', applications: ['VSCodium'] },
  {
    id: 'intellij-idea',
    label: 'IntelliJ IDEA',
    applications: ['IntelliJ IDEA', 'IntelliJ IDEA CE'],
  },
  { id: 'fleet', label: 'Fleet', applications: ['Fleet'] },
  { id: 'android-studio', label: 'Android Studio', applications: ['Android Studio'] },
  { id: 'xcode', label: 'Xcode', applications: ['Xcode'] },
  { id: 'pycharm', label: 'PyCharm', applications: ['PyCharm', 'PyCharm CE'] },
  { id: 'webstorm', label: 'WebStorm', applications: ['WebStorm'] },
  { id: 'goland', label: 'GoLand', applications: ['GoLand'] },
  { id: 'clion', label: 'CLion', applications: ['CLion'] },
  { id: 'phpstorm', label: 'PhpStorm', applications: ['PhpStorm'] },
  { id: 'rubymine', label: 'RubyMine', applications: ['RubyMine'] },
  { id: 'datagrip', label: 'DataGrip', applications: ['DataGrip'] },
  { id: 'rider', label: 'Rider', applications: ['Rider'] },
  { id: 'sublime-text', label: 'Sublime Text', applications: ['Sublime Text'] },
  { id: 'nova', label: 'Nova', applications: ['Nova'] },
  { id: 'bbedit', label: 'BBEdit', applications: ['BBEdit'] },
  { id: 'textmate', label: 'TextMate', applications: ['TextMate'] },
  { id: 'coteditor', label: 'CotEditor', applications: ['CotEditor'] },
  { id: 'terminal', label: 'Terminal', applications: ['Terminal'] },
  { id: 'iterm', label: 'iTerm', applications: ['iTerm'] },
  { id: 'warp', label: 'Warp', applications: ['Warp'] },
  { id: 'ghostty', label: 'Ghostty', applications: ['Ghostty'] },
]

const WINDOWS_PRIMARY_TERMINAL_CANDIDATES: readonly CommandWorkspacePathOpenerCandidate[] = [
  {
    id: 'terminal',
    label: 'Windows Terminal',
    commands: ['wt'],
    buildInvocation: (path, command) => ({
      command: 'cmd.exe',
      args: ['/C', 'start', '', '/D', path, command, '-d', path],
    }),
  },
  {
    id: 'terminal',
    label: 'PowerShell',
    commands: ['powershell.exe', 'powershell', 'pwsh.exe', 'pwsh'],
    buildInvocation: (path, command) => ({
      command: 'cmd.exe',
      args: ['/C', 'start', '', '/D', path, command],
    }),
  },
  {
    id: 'terminal',
    label: 'Command Prompt',
    commands: ['cmd.exe', 'cmd'],
    buildInvocation: path => ({
      command: 'cmd.exe',
      args: ['/C', 'start', '', '/D', path, 'cmd.exe'],
    }),
  },
]

const WINDOWS_COMMAND_OPENERS: readonly CommandWorkspacePathOpenerCandidate[] = [
  { id: 'vscode', label: 'VS Code', commands: ['code'] },
  { id: 'cursor', label: 'Cursor', commands: ['cursor'] },
  { id: 'windsurf', label: 'Windsurf', commands: ['windsurf'] },
  { id: 'zed', label: 'Zed', commands: ['zed'] },
  { id: 'vscode-insiders', label: 'VS Code Insiders', commands: ['code-insiders'] },
  { id: 'vscodium', label: 'VSCodium', commands: ['codium'] },
  { id: 'intellij-idea', label: 'IntelliJ IDEA', commands: ['idea64.exe', 'idea.exe', 'idea'] },
  { id: 'fleet', label: 'Fleet', commands: ['fleet'] },
  {
    id: 'android-studio',
    label: 'Android Studio',
    commands: ['studio64.exe', 'studio.exe', 'studio'],
  },
  { id: 'pycharm', label: 'PyCharm', commands: ['pycharm64.exe', 'pycharm.exe', 'pycharm'] },
  {
    id: 'webstorm',
    label: 'WebStorm',
    commands: ['webstorm64.exe', 'webstorm.exe', 'webstorm'],
  },
  { id: 'goland', label: 'GoLand', commands: ['goland64.exe', 'goland.exe', 'goland'] },
  { id: 'clion', label: 'CLion', commands: ['clion64.exe', 'clion.exe', 'clion'] },
  { id: 'phpstorm', label: 'PhpStorm', commands: ['phpstorm64.exe', 'phpstorm.exe', 'phpstorm'] },
  {
    id: 'rubymine',
    label: 'RubyMine',
    commands: ['rubymine64.exe', 'rubymine.exe', 'rubymine'],
  },
  {
    id: 'datagrip',
    label: 'DataGrip',
    commands: ['datagrip64.exe', 'datagrip.exe', 'datagrip'],
  },
  { id: 'rider', label: 'Rider', commands: ['rider64.exe', 'rider.exe', 'rider'] },
  { id: 'sublime-text', label: 'Sublime Text', commands: ['subl.exe', 'subl'] },
]

const LINUX_PRIMARY_TERMINAL_CANDIDATES: readonly CommandWorkspacePathOpenerCandidate[] = [
  {
    id: 'terminal',
    label: 'Terminal',
    commands: ['xdg-terminal-exec'],
    buildInvocation: (path, command) => ({ command, args: [`--dir=${path}`] }),
  },
  {
    id: 'terminal',
    label: 'GNOME Console',
    commands: ['kgx'],
    buildInvocation: (path, command) => ({ command, args: [`--working-directory=${path}`] }),
  },
  {
    id: 'terminal',
    label: 'GNOME Terminal',
    commands: ['gnome-terminal'],
    buildInvocation: (path, command) => ({ command, args: [`--working-directory=${path}`] }),
  },
  {
    id: 'terminal',
    label: 'Konsole',
    commands: ['konsole'],
    buildInvocation: (path, command) => ({ command, args: ['--workdir', path] }),
  },
  {
    id: 'terminal',
    label: 'Xfce Terminal',
    commands: ['xfce4-terminal'],
    buildInvocation: (path, command) => ({ command, args: [`--working-directory=${path}`] }),
  },
  {
    id: 'terminal',
    label: 'WezTerm',
    commands: ['wezterm'],
    buildInvocation: (path, command) => ({ command, args: ['start', '--cwd', path] }),
  },
]

const LINUX_COMMAND_OPENERS: readonly CommandWorkspacePathOpenerCandidate[] = [
  { id: 'vscode', label: 'VS Code', commands: ['code'] },
  { id: 'cursor', label: 'Cursor', commands: ['cursor'] },
  { id: 'windsurf', label: 'Windsurf', commands: ['windsurf'] },
  { id: 'zed', label: 'Zed', commands: ['zed'] },
  { id: 'vscode-insiders', label: 'VS Code Insiders', commands: ['code-insiders'] },
  { id: 'vscodium', label: 'VSCodium', commands: ['codium'] },
  { id: 'intellij-idea', label: 'IntelliJ IDEA', commands: ['idea'] },
  { id: 'fleet', label: 'Fleet', commands: ['fleet'] },
  { id: 'android-studio', label: 'Android Studio', commands: ['studio.sh', 'studio'] },
  { id: 'pycharm', label: 'PyCharm', commands: ['pycharm'] },
  { id: 'webstorm', label: 'WebStorm', commands: ['webstorm'] },
  { id: 'goland', label: 'GoLand', commands: ['goland'] },
  { id: 'clion', label: 'CLion', commands: ['clion'] },
  { id: 'phpstorm', label: 'PhpStorm', commands: ['phpstorm'] },
  { id: 'rubymine', label: 'RubyMine', commands: ['rubymine'] },
  { id: 'datagrip', label: 'DataGrip', commands: ['datagrip'] },
  { id: 'rider', label: 'Rider', commands: ['rider'] },
  { id: 'sublime-text', label: 'Sublime Text', commands: ['subl'] },
]

function getSystemFileManagerLabel(): string {
  if (process.platform === 'win32') {
    return 'Explorer'
  }

  if (process.platform === 'linux') {
    return 'File Manager'
  }

  return 'Finder'
}

async function openWithSystemFileManager(path: string): Promise<void> {
  const error = await shell.openPath(path)
  if (error.trim().length > 0) {
    throw new Error(error)
  }
}

async function isMacApplicationAvailable(application: string): Promise<boolean> {
  try {
    await execFileAsync('open', ['-Ra', application])
    return true
  } catch {
    return false
  }
}

async function resolveMacApplication(applications: readonly string[]): Promise<string | null> {
  const availability = await Promise.all(
    applications.map(async application => ({
      application,
      available: await isMacApplicationAvailable(application),
    })),
  )

  return availability.find(result => result.available)?.application ?? null
}

async function resolveMacApplicationOpener(
  candidate: MacApplicationWorkspacePathOpenerCandidate,
): Promise<ResolvedWorkspacePathOpener | null> {
  const application = await resolveMacApplication(candidate.applications)
  if (!application) {
    return null
  }

  return {
    id: candidate.id,
    label: candidate.label,
    open: async path => {
      await execFileAsync('open', ['-a', application, path])
    },
  }
}

async function isCommandAvailable(command: string): Promise<boolean> {
  const probeCommand = process.platform === 'win32' ? 'where.exe' : 'which'

  try {
    await execFileAsync(probeCommand, [command])
    return true
  } catch {
    return false
  }
}

async function resolveCommand(commands: readonly string[]): Promise<string | null> {
  const availability = await Promise.all(
    commands.map(async command => ({
      command,
      available: await isCommandAvailable(command),
    })),
  )

  return availability.find(result => result.available)?.command ?? null
}

async function launchDetachedProcess(
  command: string,
  args: string[],
  options: { cwd?: string; shell?: boolean } = {},
): Promise<void> {
  await new Promise<void>((resolveLaunch, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell ?? false,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })

    const handleError = (error: Error) => {
      reject(error)
    }

    const handleSpawn = () => {
      child.removeListener('error', handleError)
      child.unref()
      resolveLaunch()
    }

    child.once('error', handleError)
    child.once('spawn', handleSpawn)
  })
}

async function launchCommand(
  command: string,
  args: string[],
  options: { cwd?: string; shell?: boolean } = {},
): Promise<void> {
  if (process.platform === 'win32' && command.toLowerCase() !== 'cmd.exe') {
    await launchDetachedProcess('cmd.exe', [
      '/C',
      'start',
      '',
      '/D',
      options.cwd ?? process.cwd(),
      command,
      ...args,
    ])
    return
  }

  await launchDetachedProcess(command, args, options)
}

async function resolveCommandOpener(
  candidate: CommandWorkspacePathOpenerCandidate,
): Promise<ResolvedWorkspacePathOpener | null> {
  const command = await resolveCommand(candidate.commands)
  if (!command) {
    return null
  }

  return {
    id: candidate.id,
    label: candidate.label,
    open: async path => {
      const invocation = candidate.buildInvocation?.(path, command) ?? {
        command,
        args: [path],
        cwd: process.platform === 'win32' ? path : undefined,
      }

      await launchCommand(invocation.command, invocation.args, {
        cwd: invocation.cwd,
        shell: invocation.shell,
      })
    },
  }
}

async function resolvePlatformOpeners(): Promise<ResolvedWorkspacePathOpener[]> {
  const fileManagerOpener: ResolvedWorkspacePathOpener = {
    id: 'finder',
    label: getSystemFileManagerLabel(),
    open: openWithSystemFileManager,
  }

  if (process.platform === 'darwin') {
    const applicationOpeners = await Promise.all(
      MAC_APPLICATION_OPENERS.map(resolveMacApplicationOpener),
    )

    return [
      fileManagerOpener,
      ...applicationOpeners.filter(
        (candidate): candidate is ResolvedWorkspacePathOpener => candidate !== null,
      ),
    ]
  }

  if (process.platform === 'win32') {
    const primaryTerminal = await resolveFirstAvailableCommandOpener(
      WINDOWS_PRIMARY_TERMINAL_CANDIDATES,
    )
    const commandOpeners = await Promise.all(WINDOWS_COMMAND_OPENERS.map(resolveCommandOpener))

    return [
      fileManagerOpener,
      ...(primaryTerminal ? [primaryTerminal] : []),
      ...commandOpeners.filter(
        (candidate): candidate is ResolvedWorkspacePathOpener => candidate !== null,
      ),
    ]
  }

  if (process.platform === 'linux') {
    const primaryTerminal = await resolveFirstAvailableCommandOpener(
      LINUX_PRIMARY_TERMINAL_CANDIDATES,
    )
    const commandOpeners = await Promise.all(LINUX_COMMAND_OPENERS.map(resolveCommandOpener))

    return [
      fileManagerOpener,
      ...(primaryTerminal ? [primaryTerminal] : []),
      ...commandOpeners.filter(
        (candidate): candidate is ResolvedWorkspacePathOpener => candidate !== null,
      ),
    ]
  }

  return []
}

async function resolveFirstAvailableCommandOpener(
  candidates: readonly CommandWorkspacePathOpenerCandidate[],
): Promise<ResolvedWorkspacePathOpener | null> {
  const resolvedCandidates = await Promise.all(candidates.map(resolveCommandOpener))
  return resolvedCandidates.find(candidate => candidate !== null) ?? null
}

export async function listAvailableWorkspacePathOpeners(): Promise<WorkspacePathOpener[]> {
  const openers = await resolvePlatformOpeners()
  return openers.map(({ id, label }) => ({ id, label }))
}

export async function openWorkspacePath(
  path: string,
  openerId: WorkspacePathOpenerId,
): Promise<void> {
  const opener =
    (await resolvePlatformOpeners()).find(candidate => candidate.id === openerId) ?? null
  if (!opener) {
    throw new Error('Unsupported path opener')
  }

  await opener.open(path)
}
