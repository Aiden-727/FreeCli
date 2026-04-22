import React, { Suspense, useMemo } from 'react'
import type { BuiltinPluginId } from '../../domain/pluginManifest'
import { getWorkspaceOverlayPluginWidget } from './pluginContributionRegistry'
import type { WorkspaceOverlayPluginWidgetProps } from './types'

export function PluginWorkspaceOverlaySlot({
  enabledPluginIds,
  onOpenPluginManager,
  onShowMessage,
  activeWorkspaceId,
}: {
  enabledPluginIds: BuiltinPluginId[]
  onOpenPluginManager: WorkspaceOverlayPluginWidgetProps['onOpenPluginManager']
  onShowMessage: WorkspaceOverlayPluginWidgetProps['onShowMessage']
  activeWorkspaceId: string | null
}): React.JSX.Element | null {
  const widgets = useMemo(
    () =>
      enabledPluginIds
        .map(pluginId => ({
          pluginId,
          Component: getWorkspaceOverlayPluginWidget(pluginId),
        }))
        .filter(
          (
            entry,
          ): entry is {
            pluginId: BuiltinPluginId
            Component: NonNullable<ReturnType<typeof getWorkspaceOverlayPluginWidget>>
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
          <Component
            onOpenPluginManager={onOpenPluginManager}
            onShowMessage={onShowMessage}
            activeWorkspaceId={activeWorkspaceId}
          />
        </Suspense>
      ))}
    </>
  )
}
