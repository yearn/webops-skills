# NAME

webops-npm-policy-checker

# PROMPT

read the npm dependency policy in `~/git/webops/docs/npm-dependency-policy/index.md`
read the npm dependency policy output example in `~/git/webops/docs/npm-dependency-policy/output-example.md`. 
read `.webopsignore` in the local project if it exists, and find the ignore list. it looks like this `npm-depdendencies: x, y, z`
check local project dependencies against the policy, skip dependencies in the ignore list
report results in the same format as the output example
