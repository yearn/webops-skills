#!/usr/bin/env node
// Deterministic main-loop work for review-pr-lean, so the session model spends no turns on it.
//
//   node review.mjs prep <pr-url-or-number> [--out <dir>] [--no-checkout]
//     Fetches PR + linked issues, checks out the branch, captures the diff, detects new
//     dependencies, suggests a tier, and writes <out>/run.js (workflow.js with the context
//     injected). Prints a short summary.
//
//   node review.mjs provenance <baseRef> <file:line> [<file:line> ...]
//     git blame each anchor; prints "<file:line> <hash>" or "<file:line> pre-existing <hash>".

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const run = (cmd, a) => execFileSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] })
const git = (...a) => run('git', a)

const NO_LOCKS = ['--', '.', ':(exclude)*.lock', ':(exclude)*lock.json', ':(exclude)*lock.yaml']
const MAX_DIFF = 150_000
const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

const isLock = f => /(\.lock|lock\.json|lock\.yaml)$/.test(f)
const isDoc = f => /\.(md|mdx|txt|rst)$|(^|\/)docs?\//i.test(f)
const isGenerated = f => /generated|\.gen\.|\.snap$|__snapshots__|(^|\/)fixtures?\/|(^|\/)(locales?|i18n|translations?)\//i.test(f)
const SENSITIVE_PATH = /auth|session|token|crypto|permission|(^|[/._-])(role|acl)s?([/._-]|$)|\.github\/workflows|gitlab-ci|circleci|(^|\/)(vite|next|webpack|rollup|turbo|tsconfig|babel)[^/]*\.(c?[jt]s|mjs|json)$|dockerfile|migrations?\/|schema\.|\.sql$|chain|network|rpc|contract|address/i
const SENSITIVE_LINE = /process\.env|import\.meta\.env|Bun\.env|Deno\.env|0x[0-9a-fA-F]{40}/

function linkedIssues(meta, repo) {
  const refs = new Map()
  for (const i of meta.closingIssuesReferences || []) {
    const r = i.repository ? `${i.repository.owner.login}/${i.repository.name}` : repo
    refs.set(`${r}#${i.number}`, [r, i.number])
  }
  for (const m of (meta.body || '').matchAll(/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)/g)) {
    refs.set(`${m[1]}#${m[2]}`, [m[1], Number(m[2])])
  }
  return [...refs.values()].flatMap(([r, n]) => {
    try {
      const i = JSON.parse(run('gh', ['issue', 'view', String(n), '--repo', r, '--json', 'number,title,body']))
      return [{ number: r === repo ? i.number : `${r}#${i.number}`, title: i.title, body: i.body }]
    } catch {
      console.error(`warn: could not fetch issue ${r}#${n}`)
      return []
    }
  })
}

function newDependencies(mergeBase, files) {
  const read = (rev, f) => { try { return JSON.parse(git('show', `${rev}:${f}`)) } catch { return {} } }
  const added = files.filter(f => /(^|\/)package\.json$/.test(f)).flatMap(f => {
    const [a, b] = [read(mergeBase, f), read('HEAD', f)]
    return DEP_KEYS.flatMap(k => Object.keys(b[k] || {}).filter(n => !(a[k] || {})[n]))
  })
  return [...new Set(added)]
}

// Sensitivity only upgrades, size only downgrades, sensitivity wins. The main loop still
// reads the diff summary and may escalate on semantics this cannot see.
function suggestTier(numstat, newDeps, addedLines) {
  const files = numstat.map(n => n.file)
  const hits = [
    ...files.filter(f => SENSITIVE_PATH.test(f)),
    ...(newDeps.length ? [`added deps: ${newDeps.join(', ')}`] : []),
    ...(addedLines.some(l => SENSITIVE_LINE.test(l)) ? ['added lines read env vars or hardcode an address'] : []),
  ]
  if (hits.length) return ['full', `sensitive: ${hits.slice(0, 4).join('; ')}${hits.length > 4 ? ` (+${hits.length - 4})` : ''}`]
  const source = numstat.filter(n => !isLock(n.file) && !isDoc(n.file) && !isGenerated(n.file))
  if (!source.length) return ['skip', 'only docs, lockfiles, or generated files changed']
  const churn = source.reduce((s, n) => s + n.churn, 0)
  const dirs = new Set(source.map(n => n.file.split('/')[0]))
  if (churn <= 150 && dirs.size <= 2) return ['light', `${source.length} source files, ~${churn} changed lines, ${dirs.size} top-level dir(s), no sensitive paths`]
  return ['full', `${source.length} source files, ~${churn} changed lines, ${dirs.size} top-level dir(s)`]
}

function prep(argv) {
  const pr = argv[0]
  if (!pr) throw new Error('usage: review.mjs prep <pr-url-or-number> [--out <dir>] [--no-checkout]')
  const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined }

  const meta = JSON.parse(run('gh', ['pr', 'view', pr, '--json', 'number,title,body,url,baseRefName,headRefOid,closingIssuesReferences']))
  const repo = meta.url.split('/').slice(3, 5).join('/')
  const here = run('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim()
  if (here.toLowerCase() !== repo.toLowerCase()) throw new Error(`PR is in ${repo} but cwd is ${here} — run from the ${repo} checkout`)
  if (!argv.includes('--no-checkout')) run('gh', ['pr', 'checkout', String(meta.number)])
  git('fetch', '-q', 'origin', meta.baseRefName)
  const head = git('rev-parse', 'HEAD').trim()
  if (head !== meta.headRefOid) console.error(`warn: HEAD ${head.slice(0, 8)} != PR head ${meta.headRefOid.slice(0, 8)} — review may be stale`)
  const baseRef = `origin/${meta.baseRefName}`
  const range = `${baseRef}...HEAD`
  const mergeBase = git('merge-base', baseRef, 'HEAD').trim()

  const numstat = git('diff', '--numstat', range).trim().split('\n').filter(Boolean).map(l => {
    const [a, d, file] = l.split('\t')
    return { file, churn: (Number(a) || 0) + (Number(d) || 0) }
  })
  const changedFiles = numstat.map(n => n.file)
  const diffStat = git('diff', '--stat', range, ...NO_LOCKS).trim()
  const addedLines = git('diff', '-U0', range, ...NO_LOCKS).split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))

  let diff = git('diff', '--function-context', range, ...NO_LOCKS)
  let diffMode = 'function-context'
  if (diff.length > MAX_DIFF) { diff = git('diff', '-U10', range, ...NO_LOCKS); diffMode = '-U10' }
  if (diff.length > MAX_DIFF) { diffMode = `omitted (${diff.length} chars) — agents run git diff themselves`; diff = '' }

  const newDeps = newDependencies(mergeBase, changedFiles)
  const issues = linkedIssues(meta, repo)
  const [tier, why] = suggestTier(numstat, newDeps, addedLines)

  const out = opt('--out') || join(tmpdir(), 'review-pr-lean', `${repo.replace('/', '-')}-${meta.number}`)
  mkdirSync(out, { recursive: true })
  const src = readFileSync(join(HERE, '..', 'workflow.js'), 'utf8')
  if (!src.includes('\n// @inject\n')) throw new Error('workflow.js is missing its // @inject marker')
  const data = {
    pr: { repo, number: meta.number, title: meta.title, body: meta.body, url: meta.url },
    root: git('rev-parse', '--show-toplevel').trim(),
    issues, baseRef, diffStat, changedFiles, newDeps, diff,
  }
  writeFileSync(join(out, 'run.js'), src.replace('\n// @inject\n', () => `\nconst INJECTED = ${JSON.stringify(data)}\n`))

  console.log([
    `pr: ${repo}#${meta.number} — ${meta.title}`,
    `base: ${baseRef} (merge-base ${mergeBase.slice(0, 8)})`,
    `files: ${changedFiles.length} | ${diffStat.split('\n').pop()}`,
    `issues: ${issues.map(i => `#${i.number} ${i.title}`).join('; ') || '(none linked — review grades against the PR body)'}`,
    `newDeps: ${newDeps.join(', ') || '(none)'}`,
    `diff: ${diffMode}${diff ? `, ${diff.length} chars` : ''}`,
    `suggested tier: ${tier} — ${why}`,
    `run.js: ${join(out, 'run.js')}`,
    `ui files: ${changedFiles.filter(f => /\.(tsx|jsx|css|scss|vue|svelte|html)$/.test(f)).length}`,
  ].join('\n'))
}

function provenance([baseRef, ...anchors]) {
  if (!baseRef || !anchors.length) throw new Error('usage: review.mjs provenance <baseRef> <file:line> [...]')
  const prCommits = new Set(git('rev-list', `${baseRef}..HEAD`).split('\n').filter(Boolean))
  for (const a of anchors) {
    const i = a.lastIndexOf(':')
    const [file, line] = [a.slice(0, i), a.slice(i + 1)]
    try {
      const sha = git('blame', '-L', `${line},${line}`, '--porcelain', 'HEAD', '--', file).split(' ')[0]
      console.log(`${a} ${prCommits.has(sha) ? '' : 'pre-existing '}${sha.slice(0, 8)}`)
    } catch (e) {
      console.log(`${a} unknown (${String(e.stderr || e.message).trim().split('\n')[0]})`)
    }
  }
}

const [cmd, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'prep') prep(rest)
  else if (cmd === 'provenance') provenance(rest)
  else throw new Error('usage: review.mjs prep|provenance ...')
} catch (e) {
  console.error(`review.mjs: ${String(e.stderr || e.message).trim()}`)
  process.exit(1)
}
