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
  const line = `[renderer][${options.source}] ${options.message}`

  if (options.level === 'error') {
    console.error(line, options.detail ?? '')
  } else if (options.level === 'warn') {
    console.warn(line, options.detail ?? '')
  } else {
    console.info(line, options.detail ?? '')
  }

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
  } catch (error) {
    console.error('[renderer][diagnostics] failed to write renderer diagnostic log', error)
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

