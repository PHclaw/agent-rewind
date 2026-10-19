#!/usr/bin/env node
/**
 * Generates docs/demo.gif — the README hero animation.
 *
 * Pure Node + ffmpeg (drawtext/drawbox), no native npm deps, fully
 * reproducible. Requires: ffmpeg on PATH; fonts (Windows: Consolas +
 * Segoe UI Symbol; Linux: DejaVu Sans Mono).
 *
 * Usage:  node scripts/make-demo-gif.js [output.gif]
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// ---------------------------------------------------------------- canvas
const W = 1040
const H = 640
const FPS = 10
const DUR = 12.5
const FS = 19 // body font size
const CW = (FS * 11) / 20 // Consolas advance width (0.55em)
const X0 = 52
const Y0 = 76
const LH = 29

const C = {
  bg: '#0d1117',
  chrome: '#161b22',
  border: '#30363d',
  text: '#e6edf3',
  dim: '#8b949e',
  green: '#3fb950',
  red: '#f85149',
  yellow: '#d29922',
  blue: '#58a6ff',
  row: '#c9d1d9',
}

// ---------------------------------------------------------------- fonts
const FONT_SOURCES =
  process.platform === 'win32'
    ? {
        mono: 'C:/Windows/Fonts/consola.ttf',
        bold: 'C:/Windows/Fonts/consolab.ttf',
        sym: 'C:/Windows/Fonts/seguisym.ttf',
      }
    : {
        mono: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
        bold: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf',
        sym: '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
      }

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'arw-demo-'))
for (const [name, src] of Object.entries(FONT_SOURCES)) {
  if (!fs.existsSync(src)) {
    console.error(`font not found: ${src}`)
    process.exit(1)
  }
  fs.copyFileSync(src, path.join(work, `${name}.ttf`))
}

// ---------------------------------------------------------------- text files
const textFiles = new Map()
function tf(content) {
  if (textFiles.has(content)) return textFiles.get(content)
  const name = `t${textFiles.size}.txt`
  fs.writeFileSync(path.join(work, name), content, 'utf8')
  textFiles.set(content, name)
  return name
}

// ---------------------------------------------------------------- layers
const layers = []
function drawtext(file, o) {
  const font = o.bold ? 'bold.ttf' : o.sym ? 'sym.ttf' : 'mono.ttf'
  layers.push(
    `drawtext=fontfile=${font}:textfile=${file}:fontcolor=${o.color}:fontsize=${o.size || FS}` +
      `:x=${o.x}:y=${o.y}:enable='between(t,${o.t0 || 0},${o.t1 === undefined ? 99 : o.t1})'`
  )
}
function drawbox(o) {
  layers.push(
    `drawbox=c=${o.color}:x=${o.x}:y=${o.y}:w=${o.w}:h=${o.h}:t=fill` +
      `:enable='between(t,${o.t0},${o.t1})'`
  )
}

// window chrome
layers.push(`drawbox=c=${C.chrome}:x=0:y=0:w=${W}:h=40:t=fill`)
layers.push(`drawbox=c=${C.border}:x=0:y=40:w=${W}:h=1:t=fill`)
drawtext(tf('●'), { x: 22, y: 10, color: '#f85149', size: 14 })
drawtext(tf('●'), { x: 42, y: 10, color: '#d29922', size: 14 })
drawtext(tf('●'), { x: 62, y: 10, color: '#3fb950', size: 14 })
drawtext(tf('agent-rewind — an undo button for AI coding agents'), {
  x: '(w-text_w)/2',
  y: 12,
  color: C.dim,
  size: 15,
})

// ---------------------------------------------------------------- script
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length))
const padStart = (s, n) => ' '.repeat(Math.max(0, n - s.length)) + s
const CPS = 32 // typing speed (chars/sec)

function tableRow(id, time, agent, files, ins, del) {
  return [
    { text: pad(id, 12) + pad(time, 21) + pad(agent, 16) + padStart(String(files), 7) + '  ', color: C.row },
    { text: `+${ins}`, color: C.green },
    { text: ' ', color: C.row },
    { text: `-${del}`, color: C.red },
  ]
}

const SCRIPT = [
  { kind: 'prompt', t: 0.45, text: 'agent-rewind start --agent claude-code', until: 2.3 },
  {
    kind: 'line',
    t: 2.3,
    segs: [
      { text: '✓', color: C.green, sym: true },
      { text: ' watching /repo — snapshot every 30s', color: C.green },
    ],
  },
  { kind: 'blank' },
  { kind: 'line', t: 3.1, segs: [{ text: '[claude-code] rewriting calculator.js ...', color: C.yellow }] },
  { kind: 'line', t: 3.5, segs: [{ text: '  function add(a, b) { return a + b + Math.random() }', color: C.red }] },
  { kind: 'line', t: 3.8, segs: [{ text: '  function sub(a, b) { return a - b - 1 }', color: C.red }] },
  { kind: 'line', t: 4.1, segs: [{ text: '  var unused = "asdfasdf"', color: C.red }] },
  { kind: 'line', t: 4.5, segs: [{ text: '[claude-code] deleted server.js', color: C.red }] },
  { kind: 'line', t: 4.8, segs: [{ text: '[claude-code] created notes.txt', color: C.red }] },
  { kind: 'prompt', t: 5.3, text: 'agent-rewind ls', until: 5.95 },
  {
    kind: 'line',
    t: 5.95,
    segs: [
      {
        text: pad('ID', 12) + pad('TIME', 21) + pad('AGENT', 16) + padStart('FILES', 7) + '  CHANGES',
        color: C.dim,
      },
    ],
  },
  { kind: 'line', t: 6.25, segs: tableRow('k3f9cd', '10-19 14:32:31', 'claude-code', 2, 12, 96) },
  { kind: 'line', t: 6.55, segs: tableRow('k3f9ab', '10-19 14:32:01', 'claude-code', 4, 312, 187) },
  { kind: 'prompt', t: 7.0, text: 'agent-rewind go 5m', until: 8.2 },
  {
    kind: 'line',
    t: 8.2,
    segs: [
      { text: '←', color: C.blue },
      { text: ' rewinding to k3f9ab (14:32:01, 4m ago)', color: C.blue },
    ],
  },
  { kind: 'line', t: 8.6, segs: [{ text: '    4 file(s) differ from that snapshot', color: C.dim }] },
  { kind: 'line', t: 8.9, segs: [{ text: '    safety snapshot: m4x2cd', color: C.dim }] },
  {
    kind: 'line',
    t: 9.4,
    segs: [
      { text: '✓', color: C.green, sym: true },
      { text: ' restored 4 file(s)', color: C.green, bold: true },
    ],
  },
  { kind: 'line', t: 10.0, segs: [{ text: 'git log untouched · git status clean', color: C.dim }] },
]

let lineIdx = 0
for (const entry of SCRIPT) {
  const y = Y0 + lineIdx * LH
  if (entry.kind === 'blank') {
    lineIdx++
    continue
  }
  if (entry.kind === 'prompt') {
    drawtext(tf('$ '), { x: X0, y, color: C.green, t0: entry.t, t1: entry.until })
    const cmdX = X0 + 2 * CW
    const chars = [...entry.text]
    chars.forEach((ch, i) => {
      if (ch !== ' ') {
        drawtext(tf(ch), { x: cmdX + i * CW, y, color: C.text, bold: true, t0: entry.t + i / CPS })
      }
      // block cursor sitting at position i while waiting to type char i
      // (window shrunk at the end so adjacent cursors never double-draw)
      const t0 = i === 0 ? entry.t : entry.t + (i - 1) / CPS
      drawbox({ x: cmdX + i * CW, y: y + 2, w: CW - 1, h: FS + 5, color: C.text, t0, t1: entry.t + (i + 1) / CPS - 0.02 })
    })
    // cursor held after the last char until output starts
    const doneAt = entry.t + chars.length / CPS
    drawbox({ x: cmdX + chars.length * CW, y: y + 2, w: CW - 1, h: FS + 5, color: C.text, t0: doneAt, t1: entry.until })
  } else {
    let x = X0
    for (const seg of entry.segs) {
      drawtext(tf(seg.text), { x, y, color: seg.color, sym: seg.sym, bold: seg.bold, t0: entry.t })
      x += seg.text.length * CW * (seg.sym ? 1.1 : 1)
    }
  }
  lineIdx++
}

// ---------------------------------------------------------------- render
const filter = layers.join(',')
const input = `color=c=${C.bg}:s=${W}x${H}:r=${FPS}:d=${DUR}`
const out = process.argv[2] || path.join(__dirname, '..', 'docs', 'demo.gif')

console.log(`layers: ${layers.length}, filter: ${(filter.length / 1024).toFixed(1)} KB`)

// poster frame for QA
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', input, '-vf', filter, '-ss', '12', '-frames:v', '1', path.join(work, 'poster.png')], { cwd: work })
console.log(`poster: ${path.join(work, 'poster.png')}`)

// gif with custom palette
const fc = `[0:v]${filter},split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3[out]`
execFileSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', input, '-filter_complex', fc, '-map', '[out]', '-r', String(FPS), '-loop', '0', out],
  { cwd: work }
)
const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(2)
console.log(`gif: ${out} (${mb} MB, ${DUR}s @ ${FPS}fps, ${W}x${H})`)
