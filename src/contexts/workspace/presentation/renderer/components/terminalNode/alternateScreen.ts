export interface TerminalAlternateScreenState {
  active: boolean
  escapeState: 'none' | 'esc' | 'csi'
  csiBuffer: string
}

export function createTerminalAlternateScreenState(): TerminalAlternateScreenState {
  return {
    active: false,
    escapeState: 'none',
    csiBuffer: '',
  }
}

function resolveAlternateScreenTransition(sequence: string): boolean | null {
  if (sequence === '?47h' || sequence === '?1047h' || sequence === '?1049h') {
    return true
  }

  if (sequence === '?47l' || sequence === '?1047l' || sequence === '?1049l') {
    return false
  }

  return null
}

export function applyTerminalAlternateScreenData(
  state: TerminalAlternateScreenState,
  data: string,
): { nextState: TerminalAlternateScreenState; didChange: boolean } {
  let active = state.active
  let escapeState = state.escapeState
  let csiBuffer = state.csiBuffer
  let didChange = false

  for (const char of data) {
    if (escapeState === 'esc') {
      if (char === '[') {
        escapeState = 'csi'
        csiBuffer = ''
      } else {
        escapeState = 'none'
      }
      continue
    }

    if (escapeState === 'csi') {
      if (char >= '@' && char <= '~') {
        const nextActive = resolveAlternateScreenTransition(`${csiBuffer}${char}`)
        if (typeof nextActive === 'boolean' && nextActive !== active) {
          active = nextActive
          didChange = true
        }

        escapeState = 'none'
        csiBuffer = ''
      } else {
        csiBuffer += char
      }
      continue
    }

    if (char === '\u001b') {
      escapeState = 'esc'
    }
  }

  return {
    nextState: {
      active,
      escapeState,
      csiBuffer,
    },
    didChange,
  }
}
