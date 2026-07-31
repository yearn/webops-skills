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
  claim: `${lens} claim ${i}`, evidence: 'ev', change: 'ch', keep: '', doneWhen: 'dw',
})

// Enough material findings on `bugs` to trip MAX_VERIFY_PER_LENS.
const FAKE = {
  spec: [mkFinding('spec', 1, 'blocker'), mkFinding('spec', 2, 'suggestion')],
  bugs: [
    mkFinding('bugs', 1, 'blocker'), mkFinding('bugs', 2, 'issue'),
    mkFinding('bugs', 3, 'issue'), mkFinding('bugs', 4, 'issue'),
    mkFinding('bugs', 5, 'issue'), mkFinding('bugs', 6, 'suggestion'),
  ],
  security: [],
  deps: [],
  clarity: [mkFinding('clarity', 1, 'issue')],
}

let agentCalls = 0
let labels = []

function makeEnv({ refuteAll = false } = {}) {
  agentCalls = 0
  labels = []

  async function agent(prompt, o = {}) {
    agentCalls++
    labels.push(o.label)
    if (o.label?.startsWith('review:')) return { findings: FAKE[o.label.split(':')[1]] ?? [] }
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
check('suggestions bypass verification',
  full.suggestions.length === 2 && !labels.some(l => l?.includes('spec2') || l?.includes('bugs6')),
  JSON.stringify(full.suggestions.map(s => s.file)))
check('blockers get a 3-vote panel',
  full.confirmed.filter(f => f.severity === 'blocker').every(f => f.votes === 3),
  JSON.stringify(full.confirmed.map(f => [f.file, f.votes])))
check('issues get 1 vote',
  full.confirmed.filter(f => f.severity === 'issue').every(f => f.votes === 1))
check('refuted finding is excluded from confirmed',
  !full.confirmed.some(f => f.file === 'src/bugs3.ts') &&
  full.rejected.some(f => f.file === 'src/bugs3.ts'))
check('agent labels are unique', new Set(labels).size === labels.length,
  'duplicates: ' + labels.filter((l, i) => labels.indexOf(l) !== i).join(','))
check('critic runs at full tier', full.gaps.length === 1)
check('stats match payload',
  full.stats.confirmed === full.confirmed.length &&
  full.stats.unverified === full.dropped.length &&
  full.stats.lenses.length === 5)

const light = await run({ ...BASE, tier: 'light' })
console.log(`\n[light tier] ${agentCalls} agents`)
check('light runs spec + bugs only', light.stats.lenses.join(',') === 'spec,bugs')
check('light skips the critic', light.gaps.length === 0)
check('light gives blockers 1 vote', light.confirmed.every(f => f.votes === 1),
  JSON.stringify(light.confirmed.map(f => [f.file, f.votes])))

const none = await run({ ...BASE, tier: 'full' }, { refuteAll: true })
check('\n[edge] all-refuted yields zero confirmed',
  none.confirmed.length === 0 && none.rejected.length > 0)

let threw = null
try { await run({ ...BASE, tier: 'skip' }) } catch (e) { threw = e.message }
check('[edge] tier=skip is rejected', /must not reach the workflow/.test(threw || ''), threw)

threw = null
try { await run({}) } catch (e) { threw = e.message }
check('[edge] missing args.pr is rejected', /args\.pr is required/.test(threw || ''), threw)

console.log(fails ? `\n${fails} failing` : '\nall checks passed')
process.exit(fails ? 1 : 0)
