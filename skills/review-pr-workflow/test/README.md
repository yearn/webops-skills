# review-pr-workflow test fixtures

Deterministic fixtures to drive `scripts/phase0.mjs` offline: no network, no real `gh`.

## Build a fixture

```
node build-fixture.mjs --case=<id> --out=<dir> [--stale]
```

`--out` must resolve inside `os.tmpdir()` — the builder refuses otherwise (it wipes
`--out` first). Produces `<out>/origin.git` (bare), `<out>/work` (clean clone,
checked out to the base branch), and `<out>/fixture.json`.

Run phase0 against it:

```
PATH=bin:$PATH EVAL_FIXTURE=<out> node ../scripts/phase0.mjs <fixture case's url> \
  --cwd=<out>/work   # (actually: cd into <out>/work first, phase0 has no --cwd flag)
```

i.e.:

```
cd <out>/work
PATH=<repo>/skills/review-pr-workflow/test/bin:$PATH EVAL_FIXTURE=<out> \
  node <repo>/skills/review-pr-workflow/scripts/phase0.mjs <url>
```

`--stale` also drifts the clone's `refs/remotes/origin/HEAD` and `refs/remotes/origin/<base>`
to an older commit, simulating a reviewer who hasn't fetched recently. phase0's explicit
force-fetch should still produce byte-identical stdout.

## `bin/gh`

A stub standing in for the real CLI. Reads `$EVAL_FIXTURE/fixture.json`, logs every
invocation to `$EVAL_FIXTURE/gh-calls.log`. Supports `pr view`, `repo view`, `issue view`,
`pr diff` (shells to real git in `work`), and `api /advisories/<id>` (serves
`cases/<id>/advisories/<file>.json` when present). Anything else errors loudly.

## Case schema (`cases/<id>/case.json`)

```json
{
  "id": "case-id",
  "repo": "owner/repo",
  "number": 123,
  "title": "...",
  "body": "... may contain 'Closes #45'",
  "baseRefName": "main",
  "url": "https://github.com/owner/repo/pull/123",
  "issues": [{ "number": 45, "body": "..." }],
  "lintScript": "echo 'lint: 0 problems'",
  "expected": { "tier": "full|light|skip", "tierReason": "...", "plantedDefects": ["file:line — ..."] }
}
```

`base/**` and `head/**` are file trees applied as commits (head's parent is base).
`headRefOid` and `caseDir` are added to `fixture.json` by the builder — don't put them
in `case.json`.

## Adding a case

1. `mkdir cases/<id>`, write `case.json`, `base/**`, `head/**`.
2. `lintScript` gets merged into `package.json` at `scripts.lint` in both trees —
   don't hand-write that field into your `base`/`head` `package.json`.
3. Build it and run phase0 against it to confirm the tier matches `expected.tier`.
