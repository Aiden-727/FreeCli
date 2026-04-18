import type { BuiltinPluginId } from '../../domain/pluginManifest'
import type { MainPluginRuntimeFactory } from '../../application/MainPluginRuntimeHost'

const BUILTIN_PLUGIN_RUNTIME_FACTORIES: Partial<Record<BuiltinPluginId, MainPluginRuntimeFactory>> =
  {}

export function getBuiltinPluginRuntimeFactory(
  pluginId: BuiltinPluginId,
): MainPluginRuntimeFactory | null {
  return BUILTIN_PLUGIN_RUNTIME_FACTORIES[pluginId] ?? null
}

export function getBuiltinPluginRuntimeFactories(): Partial<
  Record<BuiltinPluginId, MainPluginRuntimeFactory>
> {
  return { ...BUILTIN_PLUGIN_RUNTIME_FACTORIES }
}
