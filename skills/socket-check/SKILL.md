---
name: socket-check
description: check package.json dependencies for security issues using Socket.dev CLI
---

## Activation Criteria
Use this skill when:
- User asks to check dependencies for security/vulnerabilities
- User says "/socket-check"
- User mentions Socket.dev in context of dependency checking
- User wants to audit npm packages for supply chain risks

## Prerequisites
- Socket CLI must be installed (`socket` command available)
- Socket API token configured (check with `socket --help`)

## Workflow

1. **Read package.json** to get exact versions of dependencies and devDependencies

2. **Check each package** using Socket CLI:
   ```bash
   socket npm/<package>@<version>
   ```

   For detailed reports:
   ```bash
   socket npm/<package>@<version> --markdown
   ```

3. **Collect scores** for each package:
   - Overall score
   - Vulnerability score
   - Supply Chain score
   - Maintenance score
   - Transitive dependency count and their aggregate scores

4. **Identify production vs dev-only packages**
   - Check `build/` output if available (LICENSE.txt shows bundled packages)
   - Or analyze which deps are only used by build tools (react-scripts, eslint, testing-library, etc.)

5. **Summarize findings** in a table format:

   | Package | Version | Overall | Vuln | Supply Chain | Maint | Transitive Deps |
   |---------|---------|---------|------|--------------|-------|-----------------|
   | react   | 17.0.2  | 77      | 100  | 99           | 96    | 3 deps, overall: 75 |

6. **Flag concerning alerts** especially:
   - `high` severity (obfuscatedFile, malware, etc.)
   - `mediumCVE` or `highCVE`
   - `potentialVulnerability`
   - Low maintenance scores (<60)

7. **Clarify production impact**
   - Most build tool vulnerabilities (webpack-dev-server, postcss, etc.) don't affect production
   - Only packages bundled into final output reach users
   - Explain which vulnerabilities matter vs which are dev-only

## Output Format

### Summary Table
Show all packages with their Socket scores.

### Key Alerts
List high/medium severity alerts with the problematic transitive package.

### Production Impact
Clearly state whether vulnerabilities affect production or are build-time only.

### Recommendations
Actionable suggestions for any packages that need attention.

## Notes
- Socket.dev focuses on supply chain security, not just known CVEs
- Transitive dependency scores often differ significantly from direct package scores
- A package with 100 vulnerability score can still have risky transitive deps
