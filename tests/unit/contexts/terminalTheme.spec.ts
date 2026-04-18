import { afterEach, describe, expect, it } from 'vitest'
import { resolveTerminalTheme } from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/theme'

function resetTerminalThemeDomState(): void {
  document.documentElement.removeAttribute('data-cove-theme')
  document.documentElement.style.removeProperty('--cove-terminal-ansi-yellow')
  document.documentElement.style.removeProperty('--cove-terminal-ansi-bright-yellow')
}

describe('terminal theme ansi palette', () => {
  afterEach(() => {
    resetTerminalThemeDomState()
  })

  it('uses darker ansi yellow fallbacks in light mode to preserve readability', () => {
    document.documentElement.dataset.coveTheme = 'light'

    expect(resolveTerminalTheme()).toMatchObject({
      background: '#f6f8fa',
      foreground: '#24292f',
      yellow: '#7a4e00',
      brightYellow: '#9a6700',
    })
  })

  it('prefers css token overrides when the renderer defines a custom terminal palette', () => {
    document.documentElement.dataset.coveTheme = 'light'
    document.documentElement.style.setProperty('--cove-terminal-ansi-yellow', '#5c3900')
    document.documentElement.style.setProperty('--cove-terminal-ansi-bright-yellow', '#7b4f00')

    expect(resolveTerminalTheme()).toMatchObject({
      yellow: '#5c3900',
      brightYellow: '#7b4f00',
    })
  })
})
