import { existsSync } from 'fs'
import { resolve } from 'path'

function resolveIconCandidates(baseDir: string, platform: NodeJS.Platform): string[] {
  const rootBuildDir = resolve(baseDir, '../../build')
  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
      ? process.resourcesPath
      : null

  if (platform === 'win32') {
    return [
      resolve(rootBuildDir, 'icon.ico'),
      resolve(rootBuildDir, 'icon.png'),
      ...(resourcesPath
        ? [resolve(resourcesPath, 'icon.ico'), resolve(resourcesPath, 'icon.png')]
        : []),
    ]
  }

  return [
    resolve(rootBuildDir, 'icon.png'),
    ...(resourcesPath ? [resolve(resourcesPath, 'icon.png')] : []),
  ]
}

export function resolveRuntimeIconPath(
  baseDir: string = __dirname,
  platform: NodeJS.Platform = process.platform,
): string | null {
  return resolveIconCandidates(baseDir, platform).find(candidate => existsSync(candidate)) ?? null
}
