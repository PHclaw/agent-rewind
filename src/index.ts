#!/usr/bin/env node
import { parseArgs } from './args'
import { fmt, die } from './utils'
import { cmdDiff, cmdGo, cmdHooks, cmdLs, cmdOnce, cmdStart, cmdStatus } from './commands'

const VERSION = '0.1.0'

const HELP = `
${fmt.bold('agent-rewind')} — an undo button for AI coding agents

${fmt.bold('Usage:')}
  agent-rewind start [--agent <name>] [--every 30s]    auto-snapshot on a timer (Ctrl+C to stop)
  agent-rewind once  [--agent <name>] [--msg "..."]    take one snapshot (for hooks / scripts)
  agent-rewind ls    [--json]                          list snapshots
  agent-rewind go    <id|10m|2h|14:30> [--prune] [--yes]   roll back to a moment
  agent-rewind diff  [<a>] [<b>] [--full]              what changed between snapshots
  agent-rewind status                                  snapshot count + latest
  agent-rewind hooks                                   copy-paste config for Claude Code / Codex

${fmt.bold('Options:')}
  --cwd <dir>     run against another directory
  --agent <name>  label snapshots with the agent that made them
  --prune         also delete files created after the target snapshot
  --yes           skip confirmation

${fmt.bold('Examples:')}
  agent-rewind start --agent claude-code
  agent-rewind once --agent codex --msg "before deploy"
  agent-rewind go 10m
  agent-rewind go 14:30 --prune --yes
`

async function main(): Promise<void> {
  const { _, flags } = parseArgs(process.argv.slice(2))
  const cmd = _[0]
  const cwd = typeof flags.cwd === 'string' ? flags.cwd : process.cwd()

  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP)
      return
    case 'version':
    case '--version':
    case '-v':
      console.log(VERSION)
      return
    case 'start':
      return cmdStart(cwd, flags)
    case 'once':
      return cmdOnce(cwd, flags)
    case 'ls':
    case 'list':
      return cmdLs(cwd, flags)
    case 'go':
    case 'rewind':
      return cmdGo(cwd, flags, _[1])
    case 'diff':
      return cmdDiff(cwd, flags, _[1], _[2])
    case 'status':
      return cmdStatus(cwd)
    case 'hooks':
      return cmdHooks()
    default:
      die(`unknown command: ${cmd}\n${HELP}`)
  }
}

main().catch(e => {
  console.error(`${fmt.red('✗')} ${e?.message ?? e}`)
  process.exit(1)
})
