// The calls the pets guard: each needs the person's OK before it runs. Most
// come from the rules in Zo's CLAUDE.md (no commits or pushes unless asked,
// no regenerating the authored curriculum sources, deploy only on purpose),
// the rest from commands that destroy work.

type Rule = { readonly test: RegExp; readonly reason: string }

// `git` with any global flags (`-C path`, `--no-pager`) before the subcommand.
const git = (subcommand: string) => new RegExp(`\\bgit(?:\\s+-C\\s+\\S+|\\s+--?[\\w-]+(?:=\\S+)?)*\\s+${subcommand}`)

const RULES: readonly Rule[] = [
  { test: git('commit\\b'), reason: 'commits need your OK' },
  { test: git('push\\b'), reason: 'pushes need your OK' },
  { test: git('reset\\s+--hard\\b'), reason: 'a hard reset throws away work' },
  { test: git('clean\\s+-[a-zA-Z]*f'), reason: 'git clean deletes untracked files' },
  { test: git('(?:checkout|restore)\\s+(?:--\\s+)?\\.(?:\\s|$)'), reason: 'it discards every uncommitted change' },
  { test: git('branch\\s+-D\\b'), reason: 'it deletes a branch' },
  { test: git('stash\\s+(?:drop|clear)\\b'), reason: 'it throws away stashed work' },
  { test: /\bsupabase\s+(?:functions\s+deploy|db\s+(?:push|reset))\b/, reason: 'it changes the hosted Supabase project' },
  { test: /\bdeno\s+task\s+generate:curriculum-sources\b/, reason: 'it regenerates the authored curriculum sources' },
  { test: /\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\b/i, reason: 'it drops data' },
]

const SCRATCH = /^["']?(?:\/private)?\/tmp\//

// `rm -r` anywhere but scratch space under /tmp: every target must be an
// absolute /tmp path, since a variable or a relative path could be anything.
const removesRecursively = (command: string) =>
  command.split(/&&|\|\||;|\|/).some(segment => {
    const words = segment.trim().split(/\s+/)
    const at = words.indexOf('rm')
    if (at < 0) return false
    const args = words.slice(at + 1)
    if (!args.some(a => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive')) return false
    const targets = args.filter(a => !a.startsWith('-'))
    return targets.length === 0 || !targets.every(t => SCRATCH.test(t))
  })

// Why this call needs the person's OK, or null when it does not.
export const riskOf = (tool: string, input: unknown): string | null => {
  const args = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  if (tool === 'Write' && typeof args.file_path === 'string' && args.file_path.endsWith('curriculum_indicator_sources.json')) {
    return 'it overwrites the authored curriculum sources'
  }
  if (tool !== 'Bash' || typeof args.command !== 'string') return null
  if (removesRecursively(args.command)) return 'it deletes files recursively'
  return RULES.find(rule => rule.test.test(args.command as string))?.reason ?? null
}

// The command as the dialog quotes it: one line, cut to fit.
export const quoteOf = (tool: string, input: unknown) => {
  const args = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const raw = typeof args.command === 'string' ? args.command : typeof args.file_path === 'string' ? `${tool} ${args.file_path}` : tool
  const line = raw.replace(/\s+/g, ' ').trim()
  return line.length > 90 ? `${line.slice(0, 87)}...` : line
}
