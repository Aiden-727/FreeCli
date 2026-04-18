import React from 'react'

export function PluginSectionCard({
  title,
  description,
  actions,
  className = '',
  hideHeader = false,
  children,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
  hideHeader?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section
      className={`plugin-section-card settings-panel__subsection${className ? ` ${className}` : ''}`}
    >
      {hideHeader ? null : (
        <header className="plugin-section-card__header settings-panel__subsection-header">
          <div className="plugin-section-card__copy">
            <strong>{title}</strong>
            {description ? <span>{description}</span> : null}
          </div>
          {actions ? <div className="plugin-section-card__actions">{actions}</div> : null}
        </header>
      )}
      <div className="plugin-section-card__body">{children}</div>
    </section>
  )
}
