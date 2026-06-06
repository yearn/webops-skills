# stYFI Contract Reference

Use this file as an orientation map for the current stYFI implementation. Verify detailed claims against the repository before answering.

## Primary Source

- Repository: https://github.com/yearn/stYFI
- README: https://github.com/yearn/stYFI/blob/master/README.md
- Contracts: https://github.com/yearn/stYFI/tree/master/contracts
- Deployment metadata: https://github.com/yearn/stYFI/blob/master/deployment.json

Use this repository for current smart contract behavior. Use YIP-88 forum text for what governance approved.

## Core stYFI Components

- `contracts/StakedYFI.vy`: ERC-4626 vault over YFI. README describes it as 1:1 with YFI, reporting user operations to a hook, and using a streaming unstake path except for hook-whitelisted addresses.
- `contracts/StakingMiddleware.vy`: hook/middleware for StakedYFI. Tracks transfer blacklist and unstaking stream bypass addresses, then forwards hook updates to staking rewards and weight aggregation.
- `contracts/StakingRewardDistributor.vy`: receives staking updates, snapshots staked YFI per epoch as reward weight, claims rewards from the global distributor, streams rewards to stakers, and handles expired rewards.
- `contracts/RewardDistributor.vy`: global epoch reward distributor. Components self-report weights; rewards scheduled for epoch N become claimable from epoch N+1.
- `contracts/RewardClaimer.vy`: user-facing claim surface for rewards across multiple components.
- `contracts/WeightAggregator.vy`: aggregates user staking balances and vote weights across stYFI and liquid-locker components. README says vote weight ramps to full value over 4 epochs.

## Migration and Liquid Lockers

- `contracts/LiquidLockerDepositor.vy`: ERC-4626 wrapper for each liquid locker token, with a non-transferable token and unstaking period.
- `contracts/LiquidLockerMiddleware.vy`: hook/middleware for each liquid locker depositor, forwarding updates to liquid locker rewards and weight aggregation.
- `contracts/LiquidLockerRewardDistributor.vy`: reward distributor for liquid locker users, using configured weights and decaying boosts rather than raw staked token amount.
- `contracts/LiquidLockerRedemption.vy`: redemption facility for exchanging liquid locker tokens for YFI with a decaying fee, plus reverse exchange when capacity is available.
- `contracts/VotingEscrowRewardDistributor.vy`: reward distributor for migrated veYFI snapshot users. Users who early-exit their veYFI lock lose future claims and can have unclaimed historical rewards reclaimed.
- `contracts/SnapshotMeasure.vy`: snapshot-related contract. Check source before using for exact behavior.
- Snapshot data files: `veyfi_snapshot.json` and `veyfi_accounts.json`.

## Delegated stYFI

- `contracts/DelegatedStakedYFI.vy`: ERC-4626 vault over YFI that deposits into StakedYFI. README describes it as functionally equivalent to StakedYFI for its own unstaking stream and hook reporting.
- `contracts/DelegatedStakingRewardDistributor.vy`: reward distributor for delegated stYFI. It is not intended as a global RewardDistributor component; it claims directly from the staking reward distributor.

Use these for yvYFI, contributor delegation, or Yearn Builder's Collective staking flow questions.

## Yearn Builder Collective

- `contracts/ybc/YBC.vy`: maintains YBC membership and holds Collective staking positions in stYFI and/or liquid-locker YFI.
- `contracts/ybc/YBCWeightAggregator.vy`: aggregates balances and voting weight for YBC members, receiving translated updates from the global WeightAggregator and YBC membership changes.
- `contracts/ybc/YBCRewardDistributor.vy`: distributes YBC rewards to members based on aggregated staked balances.
- `contracts/ybc/YBCElection.vy`: regulates YBC membership additions and expulsions through member proposals and voting.
- `contracts/ybc/YBCBonusRecipient.vy`: helper that receives YFI and stakes it into stYFI for YBC.

## Team Accounting and DAO Restructuring

- `contracts/TeamRegistry.vy`: registry for active teams, team ownership, retirement, and pointers to revenue/funding implementations.
- `contracts/Team.vy`: per-team proxy instance used by owners to claim funding and deposit revenue.
- `contracts/TeamAccountant.vy`: tracks revenues and costs in USD per team and globally, by epoch and lifetime.
- `contracts/RevenueRecipient.vy`: receives team revenue, prices deposits, credits TeamAccountant, and routes accepted tokens. README describes the current implementation as temporary.
- `contracts/RevenuePriceOracle.vy`: prices a 4626 vault and underlying token, and can convert the underlying into the vault token for RevenueRecipient.
- `contracts/FundingDistributor.vy`: receives approved funding requests and lets teams claim funding through their Team contract. README says yChad submits approvals at launch, replaceable by onchain governance later.
- `contracts/BonusDistributor.vy`: distributes team bonus YFI based on profit and global revenue growth settings.
- `contracts/BonusPriceOracle.vy`: prices bonus YFI in USD, including manual price setting and latest completed period pricing from Chainlink spot price.

## Vesting Helpers

- `contracts/VestingStaker1UP.vy`
- `contracts/VestingStakerCove.vy`
- `contracts/VestingStakerStakeDAO.vy`

Check source before summarizing exact recipient or vesting behavior.

## Answering Rules

- For "what did YIP-88 approve?", cite YIP-88/forum/vote sources.
- For "how does stYFI work?", cite `yearn/stYFI` README and relevant contract files.
- For "what is deployed?", check `deployment.json` and onchain state before answering.
- For exact parameters such as epoch length, whitelist addresses, fee curves, thresholds, accepted tokens, or contract addresses, read the contract source or deployment metadata.
- If README prose and contract source diverge, prefer contract source for behavior and mention the README as design documentation.
