#!/usr/bin/env node
// Exercises the workflow with stub agents. No network or model calls are made.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'workflow.js')

const finding = (file, severity = 'issue') => ({
  file,
  line: 10,
  severity,
  claim: `${file} fails`,
  evidence: 'observed in code',
  doneWhen: 'the failure is covered',
  provenance: 'abc1234',
})

const fake = {
  correctness: [
    finding('src/a.ts', 'blocker'),
    finding('src/b.ts'),
    finding('src/c.ts'),
    finding('src/d.ts'),
    finding('src/e.ts'),
    finding('src/style.ts', 'suggestion'),
  ],
  risk: [finding('src/risk.ts')],
}

let calls = []
async function agent(_prompt, options = {}) {
  calls.push(options)
  if (options.label?.startsWith('review:')) {
    return { findings: fake[options.label.split(':')[1]] || [] }
  }
  if (options.label === 'verify:combined') {
    return {
      verdicts: [
        { id: 'correctness:1', confirmed: true, reason: 'holds', correction: 'none' },
        { id: 'risk:1', confirmed: false, reason: 'guarded elsewhere', correction: 'none' },
      ],
    }
  }
  throw new Error(`unexpected agent call: ${options.label}`)
}

const parallel = thunks => Promise.all(thunks.map(thunk => thunk()))
const body = readFileSync(source, 'utf8').replace(/^export const meta/m, 'const meta')
const run = new Function('args', 'agent', 'parallel', `return (async () => { ${body} })()`)

const result = await run({
  pr: { repo: 'yearn/example', number: 1, title: 'Example', body: '' },
  baseRef: 'origin/main',
  changedFiles: ['src/a.ts'],
}, agent, parallel)

const checks = [
  ['workflow uses no more than three agents', calls.length <= 3, calls.length],
  ['workflow uses two lenses and one verifier', calls.map(c => c.label).join(',') === 'review:correctness,review:risk,verify:combined', calls.map(c => c.label).join(',')],
  ['agents use the bounded model settings', calls.every(c => c.model === 'sonnet' && c.effort === 'medium'), JSON.stringify(calls)],
  ['only verified findings are confirmed', result.confirmed.length === 1 && result.confirmed[0].file === 'src/a.ts', JSON.stringify(result.confirmed)],
  ['missing verifier verdicts fail closed', result.rejected.length === 4, JSON.stringify(result.rejected)],
  ['candidate overflow is returned unverified', result.dropped.length === 1 && result.dropped[0].file === 'src/e.ts', JSON.stringify(result.dropped)],
  ['suggestions are discarded', result.stats.discarded === 1, result.stats.discarded],
  ['stats expose the hard cap', result.stats.maxAgents === 3 && result.stats.agentsUsed === 3, JSON.stringify(result.stats)],
]

let failures = 0
for (const [name, passed, detail] of checks) {
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${name}${passed ? '' : `: ${detail}`}`)
  if (!passed) failures++
}

console.log(failures ? `\n${failures} failing` : '\nall checks passed')
process.exit(failures ? 1 : 0)
