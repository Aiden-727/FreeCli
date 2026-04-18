import { describe, expect, it } from 'vitest'
import { MainPluginRuntimeHost } from '../../../src/contexts/plugins/application/MainPluginRuntimeHost'

describe('MainPluginRuntimeHost', () => {
  it('activates and deactivates runtimes according to the enabled plugin set', async () => {
    const events: string[] = []
    const host = new MainPluginRuntimeHost({
      'input-stats': () => ({
        activate: () => {
          events.push('activate:input-stats')
        },
        deactivate: () => {
          events.push('deactivate:input-stats')
        },
      }),
    })

    await expect(host.syncEnabledPlugins(['input-stats'])).resolves.toEqual(['input-stats'])
    await expect(host.syncEnabledPlugins([])).resolves.toEqual([])

    expect(events).toEqual(['activate:input-stats', 'deactivate:input-stats'])
  })

  it('disposes all active runtimes', async () => {
    const events: string[] = []
    const host = new MainPluginRuntimeHost({
      'input-stats': () => ({
        activate: () => {
          events.push('activate')
        },
        deactivate: () => {
          events.push('deactivate')
        },
      }),
    })

    await host.syncEnabledPlugins(['input-stats'])
    await host.dispose()

    expect(events).toEqual(['activate', 'deactivate'])
  })

  it('rolls back a runtime when activation fails', async () => {
    const events: string[] = []
    const host = new MainPluginRuntimeHost({
      'input-stats': () => ({
        activate: () => {
          events.push('activate')
          throw new Error('boom')
        },
        deactivate: () => {
          events.push('deactivate')
        },
      }),
    })

    await expect(host.syncEnabledPlugins(['input-stats'])).rejects.toThrow('boom')
    await expect(host.syncEnabledPlugins([])).resolves.toEqual([])

    expect(events).toEqual(['activate', 'deactivate'])
  })

  it('ignores enabled plugin ids that do not have a runtime factory', async () => {
    const host = new MainPluginRuntimeHost()

    await expect(host.syncEnabledPlugins(['quota-monitor'])).resolves.toEqual([])
  })
})
