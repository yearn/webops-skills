# Kong Vault List Schema

```
GET /list/vaults           # all chains
GET /list/vaults/{chainId} # single chain (e.g. /list/vaults/1)
```

Returns a JSON array of vault summaries.

## Vault List Item

| Field | Type | Description |
|-------|------|-------------|
| `chainId` | number | Chain ID |
| `address` | string | Vault address (checksummed) |
| `name` | string | Vault name |
| `symbol` | string | Vault symbol |
| `apiVersion` | string\|null | Vault API version |
| `decimals` | number | Token decimals |
| `asset` | object | Underlying asset (see below) |
| `tvl` | number | TVL in USD |
| `performance` | object | Performance metrics (see below) |
| `fees` | object\|null | Fee structure |
| `category` | string\|null | e.g. `"Stablecoin"` |
| `type` | string\|null | Vault type |
| `kind` | string\|null | Vault kind |
| `v3` | boolean | Is V3 vault |
| `isRetired` | boolean | Retired vault |
| `isHidden` | boolean | Hidden from UI |
| `isBoosted` | boolean | Boosted vault |
| `isHighlighted` | boolean | Featured vault |
| `inclusion` | object | Protocol inclusion flags |
| `strategiesCount` | number | Number of strategies |
| `riskLevel` | string\|null | Risk classification |
| `migration` | boolean | Migration available |
| `origin` | string\|null | Origin protocol |
| `inceptBlock` | number | Deployment block |
| `inceptTime` | number | Deployment timestamp |
| `staking` | object\|null | Staking info |
| `pricePerShare` | number\|null | Current PPS (raw) |

## `asset` Object

| Field | Type | Description |
|-------|------|-------------|
| `address` | string | Token address |
| `name` | string | Token name |
| `symbol` | string | Token symbol |
| `decimals` | number | Token decimals |

## `performance` Object

| Field | Type | Description |
|-------|------|-------------|
| `performance.historical.net` | number | Monthly net APY (decimal) |
| `performance.historical.weeklyNet` | number\|null | Weekly net APY |
| `performance.historical.monthlyNet` | number\|null | Monthly net APY |
| `performance.historical.inceptionNet` | number | Since-inception net APY |

## `inclusion` Object

| Field | Type | Description |
|-------|------|-------------|
| `isYearn` | boolean | Yearn vault |
| `isMorpho` | boolean | Morpho vault |
| `isKatana` | boolean | Katana vault |
| `isCove` | boolean | Cove vault |
| `isGimme` | boolean | Gimme vault |
| `isPublicERC4626` | boolean | Public ERC-4626 |
| `isPoolTogether` | boolean | PoolTogether vault |

## Notes

- The list endpoint is lighter than snapshot — use it for browsing/searching
- `tvl` is a flat USD number here (vs nested object in snapshot)
- To get full details (deposit limit, strategies, composition), follow up with `/snapshot/{chainId}/{address}`
- Search by matching `name`, `symbol`, or `asset.symbol` against user query
- Results are not paginated — full list returned
