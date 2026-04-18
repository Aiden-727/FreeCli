import { describe, expect, it } from 'vitest'
import { resolveTaskExecutionContext } from '../../../../src/contexts/session/application/resolveTaskExecutionContext'

describe('resolveTaskExecutionContext', () => {
  it('resolves to the owning space directory when present', () => {
    const result = resolveTaskExecutionContext({
      spaces: [
        { id: 'space-1', directoryPath: '/tmp/repo/.freecli/worktrees/demo', nodeIds: ['t'] },
      ],
      taskNodeId: 't',
      workspacePath: '/tmp/repo',
    })

    expect(result.workingDirectory).toBe('/tmp/repo/.freecli/worktrees/demo')
    expect(result.target).toEqual({
      scheme: 'file',
      rootPath: '/tmp/repo/.freecli/worktrees/demo',
      rootUri: 'file:///tmp/repo/.freecli/worktrees/demo',
    })
    expect(result.endpoint).toEqual({ id: 'local', kind: 'local' })
  })

  it('falls back to workspacePath when the space directory is empty', () => {
    const result = resolveTaskExecutionContext({
      spaces: [{ id: 'space-1', directoryPath: '   ', nodeIds: ['t'] }],
      taskNodeId: 't',
      workspacePath: '/tmp/repo',
    })

    expect(result.workingDirectory).toBe('/tmp/repo')
    expect(result.target.rootUri).toBe('file:///tmp/repo')
  })
})
