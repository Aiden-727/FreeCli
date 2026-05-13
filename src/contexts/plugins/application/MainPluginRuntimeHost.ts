import type { BuiltinPluginId } from '../domain/pluginManifest'

export interface MainPluginRuntime {
  activate(): Promise<void> | void
  deactivate(): Promise<void> | void
}

export type MainPluginRuntimeFactory = () => MainPluginRuntime

export class MainPluginRuntimeHost {
  private readonly runtimeFactories: Partial<Record<BuiltinPluginId, MainPluginRuntimeFactory>>
  private readonly activeRuntimes = new Map<BuiltinPluginId, MainPluginRuntime>()

  constructor(runtimeFactories: Partial<Record<BuiltinPluginId, MainPluginRuntimeFactory>> = {}) {
    this.runtimeFactories = runtimeFactories
  }

  async syncEnabledPlugins(enabledPluginIds: BuiltinPluginId[]): Promise<BuiltinPluginId[]> {
    const nextEnabled = new Set(enabledPluginIds)
    const runtimesToDeactivate = [...this.activeRuntimes.entries()].filter(
      ([pluginId]) => !nextEnabled.has(pluginId),
    )

    await this.runSerial(runtimesToDeactivate, async ([pluginId, runtime]) => {
      await runtime.deactivate()
      this.activeRuntimes.delete(pluginId)
    })

    const pluginIdsToActivate = enabledPluginIds.filter(pluginId => {
      if (this.activeRuntimes.has(pluginId)) {
        return false
      }

      return Boolean(this.runtimeFactories[pluginId])
    })

    await this.runSerial(pluginIdsToActivate, async pluginId => {
      const runtimeFactory = this.runtimeFactories[pluginId]
      if (!runtimeFactory) {
        return
      }

      const runtime = runtimeFactory()
      try {
        await runtime.activate()
      } catch (error) {
        await Promise.resolve(runtime.deactivate()).catch(() => {
          // Best-effort rollback: a failed activation must not leave the runtime hanging.
        })
        throw error
      }
      this.activeRuntimes.set(pluginId, runtime)
    })

    return [...this.activeRuntimes.keys()]
  }

  async dispose(): Promise<void> {
    await this.runSerial(
      [...this.activeRuntimes.entries()].reverse(),
      async ([pluginId, runtime]) => {
        await runtime.deactivate()
        this.activeRuntimes.delete(pluginId)
      },
    )
  }

  private async runSerial<T>(items: readonly T[], task: (item: T) => Promise<void>): Promise<void> {
    await items.reduce<Promise<void>>(
      (chain, item) => chain.then(() => task(item)),
      Promise.resolve(),
    )
  }
}
