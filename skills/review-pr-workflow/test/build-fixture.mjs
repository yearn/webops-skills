#!/usr/bin/env node
// Builds a deterministic bare repo + clone that phase0.mjs can run against offline.
//
//   node build-fixture.mjs --case=<id> --out=<dir> [--stale]

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, realpathSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
const flag = name => {
  const hit = argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const caseId = flag('case')
const outArg = flag('out')
const stale = argv.includes('--stale')

if (!caseId || !outArg) {
  console.error('usage: build-fixture.mjs --case=<id> --out=<dir> [--stale]')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Safety guard — never delete anything outside the system temp dir.
// ---------------------------------------------------------------------------

function resolveRealPossiblyMissing(p) {
  let cur = path.resolve(p)
  const suffix = []
  while (!existsSync(cur)) {
    suffix.unshift(path.basename(cur))
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return path.join(realpathSync(cur), ...suffix)
}

const tmpReal = realpathSync(tmpdir())
const outReal = resolveRealPossiblyMissing(outArg)
if (outReal !== tmpReal && !outReal.startsWith(tmpReal + path.sep)) {
  console.error(`build-fixture: refusing --out=${outArg} — resolves to ${outReal}, outside the system temp dir (${tmpReal})`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------------

const caseDir = path.join(__dirname, 'cases', caseId)
const caseJsonPath = path.join(caseDir, 'case.json')
if (!existsSync(caseJsonPath)) {
  console.error(`build-fixture: no case at ${caseJsonPath}`)
  process.exit(1)
}
const caseDef = JSON.parse(readFileSync(caseJsonPath, 'utf8'))

const FIXED_DATE = '2020-01-01T00:00:00Z'
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Fixture Bot',
  GIT_AUTHOR_EMAIL: 'fixture-bot@example.com',
  GIT_AUTHOR_DATE: FIXED_DATE,
  GIT_COMMITTER_NAME: 'Fixture Bot',
  GIT_COMMITTER_EMAIL: 'fixture-bot@example.com',
  GIT_COMMITTER_DATE: FIXED_DATE,
}
function git(cwd, args) {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim()
}

function copyTree(sub, destDir) {
  const src = path.join(caseDir, sub)
  if (existsSync(src)) cpSync(src, destDir, { recursive: true })
}

function ensureLintScript(dir) {
  const pkgPath = path.join(dir, 'package.json')
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {}
  pkg.scripts = { ...(pkg.scripts || {}), lint: caseDef.lintScript }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

rmSync(outReal, { recursive: true, force: true })
mkdirSync(outReal, { recursive: true })

const originGit = path.join(outReal, 'origin.git')
git(outReal, ['init', '--quiet', '--bare', originGit])

const seed = path.join(outReal, '.seed')
mkdirSync(seed)
git(seed, ['init', '--quiet'])
git(seed, ['remote', 'add', 'origin', originGit])

writeFileSync(path.join(seed, '.gitkeep'), '')
ensureLintScript(seed)
git(seed, ['add', '-A'])
git(seed, ['commit', '--quiet', '-m', 'stale base'])
const staleSha = git(seed, ['rev-parse', 'HEAD'])

copyTree('base', seed)
ensureLintScript(seed)
git(seed, ['add', '-A'])
git(seed, ['commit', '--quiet', '-m', 'base'])
const baseSha = git(seed, ['rev-parse', 'HEAD'])
git(seed, ['push', '--quiet', 'origin', `HEAD:refs/heads/${caseDef.baseRefName}`])

copyTree('head', seed)
ensureLintScript(seed)
git(seed, ['add', '-A'])
git(seed, ['commit', '--quiet', '-m', 'head'])
const headSha = git(seed, ['rev-parse', 'HEAD'])
git(seed, ['push', '--quiet', 'origin', `HEAD:refs/pull/${caseDef.number}/head`])

git(originGit, ['symbolic-ref', 'HEAD', `refs/heads/${caseDef.baseRefName}`])

rmSync(seed, { recursive: true, force: true })

const work = path.join(outReal, 'work')
git(outReal, ['clone', '--quiet', originGit, work])

if (stale) {
  git(work, ['update-ref', 'refs/remotes/origin/stale-main', staleSha])
  git(work, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/stale-main'])
  git(work, ['update-ref', `refs/remotes/origin/${caseDef.baseRefName}`, staleSha])
}

writeFileSync(
  path.join(outReal, 'fixture.json'),
  JSON.stringify({ ...caseDef, headRefOid: headSha, caseDir }, null, 2) + '\n',
)

console.error(`build-fixture: ${caseId} -> ${outReal} (base=${baseSha} head=${headSha}${stale ? ' stale' : ''})`)
