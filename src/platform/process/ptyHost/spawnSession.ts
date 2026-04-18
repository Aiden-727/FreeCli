import process from 'node:process'
import type { PtyHostSpawnRequest } from './protocol'

export interface PtySpawnOptions {
  cwd: string
  env: NodeJS.ProcessEnv
  cols: number
  rows: number
  name: string
  useConpty?: boolean
  useConptyDll?: boolean
}

type PtySpawnLike<TPty> = (command: string, args: string[], options: PtySpawnOptions) => TPty

function buildBaseSpawnOptions(request: PtyHostSpawnRequest): PtySpawnOptions {
  return {
    cwd: request.cwd,
    env: request.env,
    cols: request.cols,
    rows: request.rows,
    name: 'xterm-256color',
  }
}

export function buildPreferredPtySpawnOptions(
  request: PtyHostSpawnRequest,
  platform: NodeJS.Platform = process.platform,
): PtySpawnOptions {
  const base = buildBaseSpawnOptions(request)
  if (platform !== 'win32') {
    return base
  }

  return {
    ...base,
    useConpty: true,
    useConptyDll: true,
  }
}

export function createPtySession<TPty>(
  spawnPty: PtySpawnLike<TPty>,
  request: PtyHostSpawnRequest,
  platform: NodeJS.Platform = process.platform,
): TPty {
  const preferredOptions = buildPreferredPtySpawnOptions(request, platform)

  if (platform !== 'win32') {
    return spawnPty(request.command, request.args, preferredOptions)
  }

  try {
    return spawnPty(request.command, request.args, preferredOptions)
  } catch {
    // Some Windows packaging layouts may miss the bundled conpty.dll. Fall back to the
    // default node-pty behavior instead of breaking terminal startup entirely.
    return spawnPty(request.command, request.args, buildBaseSpawnOptions(request))
  }
}
