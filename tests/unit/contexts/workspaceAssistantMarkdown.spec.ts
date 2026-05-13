import { describe, expect, it } from 'vitest'
import { __workspaceAssistantMarkdownTestUtils } from '../../../src/plugins/workspaceAssistant/presentation/renderer/WorkspaceAssistantMarkdown'

describe('WorkspaceAssistantMarkdown', () => {
  it('parses strong text from double-asterisk markdown', () => {
    const tokens =
      __workspaceAssistantMarkdownTestUtils.tokenizeInline('这里有 **重点内容** 需要加粗')

    expect(tokens).toEqual([
      {
        type: 'text',
        value: '这里有 ',
      },
      {
        type: 'strong',
        value: '重点内容',
      },
      {
        type: 'text',
        value: ' 需要加粗',
      },
    ])
  })

  it('keeps surrounding text stable when strong markdown appears with other inline text', () => {
    const tokens = __workspaceAssistantMarkdownTestUtils.tokenizeInline(
      '请先看 **项目摘要**，再执行 `pnpm dev`',
    )

    expect(tokens).toEqual([
      {
        type: 'text',
        value: '请先看 ',
      },
      {
        type: 'strong',
        value: '项目摘要',
      },
      {
        type: 'text',
        value: '，再执行 ',
      },
      {
        type: 'code',
        value: 'pnpm dev',
      },
    ])
  })
})
