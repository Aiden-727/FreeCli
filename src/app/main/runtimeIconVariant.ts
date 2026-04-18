import { existsSync } from 'fs'
import { resolve } from 'path'
import type { NativeImage } from 'electron'

type RgbaColor = {
  red: number
  green: number
  blue: number
  alpha: number
}

const DEV_RUNTIME_ICON_FILE_NAME = 'icon.png'

export function shouldRetintDevelopmentAccent(color: RgbaColor): boolean {
  if (color.alpha === 0) {
    return false
  }

  return color.green >= 140 && color.green - color.red >= 35 && color.green - color.blue >= 8
}

export function retintDevelopmentAccent(color: RgbaColor): RgbaColor {
  if (!shouldRetintDevelopmentAccent(color)) {
    return color
  }

  const [, saturation, lightness] = rgbToHsl(color.red, color.green, color.blue)
  const [red, green, blue] = hslToRgb(0, Math.max(saturation, 0.55), lightness)

  return {
    ...color,
    red,
    green,
    blue,
  }
}

export function createDevelopmentRuntimeIcon(baseDir: string = __dirname): NativeImage | null {
  const { nativeImage } = require('electron') as typeof import('electron')
  const iconPngPath = resolve(baseDir, '../../build', DEV_RUNTIME_ICON_FILE_NAME)
  if (!existsSync(iconPngPath)) {
    return null
  }

  const sourceImage = nativeImage.createFromPath(iconPngPath)
  if (sourceImage.isEmpty()) {
    return null
  }

  const { width, height } = sourceImage.getSize()
  const bitmap = Buffer.from(sourceImage.toBitmap())

  for (let offset = 0; offset < bitmap.length; offset += 4) {
    const retinted = retintDevelopmentAccent({
      blue: bitmap[offset] ?? 0,
      green: bitmap[offset + 1] ?? 0,
      red: bitmap[offset + 2] ?? 0,
      alpha: bitmap[offset + 3] ?? 0,
    })

    bitmap[offset] = retinted.blue
    bitmap[offset + 1] = retinted.green
    bitmap[offset + 2] = retinted.red
    bitmap[offset + 3] = retinted.alpha
  }

  return nativeImage.createFromBitmap(bitmap, {
    width,
    height,
    scaleFactor: 1,
  })
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const normalizedRed = red / 255
  const normalizedGreen = green / 255
  const normalizedBlue = blue / 255
  const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue)
  const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue)
  const lightness = (max + min) / 2
  const delta = max - min

  if (delta === 0) {
    return [0, 0, lightness]
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / Math.max(max + min, Number.EPSILON)

  let hue: number
  if (max === normalizedRed) {
    hue = (normalizedGreen - normalizedBlue) / delta + (normalizedGreen < normalizedBlue ? 6 : 0)
  } else if (max === normalizedGreen) {
    hue = (normalizedBlue - normalizedRed) / delta + 2
  } else {
    hue = (normalizedRed - normalizedGreen) / delta + 4
  }

  return [hue / 6, saturation, lightness]
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation === 0) {
    const channel = Math.round(lightness * 255)
    return [channel, channel, channel]
  }

  const q =
    lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation
  const p = 2 * lightness - q

  return [
    Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hue) * 255),
    Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  ]
}

function hueToRgb(p: number, q: number, hue: number): number {
  let normalizedHue = hue

  if (normalizedHue < 0) {
    normalizedHue += 1
  }

  if (normalizedHue > 1) {
    normalizedHue -= 1
  }

  if (normalizedHue < 1 / 6) {
    return p + (q - p) * 6 * normalizedHue
  }

  if (normalizedHue < 1 / 2) {
    return q
  }

  if (normalizedHue < 2 / 3) {
    return p + (q - p) * (2 / 3 - normalizedHue) * 6
  }

  return p
}
