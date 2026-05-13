import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const projectDir = process.cwd()

function resolvePackageJson(packageName) {
  return require.resolve(`${packageName}/package.json`, { paths: [projectDir] })
}

function getNodePtyPrebuildDir() {
  const nodePtyPackageJsonPath = resolvePackageJson('node-pty')
  return path.join(path.dirname(nodePtyPackageJsonPath), 'prebuilds', `${process.platform}-${process.arch}`)
}

function getNativeModulesToRebuild() {
  const modules = ['better-sqlite3']

  // `node-pty` ships bundled prebuilds on Windows/macOS, but `electron-builder
  // install-app-deps` doesn't detect that layout and falls back to node-gyp on
  // Windows. Only rebuild when the current platform has no bundled prebuild.
  if (!existsSync(getNodePtyPrebuildDir())) {
    modules.push('node-pty')
  }

  return modules
}

async function loadElectronRebuild() {
  const electronBuilderPackageJsonPath = resolvePackageJson('electron-builder')
  const electronBuilderRequire = createRequire(electronBuilderPackageJsonPath)
  const rebuildModulePath = electronBuilderRequire.resolve('@electron/rebuild')
  return import(pathToFileURL(rebuildModulePath).href)
}

async function main() {
  const electronPackageJsonPath = resolvePackageJson('electron')
  const electronPackageJson = require(electronPackageJsonPath)
  const nativeModules = getNativeModulesToRebuild()
  const { rebuild } = await loadElectronRebuild()

  await rebuild({
    buildPath: projectDir,
    electronVersion: electronPackageJson.version,
    arch: process.arch,
    onlyModules: nativeModules,
    mode: process.platform === 'win32' ? 'sequential' : 'parallel',
  })
}

main().catch((error) => {
  process.stderr.write('[postinstall] Failed to rebuild Electron native modules.\n')
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
