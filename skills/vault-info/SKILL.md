# Vault Info Skill

Query ERC-4626 vault data (especially Yearn vaults) via the Kong REST API.

## API Base URL

```
https://kong.yearn.farm/api/rest
```

## Endpoints

### Vault Snapshot (single vault)

```
GET /snapshot/{chainId}/{address}
```

Returns full vault state: TVL, APR/APY, deposit limit, strategies, composition, fees, sparklines, etc.

**Schema:** [references/snapshot-schema.md](references/snapshot-schema.md)

### Vault List (search/browse)

```
GET /list/vaults           # all chains
GET /list/vaults/{chainId} # single chain
```

Returns an array of vault summaries. Use this to search by name/symbol when the user doesn't provide an address.

**Schema:** [references/list-schema.md](references/list-schema.md)

## Default Output Template

When asked about a vault without specific questions, respond with:

| Field | Source |
|-------|--------|
| **Name** | `name` (`symbol`) |
| **Chain** | `chainId` |
| **Address** | `address` |
| **TVL** | `tvl.close` (snapshot) or `tvl` (list) — format as USD |
| **Estimated APR** | `performance.estimated.apr` — format as % |
| **Deposit Limit** | `deposit_limit` — raw value, divide by `10^decimals` |
| **Remaining Capacity** | `deposit_limit - totalAssets` (both raw), divide by `10^decimals` |
| **Last Report** | `lastProfitUpdate` — unix timestamp, format as relative time (e.g. "2h ago") |

## Workflow

1. **User gives address + chainId** → hit `/snapshot/{chainId}/{address}` directly
2. **User gives vault name only** → hit `/list/vaults` (or `/list/vaults/{chainId}` if chain known), search results by `name` or `symbol`, then hit `/snapshot` for the match
3. **User asks about multiple vaults** → use the list endpoint, filter/sort as needed
4. **Assume chainId 1 (mainnet)** if no chain specified

## Special Rules

- **yvUSD:** When asked about either yvUSD or Locked yvUSD, always show both in separate messages.
  - yvUSD: `0x696d02Db93291651ED510704c9b286841d506987`
  - Locked yvUSD: `0xAaaFEa48472f77563961Cdb53291DEDfB46F9040`

## Notes

- `totalAssets`, `totalSupply`, `deposit_limit`, `pricePerShare` are raw on-chain values — divide by `10^decimals`
- `pricePerShare` in snapshot is raw (e.g. `1002336` for 6-decimal vault = `1.002336`)
- APR/APY values are already decimals (e.g. `0.047` = 4.7%)
- Default to `performance.estimated.apr` for APR display
- The `composition` array has per-strategy breakdown if user wants details
- Full schema docs in `references/` if you need deeper fields
