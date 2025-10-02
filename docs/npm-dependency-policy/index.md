# NPM Dependency Policy

## Core Principle
**The best dependency is no dependency.** Every package added increases maintenance burden, security surface, and bundle size.

## Automated Checks

**Socket.dev integration** automatically validates all direct and transitive dependencies in PRs, checking for:
- Supply chain risks (maintainer changes, install scripts, typosquatting)
- Known vulnerabilities
- License issues
- Package quality signals

This policy covers **ai and manual evaluation** of direct dependencies before adding them.

## Decision Framework

Before adding any dependency, answer these questions **in order**:

### 1. Can we avoid this entirely?
- Can this feature be implemented using native features
- Can AI generate a simple implementation? (Copilot, Claude, ChatGPT)
- Can a teammate write this in < 1 day?
- Do we actually need this feature right now?

**If yes to any: don't add the dependency.**

### 2. Size & Performance
- Check bundle size impact (use bundlephobia.com or API: `https://bundlephobia.com/api/size?package=name@version`)
- Size thresholds are for **minified** size (require justification if exceeded):
  - Utilities: > 100kb (validation, data manipulation, helper functions)
  - UI libraries: > 150kb (component libraries, animation, charts)
  - Frameworks/SDKs: > 250kb (blockchain SDKs, major frameworks)
  - General rule: No single dependency > 15% of total bundle
- Also check **gzipped** size for network impact (download cost)
- Note: Minified = parse/execution cost (CPU), Gzipped = network cost
- Check for lighter alternatives
- Verify tree-shaking support:
  - Check bundlephobia.com "Export Analysis"
  - Package.json includes `"sideEffects": false`
  - Uses ES modules (import/export) not CommonJS (require)
  - Test: Import one function, build, verify whole library isn't bundled

### 3. Maintenance Signals
- Last updated within 6 months?
- Active GitHub issues/PRs being addressed?
- Is there more than one maintainer

**Red flags:** Abandoned, infrequent updates

### 4. Long-term Value
- Will we still need this in 2 years?
- Is this solving a temporary problem?
- Could this become platform-native soon? (e.g., date libraries → Temporal API)

## Approval Process
- **< size threshold, secure, well-maintained:** Team member discretion
- **> size threshold or has redflags:** Requires team discussion

## Exceptions

These require fewer justifications:
- Security patches
- TypeScript type definitions
- Dev-only tooling (testing, linting, bundling)

---

**When in doubt, write it yourself. Code we own is code we control.**


