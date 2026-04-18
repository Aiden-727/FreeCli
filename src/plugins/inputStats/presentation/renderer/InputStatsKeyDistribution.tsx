import React from 'react'
import type { InputStatsStateDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'
import { InputStatsKeyboardHeatmap } from './InputStatsKeyboardHeatmap'

export function InputStatsKeyDistribution({
  state,
}: {
  state: InputStatsStateDto
}): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className="input-stats-distribution" data-testid="input-stats-key-distribution">
      <div className="input-stats-distribution__heatmap">
        {state.allKeys.length === 0 ? (
          <p className="input-stats-distribution__empty">
            {t('pluginManager.plugins.inputStats.topKeysEmpty')}
          </p>
        ) : null}

        <InputStatsKeyboardHeatmap items={state.allKeys} />
      </div>
    </div>
  )
}
