# Reconciled input format (version 1)

Read `scripts/calculate.ts` for the exact TypeScript `Inputs` type. Save `inputs.json` in the run directory; the CLI also accepts `--input /absolute/path/inputs.json`. This file is private evidence, not published. No dummy core input is generated. Every row marked `Ref` must contain `evidence: ["<64-character cache ID>", ...]`. Cache envelopes live in `cache/<ID>.json`; their data digest and cutoff are verified offline. Evidence IDs must reference the actual record supporting the classification and valuation, not merely a related API response.

Top-level fields:

| Field | Meaning |
| --- | --- |
| `version` | Integer `1` |
| `cutoff` | Exact ISO UTC cutoff from `run.json` |
| `vaults` | `{id, activation, excluded?}`; IDs are `chainId:lowercaseAddress`; optional exclusion is an explanation, never a boolean |
| `current` | Array of `Holding` objects, one for every eligible vault, including observed zero balances |
| `daily` | `{date, holdings}` per completed UTC day, with date at midnight ISO (`...T00:00:00.000Z`) and same-day closing holdings |
| `fees` | Classified retained fees with distinct event IDs and source/recipient reconciliation |
| `cash` | Actual treasury/distributor movements classified separately from earnings |
| `budgets` | Approved expense lines, intervals, supersession and evidence |
| `treasury` | Priced, deduplicated custody positions and liquidity classification |
| `accountingPeriods` | Optional on-chain reported revenue/costs with actual 84-day boundaries; never redistributed into calendar months |
| `reportScope` | Public methodology, vault exclusions, fee attribution basis, treasury scope and public source links |
| `controlledAccounts` | All treasury/internal custody addresses (lowercase); team disbursements leave this scope |
| `coverage` | Core completeness reconciliation described below |
| `secondary` | Optional measured/verified metrics; omission means unavailable |

## Core records

`Holding`: `{id, usd, observedAt, block, overlaps, evidence}`. `overlaps` is an array of `{target, usd, kind}` where kind is `nested-vault`, `wrapper` or `curation`. Target is another included holding ID. The USD edge amount is the claim counted twice at that observation. Record `[]` only after inspecting allocation and wrapper relationships. The raw resolver labels failed/non-wrapper probes as unresolved-or-base; do not treat that as proof a token is a base asset. Holding evidence must include a block hash, source value, valuation and debt/ownership derivation in the cached record. Historical daily overlap cannot be copied from the current snapshot. `observedAt` is an ISO timestamp, `block` a positive integer. `usd` is actual USD units (not thousands or millions).

`Fee`: `{id, at, vaultId, kind, grossUsd, retainedUsd, distributedUsd, evidence}`. Kind is `vault` or `ylockers`. Vault ID must be in the eligible universe at event time; yLockers has `vaultId: null`. ID includes chain, transaction hash and log/economic event reference. Gross equals retained plus distributed after documented refunds. For a verified retained-mint lower bound, use `basis:"retained-mint"`, `grossUsd:null`, `distributedUsd:null`, and `reportScope.fees.basis:"identified-retained-mints"`. This explicitly withholds unavailable gross/distributed fee totals instead of inventing a balanced split. Record protocol-retained value, not all performance fees or all harvest profit. Include management fees and recipient routing; eliminate nested fee double counts before creating records.

`Cash`: `{id, at, usd, from, to, kind, evidence}`. Kind: `spending`, `receipt`, `internal`, `asset-swap`. ID identifies a unique transfer/economic payment, including token/log index where needed. Controlled-account transfers must be internal. Cash leaving the scope for team funding is spending; avoid counting the prior prefund as spending. A cash receipt is not added to fee revenue. Optional `daoCashSettlement:true` identifies a historical-priced pipeline settlement into DAO cash custody, including internal realization of an existing warehouse credit. It is displayed separately and never added to protocol earnings or external spending. Omit unpriced settlement values with an explicit coverage note rather than using current spot prices. Use actual historical token valuation; token bonuses require separate supported records.

`Budget`: `{id, team, line, start, end, usd, approvedAt, supersedes?, evidence}`. End is exclusive. `supersedes` lists earlier IDs that this approved revision replaces. No overlapping active intervals for the same team/line. Reconcile overlapping transition periods before supplying data: don't just rename cost lines to bypass the overlap check. Add documented one-off lines and token expense valuations with their own evidence. Annual/monthly amounts must be converted to the full interval's USD before day allocation.

`Treasury`: `{id, usd, liquid, committed, ownToken, observedAt, valuedAt, block, representationOf?, evidence}`. ID includes chain, custody, token and custody location (e.g. wallet vs Splits warehouse). Resolve wrapper assets and count one representation. `representationOf` points to an alternative position and prevents counting both. Committed or own-token assets cannot be marked liquid. An unvalued, non-liquid holding requires `usd:null`, a specific `valuationGap` and `reportScope.treasury`; it cannot enter liquid runway. Unpriced holdings within the declared liquid scope block publication; resolve or explain/exclude economically worthless spam before constructing the authoritative scope. Evidence must substantiate that exclusion.

`coverage`: `{feesThrough, cashThrough, budgetsThrough, treasuryEnumerationComplete, reviewNotes:{methodology,evidence}}`. Through timestamps must exactly equal cutoff. Treasury enumeration flag must be supported by reviewed custody/token/log coverage. Methodology describes included/excluded chains/vaults, retained fee mapping, refund treatment, yLockers gross/retained routing, custody, budget supersession and known gaps. Never set completeness because a query returned no rows. Scan log ranges/source watermarks and review all failures first.

## Optional records

`accountingPeriods` rows contain `{id,label,start,end,complete,protocolRevenueUsd,recordedCostsUsd,evidence}`. Completed periods must end before cutoff. Zero raw entries in the current period are rendered as no entries yet, not zero earnings or costs. With this basis, calendar protocol-revenue/yLockers charts are null; monthly fee mints, treasury cash and approved budget allocations remain distinct.

Every optional metric includes evidence, with the same `Ref` convention. Do not add fabricated zeros. Record gap explanations in `collection.json.gaps` as `{source, core:false, reason}`. The published page labels omitted metrics unavailable.

- `visitors`: `[{month, value, evidence}]`; month is exactly `YYYY-MM` or `YYYY-MM MTD`; query uniques once per matching interval.
- `mergedPRs`: `[{at,evidence}]`; one actual merged pull request, `at` is merged time. Exclude post-cutoff merges and explain repository/fork/bot coverage in methodology.
- `linearDone`: `[{at,evidence}]`; one completed issue at its completion timestamp; labels do not prove incident completeness.
- `apy`: `[{vaultId,value,evidence}]`; net yield as fraction (`0.04` means 4%), current eligible vault. Values below −1 or above 10 are unverified indexed outliers and excluded, not clipped; valid negative values are retained. APY is weighted by covered gross vault TVL; disclose nesting and missing coverage.
- `depositors`: `{count,top10Share,coveredVaults,methodology,evidence}`; share is fraction in [0,1]. Methodology states minimum USD position, chain/block reconstruction, nested-account removal and count coverage.
- `flows`: `[{id,at,vaultId,kind,usd,internal,evidence}]`; kind deposit/withdrawal. Derive from underlying asset event amounts and historical prices, not share-transfer USD or TVL deltas. `internal` identifies migrations/overlapping wrappers.
- `macro`: `[{at,fed,stableSupplyUsd,defiTvlUsd,evidence}]`; daily rates use percent units (`4` means 4%), USD series use actual USD, unavailable fields are null. Sort observations by date and use observations before cutoff. Include the previous month's last stock observation if computing supply changes independently; the current template displays stocks only.
- `partners`: `{count,methodology,evidence}`; Define the count precisely; a public website showcase count must be labeled featured use cases and cannot be presented as active integrations. Organizational text remains private; public report gets aggregate count and a nonconfidential method only.

## Additional evidence and reproduction

Use `Cache.get(source, nonsecretParameters, asyncRead)` from `scripts/io.ts` with the run's cache directory and cutoff. Never put a URL containing a credential, authorization headers, or credentials into parameters. The collector stores complete API evidence locally with mode 0600. Scope/source and aggregate claims must be reviewed against cached bodies. An arbitrary cache ID does not prove a claim correct; the agent reconciliation is still required.

After reconciliation, validate, render, and reproduce with `--offline --stage verify`; no external API is permitted in offline mode. Local HTML has no external dependencies. A successful report's monthly/quarterly values, narrative and health signal are derived from these inputs. Nothing from the October 9 report is an input to this process.
