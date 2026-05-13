import type { IpcRegistrationDisposable } from './types'
import { registerAgentIpcHandlers } from '../../../contexts/agent/presentation/main-ipc/register'
import { registerPtyIpcHandlers } from '../../../contexts/terminal/presentation/main-ipc/register'
import { createPtyRuntime } from '../../../contexts/terminal/presentation/main-ipc/runtime'
import { registerTaskIpcHandlers } from '../../../contexts/task/presentation/main-ipc/register'
import { registerAgentExtensionsIpcHandlers } from '../../../contexts/agentExtensions/presentation/main-ipc/register'
import { registerClipboardIpcHandlers } from '../../../contexts/clipboard/presentation/main-ipc/register'
import { registerWorkspaceIpcHandlers } from '../../../contexts/workspace/presentation/main-ipc/register'
import { createApprovedWorkspaceStore } from '../../../contexts/workspace/infrastructure/approval/ApprovedWorkspaceStore'
import { resolve } from 'node:path'
import { registerWorktreeIpcHandlers } from '../../../contexts/worktree/presentation/main-ipc/register'
import { registerIntegrationIpcHandlers } from '../../../contexts/integration/presentation/main-ipc/register'
import { registerPluginIpcHandlers } from '../../../contexts/plugins/presentation/main-ipc/register'
import { registerAppUpdateIpcHandlers } from '../../../contexts/update/presentation/main-ipc/register'
import { createAppUpdateService } from '../../../contexts/update/infrastructure/main/AppUpdateService'
import { registerReleaseNotesIpcHandlers } from '../../../contexts/releaseNotes/presentation/main-ipc/register'
import { createReleaseNotesService } from '../../../contexts/releaseNotes/infrastructure/main/ReleaseNotesService'
import { registerFilesystemIpcHandlers } from '../../../contexts/filesystem/presentation/main-ipc/register'
import { app } from 'electron'
import type { PersistenceStore } from '../../../platform/persistence/sqlite/PersistenceStore'
import { createPersistenceStore } from '../../../platform/persistence/sqlite/PersistenceStore'
import { registerPersistenceIpcHandlers } from '../../../platform/persistence/sqlite/ipc/register'
import { registerWindowChromeIpcHandlers } from './registerWindowChromeIpcHandlers'
import { registerWindowMetricsIpcHandlers } from './registerWindowMetricsIpcHandlers'
import { registerAppLifecycleIpcHandlers } from './registerAppLifecycleIpcHandlers'
import { writeUserDataResetMarker } from '../userDataReset'

export type { IpcRegistrationDisposable } from './types'

function resolveAppVersion(): string {
  const appWithVersion = app as unknown as { getVersion?: () => string }
  if (typeof appWithVersion.getVersion !== 'function') {
    return 'unknown'
  }

  try {
    const version = appWithVersion.getVersion()
    return typeof version === 'string' && version.trim().length > 0 ? version : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function registerIpcHandlers(deps?: {
  ptyRuntime?: ReturnType<typeof createPtyRuntime>
  approvedWorkspaces?: ReturnType<typeof createApprovedWorkspaceStore>
  requestRestart?: () => boolean
  clearUserDataAndRestart?: () => Promise<void>
}): IpcRegistrationDisposable {
  const ptyRuntime = deps?.ptyRuntime ?? createPtyRuntime()
  const approvedWorkspaces = deps?.approvedWorkspaces ?? createApprovedWorkspaceStore()
  const appUpdateService = createAppUpdateService()
  const releaseNotesService = createReleaseNotesService()
  const dbPath = resolve(app.getPath('userData'), 'freecli.db')

  let persistenceStorePromise: Promise<PersistenceStore> | null = null
  const getPersistenceStore = async (): Promise<PersistenceStore> => {
    if (persistenceStorePromise) {
      return await persistenceStorePromise
    }

    const nextStorePromise = createPersistenceStore({ dbPath }).catch(error => {
      if (persistenceStorePromise === nextStorePromise) {
        persistenceStorePromise = null
      }

      throw error
    })
    persistenceStorePromise = nextStorePromise
    return await persistenceStorePromise
  }

  if (process.env.NODE_ENV === 'test' && process.env.FREECLI_TEST_WORKSPACE) {
    void approvedWorkspaces.registerRoot(resolve(process.env.FREECLI_TEST_WORKSPACE))
  }

  const disposables: IpcRegistrationDisposable[] = [
    registerClipboardIpcHandlers(),
    registerAppLifecycleIpcHandlers({
      requestRestart: deps?.requestRestart,
      clearUserDataAndRestart:
        deps?.clearUserDataAndRestart ??
        (async () => {
          await writeUserDataResetMarker(app.getPath('userData'))
          ;(deps?.requestRestart ?? (() => false))()
        }),
    }),
    registerAppUpdateIpcHandlers(appUpdateService),
    registerReleaseNotesIpcHandlers(releaseNotesService),
    registerWorkspaceIpcHandlers(approvedWorkspaces),
    registerFilesystemIpcHandlers(approvedWorkspaces),
    registerPersistenceIpcHandlers(getPersistenceStore),
    registerWorktreeIpcHandlers(approvedWorkspaces),
    registerIntegrationIpcHandlers(approvedWorkspaces),
    registerPluginIpcHandlers(approvedWorkspaces, getPersistenceStore, {
      appVersion: resolveAppVersion(),
      dbPath,
      userDataPath: app.getPath('userData'),
    }),
    registerWindowChromeIpcHandlers(),
    registerWindowMetricsIpcHandlers(),
    registerPtyIpcHandlers(ptyRuntime, approvedWorkspaces),
    registerAgentIpcHandlers(ptyRuntime, approvedWorkspaces),
    registerAgentExtensionsIpcHandlers(),
    registerTaskIpcHandlers(approvedWorkspaces),
  ]

  return {
    dispose: async () => {
      await disposables.reduceRight<Promise<void>>(async (previous, disposable) => {
        await previous
        await Promise.resolve(disposable?.dispose())
      }, Promise.resolve())

      const storePromise = persistenceStorePromise
      persistenceStorePromise = null
      try {
        const store = await storePromise
        store?.dispose()
      } catch {
        // ignore
      }
    },
  }
}
