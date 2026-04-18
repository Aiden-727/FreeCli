import type { TerminalRuntimeKind } from '@shared/contracts/dto'

const POSIX_SINGLE_QUOTE_ESCAPE = `'"'"'`

type TerminalDropShellFlavor = 'powershell' | 'posix' | 'windows'

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value)
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/')
}

function convertWindowsPathForWsl(value: string): string {
  const driveMatch = value.match(/^([A-Za-z]):(?:[\\/](.*))?$/)
  if (!driveMatch) {
    return value
  }

  const drive = driveMatch[1]?.toLowerCase() ?? ''
  const rest = normalizeSlashes(driveMatch[2] ?? '').replace(/^\/+/, '')
  return rest.length > 0 ? `/mnt/${drive}/${rest}` : `/mnt/${drive}`
}

function convertWindowsPathForMsysBash(value: string): string {
  const driveMatch = value.match(/^([A-Za-z]):(?:[\\/](.*))?$/)
  if (!driveMatch) {
    return value
  }

  const drive = driveMatch[1]?.toLowerCase() ?? ''
  const rest = normalizeSlashes(driveMatch[2] ?? '').replace(/^\/+/, '')
  return rest.length > 0 ? `/${drive}/${rest}` : `/${drive}`
}

function resolveShellFlavor({
  profileId,
  runtimeKind,
}: {
  profileId?: string | null
  runtimeKind?: TerminalRuntimeKind
}): TerminalDropShellFlavor {
  const normalizedProfileId = typeof profileId === 'string' ? profileId.trim().toLowerCase() : ''

  if (
    normalizedProfileId === 'powershell' ||
    normalizedProfileId === 'pwsh' ||
    normalizedProfileId.startsWith('powershell:') ||
    normalizedProfileId.startsWith('pwsh:')
  ) {
    return 'powershell'
  }

  if (
    normalizedProfileId.startsWith('wsl:') ||
    normalizedProfileId.startsWith('bash:') ||
    runtimeKind === 'wsl' ||
    runtimeKind === 'posix'
  ) {
    return 'posix'
  }

  return runtimeKind === 'windows' ? 'windows' : 'posix'
}

function quotePowerShellArgument(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function quotePosixArgument(value: string): string {
  return `'${value.replace(/'/g, POSIX_SINGLE_QUOTE_ESCAPE)}'`
}

function quoteWindowsArgument(value: string): string {
  const requiresQuoting = /[\s"&|<>^()%!]/.test(value)
  if (!requiresQuoting) {
    return value
  }

  return `"${value.replace(/"/g, '\\"')}"`
}

function normalizePathForShell({
  path,
  profileId,
  runtimeKind,
}: {
  path: string
  profileId?: string | null
  runtimeKind?: TerminalRuntimeKind
}): string {
  const normalizedProfileId = typeof profileId === 'string' ? profileId.trim().toLowerCase() : ''

  if (normalizedProfileId.startsWith('wsl:') || runtimeKind === 'wsl') {
    return convertWindowsPathForWsl(path)
  }

  if (normalizedProfileId.startsWith('bash:') && isWindowsDrivePath(path)) {
    return convertWindowsPathForMsysBash(path)
  }

  return path
}

export function isFileDropTransfer(transfer: DataTransfer | null | undefined): boolean {
  if (!transfer) {
    return false
  }

  if (transfer.files.length > 0) {
    return true
  }

  if (transfer.items.length > 0) {
    return Array.from(transfer.items).some(item => item.kind === 'file')
  }

  return Array.from(transfer.types).includes('Files')
}

export function buildTerminalDropPasteText({
  paths,
  profileId,
  runtimeKind,
}: {
  paths: readonly string[]
  profileId?: string | null
  runtimeKind?: TerminalRuntimeKind
}): string {
  const shellFlavor = resolveShellFlavor({ profileId, runtimeKind })

  return paths
    .map(path => path.trim())
    .filter(path => path.length > 0)
    .map(path => normalizePathForShell({ path, profileId, runtimeKind }))
    .map(path => {
      if (shellFlavor === 'powershell') {
        return quotePowerShellArgument(path)
      }

      if (shellFlavor === 'windows') {
        return quoteWindowsArgument(path)
      }

      return quotePosixArgument(path)
    })
    .join(' ')
}

export function toTerminalDropErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'unknown error'
}
