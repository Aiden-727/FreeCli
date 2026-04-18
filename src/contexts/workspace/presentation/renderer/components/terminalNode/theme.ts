import type { ResolvedUiTheme } from '@shared/contracts/dto'

export type TerminalThemeMode = 'sync-with-ui' | 'dark'

const TERMINAL_THEME_DEFAULTS: Record<
  ResolvedUiTheme,
  {
    background: string
    foreground: string
    cursor: string
    selectionBackground: string
    yellow: string
    brightYellow: string
  }
> = {
  dark: {
    background: '#0a0f1d',
    foreground: '#d6e4ff',
    cursor: '#d6e4ff',
    selectionBackground: 'rgba(94, 156, 255, 0.35)',
    yellow: '#ffd866',
    brightYellow: '#ffe08a',
  },
  light: {
    background: '#f6f8fa',
    foreground: '#24292f',
    cursor: '#0969da',
    selectionBackground: 'rgba(9, 105, 218, 0.16)',
    // Shell integrations often use ANSI yellow to mark executable commands.
    // Light mode needs a deeper amber fallback here, otherwise those command
    // names wash out against the bright terminal background.
    yellow: '#7a4e00',
    brightYellow: '#9a6700',
  },
}

export function resolveActiveUiTheme(): ResolvedUiTheme {
  return document.documentElement.dataset.coveTheme === 'light' ? 'light' : 'dark'
}

export function resolveTerminalUiTheme(mode: TerminalThemeMode): ResolvedUiTheme {
  return mode === 'dark' ? 'dark' : resolveActiveUiTheme()
}

export function resolveTerminalTheme(mode: TerminalThemeMode = 'sync-with-ui') {
  const resolvedTheme = resolveTerminalUiTheme(mode)
  const defaults = TERMINAL_THEME_DEFAULTS[resolvedTheme]

  if (mode === 'dark') {
    return { ...defaults }
  }

  const readRootCssVar = (name: string, fallback: string): string => {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value.length > 0 ? value : fallback
  }

  return {
    background: readRootCssVar('--cove-terminal-background', defaults.background),
    foreground: readRootCssVar('--cove-terminal-foreground', defaults.foreground),
    cursor: readRootCssVar('--cove-terminal-cursor', defaults.cursor),
    selectionBackground: readRootCssVar('--cove-terminal-selection', defaults.selectionBackground),
    yellow: readRootCssVar('--cove-terminal-ansi-yellow', defaults.yellow),
    brightYellow: readRootCssVar(
      '--cove-terminal-ansi-bright-yellow',
      defaults.brightYellow,
    ),
  }
}
