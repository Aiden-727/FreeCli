import { existsSync } from 'fs'
import { resolve } from 'path'

function resolveIconCandidates(baseDir: string, platform: NodeJS.Platform): string[] {
  const rootBuildDir = resolve(baseDir, '../../build')

  if (platform === 'win32') {
    return [resolve(rootBuildDir, 'icon.ico'), resolve(rootBuildDir, 'icon.png')]
  }

  return [resolve(rootBuildDir, 'icon.png')]
}

export function resolveRuntimeIconPath(
  baseDir: string = __dirname,
  platform: NodeJS.Platform = process.platform,
): string | null {
  return resolveIconCandidates(baseDir, platform).find(candidate => existsSync(candidate)) ?? null
}
