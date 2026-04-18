import type { TerminalRuntimeKind } from '@shared/contracts/dto'

const WIDE_GLYPH_PATTERN =
  /[\u1100-\u115f\u2329\u232a\u2e80-\u303e\u3040-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u

export function containsWideGlyphs(text: string): boolean {
  return WIDE_GLYPH_PATTERN.test(text)
}

export function shouldEnableOverlappingGlyphRescale(
  platform: string | undefined,
  runtimeKind?: TerminalRuntimeKind,
): boolean {
  return platform === 'win32' || runtimeKind === 'windows' || runtimeKind === 'wsl'
}

export function resolveTerminalFontFamily(
  platform: string | undefined,
  runtimeKind?: TerminalRuntimeKind,
): string {
  const baseFonts = ['JetBrains Mono']
  const windowsFonts = [
    'Cascadia Mono',
    'Cascadia Code',
    'Sarasa Mono SC',
    'Source Han Mono SC',
    'Noto Sans Mono CJK SC',
    'NSimSun',
    'Consolas',
  ]
  const posixFonts = [
    'Sarasa Mono SC',
    'Source Han Mono SC',
    'Noto Sans Mono CJK SC',
    'SFMono-Regular',
    'Menlo',
    'Monaco',
    'ui-monospace',
  ]
  const orderedFonts =
    shouldEnableOverlappingGlyphRescale(platform, runtimeKind) || platform === 'win32'
      ? [...baseFonts, ...windowsFonts]
      : [...baseFonts, ...posixFonts]

  return [...orderedFonts, 'monospace'].map(font => `'${font}'`).join(', ')
}
