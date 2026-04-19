import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TerminalNodeHeader } from '../../../src/contexts/workspace/presentation/renderer/components/terminalNode/TerminalNodeHeader'

describe('TerminalNodeHeader directory mismatch badge', () => {
  it('renders DIR MISMATCH badge for agent nodes', () => {
    render(
      <TerminalNodeHeader
        title="codex · model"
        kind="agent"
        status="running"
        directoryMismatch={{
          executionDirectory: '/repo/.freecli/worktrees/a',
          expectedDirectory: '/repo/.freecli/worktrees/b',
        }}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByText('目录不匹配')).toBeVisible()
  })

  it('renders DIR MISMATCH badge for terminal nodes', () => {
    render(
      <TerminalNodeHeader
        title="zsh"
        kind="terminal"
        status={null}
        directoryMismatch={{
          executionDirectory: '/repo/.freecli/worktrees/a',
          expectedDirectory: '/repo/.freecli/worktrees/b',
        }}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByText('目录不匹配')).toBeVisible()
  })

  it('renders the persistence switch in the header before the close button', () => {
    const onPersistenceModeChange = vi.fn()
    const { container } = render(
      <TerminalNodeHeader
        title="pwsh"
        kind="terminal"
        status={null}
        persistenceMode="persistent"
        onPersistenceModeChange={onPersistenceModeChange}
        onClose={() => undefined}
      />,
    )

    const switchButton = screen.getByTestId('terminal-node-persistence-switch')
    const closeButton = container.querySelector('.terminal-node__close')

    expect(switchButton).toHaveTextContent('持久化')
    expect(closeButton).not.toBeNull()
    expect(
      switchButton.compareDocumentPosition(closeButton as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0)

    fireEvent.click(switchButton)
    expect(onPersistenceModeChange).toHaveBeenCalledWith('ephemeral')
  })

  it('allows native agent titles to be edited when a title commit handler is provided', () => {
    const onTitleCommit = vi.fn()

    render(
      <TerminalNodeHeader
        title="codex · gpt-5.4"
        kind="agent"
        status="standby"
        onTitleCommit={onTitleCommit}
        onClose={() => undefined}
      />,
    )

    fireEvent.click(screen.getByText('codex · gpt-5.4'), { detail: 2 })

    const input = screen.getByTestId('terminal-node-inline-title-input')
    fireEvent.change(input, { target: { value: '自定义 Agent 标题' } })
    fireEvent.blur(input)

    expect(onTitleCommit).toHaveBeenCalledWith('自定义 Agent 标题')
  })

  it('shows hosted terminal agent chrome for tracked CLI sessions', () => {
    const onCopyLastMessage = vi.fn(async () => undefined)

    render(
      <TerminalNodeHeader
        title="codex · gpt-5.4"
        kind="terminal"
        isAgentLike
        status="standby"
        onCopyLastMessage={onCopyLastMessage}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByText('待命')).toBeVisible()
    expect(screen.getByTestId('terminal-node-copy-last-message')).toBeVisible()
  })

  it('renders a model badge for agent-like headers', () => {
    render(
      <TerminalNodeHeader
        title="codex"
        modelLabel="gpt-5.4"
        kind="terminal"
        isAgentLike
        status="running"
        onClose={() => undefined}
      />,
    )

    expect(screen.getByTestId('terminal-node-model-badge')).toHaveTextContent('gpt-5.4')
  })

  it('renders a Codex credential capsule and opens profile choices', () => {
    const onCredentialProfileChange = vi.fn()

    render(
      <TerminalNodeHeader
        title="pwsh"
        kind="terminal"
        status={null}
        credentialProfileId="cred-codex"
        activeCredentialProfileId="cred-codex"
        terminalCredentialProfiles={[
          { id: 'cred-codex', label: 'Codex Main', provider: 'codex' },
          { id: 'cred-claude', label: 'Claude Main', provider: 'claude-code' },
        ]}
        activeCredentialProvider="codex"
        onCredentialProfileChange={onCredentialProfileChange}
        onClose={() => undefined}
      />,
    )

    expect(screen.getByTestId('terminal-node-credential-capsule')).toHaveTextContent('Codex Main')
    fireEvent.click(screen.getByTestId('terminal-node-credential-capsule'))
    expect(screen.getByTestId('terminal-node-credential-menu')).toBeVisible()
    expect(screen.queryByText('Claude Main')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('terminal-node-credential-option-none'))
    expect(onCredentialProfileChange).toHaveBeenCalledWith(null)
  })

  it('renders the Codex credential capsule for plain terminal sessions', () => {
    render(
      <TerminalNodeHeader
        title="pwsh"
        kind="terminal"
        status={null}
        credentialProfileId="cred-codex"
        activeCredentialProfileId="cred-codex"
        terminalCredentialProfiles={[{ id: 'cred-codex', label: 'Codex Main', provider: 'codex' }]}
        activeCredentialProvider="codex"
        onCredentialProfileChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    const capsule = screen.getByTestId('terminal-node-credential-capsule')
    expect(capsule).toHaveTextContent('Codex')
    expect(capsule).toHaveTextContent('Codex Main')
  })

  it('renders a no-credential Codex capsule when no profiles are configured', () => {
    render(
      <TerminalNodeHeader
        title="pwsh"
        kind="terminal"
        status={null}
        credentialProfileId={null}
        activeCredentialProfileId={null}
        terminalCredentialProfiles={[]}
        activeCredentialProvider="codex"
        onCredentialProfileChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    const capsule = screen.getByTestId('terminal-node-credential-capsule')
    expect(capsule).toHaveTextContent('Codex')
    expect(capsule).toHaveTextContent('不注入凭据')
  })

  it('shows pending restart when selected Codex profile differs from the active session profile', () => {
    render(
      <TerminalNodeHeader
        title="codex"
        kind="terminal"
        status={null}
        credentialProfileId="cred-next"
        activeCredentialProfileId="cred-active"
        terminalCredentialProfiles={[
          { id: 'cred-active', label: 'Active Key', provider: 'codex' },
          { id: 'cred-next', label: 'Next Key', provider: 'codex' },
        ]}
        activeCredentialProvider="codex"
        onCredentialProfileChange={() => undefined}
        onClose={() => undefined}
      />,
    )

    const capsule = screen.getByTestId('terminal-node-credential-capsule')
    expect(capsule).toHaveTextContent('Active Key')
    expect(capsule).toHaveTextContent('待重启')
  })
})
