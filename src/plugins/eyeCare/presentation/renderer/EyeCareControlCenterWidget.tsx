import React from 'react'
import { Eye } from 'lucide-react'
import { useTranslation } from '@app/renderer/i18n'
import type { ControlCenterPluginWidgetProps } from '@contexts/plugins/presentation/renderer/types'
import { useEyeCareState } from './useEyeCareState'
import { formatEyeCareRemaining } from './eyeCareFormatting'

export default function EyeCareControlCenterWidget({
  onOpenPluginManager,
}: ControlCenterPluginWidgetProps): React.JSX.Element {
  const { t } = useTranslation()
  const { state, isHydrated } = useEyeCareState()

  const phaseLabel = t(`pluginManager.plugins.eyeCare.phase.${state.phase}`)
  const remainingLabel = isHydrated ? formatEyeCareRemaining(state.remainingSeconds) : '··:··'
  const phaseClassName = `control-center-tile__eye-care-phase-pill control-center-tile__eye-care-phase-pill--${state.phase}`

  return (
    <button
      type="button"
      className="control-center-tile control-center-tile--plugin control-center-tile--eye-care"
      data-testid="control-center-plugin-eye-care"
      onClick={() => onOpenPluginManager('eye-care')}
    >
      <span className="control-center-tile__icon" aria-hidden="true">
        <Eye size={18} />
      </span>
      <span className="control-center-tile__text">
        <span className="control-center-tile__label">
          {t('pluginManager.plugins.eyeCare.title')}
        </span>
        <span className="control-center-tile__subtitle control-center-tile__plugin-lines">
          <span className="control-center-tile__plugin-line">
            <span className={phaseClassName}>{phaseLabel}</span>
          </span>
          <span className="control-center-tile__plugin-line">
            <span className="control-center-tile__eye-care-countdown-value">{remainingLabel}</span>
          </span>
        </span>
      </span>
    </button>
  )
}
