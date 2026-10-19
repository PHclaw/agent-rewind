#!/usr/bin/env node
/**
 * agent-rewind smoke test — end-to-end in throwaway git repos.
 * Run: npm run build && npm run smoke
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const CLI = path.join(__dirname, '..', 'dist', 'index.js')
if (!fs.existsSync(CLI)) {
  console.error('dist/index.js not found — run `npm run build` first')
  process.exit(1)
}

// Same git resolution as the CLI itself.
const GIT = require(path.join(__dirname, '..', 'dist', 'core', 'git.js')).gitBinPath()

const IDENT = {
  GIT_AUTHOR_NAME: 'smoke',
  GIT_AUTHOR_EMAIL: 'smoke@test',
  GIT_COMMITTER_NAME: 'smoke',
  GIT_COMMITTER_EMAIL: 'smoke@test',
}

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`)
  }
}

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' })
}

function gitCmd(args, cwd, env) {
  return spawnSync(GIT, args, { cwd, encoding: 'utf8', env: { ...process.env, ...IDENT, ...env } })
}

function lsJson(cwd) {
  const r = run(['ls', '--json'], cwd)
  try {
    return JSON.parse(r.stdout)
  } catch {
    return []
  }
}

function write(cwd, file, content) {
  fs.writeFileSync(path.join(cwd, file), content, 'utf8')
}

function read(cwd, file) {
  return fs.readFileSync(path.join(cwd, file), 'utf8')
}

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms))
}

async function scenario(name, withInitialCommit) {
  console.log(`\nscenario: ${name}`)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rewind-smoke-'))
  try {
    gitCmd(['init', '-q'], dir)
    write(dir, 'app.js', 'const v = 1\n')
    write(dir, 'README.md', '# demo\n')
    if (withInitialCommit) {
      gitCmd(['add', '-A'], dir)
      gitCmd(['commit', '-qm', 'init'], dir)
    }

    // --- snapshots ---
    let r = run(['once', '--agent', 'smoke'], dir)
    check('first snapshot created', r.status === 0 && /✓/.test(r.stdout), r.stdout + r.stderr)
    const snaps1 = lsJson(dir)
    const firstId = snaps1[snaps1.length - 1] && snaps1[snaps1.length - 1].id // oldest

    r = run(['once', '--agent', 'smoke'], dir)
    check('no-change snapshot is skipped', r.status === 0 && /no changes/.test(r.stdout), r.stdout)

    // --- agent makes a mess ---
    fs.appendFileSync(path.join(dir, 'app.js'), 'const broken = true\n', 'utf8')
    write(dir, 'agent-notes.txt', 'agent created this\n')
    fs.unlinkSync(path.join(dir, 'README.md'))
    r = run(['once', '--agent', 'claude-code'], dir)
    check('second snapshot created', r.status === 0 && /✓/.test(r.stdout), r.stdout + r.stderr)
    check('agent label recorded', /claude-code/.test(r.stdout), r.stdout)

    // --- rewind (no prune) ---
    r = run(['go', firstId, '--yes'], dir)
    check('rewind succeeded', r.status === 0, r.stdout + r.stderr)
    check('modified file restored', read(dir, 'app.js') === 'const v = 1\n', JSON.stringify(read(dir, 'app.js')))
    check('deleted file restored', fs.existsSync(path.join(dir, 'README.md')))
    check('agent-created file kept without --prune', fs.existsSync(path.join(dir, 'agent-notes.txt')))

    // --- prune ---
    r = run(['go', firstId, '--yes', '--prune'], dir)
    check('prune removes post-snapshot files', r.status === 0 && !fs.existsSync(path.join(dir, 'agent-notes.txt')), r.stdout + r.stderr)
    check('prune keeps snapshot content', read(dir, 'app.js') === 'const v = 1\n')

    // --- rewind is undoable ---
    const snaps2 = lsJson(dir)
    const safety = snaps2.find(s => s.message === 'pre-rewind safety')
    check('safety snapshot recorded', Boolean(safety), JSON.stringify(snaps2.map(s => s.message)))
    if (safety) {
      r = run(['go', safety.id, '--yes'], dir)
      check('undo the rewind', r.status === 0 && fs.existsSync(path.join(dir, 'agent-notes.txt')), r.stdout + r.stderr)
    }

    // --- idempotent rewind: get back to snap1 state, then expect nothing-to-do ---
    run(['go', firstId, '--yes', '--prune'], dir)
    r = run(['go', firstId, '--yes'], dir)
    check('nothing-to-do detected', /nothing to do/.test(r.stdout), r.stdout)

    // --- message labels ---
    write(dir, 'marker.txt', 'v1')
    r = run(['once', '--agent', 'smoke', '--msg', 'marker'], dir)
    check('msg label recorded', /marker/.test(r.stdout), r.stdout)

    // --- time-based rewind: go 1s should land on the snapshot from ~1.5s ago ---
    await sleep(1500)
    write(dir, 'marker.txt', 'v2')
    run(['once', '--agent', 'smoke'], dir)
    r = run(['go', '1s', '--yes'], dir)
    check('relative time rewind works', r.status === 0 && read(dir, 'marker.txt') === 'v1', r.stdout + r.stderr)

    // --- other subcommands ---
    check('diff exits 0', run(['diff'], dir).status === 0)
    check('diff --full exits 0', run(['diff', '--full'], dir).status === 0)
    check('diff <a> <b> exits 0', run(['diff', firstId, safety ? safety.id : firstId], dir).status === 0)
    check('status exits 0', run(['status'], dir).status === 0)
    check('start single tick works', run(['once'], dir).status === 0)
    check('help exits 0', run([], dir).status === 0)
    check('version exits 0', run(['version'], dir).status === 0)
    check('unknown command exits non-zero', run(['frobnicate'], dir).status !== 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function main() {
  await scenario('repo with initial commit (typical)', true)
  await scenario('fresh repo, no commits yet (agent started from scratch)', false)
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main()
