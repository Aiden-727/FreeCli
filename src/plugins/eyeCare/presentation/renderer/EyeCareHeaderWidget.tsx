import React from 'react'
import { Pause, Play, Square } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { HeaderPluginWidgetProps } from '@contexts/plugins/presentation/renderer/types'
import { useEyeCareState } from './useEyeCareState'
import { formatEyeCareRemaining } from './eyeCareFormatting'

export default function EyeCareHeaderWidget({
  onOpenPluginManager,
}: HeaderPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state, isHydrated, startCycle, pause, resume, stop } = useEyeCareState()

  const titleText = isHydrated
    ? t('pluginManager.plugins.eyeCare.header.title', {
        phase: t(`pluginManager.plugins.eyeCare.phase.${state.phase}`),
        remaining: formatEyeCareRemaining(state.remainingSeconds),
      })
    : t('pluginManager.plugins.eyeCare.title')

  return (
    <div
      className="app-header__eye-care-shell"
      data-testid="app-header-eye-care"
      aria-label={titleText}
      title={titleText}
    >
      <button
        type="button"
        className="app-header__eye-care-button"
        onClick={() => onOpenPluginManager('eye-care')}
      >
        <span className="app-header__eye-care-pill" aria-hidden="true">
          {isHydrated ? (
            <span className="app-header__eye-care-value">
              {formatEyeCareRemaining(state.remainingSeconds)}
            </span>
          ) : (
            <span className="app-header__eye-care-loading" />
          )}
        </span>
      </button>
      <div className="app-header__eye-care-actions">
        {state.canStart ? (
          <button
            type="button"
            className="app-header__eye-care-action app-header__eye-care-action--resume"
            onClick={() => void startCycle()}
          >
            <Play size={13} />
          </button>
        ) : null}
        {state.canPause ? (
          <button
            type="button"
            className="app-header__eye-care-action app-header__eye-care-action--pause"
            onClick={() => void pause()}
          >
            <Pause size={13} />
          </button>
        ) : null}
        {state.canResume ? (
          <button
            type="button"
            className="app-header__eye-care-action app-header__eye-care-action--resume"
            onClick={() => void resume()}
          >
            <Play size={13} />
          </button>
        ) : null}
        {state.canStop ? (
          <button
            type="button"
            className="app-header__eye-care-action app-header__eye-care-action--stop"
            onClick={() => void stop()}
          >
            <Square size={13} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
