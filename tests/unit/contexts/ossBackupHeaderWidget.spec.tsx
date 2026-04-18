import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OssBackupStateDto } from '../../../src/shared/contracts/dto'
import OssBackupHeaderWidget from '../../../src/plugins/ossBackup/presentation/renderer/OssBackupHeaderWidget'

function installOssBackupApiMock(state: OssBackupStateDto) {
  Object.defineProperty(window, 'freecliApi', {
    configurable: true,
    value: {
      meta: {
        isTest: true,
        allowWhatsNewInTests: true,
        platform: 'win32',
      },
      plugins: {
        ossBackup: {
          getState: vi.fn().mockResolvedValue(state),
          onState: vi.fn().mockImplementation(() => () => undefined),
        },
      },
    },
  })
}

describe('OssBackupHeaderWidget', () => {
  afterEach(() => {
    delete (window as unknown as { freecliApi?: unknown }).freecliApi
  })

  it('renders success indicator and opens oss backup page on click', async () => {
    installOssBackupApiMock({
      isEnabled: true,
      status: 'ready',
      isTestingConnection: false,
      isBackingUp: false,
      isRestoring: false,
      nextAutoBackupDueAt: null,
      lastBackupAt: '2026-04-13T10:00:00.000Z',
      lastRestoreAt: null,
      lastSnapshotAt: null,
      includedPluginIds: [],
      lastError: null,
    })

    const onOpenPluginManager = vi.fn()
    render(<OssBackupHeaderWidget onOpenPluginManager={onOpenPluginManager} />)

    const button = await screen.findByTestId('app-header-oss-backup-status')
    expect(button.className).toContain('app-header__oss-sync-button--success')
    expect(screen.getByTestId('app-header-oss-backup-status-badge').querySelector('svg')).not.toBeNull()

    fireEvent.click(button)
    expect(onOpenPluginManager).toHaveBeenCalledWith('oss-backup')
  })

  it('renders syncing indicator when backup is running', async () => {
    installOssBackupApiMock({
      isEnabled: true,
      status: 'backing_up',
      isTestingConnection: false,
      isBackingUp: true,
      isRestoring: false,
      nextAutoBackupDueAt: null,
      lastBackupAt: null,
      lastRestoreAt: null,
      lastSnapshotAt: null,
      includedPluginIds: [],
      lastError: null,
    })

    render(<OssBackupHeaderWidget onOpenPluginManager={() => undefined} />)
    const button = await screen.findByTestId('app-header-oss-backup-status')
    expect(button.className).toContain('app-header__oss-sync-button--syncing')
    expect(screen.getByTestId('app-header-oss-backup-status-badge').querySelectorAll('circle')).toHaveLength(3)
  })
})
