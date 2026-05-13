function formatUnknownErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    if (typeof error.stack === 'string' && error.stack.trim().length > 0) {
      return error.stack
    }

    return `${error.name}: ${error.message}`
  }

  return String(error)
}

async function writeRendererDiagnostic(options: {
  source: string
  message: string
  detail?: string
  level?: 'info' | 'warn' | 'error'
}): Promise<void> {
  const api = window.freecliApi?.appLifecycle?.writeDiagnosticLog

  if (typeof api !== 'function') {
    return
  }

  try {
    await api({
      scope: 'renderer',
      level: options.level ?? 'info',
      source: options.source,
      message: options.message,
      detail: options.detail,
    })
  } catch {
    // Diagnostics logging is best-effort and must never break renderer bootstrap.
  }
}

export function installRendererDiagnostics(): void {
  void writeRendererDiagnostic({
    source: 'bootstrap',
    level: 'info',
    message: 'renderer bootstrap start',
  })

  window.addEventListener('error', event => {
    void writeRendererDiagnostic({
      source: 'window.error',
      level: 'error',
      message: event.message || 'window error',
      detail: event.error
        ? formatUnknownErrorDetail(event.error)
        : `${event.filename}:${event.lineno}:${event.colno}`,
    })
  })

  window.addEventListener('unhandledrejection', event => {
    void writeRendererDiagnostic({
      source: 'window.unhandledrejection',
      level: 'error',
      message: 'unhandled promise rejection',
      detail: formatUnknownErrorDetail(event.reason),
    })
  })
}
