import { describe, expect, it, vi } from 'vitest'
import {
  buildPreferredPtySpawnOptions,
  createPtySession,
} from '../../../src/platform/process/ptyHost/spawnSession'
import type { PtyHostSpawnRequest } from '../../../src/platform/process/ptyHost/protocol'

function createRequest(): PtyHostSpawnRequest {
  return {
    type: 'spawn',
    requestId: 'req-1',
    command: 'pwsh.exe',
    args: ['-NoLogo'],
    cwd: 'D:/Project/freecli',
    env: { TERM: 'xterm-256color' },
    cols: 80,
    rows: 24,
  }
}

describe('ptyHost spawn session', () => {
  it('prefers conpty.dll on Windows to avoid helper flash windows during teardown', () => {
    const options = buildPreferredPtySpawnOptions(createRequest(), 'win32')

    expect(options).toEqual({
      cwd: 'D:/Project/freecli',
      env: { TERM: 'xterm-256color' },
      cols: 80,
      rows: 24,
      name: 'xterm-256color',
      useConpty: true,
      useConptyDll: true,
    })
  })

  it('falls back to default node-pty options when the bundled conpty.dll path is unavailable', () => {
    const request = createRequest()
    const spawnMock = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Cannot find conpty.dll')
      })
      .mockReturnValueOnce({ pid: 1234 })

    const session = createPtySession(spawnMock, request, 'win32')

    expect(session).toEqual({ pid: 1234 })
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      'pwsh.exe',
      ['-NoLogo'],
      expect.objectContaining({
        useConpty: true,
        useConptyDll: true,
      }),
    )
    expect(spawnMock).toHaveBeenNthCalledWith(2, 'pwsh.exe', ['-NoLogo'], {
      cwd: 'D:/Project/freecli',
      env: { TERM: 'xterm-256color' },
      cols: 80,
      rows: 24,
      name: 'xterm-256color',
    })
  })
})
