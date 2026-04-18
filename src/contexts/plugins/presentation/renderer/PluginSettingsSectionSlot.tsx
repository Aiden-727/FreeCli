import React, { Suspense, useMemo } from 'react'
import type { BuiltinPluginId } from '../../domain/pluginManifest'
import { getSettingsPluginSection } from './pluginContributionRegistry'
import type { SettingsPluginSectionProps } from './types'

export function PluginSettingsSectionSlot({
  pluginIds,
  settings,
  onChange,
  onFlushPersistNow,
}: {
  pluginIds: BuiltinPluginId[]
  settings: SettingsPluginSectionProps['settings']
  onChange: SettingsPluginSectionProps['onChange']
  onFlushPersistNow?: SettingsPluginSectionProps['onFlushPersistNow']
}): React.JSX.Element | null {
  const sections = useMemo(
    () =>
      pluginIds
        .map(pluginId => ({
          pluginId,
          Component: getSettingsPluginSection(pluginId),
        }))
        .filter(
          (
            entry,
          ): entry is {
            pluginId: BuiltinPluginId
            Component: NonNullable<ReturnType<typeof getSettingsPluginSection>>
          } => entry.Component !== null,
        ),
    [pluginIds],
  )

  if (sections.length === 0) {
    return null
  }

  return (
    <>
      {sections.map(({ pluginId, Component }) => (
        <Suspense key={pluginId} fallback={null}>
          <Component
            settings={settings}
            onChange={onChange}
            onFlushPersistNow={onFlushPersistNow}
          />
        </Suspense>
      ))}
    </>
  )
}
