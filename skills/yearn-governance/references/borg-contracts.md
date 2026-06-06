# Yearn BORG Contract Reference

Use this file as an orientation map for the Yearn/yChad BORG smart contracts. Verify detailed claims against the linked source, deployed contracts, or current onchain state before answering.

## Primary Sources

- Governance proposal: https://gov.yearn.fi/t/yip-87-convert-ychad-eth-into-a-borg/14540
- Implementation repository: https://github.com/MetaLex-Tech/borg-core/tree/feat/yearnBorg
- Yearn-specific README: https://github.com/MetaLex-Tech/borg-core/blob/feat/yearnBorg/README-yearnBorg.md
- Deploy script: https://github.com/MetaLex-Tech/borg-core/blob/feat/yearnBorg/scripts/yearnBorg.s.sol
- Acceptance test: https://github.com/MetaLex-Tech/borg-core/blob/feat/yearnBorg/test/yearnBorgAcceptance.t.sol

Local notes found in `/home/murdertxxth/git/governance/gteam/chat.md` also include the deployed address list. Treat those as internal context; cite public sources when answering externally.

## Purpose

The Yearn BORG wraps `ychad.eth` in a Cayman foundation/legal structure plus smart contract restrictions. The contract layer constrains specific yChad Safe administrative actions so they require DAO and yChad co-approval instead of unilateral Safe execution.

Keep these layers separate:

- legal structure: the BORG/Cayman foundation purpose approved by YIP-87
- governance process: Snapshot/DAO co-approval, with future migration to onchain governance
- contract mechanics: Safe Guard, Safe Modules, Snapshot Executor, and auth contracts

## Architecture

- `BORG Core`: Safe Guard restricting yChad's administrative authority.
- `Eject Implant`: Safe Module for yChad member management, integrated with Snapshot Executor for DAO co-approval.
- `Sudo Implant`: Safe Module for yChad Guard/Module management, integrated with Snapshot Executor for DAO co-approval.
- `Snapshot Executor`: contract that lets an oracle propose approved DAO operations onchain and lets yChad co-execute after a waiting period.
- `oracle`: MetaLeX service coordinating Yearn Snapshot voting and recording results onchain. The README says this is intended to be replaceable by Yearn's future onchain governance contract.

## Key Source Files

- `src/borgCore.sol`: Safe Guard / BORG Core.
- `src/implants/ejectImplant.sol`: member management implant.
- `src/implants/sudoImplant.sol`: guard/module management implant.
- `src/libs/governance/snapShotExecutor.sol`: co-approval executor.
- `src/libs/auth.sol`: BorgAuth access control.
- `scripts/yearnBorg.s.sol`: Yearn deploy script and configuration.
- `scripts/yearnBorgReplaceSnapShotExecutor.s.sol`: replacement/migration script.
- `test/yearnBorgAcceptance.t.sol`: mainnet acceptance test for deployed Yearn BORG addresses.
- `test/yearnBorgAcceptanceWithSimulation.t.sol`: simulated acceptance flow.

## Deployed Ethereum Mainnet Addresses

These addresses appear in the Yearn deploy notes and in `test/yearnBorgAcceptance.t.sol`.

- yChad Safe: `0xFEB4acf3df3cDEA7399794D0869ef76A6EfAff52`
- Core: `0xE1c90A1f8a9553b31110dD6FEEAd76E79a6ED419`
- Eject Implant: `0x991c8581Df1Bb51672e958a7fDCbE74288A1acAC`
- Sudo Implant: `0xbe01DAdf8C85277ab8db9Ceaa1cB5A5f24426Cc7`
- Snapshot Executor: `0xE8Bd6Ee2A38709e677b02C875aD73d0aE373EB5C`
- Core Auth: `0x558176a9c86E8B35F72C6dde732035887f902E2d`
- Executor Auth: `0x993Ee3e9190fFE7Df2Ea97F1f927E1678EA3610b`
- Implant Auth: `0xe3037C2f645c6ec1cFcD343ce6f93942adAd1E3f`
- Snapshot oracle from deploy script/tests: `0xf00c0dE09574805389743391ada2A0259D6b7a00`

Before claiming live state, verify whether the yChad Safe currently has the BORG Guard and Modules installed.

## Restricted Operations

The Yearn BORG README says the following yChad Safe operations require bilateral DAO and yChad approval once the BORG is installed:

- add, remove, or swap signers
- change Safe threshold
- add or disable Safe Modules
- set Safe Guards

Delegatecall mode is also restricted unless explicitly whitelisted. The deploy script whitelists Safe's Ethereum mainnet `MultiSendCallOnly` at `0x40A2aCCbd92BCA938b02010E17A5b8929b49130D`; the README notes that `MultiSend` is not whitelisted because it permits arbitrary delegatecall.

## Deployment Configuration

From `scripts/yearnBorg.s.sol`:

- BORG identifier: `Yearn BORG`
- BORG mode: blacklist
- BORG type: `0x3`, described by the README as Dev BORG
- Snapshot waiting period: 3 days
- Snapshot cancel waiting period: 7 days
- Pending proposal limit: 3
- Snapshot oracle TTL: 14 days
- yChad Safe: `0xFEB4acf3df3cDEA7399794D0869ef76A6EfAff52`

The deploy script prepares three Safe transactions for yChad:

1. enable Eject Implant as a module
2. enable Sudo Implant as a module
3. set BORG Core as the Safe Guard

It sets the Guard last because the Guard can block future module changes.

## Co-Approval Flow

The README describes the Snapshot-era co-approval flow:

1. operation is initiated through MetaLeX OS
2. a Snapshot proposal is submitted using Yearn's existing voting settings
3. MetaLeX's Snapshot oracle submits the result to Snapshot Executor
4. after the waiting period, yChad co-approves by executing through the MetaLeX OS flow
5. after the cancel waiting period, anyone can cancel an unexecuted proposal

For a future onchain-governance transition, Yearn governance can replace the oracle by having the new governance executor call `SnapShotExecutor.propose(target, value, cdata, description)`.

## Answering Rules

- For "what did YIP-87 approve?", cite the governance forum/YIP source.
- For "how does the BORG work?", cite `README-yearnBorg.md` and the relevant contract files.
- For "what is deployed?", cite deployed addresses only after checking `test/yearnBorgAcceptance.t.sol`, deploy logs/notes, Etherscan, or current onchain state.
- For "what can yChad still do unilaterally?", distinguish ordinary Safe asset operations from restricted administrative operations.
- If the question involves legal liability or BORG entity status, do not infer beyond the approved proposal and available legal documents.
