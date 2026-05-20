# Kong Snapshot Schema

`GET /snapshot/{chainId}/{address}`

Returns a single vault's full state.

## Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `chainId` | number | Chain ID |
| `address` | string | Vault address |
| `name` | string | Vault name |
| `symbol` | string | Vault symbol |
| `decimals` | number | Token decimals |
| `v3` | boolean | Is V3 vault |
| `apiVersion` | string | Vault API version (e.g. `"3.0.4"`) |
| `erc4626` | boolean | ERC-4626 compliant |
| `yearn` | boolean | Yearn vault |
| `origin` | string | Origin protocol (e.g. `"yearn"`) |
| `factory` | string | Factory address |
| `totalAssets` | string | Total assets (raw, divide by 10^decimals) |
| `totalSupply` | string | Total shares (raw) |
| `totalDebt` | string | Total debt to strategies (raw) |
| `totalIdle` | string | Idle assets in vault (raw) |
| `deposit_limit` | string | Max deposit (raw) |
| `pricePerShare` | number | Price per share (raw, divide by 10^decimals) |
| `isShutdown` | boolean | Vault shut down |
| `blockNumber` | string | Last indexed block |
| `blockTime` | string | Last indexed block timestamp |
| `inceptBlock` | number | Deployment block |
| `inceptTime` | number | Deployment timestamp |
| `accountant` | string | Accountant contract address |
| `role_manager` | string | Role manager address |
| `profitMaxUnlockTime` | string | Profit unlock period (seconds) |
| `lastProfitUpdate` | string | Last profit report timestamp (unix seconds) — use for "last report" display |
| `get_default_queue` | string[] | Default strategy withdrawal queue |
| `strategies` | string[] | All strategy addresses |

## `asset` Object

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Asset token name |
| `symbol` | string | Asset token symbol |
| `address` | string | Asset token address |
| `chainId` | number | Chain ID |
| `decimals` | string | Decimals (as string) |

## `tvl` Object

| Field | Type | Description |
|-------|------|-------------|
| `close` | number | TVL in USD |
| `label` | string | Metric label |
| `address` | string | Vault address |
| `chainId` | number | Chain ID |
| `blockTime` | string | Snapshot timestamp |
| `component` | string | Component type |

## `apy` Object (backward-looking delta PPS)

| Field | Type | Description |
|-------|------|-------------|
| `net` | number | Net APY (monthly, decimal) |
| `weeklyNet` | number | 7-day net APY |
| `monthlyNet` | number | 30-day net APY |
| `inceptionNet` | number | Since-inception net APY |
| `grossApr` | number | Gross APR |
| `pricePerShare` | string | Current PPS (raw string) |
| `weeklyPricePerShare` | string | PPS 7 days ago |
| `monthlyPricePerShare` | string | PPS 30 days ago |

## `performance` Object

### `performance.oracle` (forward-looking)

| Field | Type | Description |
|-------|------|-------------|
| `apr` | number | Oracle-based forward APR (decimal) |
| `apy` | number | Oracle-based forward APY (decimal) |
| `netAPR` | number | Net APR after fees |

### `performance.estimated`

| Field | Type | Description |
|-------|------|-------------|
| `apr` | number | Estimated APR |
| `apy` | number | Estimated APY |
| `type` | string | Estimation method |
| `components.grossAPR` | number | Gross APR component |

### `performance.historical` (backward-looking realized)

| Field | Type | Description |
|-------|------|-------------|
| `net` | number | Monthly net APY |
| `weeklyNet` | number | Weekly net APY |
| `monthlyNet` | number | Monthly net APY |
| `inceptionNet` | number | Since-inception net APY |

## `fees` Object

| Field | Type | Description |
|-------|------|-------------|
| `managementFee` | number | Management fee (decimal) |
| `performanceFee` | number | Performance fee (decimal) |

## `debts` Array

Per-strategy debt allocation:

| Field | Type | Description |
|-------|------|-------------|
| `strategy` | string | Strategy address |
| `currentDebt` | string | Current debt (raw) |
| `currentDebtUsd` | number | Current debt in USD |
| `maxDebt` | string | Max debt (raw) |
| `maxDebtUsd` | number | Max debt in USD |
| `totalGain` | string | Total gain (raw) |
| `totalLoss` | string | Total loss (raw) |
| `activation` | string | Activation timestamp |
| `lastReport` | string | Last report timestamp |
| `performanceFee` | string | Strategy performance fee |

## `composition` Array

Per-strategy details with performance:

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Strategy name |
| `status` | string | `"active"`, `"inactive"`, `"unallocated"` |
| `address` | string | Strategy address |
| `currentDebt` | string | Current allocation (raw) |
| `currentDebtUsd` | number | Current allocation in USD |
| `performance.oracle.apr` | number | Forward APR |
| `performance.oracle.apy` | number | Forward APY |
| `performance.historical.net` | number | Realized net APY |
| `performance.historical.weeklyNet` | number | Weekly realized |
| `performance.historical.monthlyNet` | number | Monthly realized |
| `latestReportApr` | number\|null | APR from latest harvest report |

## `meta` Object

Metadata from Yearn Meta registry:

| Field | Type | Description |
|-------|------|-------------|
| `category` | string | e.g. `"Stablecoin"` |
| `isHidden` | boolean | Hidden from UI |
| `isRetired` | boolean | Retired vault |
| `isBoosted` | boolean | Boosted vault |
| `isHighlighted` | boolean | Featured vault |
| `inclusion` | object | Protocol inclusion flags (`isYearn`, `isMorpho`, `isKatana`, etc.) |
| `stability.stability` | string | Stability classification |
| `token` | object | Underlying token metadata |

## `sparklines` Object

Historical data points for charts:

| Field | Type | Description |
|-------|------|-------------|
| `sparklines.apy` | array | APY data points with `close`, `blockTime` |
| `sparklines.tvl` | array | TVL data points with `close`, `blockTime` |

## `staking` Object

| Field | Type | Description |
|-------|------|-------------|
| `available` | boolean | Staking available |
| `rewards` | array | Reward token details |

## `roles` Array

| Field | Type | Description |
|-------|------|-------------|
| `account` | string | Account address |
| `roleMask` | string | Role bitmask |
