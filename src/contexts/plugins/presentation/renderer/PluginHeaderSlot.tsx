import React, { Suspense, useMemo } from 'react'
import type { BuiltinPluginId } from '../../domain/pluginManifest'
import { getHeaderPluginWidget } from './pluginContributionRegistry'

const HEADER_WIDGET_ORDER: Record<BuiltinPluginId, number> = {
  'system-monitor': 10,
  'oss-backup': 20,
  'quota-monitor': 30,
  'workspace-assistant': 40,
  'input-stats': 50,
  'git-worklog': 60,
}

export function PluginHeaderSlot({
  enabledPluginIds,
  onOpenPluginManager,
  onToggleWorkspaceAssistant,
}: {
  enabledPluginIds: BuiltinPluginId[]
  onOpenPluginManager: (pageId?: BuiltinPluginId | 'general') => void
  onToggleWorkspaceAssistant?: () => void
}): React.JSX.Element | null {
  const widgets = useMemo(
    () =>
      enabledPluginIds
        .map(pluginId => ({
          pluginId,
          Component: getHeaderPluginWidget(pluginId),
        }))
        .filter(
          (
            entry,
          ): entry is {
            pluginId: BuiltinPluginId
            Component: NonNullable<ReturnType<typeof getHeaderPluginWidget>>
          } => entry.Component !== null,
        )
        .sort((a, b) => HEADER_WIDGET_ORDER[a.pluginId] - HEADER_WIDGET_ORDER[b.pluginId]),
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
            onToggleWorkspaceAssistant={onToggleWorkspaceAssistant}
          />
        </Suspense>
      ))}
    </>
  )
}
