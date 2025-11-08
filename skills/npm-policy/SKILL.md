---
name: npm-policy
description: evaluate npm packages against dependency policy before adding them to a project
---

## Activation Criteria
Use this skill when:
- A new npm dependency is being added to the project
- Evaluating whether to add a specific package
- Requesting a policy score for a specific npm package

## Policy Application
When activated, apply the NPM dependency policy located at:
`~/git/webops/docs/npm-dependency-policy/index.md`

## Workflow

1. **Identify the package** being considered (name and version if specified)

2. **Check if we can avoid it** (Decision Framework Step 1)
   - Can this be done with native features?
   - Can AI generate a simple implementation?
   - Can a teammate write this quickly?

3. **Evaluate size & performance** (Step 2)
   - Fetch bundle size from bundlephobia.com API
   - Compare against thresholds (100kb utilities, 150kb UI, 250kb frameworks)
   - Check for tree-shaking support

4. **Check maintenance signals** (Step 3)
   - Last updated date
   - GitHub activity
   - Number of maintainers

5. **Assess long-term value** (Step 4)
   - Will we need this in 2 years?
   - Could this become platform-native soon?

6. **Provide recommendation**
   - Clear approve/reject/discuss recommendation
   - Summary of key findings
   - Alternative suggestions if rejecting

## Output Format
Provide a structured evaluation covering all decision framework points with a clear final recommendation.
