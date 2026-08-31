#!/usr/bin/env node
// node skills/review-pr-workflow/test/test.mjs [--update]

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL = join(HERE, '..')
const UPDATE = process.argv.includes('--update')

let failed = 0
const pass = m => console.log(`  ok   ${m}`)
const fail = (m, detail) => { failed++; console.log(`  FAIL ${m}`); if (detail) console.log(detail) }

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts })
}

function phase0(id, { stale = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `rpw-test-${id}-`))
  try {
    const args = ['build-fixture.mjs', `--case=${id}`, `--out=${dir}`]
    if (stale) args.push('--stale')
    sh('node', args, { cwd: HERE, stdio: ['ignore', 'ignore', 'pipe'] })
    const fixture = JSON.parse(readFileSync(join(dir, 'fixture.json'), 'utf8'))
    const out = sh('node', [join(SKILL, 'scripts', 'phase0.mjs'), fixture.url], {
      cwd: join(dir, 'work'),
      env: { ...process.env, PATH: `${join(HERE, 'bin')}:${process.env.PATH}`, EVAL_FIXTURE: dir },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return JSON.parse(out)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('workflow control flow')
try {
  sh('node', [join(SKILL, 'scripts', 'check-workflow.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] })
  pass('check-workflow.mjs')
} catch (e) {
  fail('check-workflow.mjs', (e.stdout || '') + (e.stderr || ''))
}

const casesDir = join(HERE, 'cases')
const cases = existsSync(casesDir)
  ? readdirSync(casesDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
  : []

if (!cases.length) fail('cases present', `    no case directories under ${casesDir}`)

for (const id of cases) {
  console.log(`case ${id}`)
  const snapPath = join(casesDir, id, 'expected-args.json')
  let args
  try {
    args = phase0(id)
  } catch (e) {
    fail('phase0 ran', (e.stdout || '') + (e.stderr || ''))
    continue
  }

  const expectedTier = JSON.parse(readFileSync(join(casesDir, id, 'case.json'), 'utf8')).expected?.tier
  if (expectedTier && args.detectedTier !== expectedTier) {
    fail(`tier is ${expectedTier}`, `    got ${args.detectedTier}`)
  } else if (expectedTier) pass(`tier is ${expectedTier}`)

  if (UPDATE || !existsSync(snapPath)) {
    writeFileSync(snapPath, JSON.stringify(args, null, 2) + '\n')
    pass(`snapshot ${UPDATE ? 'updated' : 'created'}`)
  } else {
    const want = readFileSync(snapPath, 'utf8').trim()
    const got = JSON.stringify(args, null, 2).trim()
    if (want === got) pass('args match snapshot')
    else {
      const wl = want.split('\n'), gl = got.split('\n')
      const first = wl.findIndex((l, i) => l !== gl[i])
      fail('args match snapshot', `    line ${first + 1}\n    want: ${wl[first]}\n    got:  ${gl[first] ?? '(missing)'}\n    re-run with --update if intended`)
    }
  }

  try {
    const staleArgs = phase0(id, { stale: true })
    if (JSON.stringify(staleArgs) === JSON.stringify(args)) pass('stale clone yields identical args')
    else fail('stale clone yields identical args', '    a per-clone ref is leaking into the diff')
  } catch (e) {
    fail('stale clone yields identical args', (e.stdout || '') + (e.stderr || ''))
  }
}

console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
