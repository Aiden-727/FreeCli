import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { AnimatedNumberText } from '../../../shared/presentation/renderer/AnimatedNumberText'

interface InputStatsMetricGridItem {
  icon: LucideIcon
  label: string
  value: string
  animatedValue?: {
    value: number
    formatter: (value: number) => string
    durationMs?: number
  }
}

export function InputStatsMetricGrid({
  items,
  testId,
}: {
  items: InputStatsMetricGridItem[]
  testId?: string
}): React.JSX.Element {
  return (
    <div className="input-stats-metric-grid" data-testid={testId}>
      {items.map(item => {
        const Icon = item.icon
        return (
          <article key={item.label} className="input-stats-metric-grid__card">
            <span className="input-stats-metric-grid__icon" aria-hidden="true">
              <Icon size={15} />
            </span>
            <span className="input-stats-metric-grid__label">{item.label}</span>
            {item.animatedValue ? (
              <AnimatedNumberText
                as="strong"
                value={item.animatedValue.value}
                formatter={item.animatedValue.formatter}
                durationMs={item.animatedValue.durationMs}
                className="input-stats-metric-grid__value cove-animated-number"
              />
            ) : (
              <strong className="input-stats-metric-grid__value">{item.value}</strong>
            )}
          </article>
        )
      })}
    </div>
  )
}
