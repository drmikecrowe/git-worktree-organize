import { run } from './run.ts'

export interface Worktree {
  path: string
  head: string
  branch: string | null  // null = detached HEAD
  isBare: boolean
}

/**
 * Parse the output of `git worktree list --porcelain` into Worktree objects.
 */
export function parsePorcelain(output: string): Worktree[] {
  const worktrees: Worktree[] = []
  const blocks = output.trim().split(/\n\n+/)

  for (const block of blocks) {
    if (!block.trim()) continue

    const lines = block.trim().split('\n')
    let path = ''
    let head = ''
    let branch: string | null = null
    let isBare = false

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length)
        branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref
      } else if (line === 'detached') {
        branch = null
      } else if (line === 'bare') {
        isBare = true
        branch = null
      }
    }

    worktrees.push({ path, head, branch, isBare })
  }

  return worktrees
}

/**
 * List all worktrees for the repo at `repoPath`.
 */
export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  const result = run('git', ['-C', repoPath, 'worktree', 'list', '--porcelain'])
  return parsePorcelain(result.stdout)
}
