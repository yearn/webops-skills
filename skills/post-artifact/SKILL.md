---
name: post-artifact
description: Publish a report file to Yearn Artifacts and return its URL. Use when asked to publish, upload, or share a report, scan result, or markdown document as a link.
---

# post-artifact skill

Use this skill when a report needs to become a URL someone can open.

## Usage

Run from the WebOps Skills repository root:

```bash
bun run post-artifact --file ./REPORT.md
```

It prints JSON:

```json
{
  "key": "9f2c41d7ab3e5806d1f4c92b7e0a5643.md",
  "url": "https://artifacts.yearn.dev/9f2c41d7ab3e5806d1f4c92b7e0a5643.md"
}
```

Report the `url` verbatim. It is the only handle on the report: the stored name
is random, there is no index, and nothing else records where the report went.

## Provenance

Pass what the report describes so the bucket is not a pile of hex names. Every
flag is optional and each becomes object metadata, shown in the rendered
report's footer.

```bash
bun run post-artifact \
  --file ./REPORT.md \
  --repository yearn/webops-skills \
  --scanner example-scan \
  --ref main \
  --commit "$(git rev-parse --short HEAD)"
```

## Configuration

`ARTIFACTS_API_KEY` must be set. It is the bearer key Yearn Artifacts checks on
publish, and publishing fails without it.

`ARTIFACTS_URL` overrides the service URL. It defaults to
`https://artifacts.yearn.dev`, so it usually does not need setting.

## Notes

- Markdown is rendered as HTML and automatically gets a 1200×630 social
  preview image. Other file types are served as stored bytes.
- The extension decides how the report is served, so keep it on `--file`.
- Reports expire 30 days after publish.
- Reads are not authenticated. Anyone holding the URL can read the report, so
  treat it as a secret and do not post it anywhere public.
- Publishing the same file twice creates two reports. Nothing is overwritten.
- To remove a report, `DELETE` its URL with the same bearer key.
