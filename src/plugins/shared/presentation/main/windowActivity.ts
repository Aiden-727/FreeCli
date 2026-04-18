import { BrowserWindow } from 'electron'

export type MainWindowActivityProbe = () => boolean

export function hasVisibleFocusedWindow(): boolean {
  const getAllWindows = BrowserWindow?.getAllWindows?.bind(BrowserWindow)
  if (!getAllWindows) {
    return true
  }

  return getAllWindows().some(window => {
    if (window.isDestroyed()) {
      return false
    }

    return window.isVisible() && window.isFocused()
  })
}
