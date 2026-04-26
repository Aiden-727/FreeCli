import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { App } from 'electron'

export type DiagnosticScope = 'main' | 'renderer'
export type DiagnosticLevel = 'info' | 'warn' | 'error'

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function sanitizeLogValue(value: string): string {
  return normalizeLineBreaks(value).trim()
}

function toIsoTimestamp(date: Date = new Date()): string {
  return date.toISOString()
}

function formatDetail(detail: string | undefined): string {
  if (!detail) {
    return ''
  }

  const normalized = sanitizeLogValue(detail)
  if (normalized.length === 0) {
    return ''
  }

  return `\n${normalized
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n')}`
}

export function resolveDiagnosticLogPath(app: App, scope: DiagnosticScope): string {
  return resolve(app.getPath('userData'), 'logs', `${scope}.log`)
}

export function writeDiagnosticLogEntry(options: {
  app: App
  scope: DiagnosticScope
  source: string
  message: string
  detail?: string
  level?: DiagnosticLevel
}): string {
  const logPath = resolveDiagnosticLogPath(options.app, options.scope)
  mkdirSync(dirname(logPath), { recursive: true })

  const line = `[${toIsoTimestamp()}] [${(options.level ?? 'info').toUpperCase()}] [${sanitizeLogValue(options.source)}] ${sanitizeLogValue(options.message)}${formatDetail(options.detail)}\n`
  appendFileSync(logPath, line, 'utf8')
  return logPath
}

