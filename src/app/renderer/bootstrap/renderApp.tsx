import React from 'react'
import ReactDOM from 'react-dom/client'
import { I18nProvider } from '../i18n'
import AppShell from '../shell/AppShell'
import { installRendererDiagnostics } from './installRendererDiagnostics'
import '../styles.css'

export function renderApp(): void {
  installRendererDiagnostics()

  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Renderer root element "#root" was not found.')
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <I18nProvider>
        <AppShell />
      </I18nProvider>
    </React.StrictMode>,
  )
}
