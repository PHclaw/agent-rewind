import fs from 'node:fs'
import path from 'node:path'

export const REWIND_DIR = '.agent-rewind'
export const META_FILE = 'snapshots.jsonl'

export interface Stats {
  files: number
  ins: number
  del: number
}

export interface Snapshot {
  id: string
  commit: string
  ref: string
  ts: number
  agent: string
  message: string
  stats: Stats
}

export function rewindDir(root: string): string {
  return path.join(root, REWIND_DIR)
}

export function metaPath(root: string): string {
  return path.join(rewindDir(root), META_FILE)
}

export function appendSnapshot(root: string, snap: Snapshot): void {
  fs.mkdirSync(rewindDir(root), { recursive: true })
  fs.appendFileSync(metaPath(root), JSON.stringify(snap) + '\n', 'utf8')
}

/** All snapshots, oldest first. */
export function loadSnapshots(root: string): Snapshot[] {
  const p = metaPath(root)
  if (!fs.existsSync(p)) return []
  const out: Snapshot[] = []
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t) as Snapshot)
    } catch {
      // skip corrupted line
    }
  }
  return out
}
