import React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { QuotaMonitorKeyProfileDto, QuotaMonitorSettingsDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import type { SettingsPluginSectionProps } from '../../../../contexts/plugins/presentation/renderer/types'
import { PluginSectionCard } from '../../../../contexts/plugins/presentation/renderer/PluginSectionCard'
import { createDefaultQuotaMonitorKeyProfile } from '../../../../contexts/plugins/domain/quotaMonitorSettings'
import { QuotaMonitorOverview } from './QuotaMonitorOverview'
import { useQuotaMonitorState } from './useQuotaMonitorState'

function nextProfileId(existing: QuotaMonitorKeyProfileDto[]): string {
  return `key_${existing.length + 1}`
}

function updateQuotaMonitorSettings(
  settings: AgentSettings,
  onChange: (settings: AgentSettings) => void,
  updater: (current: QuotaMonitorSettingsDto) => QuotaMonitorSettingsDto,
): void {
  onChange({
    ...settings,
    plugins: {
      ...settings.plugins,
      quotaMonitor: updater(settings.plugins.quotaMonitor),
    },
  })
}

function updateProfile(
  profiles: QuotaMonitorKeyProfileDto[],
  profileId: string,
  updater: (current: QuotaMonitorKeyProfileDto) => QuotaMonitorKeyProfileDto,
): QuotaMonitorKeyProfileDto[] {
  return profiles.map(profile => (profile.id === profileId ? updater(profile) : profile))
}

export default function QuotaMonitorSettingsSection({
  settings,
  onChange,
}: SettingsPluginSectionProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state, refresh } = useQuotaMonitorState()
  const quotaSettings = settings.plugins.quotaMonitor
  const isPluginEnabled = settings.plugins.enabledIds.includes('quota-monitor')
  const [visibleApiKeyIds, setVisibleApiKeyIds] = React.useState<Record<string, boolean>>({})

  const updateSettings = React.useCallback(
    (updater: (current: QuotaMonitorSettingsDto) => QuotaMonitorSettingsDto) => {
      updateQuotaMonitorSettings(settings, onChange, updater)
    },
    [onChange, settings],
  )

  return (
    <section
      className="plugin-manager-panel__plugin-section quota-monitor-config"
      data-testid="plugin-manager-plugin-quota-monitor-section"
    >
      <QuotaMonitorOverview
        isPluginEnabled={isPluginEnabled}
        settings={quotaSettings}
        state={state}
        onRefresh={() => {
          void refresh()
        }}
      />

      <div className="plugin-manager-panel__section-grid plugin-manager-panel__section-grid--stack">
        <PluginSectionCard
          title={t('pluginManager.plugins.quotaMonitor.configurationTitle')}
          description={t('pluginManager.plugins.quotaMonitor.configurationSummary')}
        >
          <div className="settings-panel__row quota-monitor-config__setting-row">
            <div className="settings-panel__row-label">
              <strong>{t('pluginManager.plugins.quotaMonitor.connectionTitle')}</strong>
              <span>{t('pluginManager.plugins.quotaMonitor.apiBaseUrlLabel')}</span>
            </div>
            <div className="settings-panel__control settings-panel__control--stack plugin-manager-panel__control-wide">
              <input
                className="cove-field"
                data-testid="quota-monitor-api-base-url"
                type="url"
                value={quotaSettings.apiBaseUrl}
                placeholder="https://..."
                onChange={event => {
                  updateSettings(current => ({
                    ...current,
                    apiBaseUrl: event.target.value,
                  }))
                }}
              />
            </div>
          </div>

          <div className="settings-panel__row quota-monitor-config__setting-row">
            <div className="settings-panel__row-label">
              <strong>{t('pluginManager.plugins.quotaMonitor.refreshIntervalLabel')}</strong>
            </div>
            <div className="settings-panel__control settings-panel__control--stack plugin-manager-panel__control-wide">
              <div className="plugin-manager-panel__field-grid plugin-manager-panel__field-grid--triple quota-monitor-config__policy-grid">
                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="quota-monitor-refresh-interval">
                    {t('pluginManager.plugins.quotaMonitor.refreshIntervalFieldLabel')}
                  </label>
                  <input
                    id="quota-monitor-refresh-interval"
                    className="cove-field"
                    data-testid="quota-monitor-refresh-interval"
                    type="number"
                    min={30000}
                    step={1000}
                    value={quotaSettings.refreshIntervalMs}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        refreshIntervalMs: Number.parseInt(event.target.value, 10) || 30000,
                      }))
                    }}
                  />
                </div>

                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="quota-monitor-timeout-seconds">
                    {t('pluginManager.plugins.quotaMonitor.timeoutSecondsLabel')}
                  </label>
                  <input
                    id="quota-monitor-timeout-seconds"
                    className="cove-field"
                    data-testid="quota-monitor-timeout-seconds"
                    type="number"
                    min={3}
                    step={1}
                    value={quotaSettings.timeoutSeconds}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        timeoutSeconds: Number.parseInt(event.target.value, 10) || 3,
                      }))
                    }}
                  />
                </div>

                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor="quota-monitor-retry-times">
                    {t('pluginManager.plugins.quotaMonitor.retryTimesLabel')}
                  </label>
                  <input
                    id="quota-monitor-retry-times"
                    className="cove-field"
                    data-testid="quota-monitor-retry-times"
                    type="number"
                    min={1}
                    step={1}
                    value={quotaSettings.retryTimes}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        retryTimes: Number.parseInt(event.target.value, 10) || 1,
                      }))
                    }}
                  />
                </div>
              </div>

              <label className="plugin-manager-panel__toggle-row">
                <span>{t('pluginManager.plugins.quotaMonitor.verifySslLabel')}</span>
                <span className="cove-toggle">
                  <input
                    type="checkbox"
                    data-testid="quota-monitor-verify-ssl"
                    checked={quotaSettings.verifySsl}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        verifySsl: event.target.checked,
                      }))
                    }}
                  />
                  <span className="cove-toggle__slider"></span>
                </span>
              </label>
            </div>
          </div>
        </PluginSectionCard>

        <PluginSectionCard
          className="quota-monitor-config__key-list-card"
          title={t('pluginManager.plugins.quotaMonitor.keyProfilesTitle')}
          actions={
            <button
              type="button"
              className="cove-window__action cove-window__action--secondary quota-monitor-config__add-button"
              data-testid="quota-monitor-add-profile"
              onClick={() => {
                updateSettings(current => ({
                  ...current,
                  keyProfiles: [
                    ...current.keyProfiles,
                    {
                      ...createDefaultQuotaMonitorKeyProfile(current.keyProfiles.length),
                      id: nextProfileId(current.keyProfiles),
                    },
                  ],
                }))
              }}
            >
              {t('pluginManager.plugins.quotaMonitor.addProfile')}
            </button>
          }
        >
          <div
            className="plugin-manager-panel__profile-list"
            data-testid="quota-monitor-config-key-profiles"
          >
            {quotaSettings.keyProfiles.map((profile, index) => (
              <article
                key={profile.id}
                className="plugin-manager-panel__profile quota-monitor-config__profile"
              >
                <div className="plugin-manager-panel__profile-header quota-monitor-config__profile-header">
                  <div className="plugin-manager-panel__profile-meta">
                    <strong>
                      {t('pluginManager.plugins.quotaMonitor.keyProfileTitle', {
                        index: index + 1,
                      })}
                    </strong>
                    <span>{profile.id}</span>
                  </div>

                  <div className="plugin-manager-panel__inline-actions quota-monitor-config__profile-actions">
                    <label className="plugin-manager-panel__toggle-row quota-monitor-config__toggle-row">
                      <span>{t('pluginManager.plugins.quotaMonitor.enableProfileLabel')}</span>
                      <span className="cove-toggle">
                        <input
                          type="checkbox"
                          data-testid={`quota-monitor-profile-enabled-${profile.id}`}
                          checked={profile.enabled}
                          onChange={event => {
                            updateSettings(current => ({
                              ...current,
                              keyProfiles: updateProfile(
                                current.keyProfiles,
                                profile.id,
                                candidate => ({
                                  ...candidate,
                                  enabled: event.target.checked,
                                }),
                              ),
                            }))
                          }}
                        />
                        <span className="cove-toggle__slider"></span>
                      </span>
                    </label>

                    <button
                      type="button"
                      className="cove-window__action cove-window__action--ghost quota-monitor-config__remove-button"
                      data-testid={`quota-monitor-profile-remove-${profile.id}`}
                      onClick={() => {
                        updateSettings(current => ({
                          ...current,
                          keyProfiles:
                            current.keyProfiles.length > 1
                              ? current.keyProfiles.filter(candidate => candidate.id !== profile.id)
                              : current.keyProfiles,
                        }))
                      }}
                      disabled={quotaSettings.keyProfiles.length <= 1}
                    >
                      {t('pluginManager.plugins.quotaMonitor.removeProfile')}
                    </button>
                  </div>
                </div>

                <div className="plugin-manager-panel__field-grid plugin-manager-panel__field-grid--double">
                  <div className="plugin-manager-panel__field-stack">
                    <label htmlFor={`quota-monitor-profile-label-${profile.id}`}>
                      {t('pluginManager.plugins.quotaMonitor.profileLabelLabel')}
                    </label>
                    <input
                      id={`quota-monitor-profile-label-${profile.id}`}
                      className="cove-field"
                      data-testid={`quota-monitor-profile-label-${profile.id}`}
                      type="text"
                      value={profile.label}
                      placeholder={t('pluginManager.plugins.quotaMonitor.profileLabelPlaceholder')}
                      onChange={event => {
                        updateSettings(current => ({
                          ...current,
                          keyProfiles: updateProfile(
                            current.keyProfiles,
                            profile.id,
                            candidate => ({
                              ...candidate,
                              label: event.target.value,
                            }),
                          ),
                        }))
                      }}
                    />
                  </div>

                  <div className="plugin-manager-panel__field-stack">
                    <label htmlFor={`quota-monitor-profile-type-${profile.id}`}>
                      {t('pluginManager.plugins.quotaMonitor.keyTypeLabel')}
                    </label>
                    <select
                      id={`quota-monitor-profile-type-${profile.id}`}
                      className="cove-field"
                      data-testid={`quota-monitor-profile-type-${profile.id}`}
                      value={profile.type}
                      onChange={event => {
                        updateSettings(current => ({
                          ...current,
                          keyProfiles: updateProfile(
                            current.keyProfiles,
                            profile.id,
                            candidate => ({
                              ...candidate,
                              type: event.target.value === 'capped' ? 'capped' : 'normal',
                            }),
                          ),
                        }))
                      }}
                    >
                      <option value="normal">
                        {t('pluginManager.plugins.quotaMonitor.keyTypeNormal')}
                      </option>
                      <option value="capped">
                        {t('pluginManager.plugins.quotaMonitor.keyTypeCapped')}
                      </option>
                    </select>
                  </div>
                </div>

                <div className="plugin-manager-panel__field-stack">
                  <label htmlFor={`quota-monitor-profile-api-key-${profile.id}`}>
                    {t('pluginManager.plugins.quotaMonitor.apiKeyLabel')}
                  </label>
                  <div className="quota-monitor-config__secret-field">
                    <input
                      id={`quota-monitor-profile-api-key-${profile.id}`}
                      className="cove-field"
                      data-testid={`quota-monitor-profile-api-key-${profile.id}`}
                      type={visibleApiKeyIds[profile.id] ? 'text' : 'password'}
                      autoComplete="off"
                      value={profile.apiKey}
                      placeholder={t('pluginManager.plugins.quotaMonitor.apiKeyPlaceholder')}
                      onChange={event => {
                        updateSettings(current => ({
                          ...current,
                          keyProfiles: updateProfile(
                            current.keyProfiles,
                            profile.id,
                            candidate => ({
                              ...candidate,
                              apiKey: event.target.value,
                            }),
                          ),
                        }))
                      }}
                    />
                    <button
                      type="button"
                      className="cove-window__action cove-window__action--ghost quota-monitor-config__secret-toggle"
                      data-testid={`quota-monitor-profile-api-key-visibility-${profile.id}`}
                      aria-pressed={visibleApiKeyIds[profile.id] ? 'true' : 'false'}
                      aria-label={
                        visibleApiKeyIds[profile.id]
                          ? t('pluginManager.plugins.quotaMonitor.hideApiKey')
                          : t('pluginManager.plugins.quotaMonitor.showApiKey')
                      }
                      onClick={() => {
                        setVisibleApiKeyIds(current => ({
                          ...current,
                          [profile.id]: !current[profile.id],
                        }))
                      }}
                    >
                      {visibleApiKeyIds[profile.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {profile.type === 'capped' ? (
                  <div className="plugin-manager-panel__field-grid plugin-manager-panel__field-grid--triple">
                    <div className="plugin-manager-panel__field-stack">
                      <label htmlFor={`quota-monitor-profile-daily-initial-${profile.id}`}>
                        {t('pluginManager.plugins.quotaMonitor.dailyInitialQuotaLabel')}
                      </label>
                      <input
                        id={`quota-monitor-profile-daily-initial-${profile.id}`}
                        className="cove-field"
                        data-testid={`quota-monitor-profile-daily-initial-${profile.id}`}
                        type="number"
                        min={0}
                        step={1}
                        value={profile.dailyInitialQuota}
                        placeholder={t(
                          'pluginManager.plugins.quotaMonitor.dailyInitialQuotaPlaceholder',
                        )}
                        onChange={event => {
                          updateSettings(current => ({
                            ...current,
                            keyProfiles: updateProfile(
                              current.keyProfiles,
                              profile.id,
                              candidate => ({
                                ...candidate,
                                dailyInitialQuota: Number.parseFloat(event.target.value) || 0,
                              }),
                            ),
                          }))
                        }}
                      />
                    </div>

                    <div className="plugin-manager-panel__field-stack">
                      <label htmlFor={`quota-monitor-profile-hourly-increase-${profile.id}`}>
                        {t('pluginManager.plugins.quotaMonitor.hourlyIncreaseQuotaLabel')}
                      </label>
                      <input
                        id={`quota-monitor-profile-hourly-increase-${profile.id}`}
                        className="cove-field"
                        data-testid={`quota-monitor-profile-hourly-increase-${profile.id}`}
                        type="number"
                        min={0}
                        step={1}
                        value={profile.hourlyIncreaseQuota}
                        placeholder={t(
                          'pluginManager.plugins.quotaMonitor.hourlyIncreaseQuotaPlaceholder',
                        )}
                        onChange={event => {
                          updateSettings(current => ({
                            ...current,
                            keyProfiles: updateProfile(
                              current.keyProfiles,
                              profile.id,
                              candidate => ({
                                ...candidate,
                                hourlyIncreaseQuota: Number.parseFloat(event.target.value) || 0,
                              }),
                            ),
                          }))
                        }}
                      />
                    </div>

                    <div className="plugin-manager-panel__field-stack">
                      <label htmlFor={`quota-monitor-profile-quota-cap-${profile.id}`}>
                        {t('pluginManager.plugins.quotaMonitor.quotaCapLabel')}
                      </label>
                      <input
                        id={`quota-monitor-profile-quota-cap-${profile.id}`}
                        className="cove-field"
                        data-testid={`quota-monitor-profile-quota-cap-${profile.id}`}
                        type="number"
                        min={0}
                        step={1}
                        value={profile.quotaCap}
                        placeholder={t('pluginManager.plugins.quotaMonitor.quotaCapPlaceholder')}
                        onChange={event => {
                          updateSettings(current => ({
                            ...current,
                            keyProfiles: updateProfile(
                              current.keyProfiles,
                              profile.id,
                              candidate => ({
                                ...candidate,
                                quotaCap: Number.parseFloat(event.target.value) || 0,
                              }),
                            ),
                          }))
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </PluginSectionCard>
      </div>
    </section>
  )
}
