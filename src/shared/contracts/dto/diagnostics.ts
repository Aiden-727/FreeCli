export interface WriteDiagnosticLogInput {
  scope: 'main' | 'renderer'
  level?: 'info' | 'warn' | 'error'
  source: string
  message: string
  detail?: string
}
