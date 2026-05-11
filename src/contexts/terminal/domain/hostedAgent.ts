import type { AgentLaunchMode, AgentProviderId } from '@shared/contracts/dto'

export type HostedTerminalAgentProvider = Extract<AgentProviderId, 'claude-code' | 'codex'>

export type HostedTerminalAgentState = 'active' | 'inactive' | 'unavailable'

export interface HostedTerminalAgent {
  bindingId?: string
  provider: HostedTerminalAgentProvider
  launchMode: AgentLaunchMode
  resumeSessionId: string | null
  resumeSessionIdVerified?: boolean
  model?: string | null
  effectiveModel?: string | null
  reasoningEffort?: string | null
  displayModelLabel?: string | null
  cwd: string
  command: string
  startedAt: string
  restoreIntent: boolean
  state: HostedTerminalAgentState
}

export interface ParsedHostedTerminalAgentCommand {
  provider: HostedTerminalAgentProvider
  launchMode: AgentLaunchMode
  resumeSessionId: string | null
  model: string | null
  command: string
}

const SUPPORTED_EXECUTABLES = new Map<string, HostedTerminalAgentProvider>([
  ['claude', 'claude-code'],
  ['claude.exe', 'claude-code'],
  ['claude.cmd', 'claude-code'],
  ['claude.bat', 'claude-code'],
  ['codex', 'codex'],
  ['codex.exe', 'codex'],
  ['codex.cmd', 'codex'],
  ['codex.bat', 'codex'],
])

function normalizeExecutableToken(token: string): string {
  const normalized = token.trim().replaceAll('\\', '/')
  const lastSlashIndex = normalized.lastIndexOf('/')
  return (lastSlashIndex >= 0 ? normalized.slice(lastSlashIndex + 1) : normalized).toLowerCase()
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function buildHostedTerminalDisplayModelLabel(input: {
  effectiveModel?: string | null
  reasoningEffort?: string | null
}): string | null {
  const effectiveModel = normalizeOptionalString(input.effectiveModel)
  if (!effectiveModel) {
    return null
  }

  const reasoningEffort = normalizeOptionalString(input.reasoningEffort)
  return reasoningEffort ? `${effectiveModel} ${reasoningEffort}` : effectiveModel
}

function tokenizeCommand(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of command) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escaping) {
    current += '\\'
  }

  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

function extractNamedOptionValue(tokens: string[], optionNames: readonly string[]): string | null {
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index] ?? ''

    for (const optionName of optionNames) {
      if (token === optionName) {
        return normalizeOptionalString(tokens[index + 1] ?? null)
      }

      const prefix = `${optionName}=`
      if (token.startsWith(prefix)) {
        return normalizeOptionalString(token.slice(prefix.length))
      }
    }
  }

  return null
}

function parseClaudeCommand(tokens: string[], command: string): ParsedHostedTerminalAgentCommand {
  let explicitResumeSessionId: string | null = null
  let launchMode: AgentLaunchMode = 'new'
  const model = extractNamedOptionValue(tokens, ['--model', '-m'])

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index] ?? ''
    if (token === '--resume') {
      launchMode = 'resume'
      explicitResumeSessionId = normalizeOptionalString(tokens[index + 1] ?? null)
      break
    }

    if (token.startsWith('--resume=')) {
      launchMode = 'resume'
      explicitResumeSessionId = normalizeOptionalString(token.slice('--resume='.length))
      break
    }

    if (token === '--continue') {
      launchMode = 'resume'
    }
  }

  return {
    provider: 'claude-code',
    launchMode,
    resumeSessionId: explicitResumeSessionId,
    model,
    command,
  }
}

function parseCodexCommand(tokens: string[], command: string): ParsedHostedTerminalAgentCommand {
  const model = extractNamedOptionValue(tokens, ['--model', '-m'])

  for (let index = 1; index < tokens.length; index += 1) {
    if (tokens[index] !== 'resume') {
      continue
    }

    return {
      provider: 'codex',
      launchMode: 'resume',
      resumeSessionId: normalizeOptionalString(tokens[index + 1] ?? null),
      model,
      command,
    }
  }

  return {
    provider: 'codex',
    launchMode: 'new',
    resumeSessionId: null,
    model,
    command,
  }
}

export function parseHostedTerminalAgentCommand(
  rawCommand: string,
): ParsedHostedTerminalAgentCommand | null {
  const command = rawCommand.trim()
  if (command.length === 0) {
    return null
  }

  const tokens = tokenizeCommand(command)
  if (tokens.length === 0) {
    return null
  }

  const provider = SUPPORTED_EXECUTABLES.get(normalizeExecutableToken(tokens[0] ?? '')) ?? null
  if (!provider) {
    return null
  }

  if (provider === 'claude-code') {
    return parseClaudeCommand(tokens, command)
  }

  return parseCodexCommand(tokens, command)
}

export function buildHostedTerminalAgentResumeCommand(binding: {
  provider: HostedTerminalAgentProvider
  resumeSessionId: string | null
}): string | null {
  const resumeSessionId = normalizeOptionalString(binding.resumeSessionId)
  if (!resumeSessionId) {
    return null
  }

  if (binding.provider === 'claude-code') {
    return `claude --resume ${resumeSessionId}`
  }

  return `codex resume ${resumeSessionId}`
}
