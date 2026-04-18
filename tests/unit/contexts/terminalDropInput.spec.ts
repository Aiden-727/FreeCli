import { describe, expect, it } from 'vitest'
import {
  buildTerminalDropPasteText,
  isFileDropTransfer,
} from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/dropInput'

describe('terminal drop input helpers', () => {
  it('quotes PowerShell paths safely', () => {
    expect(
      buildTerminalDropPasteText({
        paths: [`C:\\Work Dir\\Bob's File.txt`],
        profileId: 'powershell',
        runtimeKind: 'windows',
      }),
    ).toBe(`'C:\\Work Dir\\Bob''s File.txt'`)
  })

  it('converts Windows drive paths for WSL terminals', () => {
    expect(
      buildTerminalDropPasteText({
        paths: ['C:\\Work Dir\\demo.txt'],
        profileId: 'wsl:Ubuntu',
        runtimeKind: 'wsl',
      }),
    ).toBe(`'/mnt/c/Work Dir/demo.txt'`)
  })

  it('converts Windows drive paths for MSYS bash terminals', () => {
    expect(
      buildTerminalDropPasteText({
        paths: ['D:\\repo\\demo image.png'],
        profileId: 'bash:d:\\git\\bin\\bash.exe',
        runtimeKind: 'windows',
      }),
    ).toBe(`'/d/repo/demo image.png'`)
  })

  it('detects file drops from transfer items and types', () => {
    expect(
      isFileDropTransfer({
        files: [] as unknown as FileList,
        items: [{ kind: 'file' }] as unknown as DataTransferItemList,
        types: [] as unknown as readonly string[],
      } as DataTransfer),
    ).toBe(true)

    expect(
      isFileDropTransfer({
        files: [] as unknown as FileList,
        items: [] as unknown as DataTransferItemList,
        types: ['Files'] as unknown as readonly string[],
      } as DataTransfer),
    ).toBe(true)
  })
})
