---
name: tronche
description: Read and explain live yTranche vault, controller, hook, waterfall, and cooldown state
---

# Tronche

Inspect the yTranche system using read-only RPC calls, contract source, events, and governance records.

## Safety Boundary

- Perform read-only operations only.
- Use `eth_call`, `eth_getLogs`, contract-code reads, explorer lookups, and public APIs.
- Never send transactions, sign messages, request private keys, simulate impersonated governance actions, or modify contract state.
- If asked to perform a write, explain that this skill is read-only and provide the relevant current state or unsigned conceptual call details only when useful.

## Primary Sources

Prefer sources in this order:

1. Live Ethereum state through `RPC_URL_1`
2. Contract source: `https://github.com/Schlagonia/ytranche`
3. Governance vote: `https://snapshot.org/#/s:styfi.eth/proposal/0xa348d353b66f46c6957a938a42fbf860eaffc855cd9163d8042780f65ea72612`
4. Verified block-explorer source using `SCAN_API_KEY`
5. Kong API for indexed Yearn vault data

Use repository documentation for architecture, Solidity source for exact behavior, and live RPC state for current configuration. Clearly distinguish these layers.

## Ethereum Deployment

| Component | Address |
|---|---|
| Main USD vault | `0xDa87123895a043Ed3610155550177C54ce8ba49B` |
| Tranche controller | `0xF0145433E5289dd10712650dCd28333FA317eF36` |
| Hook | `0x776DEd3273440f1481d07B6CE916b5d5Fac170dC` |
| Tranche 0 / Fixed / A | `0x2D4F47208853a3D20EADCbdA0F03900771C6Eba3` |
| Tranche 1 / Levered / B | `0xF7B5D8b432E8c57B4a388c2D833A473091FbF284` |
| Tranche 2 / Equity / E | `0xF0A070c0c5b808AbB8EeF6838f178D44A6d9376E` |

Assume Ethereum mainnet for these addresses unless the user specifies another deployment.

## System Model

- The tranche strategies are user-facing ERC-4626 vaults.
- The controller is the source of truth for tranche priority, target accrual, excess-profit allocation, claims, losses, reserve support, and settlement.
- Priority index `0` is most senior.
- Settlement accrues every tranche's target, allocates surplus by `excessShareBps`, and applies losses in reverse priority order.
- `baselineAssets` contains principal, accrued target, and realized excess.
- `pendingExcess` is assigned but not yet realized through a strategy report.
- A tranche that absorbs any settlement loss has target accrual paused.
- The hook enforces aggregate deposit ceilings, fixed-window deposit and withdrawal rate limits, main-vault direct-deposit gating, and withdrawal caps bounded by deliverable main-vault liquidity.
- Locked tranches add per-user cooldown and withdrawal-window state.

Do not infer tranche economics solely from ERC-4626 `totalAssets` or price per share when controller state is relevant.

## Workflow

1. Identify whether the question concerns:
   - overall system backing or solvency
   - a specific tranche
   - target or excess-return configuration
   - settlement, profit, or loss history
   - hook capacity or rate limits
   - cooldown status
   - the underlying Yearn vault
   - governance intent versus deployed behavior
2. Confirm contract code exists at the expected address.
3. Read immutable relationships such as asset, vault, controller, and hook where relevant.
4. Read the smallest set of current-state fields needed to answer the question.
5. Query historical events when the question concerns changes, settlements, losses, or realized excess.
6. Normalize USDC-denominated values using 6 decimals.
7. Convert rates and timestamps into human-readable values.
8. State the block number or observation time for live results.
9. Separate:
   - governance proposal intent
   - repository implementation
   - deployed configuration
   - current live accounting state

## Core Controller Reads

Use these fields and views where relevant:

- `VAULT()`
- `ASSET()`
- `reserveVault()`
- `tranchesLength()`
- `tranchesByPriority(index)`
- `tranches(tranche)`
- `liveAssets(tranche)`
- `trancheCoverage(tranche)`
- `totalClaims()`
- `vaultAssets()`
- `vaultMaxWithdraw()`
- `reserveAssets()`
- `backingAssets()`

Interpret `tranches(tranche)` as:

- registered
- accrual paused
- excess share in basis points
- target rate per second in WAD
- baseline assets
- last accrual timestamp
- pending excess

Convert a per-second WAD target to an approximate simple annual rate with:

```text
approximate simple annual rate = targetRatePerSecondWad × 31,556,952 / 1e18
```

Treat this as a non-compounded rate. Integer flooring in the stored per-second value can make the reconstructed rate slightly lower than the configured annual BPS.

## Core Hook Reads

Inspect as needed:

- `open()`
- `rateLimitWindow()`
- `depositLimits(target)`
- `depositRateLimit(target)`
- `withdrawRateLimit(target)`
- `depositCap(tranche)`
- `withdrawCap(tranche)`
- `allowed(account)`

Interpret `depositRateLimit(target)` and `withdrawRateLimit(target)` as:

- `uint128 used`
- `uint64 windowStart`
- `uint128 rateLimit`

Treat these as fixed-window counters, not sliding-window lookbacks. A bucket expires when `block.timestamp >= windowStart + rateLimitWindow`; after expiry, effective `used` is zero. Use the current global `rateLimitWindow`, including for existing buckets.

Changing a bucket's `rateLimit` does not reset `used` or `windowStart`, and changing `rateLimitWindow` does not rewrite bucket timestamps. A zero rate limit permits zero throughput. Treat `depositCap(tranche)` and `withdrawCap(tranche)` as derived effective caps. Treat Hook `allowed(account)` as the main-vault direct-depositor allowlist; tranche-local gating is separate.

## Core Tranche Reads

For every tranche, inspect as needed:

- ERC-4626 name, symbol, asset, decimals
- `totalAssets()`
- `totalSupply()`
- `convertToAssets(shares)`
- `maxDeposit(receiver)`
- `maxWithdraw(owner)`
- `CONTROLLER()`
- `hook()`
- `isShutdown()`
- `isPaused()`
- `profitMaxUnlockTime()`
- `fullProfitUnlockDate()`
- `profitUnlockingRate()`
- `lastReport()`

For locked tranches, also inspect:

- `cooldownDuration()`
- `withdrawalWindow()`
- `cooldowns(user)`
- `getCooldownStatus(user)`

Interpret `cooldowns(user)` as `(uint64 cooldownEnd, uint64 windowEnd, uint128 shares)`. Withdrawal becomes available at `cooldownEnd`, remains available through `windowEnd`, and expires when `block.timestamp > windowEnd`. A zero cooldown or strategy shutdown bypasses cooldown gating.

Only query user-specific cooldown or balance state when the user supplies an address or explicitly requests account analysis.

## Important Events

Controller:

- `TrancheRegistered`
- `TrancheTargetRateSet`
- `TrancheExcessShareSet`
- `TrancheAccrualPausedSet`
- `TrancheLoss`
- `Settled`
- `ExcessRealized`
- `ReserveVaultSet`
- `ReserveFunded`
- `ReserveSwept`
- `TokenSwept`

Treat the `amount` emitted by `ReserveSwept` as reserve-vault shares, not underlying asset units.

Hook:

- `RateLimitWindowSet`
- `DepositLimitSet`
- `DepositRateLimitSet`
- `WithdrawRateLimitSet`
- `OpenSet`
- `AllowedSet`

Tranches:

- ERC-4626 `Deposit` and `Withdraw`
- ERC-20 `Transfer`
- `SetHook`
- `Reported`
- `Accrued`
- `StrategyShutdown`
- `UpdatePaused`
- `UpdateProfitMaxUnlockTime`
- tranche-local `OpenSet` and `AllowedSet`
- `CooldownStarted`
- `CooldownCancelled`
- `CooldownDurationUpdated`
- `WithdrawalWindowUpdated`

Distinguish the Hook's `OpenSet` and `AllowedSet` events from the tranche-local inherited events by emitting contract and full event signature.

## Answer Style

- Lead with the requested conclusion.
- Include a compact per-tranche table for system-wide questions.
- Display token amounts in normalized USDC and rates as percentages.
- Include raw values only when they help reproduce or audit the result.
- Explain whether profit is accrued, pending, realized, or still unlocking.
- For solvency questions, compare controller claims, live assets, vault backing, reserve assets, and immediately deliverable liquidity.
- Cite source URLs for architectural or governance claims.
- Identify live values as block-specific and potentially stale after the reported block.

## Common Pitfalls

- Do not treat target yield as guaranteed realized yield.
- Do not confuse `pendingExcess` with immediately available tranche NAV.
- Do not treat the reserve as a normal redemption source.
- Do not infer withdrawal capacity from accounting coverage alone; hook limits and underlying-vault liquidity also apply.
- Do not assume repository example parameters equal the deployed configuration.
- Do not assume priority names are hard-coded; A, B, and E are deployment configuration.
- Do not combine tranche TVL with main-vault TVL when calculating protocol-wide backing; tranche assets are claims on the same underlying vault.
- Do not describe a Snapshot proposal as implemented without verifying deployed state.
