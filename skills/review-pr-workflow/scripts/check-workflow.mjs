#!/usr/bin/env node
// Exercises workflow.js control flow against stub agents. No network, no real
// subagents — this checks fan-out shape, the verification cap, vote counts, and
// the return contract. Run after any edit to workflow.js:
//
//   node skills/review-pr-workflow/scripts/check-workflow.mjs

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'workflow.js')

const mkFinding = (lens, i, severity) => ({
  file: `src/${lens}${i}.ts`, line: 10 + i, severity,
  claim: `${lens} claim ${i}`, evidence: 'ev', doneWhen: 'dw', provenance: 'abc1234',
})

// Enough material findings on `bugs` to trip MAX_VERIFY_PER_LENS. The two
// `suggestion` entries must be discarded outright — the workflow returns no
// channel that could carry them to the author.
const FAKE = {
  spec: [mkFinding('spec', 1, 'blocker'), mkFinding('spec', 2, 'suggestion')],
  bugs: [
    mkFinding('bugs', 1, 'blocker'), mkFinding('bugs', 2, 'issue'),
    mkFinding('bugs', 3, 'issue'), mkFinding('bugs', 4, 'issue'),
    mkFinding('bugs', 5, 'issue'), mkFinding('bugs', 6, 'suggestion'),
  ],
  security: [],
  // Advisory findings are verified like everything else — against the registry
  // rather than by a refuter, but they still spawn a verifier and can be refuted.
  // Six advisories on one lens — more than MAX_VERIFY_PER_LENS. None may be dropped.
  deps: [1, 2, 3, 4, 5, 6].map(i => ({ ...mkFinding('deps', i, 'issue'), advisory: `GHSA-xxxx-xxxx-xxx${i}` })),
  clarity: [mkFinding('clarity', 1, 'issue')],
}

const isAdv = f => Boolean(f.advisory)
let agentCalls = 0
let labels = []
let opts = []

function makeEnv({ refuteAll = false, reverse = false } = {}) {
  agentCalls = 0
  labels = []
  opts = []

  async function agent(prompt, o = {}) {
    agentCalls++
    labels.push(o.label)
    opts.push(o)
    if (o.label?.startsWith('review:')) {
      const found = FAKE[o.label.split(':')[1]] ?? []
      // Lens agents emit findings in whatever order they please. The cap must pick
      // the same ones either way, so the reversed run has to agree with the forward one.
      return { findings: reverse ? [...found].reverse() : found }
    }
    if (o.label?.includes('verify:')) {
      const refuted = refuteAll || o.label.includes('bugs3')
      return { refuted, reason: refuted ? 'not real' : 'holds up', correction: 'none' }
    }
    if (o.label === 'critic:gaps') return { gaps: [{ gap: 'no tests', why: 'because' }] }
    throw new Error('unexpected agent label: ' + o.label)
  }

  const parallel = thunks =>
    Promise.all(thunks.map(async t => { try { return await t() } catch { return null } }))

  const pipeline = (items, ...stages) =>
    Promise.all(items.map(async (item, i) => {
      let acc = item
      for (const s of stages) {
        try { acc = await s(acc, item, i) } catch { return null }
      }
      return acc
    }))

  return { agent, parallel, pipeline, log: () => {}, phase: () => {} }
}

async function run(args, opts) {
  const env = makeEnv(opts)
  const body = readFileSync(SRC, 'utf8').replace(/^export const meta/m, 'const meta')
  const fn = new Function(
    'args', 'agent', 'parallel', 'pipeline', 'log', 'phase',
    `return (async () => { ${body} })()`,
  )
  return fn(args, env.agent, env.parallel, env.pipeline, env.log, env.phase)
}

const BASE = {
  pr: { repo: 'y/x', number: 1, title: 't', body: 'b' },
  issues: [{ number: 2, body: 'spec' }],
  changedFiles: ['a.ts'], diffStat: 's', baseRef: 'origin/main',
}

let fails = 0
const check = (name, cond, detail) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}${cond ? '' : ' — ' + detail}`)
  if (!cond) fails++
}

const full = await run({ ...BASE, tier: 'full', verifyAgent: 'claude' })
console.log(`\n[full tier] ${agentCalls} agents`)
check('all 5 lenses ran', labels.filter(l => l.startsWith('review:')).length === 5)
check('cap leaves 1 of bugs\' 5 material findings unverified',
  full.dropped.filter(d => d.lens === 'bugs').length === 1,
  JSON.stringify(full.dropped.map(d => d.file)))
check('capped findings are returned, not discarded', full.dropped.length === 1)
check('non-defect findings are discarded — never verified, never returned',
  full.stats.discarded === 2 &&
  !('suggestions' in full) &&
  !labels.some(l => l?.includes('spec2') || l?.includes('bugs6')),
  JSON.stringify({ discarded: full.stats.discarded, returned: Object.keys(full) }))
check('blockers get a 3-vote panel',
  full.confirmed.filter(f => f.severity === 'blocker').every(f => f.votes === 3),
  JSON.stringify(full.confirmed.map(f => [f.file, f.votes])))
check('issues get 1 vote, advisories included',
  full.confirmed.filter(f => f.severity === 'issue').every(f => f.votes === 1),
  JSON.stringify(full.confirmed.map(f => [f.file, f.votes])))
check('refuted finding is excluded from confirmed',
  !full.confirmed.some(f => f.file === 'src/bugs3.ts') &&
  full.rejected.some(f => f.file === 'src/bugs3.ts'))
check('agent labels are unique', new Set(labels).size === labels.length,
  'duplicates: ' + labels.filter((l, i) => labels.indexOf(l) !== i).join(','))
check('advisory finding is verified, not waved through',
  full.confirmed.some(f => f.file === 'src/deps1.ts' && f.votes === 1) &&
  labels.some(l => l === 'verify:src/deps1.ts:11'),
  JSON.stringify(labels.filter(l => l?.includes('deps'))))
check('advisory is counted in stats', full.stats.advisories === 6)
check('advisories are never dropped by the per-lens cap',
  full.confirmed.filter(isAdv).length === 6 && !full.dropped.some(d => d.lens === 'deps'),
  JSON.stringify(full.dropped.map(d => d.file)))
check('critic runs at full tier', full.gaps.length === 1)
// The contract the whole review rests on: every publishable finding carries at
// least one verifier verdict. No severity, and no advisory id, is a way around it.
check('nothing unverified is returned as publishable',
  full.confirmed.length > 0 && full.confirmed.every(f => f.votes > 0),
  JSON.stringify(full.confirmed.map(f => [f.file, f.votes, f.advisory])))
check('stats match payload',
  full.stats.confirmed === full.confirmed.length &&
  full.stats.unverified === full.dropped.length &&
  full.stats.lenses.length === 5)
// Unpinned, agent() inherits the caller's session model and the same PR reviewed
// from two different sessions produces two different reviews.
check('every agent carries an explicit model and effort',
  opts.every(o => o.model && o.effort),
  JSON.stringify(opts.filter(o => !o.model || !o.effort).map(o => o.label)))
check('the review model is reported in stats', full.stats.reviewModel === 'opus', full.stats.reviewModel)

const rev = await run({ ...BASE, tier: 'full' }, { reverse: true })
const files = r => r.dropped.map(d => d.file).sort().join(',')
check('cap selection does not depend on the order lenses emit findings',
  files(full) === files(rev),
  `${files(full)} vs ${files(rev)}`)

const codex = await run({ ...BASE, tier: 'full', verifyAgent: 'codex' })
console.log(`\n[codex verifier] ${agentCalls} agents`)
// codex's read-only sandbox has no network, so a registry lookup sent there is
// always "cannot confirm" → refuted. Advisories must bypass codex for the claude
// verifier; everything else must still go through codex.
check('codex mode: advisory verifies with claude, not codex',
  labels.some(l => l === 'verify:src/deps1.ts:11') &&
  !labels.some(l => l?.startsWith('codex-verify:') && l.includes('deps')),
  JSON.stringify(labels.filter(l => l?.includes('deps'))))
check('codex mode: non-advisory findings still verify via codex',
  labels.some(l => l?.startsWith('codex-verify:')) &&
  !labels.some(l => l?.startsWith('verify:') && !l.includes('deps')),
  JSON.stringify(labels.filter(l => l?.includes('verify'))))
check('codex mode: advisory is confirmed', codex.confirmed.filter(isAdv).every(f => f.votes === 1) && codex.confirmed.filter(isAdv).length === 6)
// The codex wrapper writes a prompt, runs the CLI and returns the JSON. No reasoning
// happens in it, so it must not burn the review tier.
check('codex mode: the wrapper runs on the cheap tier',
  opts.filter(o => o.label?.startsWith('codex-verify:')).every(o => o.model === 'haiku' && o.effort === 'low'),
  JSON.stringify(opts.filter(o => o.label?.startsWith('codex-verify:')).map(o => [o.label, o.model])))

const light = await run({ ...BASE, tier: 'light' })
console.log(`\n[light tier] ${agentCalls} agents`)
check('light runs spec + bugs only', light.stats.lenses.join(',') === 'spec,bugs')
check('light skips the critic', light.gaps.length === 0)
check('light gives blockers 1 vote', light.confirmed.every(f => f.votes === 1),
  JSON.stringify(light.confirmed.map(f => [f.file, f.votes])))

const none = await run({ ...BASE, tier: 'full' }, { refuteAll: true })
check('\n[edge] all-refuted leaves nothing confirmed — the advisory is refutable too',
  none.confirmed.length === 0 &&
  none.stats.advisories === 0 &&
  none.rejected.some(f => f.file === 'src/deps1.ts'),
  JSON.stringify(none.confirmed.map(f => f.file)))

let threw = null
try { await run({ ...BASE, tier: 'skip' }) } catch (e) { threw = e.message }
check('[edge] tier=skip is rejected', /must not reach the workflow/.test(threw || ''), threw)

threw = null
try { await run({}) } catch (e) { threw = e.message }
check('[edge] missing args.pr is rejected', /args\.pr is required/.test(threw || ''), threw)

console.log(fails ? `\n${fails} failing` : '\nall checks passed')
process.exit(fails ? 1 : 0)
