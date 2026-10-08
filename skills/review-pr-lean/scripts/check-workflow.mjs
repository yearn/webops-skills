#!/usr/bin/env node
// Exercises workflow.js control flow against stub agents. No network, no real subagents.
// Run after any edit to workflow.js:
//
//   node skills/review-pr-lean/scripts/check-workflow.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'workflow.js'), 'utf8')

const mk = (lens, i, severity, extra = {}) => ({
  file: `src/${lens}${i}.ts`, line: 10 + i, severity,
  claim: `${lens} claim ${i}`, evidence: 'ev', doneWhen: 'dw', ...extra,
})

const FAKE = {
  spec: [mk('spec', 1, 'blocker'), mk('spec', 2, 'suggestion')],
  bugs: [mk('bugs', 1, 'blocker'), ...[2, 3, 4, 5, 6, 7, 8].map(i => mk('bugs', i, 'issue')), mk('bugs', 9, 'suggestion')],
  security: [],
  deps: [1, 2, 3].map(i => mk('deps', i, 'issue', { advisory: `GHSA-xxxx-xxxx-xxx${i}` })),
  clarity: [mk('clarity', 1, 'issue')],
}

let labels, calls

function env({ fake = FAKE, refute = f => f.includes('bugs3'), skip = () => false, dead = () => false } = {}) {
  labels = []
  calls = []
  async function agent(prompt, o = {}) {
    labels.push(o.label)
    calls.push({ label: o.label, prompt, opts: o })
    if (dead(o.label)) return null
    if (o.label.startsWith('review:')) {
      return { findings: fake[o.label.split(':')[1]] ?? [] }
    }
    if (o.label.includes('verify:')) {
      const ids = [...prompt.matchAll(/^(F\d+) — (\S+):\d+/gm)]
      return { verdicts: ids.filter(m => !skip(m[2])).map(([, id, file]) => ({ id, refuted: refute(file), reason: 'r', correction: 'none' })) }
    }
    if (o.label === 'critic:gaps') return { gaps: [{ gap: 'g', why: 'w' }] }
    throw new Error('unexpected agent label: ' + o.label)
  }
  const parallel = ts => Promise.all(ts.map(async t => { try { return await t() } catch { return null } }))
  return { agent, parallel, log: () => {}, phase: () => {} }
}

async function run(args, opts, injected) {
  const e = env(opts)
  let body = SRC.replace(/^export const meta/m, 'const meta')
  if (injected) body = body.replace('\n// @inject\n', () => `\nconst INJECTED = ${JSON.stringify(injected)}\n`)
  const fn = new Function('args', 'agent', 'parallel', 'log', 'phase', `return (async () => { ${body} })()`)
  return fn(args, e.agent, e.parallel, e.log, e.phase)
}

const BASE = {
  pr: { repo: 'y/x', number: 1, title: 't', body: 'b' },
  issues: [{ number: 2, body: 'spec' }],
  changedFiles: ['src/spec1.ts', 'src/untouched.ts', 'yarn.lock'], baseRef: 'origin/main', newDeps: ['pkg'],
}

let fails = 0
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${cond ? '' : ' — ' + detail}`)
  if (!cond) fails++
}
const verifiers = () => labels.filter(l => l.includes('verify:'))
const optsOf = re => calls.filter(c => re.test(c.label)).map(c => c.opts)

const full = await run({ ...BASE, tier: 'full' })
console.log(`\n[full] ${labels.length} agents: ${labels.join(' ')}`)
check('all 5 lenses ran', labels.filter(l => l.startsWith('review:')).length === 5)
check('[models] critic on sonnet', optsOf(/^critic:gaps$/)[0]?.model === 'sonnet')
check('verifiers are batched: 3 blocker votes + 2 issue batches + 1 advisory batch',
  verifiers().length === 6 && full.stats.verifierAgents === 6, verifiers().join(','))
check('blockers carry a 3-vote majority', full.confirmed.filter(f => f.severity === 'blocker').every(f => f.votes === 3) &&
  full.confirmed.filter(f => f.severity === 'blocker').length === 2, JSON.stringify(full.confirmed.map(f => [f.file, f.votes])))
check('issues and advisories carry 1 vote', full.confirmed.filter(f => f.severity === 'issue').every(f => f.votes === 1))
check('refuted finding is excluded', !full.confirmed.some(f => f.file === 'src/bugs3.ts') && full.rejected.some(f => f.file === 'src/bugs3.ts'))
check('suggestions discarded, never verified', full.stats.discarded === 2 && !calls.some(c => c.label.includes('verify') && /spec claim 2|bugs claim 9/.test(c.prompt)))
check('advisories verified, counted, all confirmed', full.stats.advisories === 3 && labels.includes('verify:advisories1'))
check('nothing unverified is returned as publishable', full.confirmed.length > 0 && full.confirmed.every(f => f.votes > 0))
check('labels unique', new Set(labels).size === labels.length)
check('critic runs at full tier, alongside verification, on candidates',
  full.gaps.length === 1 && labels.indexOf('critic:gaps') > labels.indexOf('review:clarity') &&
  /bugs claim 3/.test(calls.find(c => c.label === 'critic:gaps').prompt), JSON.stringify(full.gaps))
check('stats match payload', full.stats.confirmed === full.confirmed.length && full.stats.refuted === full.rejected.length && full.stats.unverified === 0)
check('[models] lenses spec/bugs/security and blocker panel inherit the session model',
  optsOf(/^review:(spec|bugs|security)$|^verify:blockers/).every(o => !o.model))
check('[models] clarity/deps lenses and issue/advisory verifiers run on sonnet',
  optsOf(/^review:(clarity|deps)$|^verify:(issues|advisories)/).every(o => o.model === 'sonnet'))
check('[prompt] agents forbidden from blame/lint/tests and told to batch reads',
  /Do not run lint, tests, typecheck,\s+git blame/.test(calls[0].prompt) && /parallel tool calls/.test(calls[0].prompt))

const codex = await run({ ...BASE, tier: 'full', verifyAgent: 'codex' })
check('[codex] blocker and issue batches go through codex on haiku',
  optsOf(/^codex-verify:(blockers|issues)/).length === 5 && optsOf(/^codex-verify:/).every(o => o.model === 'haiku'))
check('[codex] advisories stay on claude', labels.includes('verify:advisories1') && codex.stats.advisories === 3)

const light = await run({ ...BASE, tier: 'light' })
check('[light] no critic', !labels.includes('critic:gaps') && light.gaps.length === 0)
check('[light] spec + bugs only, blockers 1 vote', light.stats.lenses.join() === 'spec,bugs' &&
  light.confirmed.filter(f => f.severity === 'blocker').every(f => f.votes === 1) && labels.filter(l => l.startsWith('verify:blockers')).length === 1)

const split = await run({ ...BASE, tier: 'full' }, { refute: f => f === 'src/spec1.ts' })
check('[panel] unanimous refutation kills a blocker', !split.confirmed.some(f => f.file === 'src/spec1.ts'))

const skipped = await run({ ...BASE, tier: 'full' }, { skip: f => f === 'src/bugs4.ts' })
check('[missing verdict] a claim the verifier skipped is not confirmed',
  !skipped.confirmed.some(f => f.file === 'src/bugs4.ts') && skipped.rejected.some(f => f.file === 'src/bugs4.ts' && /no verdict/.test(f.why)))

const deadLens = await run({ ...BASE, tier: 'full' }, { dead: l => l === 'review:security' })
check('[dead lens] reported as a gap', deadLens.gaps.some(g => /lens security returned nothing/.test(g.gap)))

const deadVote = await run({ ...BASE, tier: 'full' }, { dead: l => l === 'verify:blockers1#2' })
check('[dead vote] blocker decided by the votes that returned', deadVote.confirmed.filter(f => f.severity === 'blocker').every(f => f.votes === 2))

const capped = await run({ ...BASE, tier: 'full', maxVerify: 3 })
check('[cap] maxVerify caps non-advisory findings, blockers first, advisories exempt',
  capped.dropped.length === 7 && capped.dropped.every(f => f.severity === 'issue' && !f.advisory) && capped.stats.advisories === 3,
  JSON.stringify(capped.dropped.map(f => f.file)))

const dup = await run({ ...BASE, tier: 'light' }, { fake: {
  spec: [{ ...mk('shared', 1, 'issue'), claim: 'spec says' }],
  bugs: [{ ...mk('shared', 1, 'blocker'), claim: 'bugs says' }],
} })
check('[dedup] same file:line verified once, strongest claim kept',
  dup.stats.merged === 1 && dup.confirmed.length === 1 && dup.confirmed[0].claim === 'bugs says' && dup.confirmed[0].lenses.join() === 'spec,bugs')

const noDeps = await run({ ...BASE, tier: 'full', newDeps: [] })
check('[deps] deps lens skipped without new deps', noDeps.stats.lenses.join() === 'spec,bugs,security,clarity')

const one = await run({ ...BASE, tier: 'full', blockerVotes: 1 })
const even = await run({ ...BASE, tier: 'full', blockerVotes: 2 })
check('[votes] blockerVotes=1 → 1 vote; even falls back to 3',
  one.confirmed.filter(f => f.severity === 'blocker').every(f => f.votes === 1) && even.confirmed.filter(f => f.severity === 'blocker').every(f => f.votes === 3))

const inj = await run({ tier: 'light' }, {}, { ...BASE, diff: '+const injected = 1', tier: 'full' })
check('[inject] INJECTED context is used and args override it',
  inj.stats.tier === 'light' && calls[0].prompt.includes('+const injected = 1') && !/Read the diff once/.test(calls[0].prompt))
await run({ ...BASE, tier: 'light' })
check('[diff] no diff → agents told to read it once', /git diff --function-context origin\/main\.\.\.HEAD/.test(calls[0].prompt))

let threw = null
try { await run({ ...BASE, tier: 'skip' }) } catch (e) { threw = e.message }
check('[edge] tier=skip rejected', /must not reach the workflow/.test(threw || ''))
threw = null
try { await run({}) } catch (e) { threw = e.message }
check('[edge] missing pr rejected', /args\.pr is required/.test(threw || ''))
const str = await run(JSON.stringify({ ...BASE, tier: 'light' }))
check('[edge] JSON-string args accepted', str.stats.tier === 'light')

console.log(fails ? `\n${fails} failing` : '\nall checks passed')
process.exit(fails ? 1 : 0)
