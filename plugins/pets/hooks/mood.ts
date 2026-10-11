// What Claude is doing, as the pets show it: one mood per tool call, read
// from the tool and, for shell commands, from the command itself.

export type Mood = 'think' | 'read' | 'edit' | 'run' | 'test' | 'web' | 'agent' | 'wait'

const READ = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'ToolSearch'])
const EDIT = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const WEB = new Set(['WebFetch', 'WebSearch'])
const AGENT = new Set(['Agent', 'Task', 'Workflow', 'SendMessage'])
// Calls that wait on the person: a question, a plan to approve.
const ASK = new Set(['AskUserQuestion', 'ExitPlanMode'])

const TEST_COMMAND =
  /\b(?:flutter|dart|deno|bun|cargo|go|patrol)\s+test\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b|\bnpx\s+(?:jest|vitest|playwright)\b|\b(?:pytest|jest|vitest)\b|\bclaude\s+plugin\s+test\b|\bmake\s+test\b/

export const isTestCommand = (input: unknown) => {
  const command = typeof input === 'object' && input !== null ? (input as { command?: unknown }).command : undefined
  return typeof command === 'string' && TEST_COMMAND.test(command)
}

export const moodOf = (tool: string, input: unknown): Mood => {
  if (ASK.has(tool)) return 'wait'
  if (READ.has(tool)) return 'read'
  if (EDIT.has(tool)) return 'edit'
  if (WEB.has(tool) || /^mcp__(?:Claude_Browser|claude-in-chrome)__/.test(tool)) return 'web'
  if (AGENT.has(tool)) return 'agent'
  if (tool === 'Bash') return isTestCommand(input) ? 'test' : 'run'
  return 'think'
}
