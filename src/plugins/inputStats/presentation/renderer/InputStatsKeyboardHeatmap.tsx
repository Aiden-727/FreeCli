import React from 'react'
import type { InputStatsKeyCountItemDto } from '@shared/contracts/dto'
import { useTranslation } from '@app/renderer/i18n'

interface KeyboardKeySpec {
  id?: string
  label?: string
  aliases?: string[]
  width?: number
  kind?: 'key' | 'spacer'
  matchLabel?: boolean
  showCount?: boolean
}

interface InputStatsHeatPalette {
  idle: string
  lowStart: string
  lowEnd: string
  midEnd: string
  highEnd: string
  peakEnd: string
}

type ResolvedInputStatsTheme = 'light' | 'dark'

const BASE_KEY_SIZE = 46
const MIN_SCALE = 0.82
const MAX_SCALE = 1.08
const CARD_EDGE_GUTTER = 16
const SURFACE_SHADOW_BLEED_X = 12
const SURFACE_SHADOW_BLEED_TOP = 4
const SURFACE_SHADOW_BLEED_BOTTOM = 12
const SCALE_SAFETY_PX = 8
const LEFT_ALIGNMENT_BIAS = 22

const LIGHT_HEAT_PALETTE: InputStatsHeatPalette = {
  idle: '#ffffff',
  lowStart: '#EAF8EA',
  lowEnd: '#CDEFC9',
  midEnd: '#F6D17A',
  highEnd: '#E86C6C',
  peakEnd: '#FF2D2D',
}

const DARK_HEAT_PALETTE: InputStatsHeatPalette = {
  idle: '#182233',
  lowStart: '#1d2a1f',
  lowEnd: '#2f5b40',
  midEnd: '#8b6c28',
  highEnd: '#a55252',
  peakEnd: '#ef4444',
}

const spacer = (id: string, width = 1): KeyboardKeySpec => ({
  id,
  kind: 'spacer',
  width,
  showCount: false,
})

const MAIN_KEYBOARD_ROWS: KeyboardKeySpec[][] = [
  [
    { label: 'ESC', aliases: ['ESC'] },
    spacer('main-gap-esc-f1', 0.6),
    { label: 'F1' },
    { label: 'F2' },
    { label: 'F3' },
    { label: 'F4' },
    spacer('main-gap-f4-f5', 0.4),
    { label: 'F5' },
    { label: 'F6' },
    { label: 'F7' },
    { label: 'F8' },
    spacer('main-gap-f8-f9', 0.4),
    { label: 'F9' },
    { label: 'F10' },
    { label: 'F11' },
    { label: 'F12' },
  ],
  [
    { label: '~', aliases: ['`', '~'] },
    { label: '1' },
    { label: '2' },
    { label: '3' },
    { label: '4' },
    { label: '5' },
    { label: '6' },
    { label: '7' },
    { label: '8' },
    { label: '9' },
    { label: '0' },
    { label: '-' },
    { label: '=' },
    { label: 'BKS', width: 2.0, aliases: ['BACKSPACE', 'BKSP'] },
  ],
  [
    { label: 'TAB', width: 1.5 },
    { label: 'Q' },
    { label: 'W' },
    { label: 'E' },
    { label: 'R' },
    { label: 'T' },
    { label: 'Y' },
    { label: 'U' },
    { label: 'I' },
    { label: 'O' },
    { label: 'P' },
    { label: '[' },
    { label: ']' },
    { label: '\\', width: 1.5, aliases: ['\\'] },
  ],
  [
    { label: 'CAP', width: 1.8, aliases: ['CAPS', 'CAPS LOCK'] },
    { label: 'A' },
    { label: 'S' },
    { label: 'D' },
    { label: 'F' },
    { label: 'G' },
    { label: 'H' },
    { label: 'J' },
    { label: 'K' },
    { label: 'L' },
    { label: ';' },
    { label: "'" },
    { label: 'ENT', width: 2.2, aliases: ['ENTER', 'RETURN'] },
  ],
  [
    { id: 'shift-left', label: 'SFT', width: 2.3, aliases: ['SHIFT'] },
    { label: 'Z' },
    { label: 'X' },
    { label: 'C' },
    { label: 'V' },
    { label: 'B' },
    { label: 'N' },
    { label: 'M' },
    { label: ',' },
    { label: '.' },
    { label: '/' },
    { id: 'shift-right', label: 'SFT', width: 2.7, aliases: ['SHIFT'] },
  ],
  [
    { id: 'ctrl-left', label: 'CTL', width: 1.4, aliases: ['CTRL', 'CONTROL'] },
    { label: 'WIN', width: 1.2, aliases: ['WIN'] },
    { id: 'alt-left', label: 'ALT', width: 1.2, aliases: ['ALT', 'MENU'] },
    { label: 'SPC', width: 6.0, aliases: ['SPACE'] },
    { id: 'alt-right', label: 'ALT', width: 1.2, aliases: ['ALT', 'MENU'] },
    { label: 'FNC', width: 1.2, aliases: ['FN'] },
    { label: 'MNU', width: 1.2, aliases: ['APPS', 'MENU'] },
    { id: 'ctrl-right', label: 'CTL', width: 1.4, aliases: ['CTRL', 'CONTROL'] },
  ],
]

const NAVIGATION_KEYBOARD_ROWS: KeyboardKeySpec[][] = [
  [
    { label: 'PRT', aliases: ['PRTSC', 'PRINT SCREEN', 'PRT SC', 'SNAPSHOT'] },
    { label: 'SCR', aliases: ['SCRLK', 'SCROLL LOCK'] },
    { label: 'PAU', aliases: ['PAUSE', 'BREAK'] },
  ],
  [
    { label: 'INS', aliases: ['INS', 'INSERT'] },
    { label: 'HOM', aliases: ['HOME'] },
    { label: 'PGU', aliases: ['PGUP', 'PAGE UP'] },
  ],
  [
    { label: 'DEL', aliases: ['DEL', 'DELETE'] },
    { label: 'END', aliases: ['END'] },
    { label: 'PGD', aliases: ['PGDN', 'PAGE DOWN'] },
  ],
  [spacer('nav-gap-1'), spacer('nav-gap-2'), spacer('nav-gap-3')],
  [spacer('arrow-gap-left'), { label: '↑', aliases: ['UP', 'ARROWUP'] }, spacer('arrow-gap-right')],
  [
    { label: '←', aliases: ['LEFT', 'ARROWLEFT'] },
    { label: '↓', aliases: ['DOWN', 'ARROWDOWN'] },
    { label: '→', aliases: ['RIGHT', 'ARROWRIGHT'] },
  ],
]

const NUMPAD_KEYBOARD_ROWS: KeyboardKeySpec[][] = [
  [
    {
      label: 'NML',
      aliases: ['NUM LOCK', 'NUMLOCK'],
      matchLabel: false,
    },
    {
      label: '/',
      aliases: ['NUMPADDIVIDE', 'NUMPAD/', 'NUM /'],
      matchLabel: false,
    },
    {
      label: '*',
      aliases: ['NUMPADMULTIPLY', 'NUMPAD*', 'NUM *'],
      matchLabel: false,
    },
    {
      label: '-',
      aliases: ['NUMPADSUBTRACT', 'NUMPAD-', 'NUM -'],
      matchLabel: false,
    },
  ],
  [
    { label: '7', aliases: ['NUMPAD7', 'NUM 7'], matchLabel: false },
    { label: '8', aliases: ['NUMPAD8', 'NUM 8'], matchLabel: false },
    { label: '9', aliases: ['NUMPAD9', 'NUM 9'], matchLabel: false },
    {
      id: 'numpad-plus-top',
      label: '+',
      aliases: ['NUMPADADD', 'NUMPAD+', 'NUM +'],
      matchLabel: false,
      showCount: false,
    },
  ],
  [
    { label: '4', aliases: ['NUMPAD4', 'NUM 4'], matchLabel: false },
    { label: '5', aliases: ['NUMPAD5', 'NUM 5'], matchLabel: false },
    { label: '6', aliases: ['NUMPAD6', 'NUM 6'], matchLabel: false },
    {
      id: 'numpad-plus-bottom',
      label: '+',
      aliases: ['NUMPADADD', 'NUMPAD+', 'NUM +'],
      matchLabel: false,
    },
  ],
  [
    { label: '1', aliases: ['NUMPAD1', 'NUM 1'], matchLabel: false },
    { label: '2', aliases: ['NUMPAD2', 'NUM 2'], matchLabel: false },
    { label: '3', aliases: ['NUMPAD3', 'NUM 3'], matchLabel: false },
    {
      id: 'numpad-enter-top',
      label: 'ENT',
      aliases: ['NUMPADENTER', 'ENTER', 'RETURN'],
      matchLabel: false,
      showCount: false,
    },
  ],
  [
    { label: '0', width: 2.0, aliases: ['NUMPAD0', 'NUM 0'], matchLabel: false },
    { label: '.', aliases: ['NUMPADDECIMAL', 'NUM .'], matchLabel: false },
    {
      id: 'numpad-enter-bottom',
      label: 'ENT',
      aliases: ['NUMPADENTER', 'ENTER', 'RETURN'],
      matchLabel: false,
    },
  ],
]

export function normalizeKeyName(value: string): string {
  return value.trim().replaceAll(' ', '').replaceAll('_', '').replaceAll('\n', '').toLowerCase()
}

function resolveLookupAliases(spec: KeyboardKeySpec): string[] {
  const aliases = spec.aliases ?? []
  if (spec.matchLabel === false || !spec.label) {
    return aliases
  }

  return [spec.label, ...aliases]
}

function parseHexColor(color: string): [number, number, number] {
  const hex = color.replace('#', '')
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map(value => `${value}${value}`)
          .join('')
      : hex
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ]
}

function formatHexColor([red, green, blue]: [number, number, number]): string {
  return [red, green, blue]
    .map(value =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .reduce((result, value) => `${result}${value}`, '#')
}

function mixHexColor(from: string, to: string, progress: number): string {
  const source = parseHexColor(from)
  const target = parseHexColor(to)
  const clampedProgress = Math.min(1, Math.max(0, progress))

  return formatHexColor([
    source[0] + (target[0] - source[0]) * clampedProgress,
    source[1] + (target[1] - source[1]) * clampedProgress,
    source[2] + (target[2] - source[2]) * clampedProgress,
  ])
}

function readResolvedTheme(): ResolvedInputStatsTheme {
  if (typeof document === 'undefined') {
    return 'dark'
  }

  return document.documentElement.dataset.coveTheme === 'light' ? 'light' : 'dark'
}

function resolveThemePalette(theme: ResolvedInputStatsTheme): InputStatsHeatPalette {
  return theme === 'light' ? LIGHT_HEAT_PALETTE : DARK_HEAT_PALETTE
}

function resolveHeatColor(count: number, maxCount: number, palette: InputStatsHeatPalette): string {
  if (count <= 0) {
    return palette.idle
  }

  const safeMax = maxCount <= 0 ? 1 : maxCount
  const normalized = Math.min(1, Math.max(0, count / safeMax))
  const progress = Math.min(1, Math.max(0, Number(Math.pow(normalized, 0.52))))

  if (progress <= 0.3) {
    return mixHexColor(palette.lowStart, palette.lowEnd, progress / 0.3)
  }
  if (progress <= 0.6) {
    return mixHexColor(palette.lowEnd, palette.midEnd, (progress - 0.3) / 0.3)
  }
  if (progress <= 0.85) {
    return mixHexColor(palette.midEnd, palette.highEnd, (progress - 0.6) / 0.25)
  }

  return mixHexColor(palette.highEnd, palette.peakEnd, (progress - 0.85) / 0.15)
}

function resolveTextColor(backgroundColor: string): string {
  const [red, green, blue] = parseHexColor(backgroundColor).map(value => value / 255)
  const toLinear = (value: number): number =>
    value <= 0.03928 ? value / 12.92 : Number(Math.pow((value + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
  return luminance < 0.5 ? '#F8FAFC' : '#1F2937'
}

function resolveLabelFontSize(spec: KeyboardKeySpec): number {
  const label = spec.label ?? ''
  const width = spec.width ?? 1
  if (label.length >= 3 && width <= 1.05) {
    return 11.6
  }
  if (label.length >= 3 && width <= 1.2) {
    return 12.2
  }
  if (label.length >= 3 && width <= 1.5) {
    return 13
  }
  if (label.length <= 3) {
    return 17.2
  }
  if (label.length <= 4) {
    return 15.4
  }
  if ((spec.width ?? 1) >= 2.5) {
    return 13.8
  }
  if (label.includes('\n')) {
    return 13.4
  }
  if (label.length >= 6) {
    return 12.6
  }
  return 14
}

function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}k`
  }
  return String(count)
}

function resolveCount(spec: KeyboardKeySpec, countsByKey: Map<string, number>): number {
  if (spec.kind === 'spacer' || !spec.label) {
    return 0
  }

  const aliases = new Set(resolveLookupAliases(spec).map(normalizeKeyName).filter(Boolean))
  let value = 0

  for (const alias of aliases) {
    value += countsByKey.get(alias) ?? 0
  }

  return value
}

function resolveMatchedItem(
  spec: KeyboardKeySpec,
  itemsByKey: Map<string, InputStatsKeyCountItemDto>,
): InputStatsKeyCountItemDto | null {
  if (spec.kind === 'spacer' || !spec.label) {
    return null
  }

  return (
    resolveLookupAliases(spec)
      .map(alias => itemsByKey.get(normalizeKeyName(alias)) ?? null)
      .find(item => item !== null) ?? null
  )
}

function isSelectedKey(spec: KeyboardKeySpec, selectedKey: string | null): boolean {
  if (!selectedKey || spec.kind === 'spacer') {
    return false
  }

  const normalizedSelectedKey = normalizeKeyName(selectedKey)
  return resolveLookupAliases(spec).map(normalizeKeyName).includes(normalizedSelectedKey)
}

function resolveFlexWidth(width = 1): string {
  return `calc((var(--input-stats-key-unit) * ${width}) + (var(--input-stats-key-gap) * ${Math.max(0, width - 1)}))`
}

function resolveTileWidth(width = 1): number {
  if (width <= 1) {
    return BASE_KEY_SIZE
  }

  return BASE_KEY_SIZE * width + 6 * (width - 1)
}

function resolveBlockWidth(rows: KeyboardKeySpec[][]): number {
  return rows.reduce((maxWidth, row) => {
    const rowWidth = row.reduce((currentWidth, spec, index) => {
      const nextWidth = currentWidth + resolveTileWidth(spec.width ?? 1)
      return index === row.length - 1 ? nextWidth : nextWidth + 6
    }, 0)

    return Math.max(maxWidth, rowWidth)
  }, 0)
}

function resolveBlockHeight(rows: KeyboardKeySpec[][]): number {
  if (rows.length === 0) {
    return 0
  }

  return rows.length * BASE_KEY_SIZE + (rows.length - 1) * 6
}

function resolveKeyboardSurfaceSize(): { width: number; height: number } {
  const mainWidth = resolveBlockWidth(MAIN_KEYBOARD_ROWS)
  const navigationWidth = resolveBlockWidth(NAVIGATION_KEYBOARD_ROWS)
  const numpadWidth = resolveBlockWidth(NUMPAD_KEYBOARD_ROWS)
  const width = mainWidth + navigationWidth + numpadWidth + 7 * 2 + 5 * 2

  const mainHeight = resolveBlockHeight(MAIN_KEYBOARD_ROWS)
  const navigationHeight = resolveBlockHeight(NAVIGATION_KEYBOARD_ROWS)
  const numpadHeight = resolveBlockHeight(NUMPAD_KEYBOARD_ROWS) + BASE_KEY_SIZE + 6
  const height = Math.max(mainHeight, navigationHeight, numpadHeight) + 5 * 2

  return { width, height }
}

function resolveKeySpecId(spec: KeyboardKeySpec): string {
  if (spec.id) {
    return spec.id
  }

  if (spec.kind === 'spacer') {
    return `spacer-${spec.width ?? 1}`
  }

  const aliases = spec.aliases?.join('-') ?? 'none'
  return `${spec.label ?? 'key'}-${aliases}-${spec.width ?? 1}-${spec.showCount === false ? 'hidden' : 'shown'}`
}

function resolveRowId(row: KeyboardKeySpec[], prefix: string): string {
  return `${prefix}-${row.map(resolveKeySpecId).join('|')}`
}

function renderKey(
  spec: KeyboardKeySpec,
  maxCount: number,
  countsByKey: Map<string, number>,
  itemsByKey: Map<string, InputStatsKeyCountItemDto>,
  palette: InputStatsHeatPalette,
  selectedKey: string | null,
  onKeySelect?: (key: string) => void,
): React.JSX.Element {
  const keyId = resolveKeySpecId(spec)

  if (spec.kind === 'spacer') {
    return (
      <span
        key={keyId}
        className="input-stats-heatmap__spacer"
        style={{ width: resolveFlexWidth(spec.width ?? 1) }}
        aria-hidden="true"
      />
    )
  }

  const count = resolveCount(spec, countsByKey)
  const matchedItem = resolveMatchedItem(spec, itemsByKey)
  const isSelected = isSelectedKey(spec, selectedKey)
  const backgroundColor = resolveHeatColor(count, maxCount, palette)
  const textColor = resolveTextColor(backgroundColor)
  const style = {
    width: resolveFlexWidth(spec.width ?? 1),
    backgroundColor,
    color: textColor,
    ['--input-stats-key-label-font-size' as string]: `${resolveLabelFontSize(spec)}px`,
    ['--input-stats-key-count-font-size' as string]: `${Math.max(8.5, 10.5 * (BASE_KEY_SIZE / 44))}px`,
  } as React.CSSProperties
  const className = `input-stats-heatmap__key${isSelected ? ' input-stats-heatmap__key--selected' : ''}${matchedItem ? ' input-stats-heatmap__key--interactive' : ''}`
  const sharedProps = {
    className,
    style,
    title: `${spec.label} · ${count}`,
    'data-selected': isSelected ? 'true' : 'false',
  } as const

  const content = (
    <>
      <span className="input-stats-heatmap__label">{spec.label}</span>
      {spec.showCount !== false ? (
        <span className="input-stats-heatmap__count">{formatCount(count)}</span>
      ) : null}
    </>
  )

  if (matchedItem && onKeySelect) {
    return (
      <button
        key={keyId}
        type="button"
        {...sharedProps}
        aria-pressed={isSelected}
        onClick={() => {
          onKeySelect(matchedItem.key)
        }}
      >
        {content}
      </button>
    )
  }

  return (
    <div key={keyId} {...sharedProps}>
      {content}
    </div>
  )
}

export function InputStatsKeyboardHeatmap({
  items,
  selectedKey = null,
  onKeySelect,
}: {
  items: InputStatsKeyCountItemDto[]
  selectedKey?: string | null
  onKeySelect?: (key: string) => void
}): React.JSX.Element {
  const { t } = useTranslation()
  const boardRef = React.useRef<HTMLDivElement | null>(null)
  const [boardWidth, setBoardWidth] = React.useState(0)
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedInputStatsTheme>(() =>
    readResolvedTheme(),
  )
  const surfaceSize = React.useMemo(() => resolveKeyboardSurfaceSize(), [])
  const heatPalette = React.useMemo(() => resolveThemePalette(resolvedTheme), [resolvedTheme])

  React.useEffect(() => {
    const applyTheme = (): void => {
      setResolvedTheme(readResolvedTheme())
    }

    applyTheme()
    window.addEventListener('freecli-theme-changed', applyTheme)
    return () => {
      window.removeEventListener('freecli-theme-changed', applyTheme)
    }
  }, [])

  const countsByKey = React.useMemo(() => {
    const mapping = new Map<string, number>()
    for (const item of items) {
      mapping.set(normalizeKeyName(item.key), item.count)
    }
    return mapping
  }, [items])

  const itemsByKey = React.useMemo(() => {
    const mapping = new Map<string, InputStatsKeyCountItemDto>()
    for (const item of items) {
      mapping.set(normalizeKeyName(item.key), item)
    }
    return mapping
  }, [items])

  const maxCount = React.useMemo(() => {
    const specs = [...MAIN_KEYBOARD_ROWS, ...NAVIGATION_KEYBOARD_ROWS, ...NUMPAD_KEYBOARD_ROWS]
      .flat()
      .filter(spec => spec.kind !== 'spacer')

    return specs.reduce(
      (currentMax, spec) => Math.max(currentMax, resolveCount(spec, countsByKey)),
      0,
    )
  }, [countsByKey])

  React.useEffect(() => {
    const boardNode = boardRef.current
    if (!boardNode) {
      return
    }

    const update = () => {
      setBoardWidth(boardNode.clientWidth)
    }

    update()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      update()
    })

    observer.observe(boardNode)

    return () => {
      observer.disconnect()
    }
  }, [])

  const resolvedScale = React.useMemo(() => {
    if (boardWidth <= 0 || surfaceSize.width <= 0) {
      return 1
    }

    const fittingWidth = Math.max(
      0,
      boardWidth - CARD_EDGE_GUTTER * 2 - SURFACE_SHADOW_BLEED_X * 2 - SCALE_SAFETY_PX,
    )
    const rawScale = fittingWidth / surfaceSize.width
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, rawScale))
  }, [boardWidth, surfaceSize.width])

  const viewportWidth = boardWidth > 0 ? boardWidth : undefined
  const scaledContentWidth =
    surfaceSize.width > 0 ? Math.floor(surfaceSize.width * resolvedScale) : undefined
  const scaledContentHeight =
    surfaceSize.height > 0 ? Math.floor(surfaceSize.height * resolvedScale) : undefined
  const visualSurfaceWidth =
    scaledContentWidth !== undefined ? scaledContentWidth + SURFACE_SHADOW_BLEED_X * 2 : undefined
  const viewportHeight =
    scaledContentHeight !== undefined
      ? scaledContentHeight + SURFACE_SHADOW_BLEED_TOP + SURFACE_SHADOW_BLEED_BOTTOM
      : undefined
  const horizontalInset =
    viewportWidth && visualSurfaceWidth
      ? Math.max(
          CARD_EDGE_GUTTER - LEFT_ALIGNMENT_BIAS,
          Math.round((viewportWidth - visualSurfaceWidth) / 2) - LEFT_ALIGNMENT_BIAS,
        )
      : CARD_EDGE_GUTTER

  return (
    <div className="input-stats-heatmap" data-testid="input-stats-keyboard-heatmap">
      <div ref={boardRef} className="input-stats-heatmap__board">
        <div
          className="input-stats-heatmap__viewport"
          style={{ width: viewportWidth, height: viewportHeight }}
        >
          <div
            className="input-stats-heatmap__surface-shell"
            style={{
              width: viewportWidth,
              height: viewportHeight,
            }}
          >
            <div
              className="input-stats-heatmap__surface"
              style={{
                transform: `scale(${resolvedScale})`,
                left: horizontalInset + SURFACE_SHADOW_BLEED_X,
                top: SURFACE_SHADOW_BLEED_TOP,
              }}
            >
              <div className="input-stats-heatmap__layout">
                <div className="input-stats-heatmap__cluster input-stats-heatmap__cluster--main">
                  {MAIN_KEYBOARD_ROWS.map(row => (
                    <div key={resolveRowId(row, 'main')} className="input-stats-heatmap__row">
                      {row.map(spec =>
                        renderKey(
                          spec,
                          maxCount,
                          countsByKey,
                          itemsByKey,
                          heatPalette,
                          selectedKey,
                          onKeySelect,
                        ),
                      )}
                    </div>
                  ))}
                </div>

                <div className="input-stats-heatmap__cluster input-stats-heatmap__cluster--navigation">
                  {NAVIGATION_KEYBOARD_ROWS.map(row => (
                    <div key={resolveRowId(row, 'nav')} className="input-stats-heatmap__row">
                      {row.map(spec =>
                        renderKey(
                          spec,
                          maxCount,
                          countsByKey,
                          itemsByKey,
                          heatPalette,
                          selectedKey,
                          onKeySelect,
                        ),
                      )}
                    </div>
                  ))}
                </div>

                <div className="input-stats-heatmap__cluster input-stats-heatmap__cluster--numpad">
                  {NUMPAD_KEYBOARD_ROWS.map(row => (
                    <div key={resolveRowId(row, 'numpad')} className="input-stats-heatmap__row">
                      {row.map(spec =>
                        renderKey(
                          spec,
                          maxCount,
                          countsByKey,
                          itemsByKey,
                          heatPalette,
                          selectedKey,
                          onKeySelect,
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="input-stats-heatmap__legend">
        <span className="input-stats-heatmap__legend-item">
          <i className="input-stats-heatmap__legend-swatch input-stats-heatmap__legend-swatch--low" />
          {t('pluginManager.plugins.inputStats.distributionSelectedIntensityLight')}
        </span>
        <span className="input-stats-heatmap__legend-item">
          <i className="input-stats-heatmap__legend-swatch input-stats-heatmap__legend-swatch--mid" />
          {t('pluginManager.plugins.inputStats.distributionSelectedIntensityWarm')}
        </span>
        <span className="input-stats-heatmap__legend-item">
          <i className="input-stats-heatmap__legend-swatch input-stats-heatmap__legend-swatch--high" />
          {t('pluginManager.plugins.inputStats.distributionSelectedIntensityCore')}
        </span>
      </div>
    </div>
  )
}
