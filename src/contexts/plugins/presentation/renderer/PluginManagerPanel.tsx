import React from 'react'
import { useTranslation } from '@app/renderer/i18n'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import { listBuiltinPluginManifests, type BuiltinPluginId } from '../../domain/pluginManifest'
import { SettingsPanelNavButton } from '../../../settings/presentation/renderer/settingsPanel/SettingsPanelNavButton'
import { PluginSettingsSectionSlot } from './PluginSettingsSectionSlot'
import type { PluginHostDiagnosticItem } from './types'

type PluginManagerPageId = 'general' | BuiltinPluginId

export function PluginManagerPanel({
  isOpen,
  initialPageId = 'general',
  settings,
  diagnostics = [],
  onChange,
  onFlushPersistNow,
  onClose,
}: {
  isOpen: boolean
  initialPageId?: PluginManagerPageId
  settings: AgentSettings
  diagnostics?: PluginHostDiagnosticItem[]
  onChange: (settings: AgentSettings) => void
  onFlushPersistNow?: () => void
  onClose: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const restoreFocusRef = React.useRef<HTMLElement | null>(null)
  const initialFocusRef = React.useRef<HTMLButtonElement | null>(null)
  const [activePageId, setActivePageId] = React.useState<PluginManagerPageId>('general')

  const availablePlugins = React.useMemo(
    () =>
      listBuiltinPluginManifests().map(manifest => ({
        ...manifest,
        title: t(manifest.titleKey),
        description: t(manifest.descriptionKey),
        enabled: settings.plugins.enabledIds.includes(manifest.id),
      })),
    [settings.plugins.enabledIds, t],
  )

  const enabledPluginIds = React.useMemo(
    () => availablePlugins.filter(plugin => plugin.enabled).map(plugin => plugin.id),
    [availablePlugins],
  )

  const activePlugin = React.useMemo(
    () =>
      activePageId === 'general'
        ? null
        : (availablePlugins.find(plugin => plugin.id === activePageId && plugin.enabled) ?? null),
    [activePageId, availablePlugins],
  )

  const updatePluginEnabled = React.useCallback(
    (pluginId: BuiltinPluginId, enabled: boolean): void => {
      const enabledIds = settings.plugins.enabledIds.filter(id => id !== pluginId)
      const nextEnabledIds = enabled ? [...enabledIds, pluginId] : enabledIds
      onChange({
        ...settings,
        plugins: {
          ...settings.plugins,
          enabledIds: nextEnabledIds,
        },
      })
    },
    [onChange, settings],
  )

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    setActivePageId(initialPageId)
  }, [initialPageId, isOpen])

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    window.setTimeout(() => {
      initialFocusRef.current?.focus()
    }, 0)

    return () => {
      const focusTarget = restoreFocusRef.current
      restoreFocusRef.current = null
      if (focusTarget && document.contains(focusTarget)) {
        window.setTimeout(() => {
          focusTarget.focus()
        }, 0)
      }
    }
  }, [isOpen])

  React.useEffect(() => {
    if (activePageId === 'general') {
      return
    }

    const pluginStillEnabled = enabledPluginIds.includes(activePageId)
    if (!pluginStillEnabled) {
      setActivePageId('general')
    }
  }, [activePageId, enabledPluginIds])

  React.useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="settings-backdrop plugin-manager-backdrop"
      data-testid="plugin-manager-backdrop"
      onMouseDown={event => {
        event.preventDefault()
        onClose()
      }}
    >
      <section
        className="settings-panel plugin-manager-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('pluginManager.title')}
        data-testid="plugin-manager"
        onMouseDown={event => {
          event.stopPropagation()
        }}
      >
        <aside
          className="settings-panel__sidebar plugin-manager-panel__sidebar"
          aria-label={t('pluginManager.nav.sectionsLabel')}
        >
          <SettingsPanelNavButton
            isActive={activePageId === 'general'}
            label={t('pluginManager.nav.general')}
            testId="plugin-manager-nav-general"
            onClick={() => setActivePageId('general')}
          />

          {enabledPluginIds.length > 0 ? (
            <>
              <div className="settings-panel__nav-group-label">
                {t('pluginManager.nav.enabledPlugins')}
              </div>
              <div className="settings-panel__nav-group">
                {availablePlugins
                  .filter(plugin => plugin.enabled)
                  .map(plugin => (
                    <SettingsPanelNavButton
                      key={plugin.id}
                      isActive={activePageId === plugin.id}
                      label={plugin.title}
                      testId={`plugin-manager-nav-${plugin.id}`}
                      onClick={() => setActivePageId(plugin.id)}
                    />
                  ))}
              </div>
            </>
          ) : null}
        </aside>

        <div className="settings-panel__content-wrapper">
          <header className="settings-panel__header plugin-manager-panel__header">
            <div className="plugin-manager-panel__header-copy">
              <h2>{t('pluginManager.title')}</h2>
            </div>
            <button
              ref={initialFocusRef}
              type="button"
              className="settings-panel__close"
              data-testid="plugin-manager-close"
              aria-label={t('common.close')}
              onClick={onClose}
            >
              ×
            </button>
          </header>

          <div className="settings-panel__content plugin-manager-panel__content">
            {activePageId === 'general' ? (
              <>
                <section className="settings-panel__section plugin-manager-panel__section-shell plugin-manager-panel__section-shell--catalog">
                  <div className="plugin-manager-panel__plugin-list-shell">
                    <div className="plugin-manager-panel__plugin-list">
                      {availablePlugins.map(plugin => (
                        <div
                          key={plugin.id}
                          className="settings-panel__row plugin-manager-panel__plugin-row"
                          data-testid={`plugin-manager-card-${plugin.id}`}
                        >
                          <div className="settings-panel__row-label">
                            <div className="plugin-manager-panel__plugin-meta">
                              <strong className="plugin-manager-panel__plugin-title">{plugin.title}</strong>
                              <span className="plugin-manager-panel__plugin-description">
                                {plugin.description}
                              </span>
                            </div>
                          </div>

                          <div className="settings-panel__control plugin-manager-panel__plugin-control">
                            <label
                              className={`plugin-manager-panel__toggle-row plugin-manager-panel__plugin-toggle-row${plugin.enabled ? ' plugin-manager-panel__plugin-toggle-row--enabled' : ''}`}
                            >
                              <span className="plugin-manager-panel__plugin-toggle-status">
                                {plugin.enabled
                                  ? t('pluginManager.status.enabled')
                                  : t('pluginManager.status.disabled')}
                              </span>
                              <span className="cove-toggle">
                                <input
                                  type="checkbox"
                                  data-testid={`plugin-manager-toggle-${plugin.id}`}
                                  checked={plugin.enabled}
                                  onChange={event => {
                                    updatePluginEnabled(plugin.id, event.target.checked)
                                  }}
                                />
                                <span className="cove-toggle__slider"></span>
                              </span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                {diagnostics.length > 0 ? (
                  <section className="settings-panel__section plugin-manager-panel__section-shell">
                    <div className="plugin-manager-panel__section-head">
                      <h3 className="settings-panel__section-title">
                        {t('pluginManager.hostDiagnostics.title')}
                      </h3>
                    </div>

                    <div
                      className="plugin-manager-panel__status-list"
                      data-testid="plugin-manager-host-diagnostics"
                    >
                      {diagnostics.map(diagnostic => (
                        <div
                          key={diagnostic.code}
                          className="plugin-manager-panel__hint plugin-manager-panel__hint--error"
                          data-testid={`plugin-manager-host-diagnostic-${diagnostic.code}`}
                        >
                          <strong>
                            {t(`pluginManager.hostDiagnostics.items.${diagnostic.code}`)}
                          </strong>
                          <span>{diagnostic.message}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : activePlugin ? (
              <section className="settings-panel__section">
                <h3 className="settings-panel__section-title plugin-manager-panel__active-plugin-title">
                  {activePlugin.title}
                </h3>

                <div className="plugin-manager-panel__enabled-sections">
                  <PluginSettingsSectionSlot
                    pluginIds={[activePlugin.id]}
                    settings={settings}
                    onChange={onChange}
                    onFlushPersistNow={onFlushPersistNow}
                  />
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  )
}
