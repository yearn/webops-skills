# YIP-88 Reference

Use this file as an orientation map. Always verify detailed claims against the linked primary source before answering.

## Bundle Identity

- Name: YIP-88: Governance Overhaul - DAO Restructuring, stYFI, and Incentives
- Vote record: https://gl.app/dao/veyfi.eth/proposals/0x9b3a40326411eea6c51ec389a802ed695de53961fa49f6d3525e256513d0a7f9
- Snapshot URL from the forum: https://snapshot.box/#/s:veyfi.eth/proposal/0x9b3a40326411eea6c51ec389a802ed695de53961fa49f6d3525e256513d0a7f9
- Vote created: 2025-10-03
- Vote ended: 2025-10-10
- Result: succeeded, 631.46 veYFI for, 0 veYFI against, 100% for

YIP-88 was voted as a single all-or-nothing package. The vote record says the proposal contains three interconnected parts and that if the unified proposal passed, all three parts would be implemented.

## Primary Forum Threads

- Part 1, DAO Restructuring: https://gov.yearn.fi/t/yip-88-governance-overhaul-dao-restructuring/14553
- Part 2, stYFI Tokenomics and Migration: https://gov.yearn.fi/t/yip-88-governance-overhaul-styfi/14552
- Part 3, Contributor and Team Incentives: https://gov.yearn.fi/t/yip-88-governance-overhaul-incentives/14551

The Snapshot proposal could not include the full text due to Snapshot's character limit, so it points readers to these three forum threads.

## Implementation Source

- stYFI smart contracts: https://github.com/yearn/stYFI
- Local map: `references/styfi-contracts.md`

Use the YIP and forum text to answer what governance approved. Use `yearn/stYFI` to answer how stYFI, migration, rewards, YBC, team accounting, funding, and bonus mechanics are implemented in contracts.

## Part 1: DAO Restructuring

Core claim: reorganize Yearn DAO operations around revenue generation and onchain accountability.

Key approved concepts:

- Existing yTeams are required to reorganize into cohesive revenue-generating teams, except for a minimal DAO Operations team.
- Transition deadline: the current yBudget II epoch was set to end on 2025-10-31 23:59:59 UTC. After that, no recurring BRs from non-revenue-earning teams would be approved.
- DAO-ops scope is limited to DAO smart contracts, governance/reporting infrastructure, and essential administration related to those systems.
- All team-generated revenue must be sent to designated Ethereum mainnet splitter contracts.
- Budget requests must be justified by onchain financial reporting tracking revenue contributed against budget used.
- A discretionary onchain fund is established for urgent, sensitive, or unforeseen expenses, initially funded with $250,000 worth of stablecoins.
- Budget approvals continue through yBudget II during the interim, then transition to a final onchain governance system once contracts are designed, deployed, and signed off.

When answering, separate the approved operating model from the later implementation details that DAO-ops was delegated to design.

## Part 2: stYFI Tokenomics and Migration

Core claim: replace veYFI with stYFI, a liquid governance and revenue-sharing token.

Key approved concepts:

- stYFI is designed to replace veYFI and become the sole governance token for Yearn governance.
- Users stake YFI 1:1 to receive stYFI.
- Unstaking begins a 14-day cooldown. No rewards or voting power accrue to YFI in cooldown.
- Voting power is time-weighted over four phases of continuous staking, from 0% at initial stake to 100% at phase 4+.
- Governance epochs must not be shorter than 14 days.
- Snapshot may be used for binding votes initially, until an onchain system is deployed.
- stYFI holders receive protocol revenue, paid in a single predetermined Yearn vault token such as yvUSDS or yvUSDC.
- Default revenue split: 90% to stYFI stakers and 10% to the DAO treasury. This split is DAO-configurable.
- Revenue split applies to protocol revenue such as vault fees, not assets already held in the DAO treasury.
- Revenue tokens are converted to the reward asset through Yearn's automated, permissionless treasury auction system.
- A veYFI balance snapshot was specified at Ethereum block 23460759, around proposal publication.
- Existing veYFI holders and liquid locker users must opt in via a migration contract to be eligible for rewards in the new system.
- Active dYFI gauges are to be shut down as part of the migration.

Do not claim the exact current reward asset, phase durations, contract addresses, or app behavior without checking current implementation sources. For contract behavior, check `yearn/stYFI`.

## Part 3: Contributor and Team Incentives

Core claim: use treasury-held YFI to align core contributors and revenue-generating teams with protocol profitability.

Key approved concepts:

- No new YFI mint is requested.
- Total incentive pool: about 1,930 YFI, consisting of about 1,700 YFI from the YIP-57 strategic operations mint plus about 230 YFI from the veYFI program remainder.
- Allocation plan:
  - up to 1,111 YFI for Season 2 core contributor vests
  - up to 600 YFI for the liquid locker redemption facility from Part 2
  - initially 200-400 YFI for the team performance bonus program
- Core contributor vests are 3-year linear vests with a 6-month cliff and treasury clawback over unvested portions.
- A volunteer compensation committee must publish an accountability package before vests are distributed.
- Revenue-generating teams receive quarterly YFI performance bonuses based on net profit: revenue contributed minus budget utilized.
- Team bonus value is capped at 50% of the net profit generated that quarter.
- Default universal bonus split: 67% to the team and 33% to the Yearn Builder's Collective as stYFI.
- The Yearn Builder's Collective is a long-term incentive pool for whitelisted contributors.
- The new yvYFI contributor delegation vault is intended to stake YFI into stYFI, vote on governance proposals, and direct voting through the Yearn Builder's Collective.

When answering incentive questions, mention that the proposal uses already-approved treasury assets, especially the YIP-57 strategic operations mint.

## Interpretation Rules

- "Passed in a bundle" means the three parts were one YIP-88 Snapshot vote, not three separately passed votes.
- If a forum thread's status block still says discussion, defer to the final YIP-88 vote record for the approval outcome.
- If the text says "DAO-ops is authorized" or "to be determined", treat it as delegated implementation authority, not a fixed parameter.
- If a question asks "what is live now?", verify against current Yearn apps, docs, `yearn/stYFI`, or onchain data.
