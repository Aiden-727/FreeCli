import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
} from '../../../src/contexts/settings/domain/agentSettings'

describe('normalizeAgentSettings', () => {
  it('keeps the default terminal profile unset by default', () => {
    expect(DEFAULT_AGENT_SETTINGS.defaultTerminalProfileId).toBeNull()
    expect(normalizeAgentSettings({}).defaultTerminalProfileId).toBeNull()
  })

  it('defaults graphics mode to system-default', () => {
    expect(DEFAULT_AGENT_SETTINGS.graphicsMode).toBe('system-default')
    expect(normalizeAgentSettings({}).graphicsMode).toBe('system-default')
  })

  it('restores a persisted graphics mode when it is valid', () => {
    expect(normalizeAgentSettings({ graphicsMode: 'power-saving' }).graphicsMode).toBe(
      'power-saving',
    )
  })

  it('falls back to system-default for invalid graphics modes', () => {
    expect(normalizeAgentSettings({ graphicsMode: 'invalid' }).graphicsMode).toBe(
      DEFAULT_AGENT_SETTINGS.graphicsMode,
    )
  })

  it('restores a persisted terminal profile id when it is present', () => {
    const settings = normalizeAgentSettings({
      defaultTerminalProfileId: 'wsl:Ubuntu',
    })

    expect(settings.defaultTerminalProfileId).toBe('wsl:Ubuntu')
  })

  it('falls back to automatic terminal profile selection for invalid values', () => {
    const settings = normalizeAgentSettings({
      defaultTerminalProfileId: 123,
    })

    expect(settings.defaultTerminalProfileId).toBeNull()
  })

  it('normalizes the standard window size bucket', () => {
    expect(
      normalizeAgentSettings({ standardWindowSizeBucket: 'large' }).standardWindowSizeBucket,
    ).toBe('large')
    expect(
      normalizeAgentSettings({ standardWindowSizeBucket: 'invalid' }).standardWindowSizeBucket,
    ).toBe(DEFAULT_AGENT_SETTINGS.standardWindowSizeBucket)
  })
})
