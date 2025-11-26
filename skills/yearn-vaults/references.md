# Yearn Vaults v3 - Code Reference

This document maps the directory structures and key contracts across all Yearn v3 repositories.

## Repository Locations

All repositories are located at: `~/git/<repo-name>`

---

## 1. yearn-vaults-v3

**Location**: `~/git/yearn-vaults-v3`
**Purpose**: Core vault contracts implementing ERC-4626 tokenized yield aggregators

### Directory Structure

```
contracts/
├── VaultV3.vy              # Main vault implementation (ERC-4626 compliant)
├── VaultFactory.vy         # Factory for deploying new vaults
├── interfaces/
│   ├── IVault.sol          # Vault interface definition
│   ├── IVaultFactory.sol   # Factory interface
│   ├── IDeployer.sol       # Deployer interface
│   ├── Roles.sol           # Role constants and definitions
│   └── VaultConstants.sol  # Vault constant values
└── test/                   # Test contracts and mocks
```

### Key Contracts

| Contract | Path | Description |
|----------|------|-------------|
| VaultV3 | `contracts/VaultV3.vy` | Core vault implementation with multi-strategy debt allocation |
| VaultFactory | `contracts/VaultFactory.vy` | Factory for creating new vault instances |
| IVault | `contracts/interfaces/IVault.sol` | Main vault interface with all external functions |
| Roles | `contracts/interfaces/Roles.sol` | Role-based access control definitions |

### Key Concepts
- **Multi-strategy allocation**: Vaults can allocate funds to multiple strategies
- **Debt management**: Vault tracks debt allocated to each strategy
- **Share accounting**: Implements ERC-4626 share-based accounting
- **Role-based permissions**: Multiple roles (management, debt manager, etc.)

---

## 2. vault-periphery

**Location**: `~/git/vault-periphery`
**Purpose**: Peripheral contracts for vault management, debt allocation, and accounting

### Directory Structure

```
src/
├── Keeper.sol              # Keeper contract for automated operations
├── accountants/
│   ├── Accountant.sol      # Fee management and profit reporting
│   ├── RefundAccountant.sol # Accountant with gas refunds
│   └── AccountantFactory.sol
├── addressProviders/
│   └── ProtocolAddressProvider.vy # Central address registry
├── debtAllocators/
│   ├── DebtAllocator.sol   # Manual debt allocation
│   ├── DebtOptimizerApplicator.sol
│   ├── DebtAllocatorFactory.sol
│   └── Generic/
│       ├── GenericDebtAllocator.sol # Generic debt allocator
│       └── GenericDebtAllocatorFactory.sol
├── managers/
│   ├── RoleManager.sol     # Role and permission management
│   ├── Positions.sol       # Position tracking
│   └── RoleManagerFactory.sol
├── registry/
│   ├── Registry.sol        # Vault registry
│   ├── ReleaseRegistry.sol # Release version tracking
│   └── RegistryFactory.sol
└── splitter/
    ├── Splitter.vy         # Splits deposits across multiple vaults
    └── SplitterFactory.vy
```

### Key Contracts

| Contract | Path | Description |
|----------|------|-------------|
| Accountant | `src/accountants/Accountant.sol` | Manages fees and profit reporting for vaults |
| DebtAllocator | `src/debtAllocators/DebtAllocator.sol` | Allocates debt between vault strategies |
| RoleManager | `src/managers/RoleManager.sol` | Manages roles and permissions across vaults |
| Registry | `src/registry/Registry.sol` | Vault registration and discovery |
| Splitter | `src/splitter/Splitter.vy` | Splits deposits across multiple vaults |
| Keeper | `src/Keeper.sol` | Automation for harvest/report operations |

### Key Concepts
- **Accountants**: Handle fee calculation, profit reporting, and refunds
- **Debt Allocators**: Automated or manual debt allocation to strategies
- **Role Managers**: Centralized role and permission management
- **Registry**: Discovery and validation of vaults
- **Splitters**: Route deposits to multiple vaults automatically

---

## 3. tokenized-strategy-foundry-mix

**Location**: `~/git/tokenized-strategy-foundry-mix`
**Purpose**: Base template for creating tokenized strategies (ERC-4626 compliant)

### Directory Structure

```
src/
├── Strategy.sol            # Base strategy implementation template
├── StrategyFactory.sol     # Factory for deploying strategies
├── interfaces/
│   └── IStrategyInterface.sol # Strategy interface
└── periphery/
    └── StrategyAprOracle.sol  # APR oracle for strategies
```

### Key Contracts

| Contract | Path | Description |
|----------|------|-------------|
| Strategy | `src/Strategy.sol` | Base ERC-4626 tokenized strategy implementation |
| StrategyFactory | `src/StrategyFactory.sol` | Factory for creating new strategy instances |
| IStrategyInterface | `src/interfaces/IStrategyInterface.sol` | Full strategy interface definition |
| StrategyAprOracle | `src/periphery/StrategyAprOracle.sol` | APR calculation and reporting |

### Key Concepts
- **ERC-4626 strategies**: Standalone tokenized positions
- **Template pattern**: Inherit Strategy.sol and implement `_deployFunds()`, `_freeFunds()`, `_harvestAndReport()`
- **Independent operation**: Strategies can be used standalone or within vaults
- **APR reporting**: Built-in APR oracle integration

---

## 4. tokenized-strategy-periphery

**Location**: `~/git/tokenized-strategy-periphery`
**Purpose**: Peripheral utilities for strategies (swappers, auctions, base contracts, triggers)

### Directory Structure

```
src/
├── AprOracle/
│   ├── AprOracle.sol       # APR oracle implementation
│   ├── AprOracleBase.sol   # Base oracle contract
│   └── ShadowQueueAprOracle.sol
├── Auctions/
│   ├── Auction.sol         # Dutch auction for liquidations
│   ├── AuctionFactory.sol
│   └── AuctionRegistry.sol
├── Bases/
│   ├── 4626Compounder/
│   │   └── Base4626Compounder.sol # Auto-compound ERC-4626 positions
│   ├── HealthCheck/
│   │   └── BaseHealthCheck.sol # Health check base contract
│   ├── Hooks/
│   │   ├── BaseHooks.sol   # Pre/post hooks for strategies
│   │   └── Hooks.sol
│   ├── Staker/
│   │   └── TokenizedStaker.sol # Staking base contract
│   └── Upgradeable/
│       ├── BaseStrategyUpgradeable.sol
│       └── BaseHooksUpgradeable.sol
├── ReportTrigger/
│   ├── CommonTrigger.sol   # Common report triggers
│   ├── CustomStrategyTriggerBase.sol
│   └── CustomVaultTriggerBase.sol
├── swappers/
│   ├── BaseSwapper.sol     # Base swapper implementation
│   ├── UniswapV2Swapper.sol
│   ├── UniswapV3Swapper.sol
│   ├── SolidlySwapper.sol
│   ├── AuctionSwapper.sol
│   └── TradeFactorySwapper.sol
└── utils/
    ├── Governance.sol      # Governance utilities
    ├── Governance2Step.sol
    ├── Clonable.sol        # Clone pattern utilities
    └── ClonableCreate2.sol
```

### Key Contracts

| Contract | Path | Description |
|----------|------|-------------|
| AprOracle | `src/AprOracle/AprOracle.sol` | APR calculation and oracle |
| Auction | `src/Auctions/Auction.sol` | Dutch auction for token liquidations |
| Base4626Compounder | `src/Bases/4626Compounder/Base4626Compounder.sol` | Auto-compounds ERC-4626 yield |
| BaseHealthCheck | `src/Bases/HealthCheck/BaseHealthCheck.sol` | Health checks for strategies |
| BaseHooks | `src/Bases/Hooks/BaseHooks.sol` | Pre/post action hooks |
| TokenizedStaker | `src/Bases/Staker/TokenizedStaker.sol` | Staking strategy base |
| CommonTrigger | `src/ReportTrigger/CommonTrigger.sol` | Keeper trigger conditions |
| UniswapV3Swapper | `src/swappers/UniswapV3Swapper.sol` | Uniswap V3 token swapping |
| AuctionSwapper | `src/swappers/AuctionSwapper.sol` | Auction-based token swapping |

### Key Concepts
- **Swappers**: Modular token swapping integrations (Uniswap, Solidly, TradeFactory, Auctions)
- **Base contracts**: Reusable patterns (auto-compounding, health checks, hooks, staking)
- **Auctions**: Dutch auctions for efficient token liquidations
- **APR oracles**: Track and report strategy performance
- **Report triggers**: Keeper automation conditions
- **Upgradeable**: Support for upgradeable proxy patterns

---

## Common Workflows

### Vault Deployment
1. Deploy vault via `VaultFactory.vy`
2. Configure roles and permissions via `RoleManager.sol`
3. Set up accounting via `Accountant.sol`
4. Register in `Registry.sol`

### Strategy Development
1. Inherit from `Strategy.sol` (tokenized-strategy-foundry-mix)
2. Implement required functions: `_deployFunds()`, `_freeFunds()`, `_harvestAndReport()`
3. Add swappers from tokenized-strategy-periphery as needed
4. Deploy via `StrategyFactory.sol`

### Vault + Strategy Integration
1. Vault adds strategy via `add_strategy()`
2. Vault allocates debt via `update_debt()`
3. `DebtAllocator.sol` can automate debt updates
4. Strategy reports profits via `report()`
5. `Accountant.sol` processes fees
6. Keeper triggers `tend()` and `report()` calls

---

## Finding Specific Functionality

### Deposit/Withdraw Flows
- **Vaults**: `VaultV3.vy` (lines with `deposit`, `mint`, `withdraw`, `redeem`)
- **Strategies**: `Strategy.sol` (ERC-4626 functions)

### Share Accounting
- **Vaults**: `VaultV3.vy` (search for `convertToShares`, `convertToAssets`)
- **Strategies**: `Strategy.sol` (ERC-4626 accounting)

### Debt Management
- **Vault side**: `VaultV3.vy` (`update_debt`, `_update_debt`)
- **Allocation**: `src/debtAllocators/DebtAllocator.sol`

### Fee Management
- **Accountant**: `src/accountants/Accountant.sol`
- **Vault integration**: `VaultV3.vy` (search for `accountant`)

### Role Permissions
- **Definitions**: `contracts/interfaces/Roles.sol` (yearn-vaults-v3)
- **Management**: `src/managers/RoleManager.sol` (vault-periphery)
- **Vault usage**: `VaultV3.vy` (search for role checks)

### Strategy Patterns
- **Auto-compounding**: `src/Bases/4626Compounder/Base4626Compounder.sol`
- **Staking**: `src/Bases/Staker/TokenizedStaker.sol`
- **Health checks**: `src/Bases/HealthCheck/BaseHealthCheck.sol`
- **Hooks**: `src/Bases/Hooks/BaseHooks.sol`

---

## Quick Reference Commands

```bash
# Navigate to repos
cd ~/git/yearn-vaults-v3
cd ~/git/vault-periphery
cd ~/git/tokenized-strategy-foundry-mix
cd ~/git/tokenized-strategy-periphery

# Search for functionality
grep -r "function_name" ~/git/yearn-vaults-v3/contracts/
grep -r "function_name" ~/git/vault-periphery/src/
grep -r "function_name" ~/git/tokenized-strategy-foundry-mix/src/
grep -r "function_name" ~/git/tokenized-strategy-periphery/src/
```

---

## Additional Notes

- **Language**: Core vaults use Vyper (`.vy`), periphery uses Solidity (`.sol`)
- **ERC-4626**: Both vaults and strategies are ERC-4626 compliant
- **Modularity**: System is highly modular - mix and match components
- **Upgradability**: Some contracts support upgradeable proxies (see `Bases/Upgradeable/`)
