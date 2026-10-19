import fs from 'node:fs'
import path from 'node:path'
import { git, gitQuiet } from './git'
import {
  appendSnapshot,
  loadSnapshots,
  rewindDir,
  type Snapshot,
  type Stats,
} from './store'
import { parseDuration } from '../utils'

const REF_PREFIX = 'refs/agent-rewind/'
const LATEST_REF = 'refs/agent-rewind/latest'
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

const IDENT_ENV: Record<string, string> = {
  GIT_AUTHOR_NAME: 'agent-rewind',
  GIT_AUTHOR_EMAIL: 'noreply@agent-rewind.dev',
  GIT_COMMITTER_NAME: 'agent-rewind',
  GIT_COMMITTER_EMAIL: 'noreply@agent-rewind.dev',
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
}

/** Keep our own data dir out of snapshots via the repo-local exclude file. */
function excludeRewindDir(root: string): void {
  const rel = git(['rev-parse', '--git-path', 'info/exclude'], root)
  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel)
  let cur = ''
  try {
    cur = fs.readFileSync(abs, 'utf8')
  } catch {
    /* ignore */
  }
  const lines = cur.split('\n').map(l => l.trim())
  if (lines.includes('.agent-rewind/') || lines.includes('.agent-rewind')) return
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.appendFileSync(abs, (cur === '' || cur.endsWith('\n') ? '' : '\n') + '.agent-rewind/\n', 'utf8')
}

function latestCommit(root: string): string | null {
  return gitQuiet(['rev-parse', '--verify', '--quiet', LATEST_REF], root)
}

function parseNumstat(out: string): Stats {
  let files = 0
  let ins = 0
  let del = 0
  for (const line of out.split('\n')) {
    if (!line.trim()) continue
    const [a, b] = line.split('\t')
    files++
    if (a !== '-') ins += parseInt(a, 10) || 0
    if (b !== '-') del += parseInt(b, 10) || 0
  }
  return { files, ins, del }
}

function computeStats(root: string, prev: string | null, commit: string): Stats {
  const out = gitQuiet(['diff', '--numstat', prev ?? EMPTY_TREE, commit], root) ?? ''
  return parseNumstat(out)
}

/** Diff stat between two arbitrary trees/commits. */
export function treeDiffStat(root: string, a: string, b: string): Stats {
  return parseNumstat(gitQuiet(['diff', '--numstat', a, b], root) ?? '')
}

/**
 * Create a snapshot of the working tree as a git commit on a hidden ref.
 * Returns null when nothing changed since the last snapshot.
 */
export function createSnapshot(root: string, agent = 'agent', message = ''): Snapshot | null {
  excludeRewindDir(root)
  fs.mkdirSync(rewindDir(root), { recursive: true })

  const id = newId()
  const ref = `${REF_PREFIX}${id}`
  // Isolated index so we never touch the user's staging area.
  const env: Record<string, string> = {
    ...IDENT_ENV,
    GIT_INDEX_FILE: path.join(rewindDir(root), 'index'),
  }

  git(['add', '-A'], root, env)
  const tree = git(['write-tree'], root, env)

  const prev = latestCommit(root)
  if (prev) {
    const prevTree = git(['rev-parse', `${prev}^{tree}`], root)
    if (prevTree === tree) return null // nothing changed since last snapshot
  }

  const label = `rewind:${id} agent:${agent}${message ? ` msg:${message}` : ''}`
  const parent = prev ? ['-p', prev] : []
  const commit = git(['commit-tree', tree, ...parent, '-m', label], root, env)
  git(['update-ref', ref, commit], root)
  git(['update-ref', LATEST_REF, commit], root)

  const snap: Snapshot = {
    id,
    commit,
    ref,
    ts: Date.now(),
    agent,
    message,
    stats: computeStats(root, prev, commit),
  }
  appendSnapshot(root, snap)
  return snap
}

/** Resolve a snapshot id (or id prefix, or any commit-ish) to a commit hash. */
export function resolveCommit(root: string, idOrHash: string): string {
  const snaps = loadSnapshots(root)
  const byId = snaps.filter(s => s.id === idOrHash)
  if (byId.length === 1) return byId[0].commit
  if (idOrHash.length >= 4) {
    const byPrefix = snaps.filter(s => s.id.startsWith(idOrHash))
    if (byPrefix.length === 1) return byPrefix[0].commit
    if (byPrefix.length > 1) throw new Error(`ambiguous snapshot id prefix: ${idOrHash}`)
  }
  const viaRef = gitQuiet(['rev-parse', '--verify', '--quiet', `${REF_PREFIX}${idOrHash}^{commit}`], root)
  if (viaRef) return viaRef
  const viaHash = gitQuiet(['rev-parse', '--verify', '--quiet', `${idOrHash}^{commit}`], root)
  if (viaHash) return viaHash
  throw new Error(`no snapshot found: ${idOrHash}`)
}

/** Latest snapshot at or before the given timestamp. */
export function resolveByTime(root: string, ts: number): Snapshot {
  const cands = loadSnapshots(root).filter(s => s.ts <= ts)
  if (cands.length === 0) throw new Error('no snapshot exists at or before that time')
  return cands[cands.length - 1]
}

export interface RestoreResult {
  pruned: number
}

/**
 * Restore the working tree to a snapshot commit.
 * Your branches, HEAD, history AND staging area are never touched:
 * we load the snapshot into a throwaway index and write files out with
 * checkout-index, so the user's index keeps its original state.
 * Files created after the snapshot stay (untracked); --prune removes them.
 */
export function restore(root: string, commit: string, opts: { prune: boolean }): RestoreResult {
  const tmpIndex = path.join(rewindDir(root), 'restore-index')
  const env: Record<string, string> = { GIT_INDEX_FILE: tmpIndex }
  try {
    fs.rmSync(tmpIndex, { force: true })
    git(['read-tree', commit], root, env)
    git(['checkout-index', '-a', '-f'], root, env)
  } catch {
    // Degraded fallback (may stage files into the user's index).
    git(['checkout', commit, '--', '.'], root)
  }

  let pruned = 0
  if (opts.prune) {
    const inSnap = new Set(
      git(['ls-tree', '-r', '--name-only', '-z', commit], root).split('\0').filter(Boolean)
    )
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], root)
      .split('\0')
      .filter(Boolean)
    for (const f of untracked) {
      if (!inSnap.has(f)) {
        fs.rmSync(path.join(root, f), { force: true, recursive: true })
        pruned++
      }
    }
  }
  return { pruned }
}

/**
 * Current full working-tree state as a git tree hash (tracked + untracked,
 * excluding .gitignore'd files). Comparing tree hashes is exact — unlike
 * `git diff <commit>`, it also sees untracked files.
 */
export function currentTree(root: string): string {
  const env: Record<string, string> = {
    ...IDENT_ENV,
    GIT_INDEX_FILE: path.join(rewindDir(root), 'index'),
  }
  git(['add', '-A'], root, env)
  return git(['write-tree'], root, env)
}

/** Diff between two snapshots (or against the empty tree for the first one). */
export function diffSnapshots(root: string, aId?: string, bId?: string, full = false): string {
  const snaps = loadSnapshots(root)
  if (snaps.length === 0) return ''
  let b: string
  if (bId) {
    b = resolveCommit(root, bId)
  } else {
    b = snaps[snaps.length - 1].commit
  }
  let a: string | null = null
  if (aId) {
    a = resolveCommit(root, aId)
  } else {
    const idx = snaps.findIndex(s => s.commit === b)
    if (idx > 0) a = snaps[idx - 1].commit
  }
  if (a === null) a = EMPTY_TREE
  const args = full
    ? ['diff', a, b]
    : ['diff', '--stat', a, b]
  return gitQuiet(args, root) ?? ''
}

/**
 * Parse a "when" spec into a timestamp:
 *   "10m" / "2h" / "1d"  -> relative
 *   "14:30"              -> today at that local time
 *   "2026-10-19 14:30"   -> absolute
 *   "1700000000000"      -> epoch ms
 * Returns null if the spec is not a time expression (caller tries snapshot id first).
 */
export function parseWhen(spec: string): number | null {
  const t = spec.trim()
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10)
    return n > 1e12 ? n : Date.now() - n * 1000
  }
  const dur = parseDuration(t)
  if (dur !== null) return Date.now() - dur
  const clock = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (clock) {
    const d = new Date()
    d.setHours(parseInt(clock[1], 10), parseInt(clock[2], 10), 0, 0)
    if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1)
    return d.getTime()
  }
  const dt = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(t)
  if (dt) {
    return new Date(
      parseInt(dt[1], 10),
      parseInt(dt[2], 10) - 1,
      parseInt(dt[3], 10),
      dt[4] ? parseInt(dt[4], 10) : 0,
      dt[5] ? parseInt(dt[5], 10) : 0,
      0,
      0
    ).getTime()
  }
  return null
}
