export const isTTY = process.stdout.isTTY === true && !process.env.NO_COLOR

const wrap = (code: string) => (s: string) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s)

export const fmt = {
  dim: wrap('2'),
  bold: wrap('1'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  cyan: wrap('36'),
}

export function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

export function padStart(s: string, n: number): string {
  return s.length >= n ? s : ' '.repeat(n - s.length) + s
}

function p2(x: number): string {
  return String(x).padStart(2, '0')
}

export function timeStr(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}

export function relTime(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m ago`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h ago`
}

export function die(msg: string): never {
  console.error(`${fmt.red('✗')} ${msg}`)
  process.exit(1)
}

export function str(v: string | boolean | undefined, dflt: string): string {
  return typeof v === 'string' && v.length > 0 ? v : dflt
}

/** Parse "30", "30s", "10m", "2h", "1d" -> milliseconds. Returns null if unparseable. */
export function parseDuration(s: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)?$/i.exec(s.trim())
  if (!m) return null
  const n = parseFloat(m[1])
  const unit = (m[2] ?? 's').toLowerCase()
  const mult = unit.startsWith('s') ? 1000
    : unit.startsWith('m') ? 60_000
    : unit.startsWith('h') ? 3_600_000
    : unit.startsWith('d') ? 86_400_000
    : 1000
  return Math.round(n * mult)
}
