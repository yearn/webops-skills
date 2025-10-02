● NPM Dependency Policy Compliance Report

  Summary

  This project has several dependencies that violate the policy size thresholds and maintenance requirements.

  ---
  Critical Policy Violations

  1. @cowprotocol/cow-sdk@5.10.3 🚨

  - Minified: 546kb | Gzipped: 162kb
  - Status: EXCEEDS all thresholds (>200kb for Frameworks/SDKs)
  - Last Updated: April 11, 2025 (within 6 months ✓)
  - Issue: This is a utility SDK, should be <50kb but is 10x over the limit

  2. recharts@2.15.4 🚨

  - Minified: 602kb | Gzipped: 137kb
  - Status: EXCEEDS UI library threshold (>150kb)
  - Last Updated: June 20, 2025 (within 6 months ✓)
  - Recommendation: Consider lighter alternatives like lightweight-charts, visx, or nivo

  3. ethers@5.7.2 ⚠️

  - Minified: 404kb | Gzipped: 133kb
  - Status: EXCEEDS Framework/SDK threshold (>200kb)
  - Last Updated: October 19, 2022 (>2 years old ❌)
  - Critical Issues:
    - Abandoned/outdated (not updated in 2+ years)
    - Project should migrate to viem (already installed at 348kb)
    - Having both ethers AND viem is wasteful

  4. viem@2.31.7 ⚠️

  - Minified: 348kb | Gzipped: 96kb
  - Status: EXCEEDS Framework/SDK threshold (>200kb) but acceptable for blockchain SDK
  - Last Updated: Recent ✓
  - Note: Modern replacement for ethers, tree-shakeable

  5. @rainbow-me/rainbowkit@2.2.5 ⚠️

  - Minified: 263kb | Gzipped: 63kb
  - Status: EXCEEDS UI library threshold (>150kb)
  - Note: Required for wallet connection UI

  6. framer-motion@11.18.2 ⚠️

  - Minified: 153kb | Gzipped: 49kb
  - Status: Just barely over UI library threshold (>150kb)
  - Recommendation: Consider motion-one (lighter alternative) or CSS animations

  7. axios@1.12.2 🟡

  - Minified: 36kb | Gzipped: 14kb
  - Status: Under threshold but could use native fetch
  - Recommendation: Modern browsers support fetch API natively, consider removing

  ---
  Compliant Dependencies ✓

  | Package               | Minified | Gzipped | Category    |
  |-----------------------|----------|---------|-------------|
  | @clustersxyz/sdk      | 7kb      | 1kb     | Utility ✓   |
  | @react-hookz/web      | 20kb     | 6kb     | Utility ✓   |
  | @tanstack/react-query | 63kb     | 15kb    | Framework ✓ |
  | react                 | 7kb      | 2kb     | Framework ✓ |
  | react-router-dom      | <1kb     | <1kb    | Utility ✓   |

  ---
  Recommendations

  Immediate Actions Required:

  1. Remove ethers@5.7.2 - Outdated and redundant (use viem instead)
  2. Evaluate @cowprotocol/cow-sdk - 546kb is extreme, check if tree-shaking works or find lighter alternative
  3. Replace recharts - 602kb for charts is too heavy, consider:
    - lightweight-charts (~50kb)
    - visx (modular, tree-shakeable)
    - native SVG/Canvas implementations

  Consider:

  4. Replace axios with fetch - Native API, saves 36kb
  5. Evaluate framer-motion - Consider motion-one or CSS animations
  6. Review @rainbow-me/rainbowkit - Check if all features are needed

  Policy Compliance Score: 4/13 critical dependencies compliant (31%)
  