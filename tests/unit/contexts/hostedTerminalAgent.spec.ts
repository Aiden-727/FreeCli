import { describe, expect, it } from 'vitest'
import {
  buildHostedTerminalDisplayModelLabel,
  buildHostedTerminalAgentResumeCommand,
  parseHostedTerminalAgentCommand,
} from '../../../src/contexts/terminal/domain/hostedAgent'
import {
  applyTerminalAlternateScreenData,
  createTerminalAlternateScreenState,
} from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/alternateScreen'

describe('hosted terminal agent command parsing', () => {
  it('detects a plain codex launch as a resumable hosted session candidate', () => {
    expect(parseHostedTerminalAgentCommand('codex')).toEqual({
      provider: 'codex',
      launchMode: 'new',
      resumeSessionId: null,
      model: null,
      command: 'codex',
    })
  })

  it('builds a hosted terminal model label from the effective model and reasoning effort', () => {
    expect(
      buildHostedTerminalDisplayModelLabel({
        effectiveModel: 'gpt-5.4',
        reasoningEffort: 'high',
      }),
    ).toBe('gpt-5.4 high')

    expect(
      buildHostedTerminalDisplayModelLabel({
        effectiveModel: 'gpt-5.4',
        reasoningEffort: null,
      }),
    ).toBe('gpt-5.4')
  })

  it('detects codex resume with an explicit session id', () => {
    expect(parseHostedTerminalAgentCommand('codex resume session-123')).toEqual({
      provider: 'codex',
      launchMode: 'resume',
      resumeSessionId: 'session-123',
      model: null,
      command: 'codex resume session-123',
    })
  })

  it('detects claude continue without trusting an implicit session id', () => {
    expect(parseHostedTerminalAgentCommand('claude --continue')).toEqual({
      provider: 'claude-code',
      launchMode: 'resume',
      resumeSessionId: null,
      model: null,
      command: 'claude --continue',
    })
  })

  it('extracts an explicit model from supported codex flags', () => {
    expect(parseHostedTerminalAgentCommand('codex --model gpt-5.4')).toEqual({
      provider: 'codex',
      launchMode: 'new',
      resumeSessionId: null,
      model: 'gpt-5.4',
      command: 'codex --model gpt-5.4',
    })

    expect(parseHostedTerminalAgentCommand('codex resume session-123 -m gpt-5.4')).toEqual({
      provider: 'codex',
      launchMode: 'resume',
      resumeSessionId: 'session-123',
      model: 'gpt-5.4',
      command: 'codex resume session-123 -m gpt-5.4',
    })
  })

  it('builds a provider-specific resume command only when an explicit binding exists', () => {
    expect(
      buildHostedTerminalAgentResumeCommand({
        provider: 'claude-code',
        resumeSessionId: 'resume-claude-1',
      }),
    ).toBe('claude --resume resume-claude-1')
    expect(
      buildHostedTerminalAgentResumeCommand({
        provider: 'codex',
        resumeSessionId: 'resume-codex-1',
      }),
    ).toBe('codex resume resume-codex-1')
    expect(
      buildHostedTerminalAgentResumeCommand({
        provider: 'codex',
        resumeSessionId: null,
      }),
    ).toBeNull()
  })
})

describe('terminal alternate screen tracking', () => {
  it('tracks alternate-screen entry and exit across split chunks', () => {
    const first = applyTerminalAlternateScreenData(
      createTerminalAlternateScreenState(),
      '\u001b[?104',
    )
    expect(first.nextState.active).toBe(false)
    expect(first.didChange).toBe(false)

    const second = applyTerminalAlternateScreenData(first.nextState, '9h')
    expect(second.nextState.active).toBe(true)
    expect(second.didChange).toBe(true)

    const third = applyTerminalAlternateScreenData(second.nextState, '\u001b[?1049l')
    expect(third.nextState.active).toBe(false)
    expect(third.didChange).toBe(true)
  })
})
