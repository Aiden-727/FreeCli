import { describe, expect, it } from 'vitest'
import {
  retintDevelopmentAccent,
  shouldRetintDevelopmentAccent,
} from '../../../src/app/main/runtimeIconVariant'

describe('runtimeIconVariant', () => {
  it('detects the mint prompt accent pixels', () => {
    expect(
      shouldRetintDevelopmentAccent({
        red: 0x20,
        green: 0xd8,
        blue: 0xa4,
        alpha: 0xff,
      }),
    ).toBe(true)

    expect(
      shouldRetintDevelopmentAccent({
        red: 0x1b,
        green: 0x2d,
        blue: 0x52,
        alpha: 0xff,
      }),
    ).toBe(false)
  })

  it('retints the development accent from mint to red without changing alpha', () => {
    const retinted = retintDevelopmentAccent({
      red: 0x20,
      green: 0xd8,
      blue: 0xa4,
      alpha: 0x80,
    })

    expect(retinted.alpha).toBe(0x80)
    expect(retinted.red).toBeGreaterThan(200)
    expect(retinted.green).toBeLessThan(60)
    expect(retinted.blue).toBeLessThan(60)
  })
})
