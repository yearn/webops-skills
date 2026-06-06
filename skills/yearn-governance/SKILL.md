---
name: yearn-governance
description: Answer questions about Yearn governance, YIPs, stYFI, YIP-88, and DAO operations.
---

## Activation Criteria
Use this skill when:
- The user asks about Yearn governance, YIPs, Snapshot votes, veYFI, stYFI, yChad, BORG, DAO-ops, yBudget, or Yearn treasury governance
- The user asks how the system approved in YIP-88 works
- The user asks about Yearn DAO restructuring, contributor incentives, revenue sharing, or budget governance
- The user needs a source-backed explanation of what a Yearn governance proposal approved, rejected, mandated, or left unresolved

## Core Sources

Prefer primary sources in this order:

1. Official YIP text at `https://yips.yearn.fi/` and `https://github.com/yearn/YIPS`
2. Yearn governance forum threads at `https://gov.yearn.fi/`
3. Snapshot or mirrored vote records, especially `https://snapshot.box/` and `https://gl.app/`
4. `https://github.com/yearn/stYFI` for stYFI, reward, YBC, team accounting, and related smart contract implementation details
5. `https://github.com/MetaLex-Tech/borg-core/tree/feat/yearnBorg` for Yearn BORG smart contract implementation details
6. Official Yearn docs, blog posts, or Yearn-owned apps for implementation status
7. Onchain data when the question is about actual deployed behavior

Use secondary summaries only for orientation. Do not rely on them for final claims when a primary source exists.

## Workflow

1. Classify the question:
   - proposal meaning: read the relevant YIP/forum text
   - vote result: read Snapshot/Goverland or the YIP information section
   - implementation status: verify current docs, apps, code, or onchain state
   - historical context: read the prior YIPs referenced by the proposal
2. For YIP-88 questions, read `references/yip-88.md` first, then open the linked primary source section needed for the answer.
3. For stYFI contract behavior, migration mechanics, rewards, YBC, or onchain team accounting, read `references/styfi-contracts.md`.
4. For yChad BORG contract behavior, restricted Safe operations, Snapshot co-approval, or deployed BORG addresses, read `references/borg-contracts.md`.
5. For background on older governance mechanics, read `references/related-yips.md`.
6. In the answer, distinguish clearly between:
   - approved proposal text vs current implementation
   - a binding requirement vs an authorization or design mandate
   - forum discussion status text vs the final Snapshot outcome
   - veYFI-era mechanics vs stYFI-era mechanics
   - BORG legal/governance purpose vs BORG contract mechanics
7. Cite source URLs for nontrivial claims. Include dates for vote outcomes, transition deadlines, or time-sensitive implementation statements.

## Answer Style

- Answer narrowly first, then add context.
- Use "according to the approved proposal" when summarizing proposal text.
- Use "I verified current status" only after checking a current source.
- If implementation may have changed, say what source was checked and when.
- If the proposal delegates final design to DAO-ops or governance, do not invent missing parameters.

## Common Pitfalls

- YIP-88 forum threads were originally posted as discussion threads, but the unified YIP-88 Snapshot vote later passed. Use the vote record for approval status.
- YIP-88 was one all-or-nothing package with three forum threads. Do not describe the three parts as separately approved YIPs.
- stYFI details in YIP-88 are a governance mandate and system design. Check implementation sources before claiming what is live today.
- `yearn/stYFI` may describe implementation choices that refine or operationalize YIP-88. If proposal text and contract behavior differ, identify which one the user asked about.
- YIP-87/BORG questions may mix legal structure, Safe controls, Snapshot co-approval, and onchain implementation. Keep those layers separate.
- YIP-57 treasury YFI is relevant to YIP-88 incentives, but YIP-88 did not request a new YFI mint.
