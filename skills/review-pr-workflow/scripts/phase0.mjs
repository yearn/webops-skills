#!/usr/bin/env node
// Phase 0 for review-pr-workflow, computed identically on every machine.
//
//   node skills/review-pr-workflow/scripts/phase0.mjs <pr-url-or-number> [--tier=...] [--verify-agent=...]
//
// Prints one JSON object on stdout — hand it to Workflow() as `args` verbatim.
// Progress, warnings and the tier line go to stderr so stdout stays parseable.
//
// Why this exists: the same PR url used to produce different reviews for different
// people. The diff base came from each clone's `origin/HEAD`, the context was
// hand-assembled per session, and the tier was a judgement call made by whatever
// model happened to be driving. All three are mechanical here.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const warnings = []
const note = m => process.stderr.write(m + '\n')

function run(cmd, args, { allowFail = false, cwd } = {}) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd,
    })
  } catch (e) {
    if (allowFail) return (e.stdout || '') + (e.stderr || '')
    throw new Error(`${cmd} ${args.join(' ')} failed:\n${e.stderr || e.message}`)
  }
}

function die(msg) {
  process.stderr.write(`phase0: ${msg}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
const target = argv.find(a => !a.startsWith('--'))
const flag = name => {
  const hit = argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

if (!target) die('usage: phase0.mjs <pr-url-or-number> [--tier=full|light] [--verify-agent=claude|codex]')

const tierOverride = flag('tier')
if (tierOverride && !['auto', 'full', 'light', 'skip'].includes(tierOverride)) {
  die(`unknown --tier=${tierOverride}`)
}

let verifyAgent = flag('verify-agent') || 'claude'
if (!['claude', 'codex'].includes(verifyAgent)) die(`unknown --verify-agent=${verifyAgent}`)
if (verifyAgent === 'codex') {
  const found = run('sh', ['-c', 'command -v codex || true'], { allowFail: true }).trim()
  if (!found) {
    warnings.push('codex CLI not on PATH — verifyAgent fell back to "claude". Verification is NOT model-independent.')
    verifyAgent = 'claude'
  }
}

// ---------------------------------------------------------------------------
// Repo + PR metadata
// ---------------------------------------------------------------------------

// Tracked modifications only. `git checkout --detach` refuses rather than clobbering
// an untracked file, and every repo carries some untracked scratch.
const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], { allowFail: true }).trim()
if (dirty) die('working tree is dirty. Commit or stash first — this script checks out the PR head.')

const prJson = JSON.parse(
  run('gh', ['pr', 'view', target, '--json', 'number,title,body,baseRefName,headRefOid,url']),
)

const urlMatch = /github\.com\/([^/]+)\/([^/]+)\/pull\/\d+/.exec(prJson.url)
if (!urlMatch) die(`cannot parse owner/repo out of ${prJson.url}`)
const repo = `${urlMatch[1]}/${urlMatch[2]}`

const localRepo = JSON.parse(run('gh', ['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner
if (localRepo.toLowerCase() !== repo.toLowerCase()) {
  die(`PR belongs to ${repo} but the working directory is ${localRepo}. cd into the right checkout.`)
}

// ---------------------------------------------------------------------------
// Pin the diff. Explicit refspecs, not `git fetch origin <branch>` — the base must
// land in refs/remotes/origin/<base> on every machine regardless of local config,
// and `origin/HEAD` is never consulted.
// ---------------------------------------------------------------------------

const base = prJson.baseRefName
note(`phase0: fetching ${repo} base ${base} and pull/${prJson.number}/head`)
run('git', [
  'fetch', '--quiet', 'origin',
  `+refs/heads/${base}:refs/remotes/origin/${base}`,
  `+refs/pull/${prJson.number}/head:refs/remotes/origin/pr/${prJson.number}`,
])
run('git', ['checkout', '--quiet', '--detach', prJson.headRefOid])

const baseRef = `origin/${base}`
const range = `${baseRef}...HEAD`

const changedFiles = run('git', ['diff', '--name-only', range]).split('\n').filter(Boolean)
const diffStat = run('git', ['diff', '--stat', range]).trim()
const numstat = run('git', ['diff', '--numstat', range])
  .split('\n')
  .filter(Boolean)
  .map(l => {
    const [added, deleted, ...rest] = l.split('\t')
    return { file: rest.join('\t'), added: Number(added) || 0, deleted: Number(deleted) || 0 }
  })

if (!changedFiles.length) die(`no changes between ${baseRef} and the PR head`)

// ---------------------------------------------------------------------------
// Linked issues — the spec the PR is graded against
// ---------------------------------------------------------------------------

const body = prJson.body || ''
const refs = new Map()
for (const m of body.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)) {
  refs.set(`${repo}#${m[1]}`, { repo, number: Number(m[1]) })
}
for (const m of body.matchAll(/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/gi)) {
  refs.set(`${m[1]}/${m[2]}#${m[3]}`, { repo: `${m[1]}/${m[2]}`, number: Number(m[3]) })
}

const issues = []
for (const { repo: r, number } of refs.values()) {
  try {
    const i = JSON.parse(run('gh', ['issue', 'view', String(number), '--repo', r, '--json', 'number,body']))
    issues.push({ number: i.number, body: i.body || '' })
  } catch {
    warnings.push(`linked issue ${r}#${number} could not be fetched — the review grades against the PR body for it`)
  }
}
if (!issues.length) warnings.push('no linked issue spec — the spec lens grades against the PR description')

// ---------------------------------------------------------------------------
// New dependencies
// ---------------------------------------------------------------------------

const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
const depsOf = json => {
  const out = {}
  for (const f of DEP_FIELDS) Object.assign(out, json[f] || {})
  return out
}
const showJson = (ref, file) => {
  const raw = run('git', ['show', `${ref}:${file}`], { allowFail: true })
  try { return JSON.parse(raw) } catch { return null }
}

const newDeps = []
let depBump = false
for (const file of changedFiles.filter(f => f === 'package.json' || f.endsWith('/package.json'))) {
  const before = showJson(baseRef, file)
  const after = showJson('HEAD', file)
  if (!after) continue
  const beforeDeps = before ? depsOf(before) : {}
  const afterDeps = depsOf(after)
  for (const [name, version] of Object.entries(afterDeps)) {
    if (!(name in beforeDeps)) newDeps.push(`${name}@${version}`)
    else if (beforeDeps[name] !== version) depBump = true
  }
}

// ---------------------------------------------------------------------------
// Lint, run once here so five agents do not each re-run it
// ---------------------------------------------------------------------------

let lintOutput = ''
const rootPkg = existsSync('package.json') ? JSON.parse(readFileSync('package.json', 'utf8')) : null
if (rootPkg?.scripts?.lint) {
  const pm = existsSync('bun.lockb') || existsSync('bun.lock') ? 'bun'
    : existsSync('pnpm-lock.yaml') ? 'pnpm'
      : existsSync('yarn.lock') ? 'yarn' : 'npm'
  note(`phase0: running ${pm} run lint`)
  lintOutput = run(pm, ['run', 'lint'], { allowFail: true }).slice(0, 8000)
} else {
  lintOutput = '(no lint script defined in package.json)'
}

// ---------------------------------------------------------------------------
// Tier. Mechanical, so two people get the same workflow shape from the same PR.
// Sensitivity can only upgrade, size can only downgrade, sensitivity wins.
// ---------------------------------------------------------------------------

const EXCLUDED = [
  /(^|\/)(dist|build|out|coverage|node_modules|\.next|__snapshots__)\//,
  /(^|\/)(locales|i18n|translations|fixtures|__fixtures__)\//,
  /\.(lock|snap|po|mo)$/,
  /(^|\/)(bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|package-lock\.json|Cargo\.lock|poetry\.lock|go\.sum)$/,
  /\.min\.(js|css)$/,
  /\.(generated|gen)\.[\w]+$/,
]
// Markdown that is behavior rather than prose — a SKILL.md or an AGENTS.md is
// instructions something executes, so a diff touching only those is not docs-only.
const BEHAVIOR_MD = /(^|\/)(SKILL|AGENTS|CLAUDE|GEMINI)\.mdx?$/
const DOCSY = f => !BEHAVIOR_MD.test(f) &&
  /\.(md|mdx|txt|rst)$|^(LICENSE|NOTICE|CODEOWNERS)$|(^|\/)docs\//i.test(f)

const isExcluded = f => EXCLUDED.some(re => re.test(f))
const sourceFiles = changedFiles.filter(f => !isExcluded(f))
const sourceChurn = numstat
  .filter(n => !isExcluded(n.file))
  .reduce((sum, n) => sum + n.added + n.deleted, 0)

// Added lines only, lockfiles excluded — a token in a deleted line is not a new risk.
const addedLines = run('git', [
  'diff', '--unified=0', range, '--',
  ':!*.lock', ':!*lock.json', ':!*lock.yaml', ':!bun.lockb', ':!bun.lock', ':!go.sum',
], { allowFail: true })
  .split('\n')
  .filter(l => l.startsWith('+') && !l.startsWith('+++'))
  .join('\n')

const SENSITIVE_PATHS = /auth|session|token|crypto|permission|role|acl|(^|\/)migrations?\//i
const CI_PATHS = /(^|\/)\.github\/workflows\/|(^|\/)(Dockerfile|docker-compose|\.circleci|\.gitlab-ci|vercel\.json|netlify\.toml|turbo\.json|next\.config|vite\.config|webpack\.config)/i
const SCHEMA_PATHS = /(^|\/)(migrations?|schema)\/|\.(sql|prisma)$|schema\.(ts|js|graphql)$/i

const triggers = []
const hitPaths = re => changedFiles.filter(f => re.test(f))

if (hitPaths(SENSITIVE_PATHS).length) triggers.push(`sensitive path: ${hitPaths(SENSITIVE_PATHS)[0]}`)
if (hitPaths(CI_PATHS).length) triggers.push(`CI/build config: ${hitPaths(CI_PATHS)[0]}`)
if (hitPaths(SCHEMA_PATHS).length) triggers.push(`schema/migration: ${hitPaths(SCHEMA_PATHS)[0]}`)
if (newDeps.length) triggers.push(`added dependency: ${newDeps.join(', ')}`)
if (/process\.env|import\.meta\.env|getenv|os\.environ/.test(addedLines)) triggers.push('reads env vars')
if (/0x[a-fA-F0-9]{40}\b/.test(addedLines)) triggers.push('hardcoded address')
if (/\b(rpc|chainId|chain_id|endpoint|providerUrl|RPC_URL)\b/.test(addedLines)) triggers.push('network/endpoint/chain config')

const topDirs = new Set(sourceFiles.map(f => (f.includes('/') ? f.split('/')[0] : '.')))

let tier
let tierReason
if (!sourceFiles.length) {
  tier = 'skip'
  tierReason = 'no source changes — docs, generated files or lockfiles only'
} else if (sourceFiles.every(DOCSY)) {
  tier = 'skip'
  tierReason = 'docs-only diff'
} else if (!triggers.length && sourceFiles.every(f => f.endsWith('package.json')) && !newDeps.length && depBump) {
  tier = 'skip'
  tierReason = 'pure version bump, no added dependency'
} else if (triggers.length) {
  tier = 'full'
  tierReason = `sensitivity trigger — ${triggers.join('; ')}`
} else if (topDirs.size <= 2 && sourceChurn <= 150) {
  tier = 'light'
  tierReason = `${sourceFiles.length} source file(s), ~${sourceChurn} changed source lines across ${topDirs.size} top-level dir(s), no sensitive paths`
} else {
  tier = 'full'
  tierReason = `${sourceFiles.length} source file(s), ~${sourceChurn} changed source lines across ${topDirs.size} top-level dir(s)`
}

const detectedTier = tier
if (tierOverride && tierOverride !== 'auto') {
  tier = tierOverride
  tierReason = `overridden with --tier=${tierOverride} (detector said ${detectedTier}: ${tierReason})`
}

note(`phase0: tier: ${tier} — ${tierReason}`)
for (const w of warnings) note(`phase0: warning: ${w}`)
if (tier === 'skip') note('phase0: do not run the workflow — review inline with review-pr.')

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

process.stdout.write(JSON.stringify({
  pr: { repo, number: prJson.number, title: prJson.title, body },
  issues,
  baseRef,
  diffStat,
  changedFiles,
  lintOutput,
  newDeps,
  tier,
  verifyAgent,
  detectedTier,
  tierReason,
  warnings,
}, null, 2) + '\n')
