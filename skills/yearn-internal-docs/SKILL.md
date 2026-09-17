---
name: yearn-internal-docs
description: Answer questions from Yearn's internal docs (read-only knowledge base at ~/git/internal-docs). Use for team structure, tools and access, internal websites, private repos, opsec, hack gameplan, multisig ops, keepers (TKS/DOA), auctions, curation, v3 fees, yield, partnerships, glossary, and Yearn history.
---

# Yearn Internal Docs

Use the local checkout of https://github.com/yearn/internal-docs as ground truth when
answering questions about how Yearn operates internally. The site is a Docusaurus project;
the knowledge base is the Markdown under `docs/`.

## Activation Criteria
Use this skill when:
- The user asks how something works "at Yearn" or "internally" (teams, access, tooling, process)
- The question matches a topic in `references.md` (keepers, auctions, curation, fees, opsec, hacks, partnerships, glossary terms, history)
- The user names `internal-docs` or asks what the internal docs say
- Another skill needs an internal definition, contact, or procedure it cannot get from public repos

Do not use it for vault contract internals; use `yearn-vaults` for that. Do not use it for
governance proposals; use `yearn-governance`.

## Read-only contract

This skill only reads. It never:
- Creates, edits, moves, or deletes anything under `~/git/internal-docs`
- Runs `git` write commands there (commit, checkout, pull, stash, reset)
- Pastes internal content into anything outward-facing: PR descriptions, issues, commits,
  comments, public reports, or external services

If the user wants a doc changed, tell them which file and stop. Editing the docs site is a
separate task with its own repo conventions.

Internal links inside the docs (dashboards, HackMD notes, private repos, spreadsheets) are
fine to relay back to the user in conversation. They must not be copied into any artifact
that leaves the conversation.

## Workflow

1. **Locate the checkout** at `~/git/internal-docs`. If it is missing, ask before cloning;
   the repo is private and needs GitHub access.
2. **Check freshness** with `git -C ~/git/internal-docs log -1 --format='%h %ad' --date=short`.
   Mention the date if it is older than about a month. Do not pull; ask the user to.
3. **Pick files from `references.md`**, which maps topics to files and lists what each covers.
4. **Grep before reading** when the topic is unclear:
   ```bash
   grep -rniE '<term>' ~/git/internal-docs/docs
   ```
5. **Read the matching files** in full. They are short. Follow links to other docs in the set
   when the answer spans pages.
6. **Answer from the text**, then cite each source as `docs/<file>.md` with a heading or line
   number. Say when a page is a stub (several are still `TODO`) so the user knows the docs
   have a gap rather than guessing.
7. **Flag staleness** if the doc contradicts something you verified elsewhere (onchain data,
   a public repo). Report both and say which is more recent.

## Answer format

- Lead with the answer in plain prose.
- Cite sources on their own lines: `Source: docs/team-structure.md ("Teams")`
- Quote sparingly. Paraphrase, and quote only when exact wording matters (a checklist item,
  a rule, an address).
- If nothing in the docs covers the question, say so and point to the nearest page.
  Do not fill the gap from memory as if it came from the docs.

## Related skills
- `yearn-vaults` for contract-level questions
- `yearn-governance` for YIPs and DAO process
- `vault-info` and `tronche` for live vault data referenced by the fees and yield pages
