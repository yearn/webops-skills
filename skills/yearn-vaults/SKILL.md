---
name: yearn-vaults
description: Answer questions about Yearn Finance's vault system by reviewing source code from official repositories. Use this skill for questions about vault architecture, tokenized strategies, allocator patterns, deposit/withdraw flows, share accounting, role permissions, ERC-4626 compliance, or smart contract implementation details.
---

# Yearn Vaults

Reference these repositories for ground truth when answering questions about Yearn's vault system:

| Repository | Purpose |
|------------|---------|
| https://github.com/yearn/yearn-vaults-v3 | Core vault contracts |
| https://github.com/yearn/vault-periphery | Vault periphery contracts |
| https://github.com/yearn/tokenized-strategy-foundry-mix | Tokenized strategy template |
| https://github.com/yearn/tokenized-strategy-periphery | Strategy periphery contracts |

## Workflow

1. Check if repos exist at `~/git/<repo-name>`
2. If not found, ask user for permission to clone missing repos
3. **Use references.md** - Consult `references.md` for directory structures and key contract locations
4. Navigate to relevant contracts based on the question
5. Read source files to provide accurate answers
6. Always cite specific files and line numbers in responses

## Optional: Archive Node

For questions requiring onchain data (not just code/docs), configure archive node RPC in `~/git/webops/.env`. See [README](../../README.md) for setup.

## Quick Reference

The `references.md` file contains:
- Complete directory structures for all 4 repositories
- Key contract locations with descriptions
- Common workflows (vault deployment, strategy development, integration)
- Quick lookup guides for specific functionality (deposits, debt management, fees, roles)
- Search commands for finding functionality across repos

## Key Concepts

- Vaults are ERC-4626 compliant tokenized yield aggregators
- Strategies are standalone ERC-4626 tokenized positions
- Vaults allocate to multiple strategies via debt management
- Periphery contracts handle auxiliary functions (accountants, registries, factories)
- Core vaults use Vyper (`.vy`), periphery uses Solidity (`.sol`)