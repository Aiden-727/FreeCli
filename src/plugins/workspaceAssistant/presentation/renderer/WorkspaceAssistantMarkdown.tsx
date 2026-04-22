import React from 'react'

interface InlineToken {
  type: 'text' | 'strong' | 'code' | 'link'
  value: string
  href?: string
}

interface ParagraphBlock {
  type: 'paragraph'
  text: string
}

interface HeadingBlock {
  type: 'heading'
  level: 1 | 2 | 3
  text: string
}

interface QuoteBlock {
  type: 'quote'
  lines: string[]
}

interface ListBlock {
  type: 'list'
  ordered: boolean
  items: string[]
}

interface CodeBlock {
  type: 'code'
  language: string | null
  code: string
}

type MarkdownBlock = ParagraphBlock | HeadingBlock | QuoteBlock | ListBlock | CodeBlock

interface InlineMatch {
  token: InlineToken
  length: number
}

function consumeInlineToken(source: string): InlineMatch | null {
  const codeMatch = source.match(/^`([^`\n]+)`/)
  if (codeMatch) {
    return {
      token: {
        type: 'code',
        value: codeMatch[1] ?? '',
      },
      length: codeMatch[0].length,
    }
  }

  const strongMatch = source.match(/^\*\*([^*\n]+)\*\*/)
  if (strongMatch) {
    return {
      token: {
        type: 'strong',
        value: strongMatch[1] ?? '',
      },
      length: strongMatch[0].length,
    }
  }

  const linkMatch = source.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/)
  if (linkMatch) {
    return {
      token: {
        type: 'link',
        value: linkMatch[1] ?? '',
        href: linkMatch[2] ?? '',
      },
      length: linkMatch[0].length,
    }
  }

  return null
}

function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let index = 0

  while (index < text.length) {
    const directMatch = consumeInlineToken(text.slice(index))
    if (directMatch) {
      tokens.push(directMatch.token)
      index += directMatch.length
      continue
    }

    let nextMatchIndex = text.length
    for (let candidateIndex = index + 1; candidateIndex < text.length; candidateIndex += 1) {
      const candidate = consumeInlineToken(text.slice(candidateIndex))
      if (candidate) {
        nextMatchIndex = candidateIndex
        break
      }
    }

    const value = text.slice(index, nextMatchIndex)
    if (value.length > 0) {
      tokens.push({
        type: 'text',
        value,
      })
    }

    index = nextMatchIndex
  }

  return tokens
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] ?? ''
    const trimmed = line.trim()

    if (trimmed.length === 0) {
      index += 1
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2]?.trim() ?? '',
      })
      index += 1
      continue
    }

    const codeFenceMatch = trimmed.match(/^```([\w-]+)?$/)
    if (codeFenceMatch) {
      index += 1
      const codeLines: string[] = []
      while (index < lines.length && !(lines[index]?.trim().startsWith('```') ?? false)) {
        codeLines.push(lines[index] ?? '')
        index += 1
      }
      if (index < lines.length) {
        index += 1
      }
      blocks.push({
        type: 'code',
        language: codeFenceMatch[1]?.trim() || null,
        code: codeLines.join('\n'),
      })
      continue
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = []
      while (index < lines.length) {
        const quoteLine = lines[index] ?? ''
        if (!quoteLine.trim().startsWith('>')) {
          break
        }
        quoteLines.push(quoteLine.replace(/^\s*>\s?/, ''))
        index += 1
      }
      blocks.push({
        type: 'quote',
        lines: quoteLines,
      })
      continue
    }

    const listMatch = trimmed.match(/^([-*]|\d+\.)\s+(.+)$/)
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1] ?? '')
      const items: string[] = []
      while (index < lines.length) {
        const nextLine = lines[index] ?? ''
        const nextTrimmed = nextLine.trim()
        const nextListMatch = nextTrimmed.match(/^([-*]|\d+\.)\s+(.+)$/)
        if (!nextListMatch) {
          break
        }
        items.push(nextListMatch[2]?.trim() ?? '')
        index += 1
      }
      blocks.push({
        type: 'list',
        ordered,
        items,
      })
      continue
    }

    const paragraphLines: string[] = []
    while (index < lines.length) {
      const nextLine = lines[index] ?? ''
      const nextTrimmed = nextLine.trim()
      if (
        nextTrimmed.length === 0 ||
        /^(#{1,3})\s+/.test(nextTrimmed) ||
        /^```/.test(nextTrimmed) ||
        nextTrimmed.startsWith('>') ||
        /^([-*]|\d+\.)\s+/.test(nextTrimmed)
      ) {
        break
      }
      paragraphLines.push(nextTrimmed)
      index += 1
    }

    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join(' '),
    })
  }

  return blocks
}

function renderInline(text: string): React.ReactNode[] {
  return tokenizeInline(text).map((token, index) => {
    const key = `${token.type}_${index}_${token.value}`

    if (token.type === 'strong') {
      return <strong key={key}>{token.value}</strong>
    }

    if (token.type === 'code') {
      return (
        <code key={key} className="workspace-assistant-markdown__inline-code">
          {token.value}
        </code>
      )
    }

    if (token.type === 'link' && token.href) {
      return (
        <a
          key={key}
          href={token.href}
          target="_blank"
          rel="noreferrer"
          className="workspace-assistant-markdown__link"
        >
          {token.value}
        </a>
      )
    }

    return <React.Fragment key={key}>{token.value}</React.Fragment>
  })
}

export default function WorkspaceAssistantMarkdown({
  content,
}: {
  content: string
}): React.JSX.Element {
  const blocks = React.useMemo(() => parseMarkdownBlocks(content), [content])

  return (
    <div className="workspace-assistant-markdown">
      {blocks.map((block, index) => {
        const key = `${block.type}_${index}`

        if (block.type === 'heading') {
          const className = `workspace-assistant-markdown__heading workspace-assistant-markdown__heading--h${block.level}`
          if (block.level === 1) {
            return (
              <h1 key={key} className={className}>
                {renderInline(block.text)}
              </h1>
            )
          }
          if (block.level === 2) {
            return (
              <h2 key={key} className={className}>
                {renderInline(block.text)}
              </h2>
            )
          }
          return (
            <h3 key={key} className={className}>
              {renderInline(block.text)}
            </h3>
          )
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={key} className="workspace-assistant-markdown__quote">
              {block.lines.map((line, lineIndex) => (
                <p key={`${key}_line_${lineIndex}`}>{renderInline(line)}</p>
              ))}
            </blockquote>
          )
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul'
          return (
            <ListTag key={key} className="workspace-assistant-markdown__list">
              {block.items.map((item, itemIndex) => (
                <li key={`${key}_item_${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ListTag>
          )
        }

        if (block.type === 'code') {
          return (
            <pre key={key} className="workspace-assistant-markdown__code-block">
              {block.language ? (
                <span className="workspace-assistant-markdown__code-language">
                  {block.language}
                </span>
              ) : null}
              <code>{block.code}</code>
            </pre>
          )
        }

        return (
          <p key={key} className="workspace-assistant-markdown__paragraph">
            {renderInline(block.text)}
          </p>
        )
      })}
    </div>
  )
}

export const __workspaceAssistantMarkdownTestUtils = {
  tokenizeInline,
}
