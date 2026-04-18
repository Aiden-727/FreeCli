import React, { Suspense, useMemo } from 'react'
import type { BuiltinPluginId } from '../../domain/pluginManifest'
import { getControlCenterPluginWidget } from './pluginContributionRegistry'

export function PluginControlCenterSlot({
  enabledPluginIds,
  onOpenPluginManager,
}: {
  enabledPluginIds: BuiltinPluginId[]
  onOpenPluginManager: (pageId?: BuiltinPluginId | 'general') => void
}): React.JSX.Element | null {
  const widgets = useMemo(
    () =>
      enabledPluginIds
        .map(pluginId => ({
          pluginId,
          Component: getControlCenterPluginWidget(pluginId),
        }))
        .filter(
          (
            entry,
          ): entry is {
            pluginId: BuiltinPluginId
            Component: NonNullable<ReturnType<typeof getControlCenterPluginWidget>>
          } => entry.Component !== null,
        ),
    [enabledPluginIds],
  )

  if (widgets.length === 0) {
    return null
  }

  return (
    <>
      {widgets.map(({ pluginId, Component }) => (
        <Suspense key={pluginId} fallback={null}>
          <Component onOpenPluginManager={onOpenPluginManager} />
        </Suspense>
      ))}
    </>
  )
}
