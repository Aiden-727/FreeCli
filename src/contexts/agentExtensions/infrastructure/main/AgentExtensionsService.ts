import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import type {
  AddAgentMcpServerInput,
  AgentExtensionProviderId,
  AgentExtensionSummary,
  AgentMcpServerEntry,
  AgentSkillEntry,
  CreateAgentSkillInput,
  CreateAgentSkillResult,
  GetAgentExtensionsInput,
  GetAgentExtensionsResult,
  RemoveAgentMcpServerInput,
} from '@shared/contracts/dto'
import { resolveAgentCliInvocation } from '../../../agent/infrastructure/cli/AgentCliInvocation'

const execFileAsync = promisify(execFile)

interface ProviderPaths {
  configPath: string | null
  skillsDirectoryPath: string
}

function resolveProviderPaths(provider: AgentExtensionProviderId): ProviderPaths {
  const userHome = homedir()

  if (provider === 'codex') {
    return {
      configPath: join(userHome, '.codex', 'config.toml'),
      skillsDirectoryPath: join(userHome, '.codex', 'skills'),
    }
  }

  return {
    configPath: join(userHome, '.claude.json'),
    skillsDirectoryPath: join(userHome, '.claude', 'skills'),
  }
}

async function fileExists(path: string | null): Promise<boolean> {
  if (!path) {
    return false
  }

  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const result = await stat(path)
    return result.isDirectory()
  } catch {
    return false
  }
}

async function resolveCliAvailable(provider: AgentExtensionProviderId): Promise<boolean> {
  try {
    const invocation = await resolveAgentCliInvocation({
      command: provider === 'codex' ? 'codex' : 'claude',
      args: ['--help'],
    })

    await execFileAsync(invocation.command, invocation.args, {
      windowsHide: true,
      timeout: 10_000,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    })

    return true
  } catch {
    return false
  }
}

function parseCodexMcpListOutput(stdout: string): AgentMcpServerEntry[] {
  const lines = stdout
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)

  const entries: AgentMcpServerEntry[] = []
  let readingHttpTable = false

  for (const line of lines) {
    if (line.startsWith('Name') && line.includes('Url')) {
      readingHttpTable = true
      continue
    }

    if (line.startsWith('Name') && line.includes('Command')) {
      readingHttpTable = false
      continue
    }

    if (line.startsWith('-')) {
      continue
    }

    const parts = line.split(/\s{2,}/).map(part => part.trim()).filter(Boolean)
    if (readingHttpTable) {
      if (parts.length < 4) {
        continue
      }

      entries.push({
        name: parts[0] ?? '',
        enabled: (parts[3] ?? '').toLowerCase() === 'enabled',
        transport: 'http',
        command: null,
        args: [],
        url: parts[1] ?? null,
        env: {},
        source: 'cli',
      })
      continue
    }

    if (parts.length < 6) {
      continue
    }

    const [name, command, argsCell, , , status] = parts

    entries.push({
      name: name ?? '',
      enabled: (status ?? '').toLowerCase() === 'enabled',
      transport: 'stdio',
      command: command === '-' ? null : (command ?? null),
      args:
        argsCell && argsCell !== '-'
          ? argsCell
              .split(/\s+/)
              .map(item => item.trim())
              .filter(Boolean)
          : [],
      url: null,
      env: {},
      source: 'cli',
    })
  }

  return entries
}

function parseClaudeMcpConfig(raw: string): AgentMcpServerEntry[] {
  try {
    const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> }
    const servers = parsed.mcpServers
    if (!servers || typeof servers !== 'object') {
      return []
    }

    return Object.entries(servers).flatMap(([name, value]) => {
      if (!value || typeof value !== 'object') {
        return []
      }

      const record = value as Record<string, unknown>
      const command = typeof record.command === 'string' ? record.command.trim() : ''
      const args = Array.isArray(record.args)
        ? record.args.filter((item): item is string => typeof item === 'string')
        : []
      const url = typeof record.url === 'string' ? record.url.trim() : ''
      const env =
        record.env && typeof record.env === 'object'
          ? Object.fromEntries(
              Object.entries(record.env as Record<string, unknown>).flatMap(([key, current]) =>
                typeof current === 'string' ? [[key, current]] : [],
              ),
            )
          : {}

      return [
        {
          name,
          enabled: true,
          transport: url.length > 0 ? 'http' : command.length > 0 ? 'stdio' : 'unknown',
          command: command.length > 0 ? command : null,
          args,
          url: url.length > 0 ? url : null,
          env,
          source: 'file' as const,
        },
      ]
    })
  } catch {
    return []
  }
}

async function listSkills(skillsDirectoryPath: string): Promise<AgentSkillEntry[]> {
  if (!(await directoryExists(skillsDirectoryPath))) {
    return []
  }

  const entries = await readdir(skillsDirectoryPath, { withFileTypes: true })
  const skills = await Promise.all(
    entries
      .filter(entry => entry.isDirectory())
      .map(async entry => {
        const fullPath = join(skillsDirectoryPath, entry.name)
        const hasSkillManifest = await fileExists(join(fullPath, 'SKILL.md'))

        return {
          name: entry.name,
          path: fullPath,
          hasSkillManifest,
        } satisfies AgentSkillEntry
      }),
  )

  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

async function listCodexMcpServers(): Promise<AgentMcpServerEntry[]> {
  const invocation = await resolveAgentCliInvocation({
    command: 'codex',
    args: ['mcp', 'list'],
  })
  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    windowsHide: true,
    timeout: 15_000,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })

  return parseCodexMcpListOutput(stdout)
}

async function listClaudeMcpServers(configPath: string | null): Promise<AgentMcpServerEntry[]> {
  if (!(await fileExists(configPath))) {
    return []
  }

  const raw = await readFile(configPath as string, 'utf8')
  return parseClaudeMcpConfig(raw)
}

export async function getAgentExtensions(
  input: GetAgentExtensionsInput,
): Promise<GetAgentExtensionsResult> {
  const paths = resolveProviderPaths(input.provider)
  const cliAvailable = await resolveCliAvailable(input.provider)

  const summary: AgentExtensionSummary = {
    provider: input.provider,
    scope: input.scope,
    skillsDirectoryPath: paths.skillsDirectoryPath,
    configPath: (await fileExists(paths.configPath)) ? paths.configPath : null,
    cliAvailable,
    supportsMcpWrite: input.provider === 'codex' ? cliAvailable : true,
    supportsSkillWrite: true,
  }

  const [mcpServers, skills] = await Promise.all([
    input.provider === 'codex' && cliAvailable
      ? listCodexMcpServers()
      : listClaudeMcpServers(paths.configPath),
    listSkills(paths.skillsDirectoryPath),
  ])

  return {
    summary,
    mcpServers,
    skills,
  }
}

function normalizeEnvEntries(env: Record<string, string> | undefined): string[] {
  if (!env) {
    return []
  }

  return Object.entries(env)
    .filter(([key, value]) => key.trim().length > 0 && value.trim().length > 0)
    .flatMap(([key, value]) => ['--env', `${key}=${value}`])
}

async function addCodexMcpServer(input: AddAgentMcpServerInput): Promise<void> {
  const baseArgs = ['mcp', 'add', input.name]

  if (input.transport === 'http') {
    baseArgs.push('--url', input.url?.trim() ?? '')
  } else {
    baseArgs.push(...normalizeEnvEntries(input.env))
    baseArgs.push('--', input.command?.trim() ?? '')
    baseArgs.push(...(input.args ?? []).map(item => item.trim()).filter(Boolean))
  }

  const invocation = await resolveAgentCliInvocation({
    command: 'codex',
    args: baseArgs,
  })

  await execFileAsync(invocation.command, invocation.args, {
    windowsHide: true,
    timeout: 20_000,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
}

async function upsertClaudeMcpServer(input: AddAgentMcpServerInput): Promise<void> {
  const paths = resolveProviderPaths('claude-code')
  const configPath = paths.configPath ?? join(homedir(), '.claude.json')
  const current = (await fileExists(configPath))
    ? JSON.parse(await readFile(configPath, 'utf8'))
    : {}

  const mcpServers =
    current && typeof current === 'object' && current.mcpServers && typeof current.mcpServers === 'object'
      ? { ...(current.mcpServers as Record<string, unknown>) }
      : {}

  mcpServers[input.name] =
    input.transport === 'http'
      ? {
          url: input.url?.trim() ?? '',
        }
      : {
          command: input.command?.trim() ?? '',
          args: (input.args ?? []).map(item => item.trim()).filter(Boolean),
          env: Object.fromEntries(
            Object.entries(input.env ?? {}).filter(
              ([key, value]) => key.trim().length > 0 && value.trim().length > 0,
            ),
          ),
        }

  const next = {
    ...(current && typeof current === 'object' ? current : {}),
    mcpServers,
  }

  await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

export async function addAgentMcpServer(input: AddAgentMcpServerInput): Promise<void> {
  if (input.provider === 'codex') {
    await addCodexMcpServer(input)
    return
  }

  await upsertClaudeMcpServer(input)
}

async function removeCodexMcpServer(input: RemoveAgentMcpServerInput): Promise<void> {
  const invocation = await resolveAgentCliInvocation({
    command: 'codex',
    args: ['mcp', 'remove', input.name],
  })

  await execFileAsync(invocation.command, invocation.args, {
    windowsHide: true,
    timeout: 20_000,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
}

async function removeClaudeMcpServer(input: RemoveAgentMcpServerInput): Promise<void> {
  const paths = resolveProviderPaths('claude-code')
  const configPath = paths.configPath
  if (!(await fileExists(configPath))) {
    return
  }

  const current = JSON.parse(await readFile(configPath as string, 'utf8')) as Record<string, unknown>
  const servers =
    current.mcpServers && typeof current.mcpServers === 'object'
      ? { ...(current.mcpServers as Record<string, unknown>) }
      : {}

  delete servers[input.name]

  const next = {
    ...current,
    mcpServers: servers,
  }

  await writeFile(configPath as string, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
}

export async function removeAgentMcpServer(input: RemoveAgentMcpServerInput): Promise<void> {
  if (input.provider === 'codex') {
    await removeCodexMcpServer(input)
    return
  }

  await removeClaudeMcpServer(input)
}

function sanitizeSkillName(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
}

function buildSkillTemplate(name: string): string {
  return `---\nname: \"${name}\"\ndescription: \"\"\n---\n\n# ${name}\n\n`
}

export async function createAgentSkill(
  input: CreateAgentSkillInput,
): Promise<CreateAgentSkillResult> {
  const paths = resolveProviderPaths(input.provider)
  const normalizedName = sanitizeSkillName(input.name)
  const skillPath = resolve(paths.skillsDirectoryPath, normalizedName)
  const skillFilePath = join(skillPath, 'SKILL.md')

  await mkdir(skillPath, { recursive: true })
  if (!(await fileExists(skillFilePath))) {
    await writeFile(skillFilePath, buildSkillTemplate(normalizedName), 'utf8')
  }

  return {
    skill: {
      name: basename(skillPath),
      path: skillPath,
      hasSkillManifest: true,
    },
  }
}
