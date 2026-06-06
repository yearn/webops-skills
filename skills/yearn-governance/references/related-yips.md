# Related YIPs Reference

Use this file to find background sources for Yearn governance and tokenomics questions. Always verify details in the linked primary source before answering.

## YIP-57: Funding Yearn's Future

- Source: https://yips.yearn.fi/YIPS/yip-57
- Status: Implemented
- Created: 2021-01-28
- Relevance to YIP-88: provides the strategic operations mint that Part 3 relies on.

Key context:

- Minted 6,666 YFI.
- About one third was allocated to contributor retention packages.
- About two thirds was allocated to the treasury for community-governed strategic uses, including future contributor incentives.
- YIP-88 Part 3 says about 1,700 YFI from this strategic operations mint remains available for contributor incentives.

## YIP-61: Governance 2.0

- Source: https://yips.yearn.fi/YIPS/yip-61
- Relevance to YIP-88: foundational governance model that moved Yearn away from centralized operations toward yTeams and delegated governance structures.

Use when explaining:

- why Yearn had yTeams
- why YIP-88 describes the current model as a multi-year decentralization evolution
- how the DAO moved from centralized operations toward smaller independent teams

## YIP-65: Evolving YFI Tokenomics

- Source: https://yips.yearn.fi/YIPS/yip-65
- Relevance to YIP-88: defines the earlier veYFI tokenomics roadmap that later proposals built on and that YIP-88 replaces.

Use when explaining:

- the origin of veYFI
- why YFI locking and tokenomics rewards were introduced
- the intended governance flywheel before stYFI

## YIP-73: Activate veYFI Rewards with oYFI Gauges

- Source: https://gov.yearn.fi/t/yip-73-activate-veyfi-rewards-with-oyfi-gauges/13414
- Relevance to YIP-88: activated the veYFI rewards and gauge system that YIP-88 sunsets.

Use when explaining:

- dYFI/oYFI gauge mechanics
- veYFI epochs and gauge voting
- why YIP-88 discusses shutting down active dYFI gauges
- how veYFI holders previously earned rewards from lock exits and gauge forfeitures

Note: the forum thread uses oYFI terminology in places; Yearn later commonly used dYFI naming for the discount token. Check current context before assuming the name a user means.

## YIP-81: Prepare for Full On-Chain Governance

- Source: https://gov.yearn.fi/t/yip-81-prepare-for-full-on-chain-governance/14282
- Relevance to YIP-88: earlier proposal to extend YIP-73's epoch/voting framework toward broader governance proposals.

Use when explaining:

- the path from veYFI voting toward full onchain governance
- why YIP-88 references DAO-ops implementation work
- how Snapshot could be an interim mechanism before onchain governance

## YIP-87: Convert Ychad.ETH into a BORG

- Source: https://gov.yearn.fi/t/yip-87-convert-ychad-eth-into-a-borg/14540
- Implementation source: https://github.com/MetaLex-Tech/borg-core/tree/feat/yearnBorg
- Local map: `references/borg-contracts.md`
- Relevance to YIP-88: establishes yChad's BORG legal and smart-contract wrapper before the broader governance overhaul.

Use when explaining:

- what the Yearn BORG is
- why yChad signer/member changes require DAO co-approval
- how BORG Core, Eject Implant, Sudo Implant, Snapshot Executor, and the oracle interact
- which deployed contracts correspond to the yChad BORG implementation

## Other Useful Sources

- All YIPs index: https://yips.yearn.fi/all-yip
- YIPs repository: https://github.com/yearn/YIPS
- Yearn governance forum: https://gov.yearn.fi/
- Snapshot space used for veYFI-era votes: https://snapshot.box/#/s:veyfi.eth
- Legacy veYFI app status, if still available: https://legacy-veyfi.yearn.fi/
