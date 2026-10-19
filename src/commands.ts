import readline from 'node:readline'
import fs from 'node:fs'
import { fmt, pad, padStart, relTime, str, timeStr, die } from './utils'
import { git, gitQuiet, repoRoot } from './core/git'
import { loadSnapshots, rewindDir, type Snapshot } from './core/store'
import {
  createSnapshot,
  currentTree,
  diffSnapshots,
  parseWhen,
  resolveByTime,
  resolveCommit,
  restore,
  treeDiffStat,
} from './core/snapshots'

type Flags = Record<string, string | boolean>

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(res => rl.question(question, res))
}

/** Find (or lazily create) the repo root. */
function ensureRoot(startDir: string): string {
  if (!fs.existsSync(startDir)) die(`directory does not exist: ${startDir}`)
  let root = repoRoot(startDir)
  if (!root) {
    console.log(fmt.dim(`no git repo found — initializing one in ${startDir}`))
    git(['init', '-q'], startDir)
    root = repoRoot(startDir)
    if (!root) die('failed to initialize git repository')
  }
  return root
}

function printSnapLine(s: Snapshot): void {
  const stats = `${s.stats.files} files ${fmt.green('+' + s.stats.ins)} ${fmt.red('-' + s.stats.del)}`
  const msg = s.message ? `  ${fmt.dim(s.message)}` : ''
  console.log(`${fmt.green('✓')} ${fmt.bold(s.id)}  ${timeStr(s.ts)}  agent:${s.agent}  ${stats}${msg}`)
}

export function cmdStart(startDir: string, flags: Flags): void {
  const root = ensureRoot(startDir)
  const agent = str(flags.agent, 'agent')
  const every = Math.max(1, parseInt(str(flags.every, '30'), 10) || 30)
  console.log(fmt.dim(`agent-rewind watching ${root}`))
  console.log(fmt.dim(`snapshot every ${every}s — Ctrl+C to stop`))
  const tick = (): void => {
    try {
      const snap = createSnapshot(root, agent, '')
      if (snap) printSnapLine(snap)
    } catch (e: any) {
      console.error(`${fmt.red('✗')} ${e.message}`)
    }
  }
  tick()
  const timer = setInterval(tick, every * 1000)
  const stop = (): void => {
    clearInterval(timer)
    console.log(fmt.dim('\nstopped — snapshots kept'))
    process.exit(0)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

export function cmdOnce(startDir: string, flags: Flags): void {
  const root = ensureRoot(startDir)
  const snap = createSnapshot(root, str(flags.agent, 'agent'), str(flags.msg, ''))
  if (!snap) {
    console.log(fmt.dim('no changes since last snapshot'))
    return
  }
  printSnapLine(snap)
}

export function cmdLs(startDir: string, flags: Flags): void {
  const root = repoRoot(startDir)
  if (!root) die('not a git repository')
  const snaps = loadSnapshots(root).slice().reverse() // newest first
  if (flags.json) {
    console.log(JSON.stringify(snaps, null, 2))
    return
  }
  if (snaps.length === 0) {
    console.log(fmt.dim('no snapshots yet — run: agent-rewind start'))
    return
  }
  console.log(
    fmt.bold(
      pad('ID', 12) + pad('TIME', 21) + pad('AGENT', 16) + padStart('FILES', 7) + '  CHANGES'
    )
  )
  for (const s of snaps) {
    console.log(
      pad(s.id, 12) +
        pad(timeStr(s.ts).slice(5), 21) +
        pad(s.agent, 16) +
        padStart(String(s.stats.files), 7) +
        '  ' +
        fmt.green('+' + s.stats.ins) +
        ' ' +
        fmt.red('-' + s.stats.del) +
        (s.message ? '  ' + fmt.dim(s.message) : '')
    )
  }
  console.log(fmt.dim(`\n${snaps.length} snapshots — rewind with: agent-rewind go <id|10m|2h|14:30>`))
}

export async function cmdGo(startDir: string, flags: Flags, when?: string): Promise<void> {
  const root = repoRoot(startDir)
  if (!root) die('not a git repository')
  const snaps = loadSnapshots(root)
  if (snaps.length === 0) die('no snapshots yet — run: agent-rewind start')

  let commit: string
  let desc: string
  const byId = when ? snaps.find(s => s.id === when || (when.length >= 4 && s.id.startsWith(when))) : undefined
  if (byId) {
    commit = byId.commit
    desc = `${byId.id} (${timeStr(byId.ts)}, ${relTime(byId.ts)})`
  } else if (!when) {
    const latest = snaps[snaps.length - 1]
    commit = latest.commit
    desc = `${latest.id} (${timeStr(latest.ts)}, ${relTime(latest.ts)})`
  } else {
    const ts = parseWhen(when)
    if (ts === null) die(`cannot parse "${when}" — use a snapshot id, 10m, 2h, 14:30, or a date`)
    const snap = resolveByTime(root, ts)
    commit = snap.commit
    desc = `${snap.id} (${timeStr(snap.ts)}, ${relTime(snap.ts)})`
  }

  const prune = Boolean(flags.prune)
  // Exact comparison: full current tree (tracked + untracked) vs snapshot tree.
  const snapTree = git(['rev-parse', `${commit}^{tree}`], root)
  const curTree = currentTree(root)
  if (curTree === snapTree) {
    console.log(fmt.dim('nothing to do — working tree already matches that snapshot'))
    return
  }
  const stat = treeDiffStat(root, snapTree, curTree)
  console.log(`${fmt.cyan('⏪')} rewinding to ${fmt.bold(desc)}${prune ? fmt.dim('  (prune: files created after this snapshot will be deleted)') : ''}`)
  console.log(fmt.dim(`   ${stat.files} file(s) differ from that snapshot`))

  if (!flags.yes) {
    if (process.stdin.isTTY) {
      const answer = await ask("type 'yes' to proceed: ")
      if (answer.trim().toLowerCase() !== 'yes') die('aborted')
    } else {
      die('non-interactive shell — pass --yes to confirm')
    }
  }

  // Safety first: snapshot the current state so the rewind itself is undoable.
  const safety = createSnapshot(root, 'agent-rewind', 'pre-rewind safety')
  if (safety) console.log(fmt.dim(`   safety snapshot: ${safety.id}`))

  const { pruned } = restore(root, commit, { prune })
  console.log(`${fmt.green('✓')} restored ${stat.files} file(s)${pruned ? `, pruned ${pruned} new file(s)` : ''}`)
  if (safety) console.log(fmt.dim(`   undo this rewind: agent-rewind go ${safety.id}`))
}

export function cmdDiff(startDir: string, flags: Flags, a?: string, b?: string): void {
  const root = repoRoot(startDir)
  if (!root) die('not a git repository')
  const out = diffSnapshots(root, a, b, Boolean(flags.full))
  console.log(out || fmt.dim('(no differences)'))
}

export function cmdStatus(startDir: string): void {
  const root = repoRoot(startDir)
  if (!root) die('not a git repository')
  const snaps = loadSnapshots(root)
  const latest = snaps[snaps.length - 1]
  console.log(`${fmt.bold('repo:')}      ${root}`)
  console.log(`${fmt.bold('snapshots:')} ${snaps.length}`)
  if (latest) {
    console.log(`${fmt.bold('latest:')}    ${latest.id} — ${timeStr(latest.ts)} (${relTime(latest.ts)}), agent: ${latest.agent}`)
  }
  console.log(`${fmt.bold('data dir:')}  ${rewindDir(root)}`)
}

export function cmdHooks(): void {
  console.log(`# Claude Code — add to .claude/settings.json (snapshot after each agent turn):
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "npx agent-rewind once --agent claude-code --msg \\"turn done\\"" }
        ]
      }
    ]
  }
}

# Any agent / CI — snapshot around a run:
agent-rewind once --agent my-bot --msg "before run"
# ... run your agent ...
agent-rewind once --agent my-bot --msg "after run"

# Codex / Cursor / custom agents — run the watcher in a second terminal:
agent-rewind start --agent cursor
`)
}

export { resolveCommit }
