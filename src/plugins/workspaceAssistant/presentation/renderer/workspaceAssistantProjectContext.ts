import { toFileUri } from '@contexts/filesystem/domain/fileUri'
import type { WorkspaceAssistantProjectFileSummaryDto } from '@shared/contracts/dto'

const PROJECT_FILE_CANDIDATES: Array<{
  name: string
  kind: WorkspaceAssistantProjectFileSummaryDto['kind']
}> = [
  { name: 'README.md', kind: 'readme' },
  { name: 'README.zh-CN.md', kind: 'readme' },
  { name: 'package.json', kind: 'package_json' },
  { name: 'tsconfig.json', kind: 'tsconfig' },
  { name: 'pnpm-workspace.yaml', kind: 'pnpm_workspace' },
  { name: '.gitignore', kind: 'gitignore' },
]

function joinPath(root: string, child: string): string {
  const normalizedRoot = root.replace(/[\\/]+$/, '')
  if (normalizedRoot.length === 0) {
    return child
  }

  return `${normalizedRoot}${normalizedRoot.includes('\\') ? '\\' : '/'}${child}`
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
}

function summarizeReadme(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('!['))
  return truncateText(lines.slice(0, 3).join(' '), 220)
}

function summarizeTsconfig(content: string): string {
  try {
    const parsed = JSON.parse(content) as {
      extends?: unknown
      compilerOptions?: Record<string, unknown>
      include?: unknown
    }
    const parts: string[] = []
    if (typeof parsed.extends === 'string' && parsed.extends.trim().length > 0) {
      parts.push(`extends ${parsed.extends.trim()}`)
    }

    const moduleResolution = parsed.compilerOptions?.moduleResolution
    if (typeof moduleResolution === 'string' && moduleResolution.trim().length > 0) {
      parts.push(`moduleResolution=${moduleResolution.trim()}`)
    }

    const jsx = parsed.compilerOptions?.jsx
    if (typeof jsx === 'string' && jsx.trim().length > 0) {
      parts.push(`jsx=${jsx.trim()}`)
    }

    const include = Array.isArray(parsed.include)
      ? parsed.include.filter((entry): entry is string => typeof entry === 'string')
      : []
    if (include.length > 0) {
      parts.push(`include ${include.slice(0, 3).join(', ')}`)
    }

    return truncateText(parts.join('，'), 220)
  } catch {
    return truncateText(content, 220)
  }
}

function summarizePackageJson(content: string): string {
  try {
    const parsed = JSON.parse(content) as {
      name?: unknown
      productName?: unknown
      scripts?: Record<string, unknown>
      dependencies?: Record<string, unknown>
      devDependencies?: Record<string, unknown>
    }
    const parts: string[] = []
    const displayName =
      typeof parsed.productName === 'string' && parsed.productName.trim().length > 0
        ? parsed.productName.trim()
        : typeof parsed.name === 'string'
          ? parsed.name.trim()
          : ''
    if (displayName.length > 0) {
      parts.push(`包名 ${displayName}`)
    }

    const scripts = parsed.scripts ? Object.keys(parsed.scripts) : []
    if (scripts.length > 0) {
      parts.push(`脚本 ${scripts.slice(0, 5).join(', ')}`)
    }

    const dependenciesCount = parsed.dependencies ? Object.keys(parsed.dependencies).length : 0
    const devDependenciesCount = parsed.devDependencies
      ? Object.keys(parsed.devDependencies).length
      : 0
    parts.push(`依赖 ${dependenciesCount}，开发依赖 ${devDependenciesCount}`)
    return truncateText(parts.join('；'), 220)
  } catch {
    return truncateText(content, 220)
  }
}

function summarizePnpmWorkspace(content: string): string {
  const packagesLine = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('- ') || line.startsWith('packages:'))
  return truncateText(packagesLine.join(' '), 220)
}

function summarizeGitignore(content: string): string {
  const entries = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
  return truncateText(`忽略规则：${entries.slice(0, 6).join('、')}`, 220)
}

function summarizeProjectFile(
  kind: WorkspaceAssistantProjectFileSummaryDto['kind'],
  content: string,
): string {
  switch (kind) {
    case 'readme':
      return summarizeReadme(content)
    case 'package_json':
      return summarizePackageJson(content)
    case 'tsconfig':
      return summarizeTsconfig(content)
    case 'pnpm_workspace':
      return summarizePnpmWorkspace(content)
    case 'gitignore':
      return summarizeGitignore(content)
    default:
      return truncateText(content, 220)
  }
}

export async function collectWorkspaceAssistantProjectFiles(
  rootPath: string,
): Promise<WorkspaceAssistantProjectFileSummaryDto[]> {
  const readFileText = window.freecliApi?.filesystem?.readFileText
  if (typeof readFileText !== 'function' || rootPath.trim().length === 0) {
    return []
  }

  const summaries = await Promise.all(
    PROJECT_FILE_CANDIDATES.map(async candidate => {
      try {
        const path = joinPath(rootPath, candidate.name)
        const result = await readFileText({
          uri: toFileUri(path),
        })

        return {
          kind: candidate.kind,
          name: candidate.name,
          path,
          summary: summarizeProjectFile(candidate.kind, result.content),
        } satisfies WorkspaceAssistantProjectFileSummaryDto
      } catch {
        return null
      }
    }),
  )

  return summaries.filter(
    (entry): entry is WorkspaceAssistantProjectFileSummaryDto =>
      entry !== null && entry.summary.trim().length > 0,
  )
}

export function buildWorkspaceAssistantProjectSummary(
  projectFiles: WorkspaceAssistantProjectFileSummaryDto[],
): string | null {
  if (projectFiles.length === 0) {
    return null
  }

  const preferredOrder: WorkspaceAssistantProjectFileSummaryDto['kind'][] = [
    'readme',
    'package_json',
    'pnpm_workspace',
    'tsconfig',
    'gitignore',
  ]

  const ordered = [...projectFiles].sort(
    (left, right) => preferredOrder.indexOf(left.kind) - preferredOrder.indexOf(right.kind),
  )

  const parts = ordered.slice(0, 3).map(file => {
    switch (file.kind) {
      case 'readme':
        return `README：${file.summary}`
      case 'package_json':
        return `package.json：${file.summary}`
      case 'pnpm_workspace':
        return `pnpm-workspace：${file.summary}`
      case 'tsconfig':
        return `tsconfig：${file.summary}`
      case 'gitignore':
        return `.gitignore：${file.summary}`
      default:
        return `${file.name}：${file.summary}`
    }
  })

  return truncateText(parts.join('；'), 320)
}
