import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatSpeed,
} from '../../../src/plugins/systemMonitor/presentation/renderer/systemMonitorFormatting'

describe('systemMonitorFormatting', () => {
  it('formats traffic values with KB as the minimum visible unit', () => {
    expect(formatBytes(0)).toBe('0 KB')
    expect(formatBytes(512)).toBe('0.5 KB')
    expect(formatSpeed(512)).toBe('0.5 KB/s')
  })

  it('switches to MB when traffic exceeds the MB range', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatSpeed(2 * 1024 * 1024)).toBe('2 MB/s')
  })
})
