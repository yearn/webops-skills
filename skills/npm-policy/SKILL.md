---
name: npm-policy
description: evaluate npm packages against dependency policy before adding them to a project
---

## Activation Criteria
Use this skill when:
- A new npm dependency is being added to the project
- Evaluating whether to add a specific package
- Requesting a policy score for a specific npm package
- Auditing all dependencies in a project

## Policy Reference
Read the full policy at: `~/.claude/skills/npm-policy/policy.md`

## Ignore List
Check for `.webopsignore` in the local project root. If it exists, look for:
```
npm-dependencies: package-a, package-b, package-c
```
Skip any packages listed there during audits.

## Workflow

1. **Identify the package(s)** being considered (name and version if specified)

2. **Check if we can avoid it** (Decision Framework Step 1)
   - Can this be done with native features?
   - Can AI generate a simple implementation?
   - Can a teammate write this quickly?

3. **Evaluate size & performance** (Step 2)
   - Fetch bundle size from bundlephobia.com API: `https://bundlephobia.com/api/size?package=name@version`
   - Compare against thresholds:
     - Utilities: >100kb
     - UI libraries: >150kb
     - Frameworks/SDKs: >250kb
   - Check for tree-shaking support

4. **Check maintenance signals** (Step 3)
   - Last updated date (should be within 6 months)
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
For full project audits, follow the format in: `~/.claude/skills/npm-policy/output-example.md`

For single package evaluations, provide a structured evaluation covering all decision framework points with a clear final recommendation.
