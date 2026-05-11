import { afterEach, describe, expect, it, vi } from 'vitest'

describe('resolveAgentTestStub', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('prefers a real node binary over Electron process.execPath in test mode', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('FREECLI_TEST_AGENT_SESSION_SCENARIO', 'jsonl-stdin-submit-delayed-turn')
    vi.stubEnv('FREECLI_TEST_AGENT_STUB_SCRIPT', 'D:/Project/FreeCli/scripts/test-agent-session-stub.mjs')
    vi.stubEnv('FREECLI_TEST_NODE_BINARY', 'C:/Program Files/nodejs/node.exe')

    const { resolveAgentTestStub } = await import(
      '../../../src/contexts/agent/presentation/main-ipc/validate'
    )

    const result = resolveAgentTestStub('codex', 'D:/Project/FreeCli', 'gpt-5.2-codex', 'new')

    expect(result).not.toBeNull()
    expect(result?.command).toBe('C:/Program Files/nodejs/node.exe')
    expect(result?.args).toEqual([
      'D:/Project/FreeCli/scripts/test-agent-session-stub.mjs',
      'codex',
      'D:/Project/FreeCli',
      'new',
      'gpt-5.2-codex',
      'jsonl-stdin-submit-delayed-turn',
    ])
  })
})
