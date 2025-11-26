---
name: find-create-block
description: estimate the block number when a contract was created using binary search on RPC
---

## Activation Criteria
Use this skill when:
- Need to find when a contract was deployed
- Given a contract address and chain ID
- Want to estimate the creation block for indexing or analysis

## Prerequisites

Requires archive node RPC configured in `~/git/webops/.env`. See [README](../../README.md) for setup.

## Usage

### Execute the Script
```bash
cd ~/git/webops/skills/find-create-block
bun run find-create-block.ts <chainId> <address>
```

### Input Parameters
- **chainId**: Numeric chain ID (e.g., 1 for Ethereum, 8453 for Base)
- **address**: Contract address (0x... format)

### Example
```bash
bun run find-create-block.ts 1 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
```

## Output Format

The script outputs JSON to stdout:

```json
{
  "chainId": 1,
  "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "createBlock": "6082465",
  "confidence": "exact",
  "method": "rpc-binary-search",
  "blocksSearched": 24
}
```

### Fields
- **chainId**: Chain ID searched
- **address**: Contract address searched
- **createBlock**: Block number where contract was created (null if not found)
- **confidence**:
  - `exact`: Verified as first block with code
  - `estimated`: Code exists in previous block (rare edge case)
  - `not_found`: Contract doesn't exist on this chain
- **method**: Always `rpc-binary-search`
- **blocksSearched**: Number of RPC calls made

## How It Works

1. **Validation**: Checks if RPC URL exists for the chain ID
2. **Current State**: Verifies contract exists at current block
3. **Binary Search**:
   - Searches from block 0 to current block
   - Checks `eth_getCode` at midpoint
   - If code exists: search earlier blocks
   - If no code: search later blocks
4. **Verification**: Confirms result by checking previous block

## Error Handling

**Missing Archive Node Configuration**
```
Error: No archive node RPC URL configured for chain 8453. Add ARCHIVE_NODE_8453 to .env file.
```
→ Add the chain's archive node RPC URL to `~/git/webops/.env`

**Invalid Address**
```
Error: address must be a valid Ethereum address (0x...)
```
→ Check address format (must be 0x followed by 40 hex characters)

**Contract Not Found**
```json
{
  "createBlock": null,
  "confidence": "not_found"
}
```
→ Contract doesn't exist on this chain, or address is an EOA

## Performance

- **Speed**: O(log n) where n = current block number
- **RPC Calls**: ~log₂(current block) + 2
  - Ethereum mainnet (~20M blocks): ~25 calls
  - Base (~10M blocks): ~24 calls
- **Time**: Depends on RPC latency (typically 5-30 seconds)

## Workflow for Claude Code

When this skill is activated:

1. **Get inputs** from user (chainId and address)
2. **Execute script**:
   ```bash
   cd ~/git/webops/skills/find-create-block
   bun run find-create-block.ts <chainId> <address>
   ```
3. **Parse JSON output** from stdout
4. **Report results** to user with block number and confidence level

## Common Chain IDs

- 1: Ethereum Mainnet
- 10: Optimism
- 137: Polygon
- 8453: Base
- 42161: Arbitrum One
- 43114: Avalanche C-Chain
- 56: BNB Smart Chain
