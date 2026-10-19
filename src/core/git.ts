import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

let cachedBin: string | null = null

/**
 * Locate the git executable:
 *   1. $AGENT_REWIND_GIT (explicit override)
 *   2. PATH lookup (just "git")
 *   3. common Windows install locations (git is often installed but not on PATH)
 */
export function gitBinPath(): string {
  if (cachedBin) return cachedBin
  if (process.env.AGENT_REWIND_GIT && process.env.AGENT_REWIND_GIT.length > 0) {
    cachedBin = process.env.AGENT_REWIND_GIT
    return cachedBin
  }
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'cmd', 'git.exe'),
      path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
    ]
    for (const c of candidates) {
      try {
        if (c && fs.existsSync(c)) {
          cachedBin = c
          return cachedBin
        }
      } catch {
        /* ignore */
      }
    }
  }
  cachedBin = 'git'
  return cachedBin
}

/**
 * Config forced on every git invocation:
 * - core.autocrlf=false: byte-exact snapshots. Windows git defaults to
 *   autocrlf=true, which would rewrite line endings on checkout and make
 *   restores lossy. A snapshot tool must not transform file content.
 * - core.fileMode=false (Windows only): ignore exec-bit noise.
 */
const CONFIG_ARGS: string[] =
  process.platform === 'win32'
    ? ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.fileMode=false']
    : ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false']

export function git(args: string[], cwd: string, env?: Record<string, string>): string {
  try {
    return execFileSync(gitBinPath(), [...CONFIG_ARGS, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env } as NodeJS.ProcessEnv,
    }).trim()
  } catch (e: any) {
    const stderr = typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString?.() ?? '')
    const err = new Error(`git ${args.join(' ')} failed: ${stderr.trim() || e.message}`) as Error & { stderr: string }
    err.stderr = stderr
    throw err
  }
}

/** Run git, return null instead of throwing on failure. */
export function gitQuiet(args: string[], cwd: string, env?: Record<string, string>): string | null {
  try {
    return git(args, cwd, env)
  } catch {
    return null
  }
}

/** Repository root containing startDir, or null if not inside a git repo. */
export function repoRoot(startDir: string): string | null {
  const out = gitQuiet(['rev-parse', '--show-toplevel'], startDir)
  return out && out.length > 0 ? out : null
}
