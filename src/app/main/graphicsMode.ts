import type { App } from 'electron'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import {
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  type GraphicsMode,
} from '@contexts/settings/domain/agentSettings'

export function parseGraphicsModeFromSettingsValue(value: unknown): GraphicsMode {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_AGENT_SETTINGS.graphicsMode
  }

  try {
    const parsed = JSON.parse(value) as unknown
    return normalizeAgentSettings(parsed).graphicsMode
  } catch {
    return DEFAULT_AGENT_SETTINGS.graphicsMode
  }
}

export function resolveLaunchGraphicsMode(userDataPath: string): GraphicsMode {
  const dbPath = resolve(userDataPath, 'freecli.db')
  if (!existsSync(dbPath)) {
    return DEFAULT_AGENT_SETTINGS.graphicsMode
  }

  let db: Database.Database | null = null

  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true })

    const appSettingsTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_settings' LIMIT 1",
      )
      .get() as { name?: string } | undefined
    if (appSettingsTable?.name !== 'app_settings') {
      return DEFAULT_AGENT_SETTINGS.graphicsMode
    }

    const row = db.prepare('SELECT value FROM app_settings WHERE id = 1 LIMIT 1').get() as
      | { value?: unknown }
      | undefined

    return parseGraphicsModeFromSettingsValue(row?.value)
  } catch {
    return DEFAULT_AGENT_SETTINGS.graphicsMode
  } finally {
    db?.close()
  }
}

export function applyLaunchGraphicsMode(app: App, graphicsMode: GraphicsMode): void {
  if (graphicsMode !== 'power-saving') {
    return
  }

  // We can only express a low-power preference here. The OS / driver still owns the final GPU.
  app.commandLine.appendSwitch('force_low_power_gpu')
}
