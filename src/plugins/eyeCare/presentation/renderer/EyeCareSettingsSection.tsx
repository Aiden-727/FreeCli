import React from 'react'
import { Pause, Play, Square } from 'lucide-react'
import type { EyeCareSettingsDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import type { AgentSettings } from '@contexts/settings/domain/agentSettings'
import { CoveSelect } from '@app/renderer/components/CoveSelect'
import { EYE_CARE_MODE_OPTIONS } from '@contexts/plugins/domain/eyeCareSettings'
import { PluginSectionCard } from '@contexts/plugins/presentation/renderer/PluginSectionCard'
import type { SettingsPluginSectionProps } from '@contexts/plugins/presentation/renderer/types'
import { useEyeCareState } from './useEyeCareState'
import { formatEyeCareRemaining } from './eyeCareFormatting'

function updateEyeCareSettings(
  settings: AgentSettings,
  onChange: (settings: AgentSettings) => void,
  updater: (current: EyeCareSettingsDto) => EyeCareSettingsDto,
): void {
  onChange({
    ...settings,
    plugins: {
      ...settings.plugins,
      eyeCare: updater(settings.plugins.eyeCare),
    },
  })
}

export default function EyeCareSettingsSection({
  settings,
  onChange,
}: SettingsPluginSectionProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state, startCycle, pause, resume, stop } = useEyeCareState()
  const eyeCareSettings = settings.plugins.eyeCare
  const modeOptions = React.useMemo(
    () =>
      EYE_CARE_MODE_OPTIONS.map(option => ({
        value: option,
        label: t(`pluginManager.plugins.eyeCare.modeOptions.${option === 'forced-blur' ? 'forcedBlur' : 'gentle'}`),
      })),
    [t],
  )

  const updateSettings = React.useCallback(
    (updater: (current: EyeCareSettingsDto) => EyeCareSettingsDto) => {
      updateEyeCareSettings(settings, onChange, updater)
    },
    [onChange, settings],
  )

  return (
    <section
      className="plugin-manager-panel__plugin-section eye-care-config"
      data-testid="plugin-manager-plugin-eye-care-section"
    >
      <div className="plugin-manager-panel__section-grid plugin-manager-panel__section-grid--stack">
        <PluginSectionCard
          title={t('pluginManager.plugins.eyeCare.overview.title')}
          description={t('pluginManager.plugins.eyeCare.overview.summary')}
        >
          <div className="eye-care-overview">
            <div className="eye-care-overview__hero">
              <div className="eye-care-overview__hero-copy">
                <span className="eye-care-overview__kicker">
                  {t('pluginManager.plugins.eyeCare.overview.phase')}
                </span>
                <strong>{t(`pluginManager.plugins.eyeCare.phase.${state.phase}`)}</strong>
                <p>{t('pluginManager.plugins.eyeCare.overview.heroSummary')}</p>
              </div>
              <div className="eye-care-overview__hero-timer">
                <span>{t('pluginManager.plugins.eyeCare.overview.remaining')}</span>
                <strong>{formatEyeCareRemaining(state.remainingSeconds)}</strong>
              </div>
            </div>
            <div className="eye-care-overview__summary-grid">
              <article className="quota-monitor-overview__summary-card">
                <span>{t('pluginManager.plugins.eyeCare.overview.breaks')}</span>
                <strong>{state.completedBreakCountToday}</strong>
              </article>
              <article className="quota-monitor-overview__summary-card">
                <span>{t('pluginManager.plugins.eyeCare.modeLabel')}</span>
                <strong>
                  {t(
                    `pluginManager.plugins.eyeCare.modeOptions.${eyeCareSettings.mode === 'forced-blur' ? 'forcedBlur' : 'gentle'}`,
                  )}
                </strong>
              </article>
              <article className="quota-monitor-overview__summary-card">
                <span>{t('pluginManager.plugins.eyeCare.overview.cycle')}</span>
                <strong>{state.cycleIndex}</strong>
              </article>
            </div>
          </div>
        </PluginSectionCard>

        <PluginSectionCard
          title={t('pluginManager.plugins.eyeCare.configurationTitle')}
          description={t('pluginManager.plugins.eyeCare.configurationSummary')}
        >
          <div className="eye-care-config__grid">
            <div className="plugin-manager-panel__compact-board">
              <div className="plugin-manager-panel__compact-board-head">
                <span className="plugin-manager-panel__compact-board-pill">时长设置</span>
                <span className="plugin-manager-panel__compact-board-hint">工作、休息与延后统一收口</span>
              </div>
              <div className="eye-care-config__cluster eye-care-config__cluster--triple">
                <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                  <label htmlFor="eye-care-work-duration">
                    {t('pluginManager.plugins.eyeCare.workDurationLabel')}
                  </label>
                  <input
                    id="eye-care-work-duration"
                    className="cove-field"
                    data-testid="eye-care-work-duration"
                    type="number"
                    min={1}
                    max={180}
                    value={eyeCareSettings.workDurationMinutes}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        workDurationMinutes:
                          Number.parseInt(event.target.value, 10) || current.workDurationMinutes,
                      }))
                    }}
                  />
                </div>
                <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                  <label htmlFor="eye-care-break-duration">
                    {t('pluginManager.plugins.eyeCare.breakDurationLabel')}
                  </label>
                  <input
                    id="eye-care-break-duration"
                    className="cove-field"
                    data-testid="eye-care-break-duration"
                    type="number"
                    min={5}
                    max={600}
                    value={eyeCareSettings.breakDurationSeconds}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        breakDurationSeconds:
                          Number.parseInt(event.target.value, 10) || current.breakDurationSeconds,
                      }))
                    }}
                  />
                </div>
                <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                  <label htmlFor="eye-care-postpone-duration">
                    {t('pluginManager.plugins.eyeCare.postponeDurationLabel')}
                  </label>
                  <input
                    id="eye-care-postpone-duration"
                    className="cove-field"
                    data-testid="eye-care-postpone-duration"
                    type="number"
                    min={1}
                    max={60}
                    value={eyeCareSettings.postponeMinutes}
                    onChange={event => {
                      updateSettings(current => ({
                        ...current,
                        postponeMinutes:
                          Number.parseInt(event.target.value, 10) || current.postponeMinutes,
                      }))
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="plugin-manager-panel__compact-board">
              <div className="plugin-manager-panel__compact-board-head">
                <span className="plugin-manager-panel__compact-board-pill">休息策略</span>
                <span className="plugin-manager-panel__compact-board-hint">模式切换和规则统一展示</span>
              </div>
              <div className="eye-care-config__cluster">
                <div className="plugin-manager-panel__field-stack system-monitor-config__field-card">
                  <label htmlFor="eye-care-mode">{t('pluginManager.plugins.eyeCare.modeLabel')}</label>
                  <CoveSelect
                    id="eye-care-mode"
                    testId="eye-care-mode"
                    triggerClassName="system-monitor-config__select-trigger"
                    menuClassName="system-monitor-config__select-menu"
                    ariaLabel={t('pluginManager.plugins.eyeCare.modeLabel')}
                    value={eyeCareSettings.mode}
                    options={modeOptions}
                    onChange={nextValue => {
                      updateSettings(current => ({
                        ...current,
                        mode: EYE_CARE_MODE_OPTIONS.includes(nextValue as EyeCareSettingsDto['mode'])
                          ? (nextValue as EyeCareSettingsDto['mode'])
                          : current.mode,
                      }))
                    }}
                  />
                </div>
                <label className="system-monitor-config__toggle-card">
                  <span className="system-monitor-config__toggle-label">
                    {t('pluginManager.plugins.eyeCare.strictModeLabel')}
                  </span>
                  <span className="cove-toggle">
                    <input
                      type="checkbox"
                      data-testid="eye-care-strict-mode"
                      checked={eyeCareSettings.strictMode}
                      onChange={event => {
                        updateSettings(current => ({
                          ...current,
                          strictMode: event.target.checked,
                          allowSkip: event.target.checked ? false : current.allowSkip,
                        }))
                      }}
                    />
                    <span className="cove-toggle__slider"></span>
                  </span>
                </label>
                <label className="system-monitor-config__toggle-card">
                  <span className="system-monitor-config__toggle-label">
                    {t('pluginManager.plugins.eyeCare.allowPostponeLabel')}
                  </span>
                  <span className="cove-toggle">
                    <input
                      type="checkbox"
                      data-testid="eye-care-allow-postpone"
                      checked={eyeCareSettings.allowPostpone}
                      onChange={event => {
                        updateSettings(current => ({
                          ...current,
                          allowPostpone: event.target.checked,
                        }))
                      }}
                    />
                    <span className="cove-toggle__slider"></span>
                  </span>
                </label>
                <label className="system-monitor-config__toggle-card">
                  <span className="system-monitor-config__toggle-label">
                    {t('pluginManager.plugins.eyeCare.allowSkipLabel')}
                  </span>
                  <span className="cove-toggle">
                    <input
                      type="checkbox"
                      data-testid="eye-care-allow-skip"
                      checked={eyeCareSettings.allowSkip}
                      disabled={eyeCareSettings.strictMode}
                      onChange={event => {
                        updateSettings(current => ({
                          ...current,
                          allowSkip: event.target.checked,
                        }))
                      }}
                    />
                    <span className="cove-toggle__slider"></span>
                  </span>
                </label>
                <label className="system-monitor-config__toggle-card">
                  <span className="system-monitor-config__toggle-label">
                    {t('pluginManager.plugins.eyeCare.autoRestartLabel')}
                  </span>
                  <span className="cove-toggle">
                    <input
                      type="checkbox"
                      data-testid="eye-care-auto-restart"
                      checked={eyeCareSettings.autoStartNextCycle}
                      onChange={event => {
                        updateSettings(current => ({
                          ...current,
                          autoStartNextCycle: event.target.checked,
                        }))
                      }}
                    />
                    <span className="cove-toggle__slider"></span>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </PluginSectionCard>

        <PluginSectionCard
          title={t('pluginManager.plugins.eyeCare.actionsTitle')}
          description={t('pluginManager.plugins.eyeCare.actionsSummary')}
        >
          <div className="eye-care-config__action-row">
            {state.canStart ? (
              <button
                type="button"
                className="cove-window__action"
                onClick={() => void startCycle()}
              >
                <Play size={16} />
                <span>{t('pluginManager.plugins.eyeCare.actions.start')}</span>
              </button>
            ) : null}
            {state.canPause ? (
              <button type="button" className="cove-window__action" onClick={() => void pause()}>
                <Pause size={16} />
                <span>{t('pluginManager.plugins.eyeCare.actions.pause')}</span>
              </button>
            ) : null}
            {state.canResume ? (
              <button type="button" className="cove-window__action" onClick={() => void resume()}>
                <Play size={16} />
                <span>{t('pluginManager.plugins.eyeCare.actions.resume')}</span>
              </button>
            ) : null}
            {state.canStop ? (
              <button type="button" className="cove-window__action" onClick={() => void stop()}>
                <Square size={16} />
                <span>{t('pluginManager.plugins.eyeCare.actions.stop')}</span>
              </button>
            ) : null}
          </div>
        </PluginSectionCard>
      </div>
    </section>
  )
}
