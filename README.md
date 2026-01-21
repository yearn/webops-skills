# WebOps Skills

Custom skills for [Claude Code](https://claude.com/claude-code) used by the WebOps team at Yearn Finance.

## Setup

1. **Install dependencies and export skills:**
   ```bash
   cd ~/git/webops
   bun run install-skills
   ```

2. **Configure archive nodes (required for some skills):**
   ```bash
   cp .env.example .env
   # Edit .env and add your archive node RPC URLs
   ```

   Skills that query historical blockchain state load archive node RPCs from the root `.env` using the format `ARCHIVE_NODE_[CHAIN_ID]` (e.g., `ARCHIVE_NODE_1` for Ethereum, `ARCHIVE_NODE_8453` for Base).

3. **Create a GitHub PAT (required for GitHub MCP skills):**

   Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with these settings:
   - **Token name:** `[agent]-[repo1]-[repo2]-...` (e.g., `code-yearnfi-kong-ydaemon`)
   - **Resource owner:** Yearn
   - **Expiration:** Use shortest option available
   - **Repository access:** Only select repositories (pick the repos you need)
   - **Permissions:** Read and write access to:
     - Contents
     - Issues
     - Pull requests

   > **Important:** Delete your token when you're done with your work session.

4. **Install MCP servers (required for GitHub and browser automation skills):**
   ```bash
   claude mcp add-json github '{"type":"http","url":"https://api.githubcopilot.com/mcp","headers":{"Authorization":"Bearer github_pat_********"}}' --scope user
   claude mcp add playwright -- npx -y @playwright/mcp@latest
   ```

## Available Skills

| Skill | Description |
|-------|-------------|
| `find-create-block` | Estimate contract creation block via binary search on archive RPC |
| `npm-policy` | Evaluate npm packages against dependency policy |
| `create-commit` | Git commit message guidelines |
| `create-pr` | PR title and description template |
| `review-pr` | Review PRs and post feedback via GitHub MCP |
| `create-skill` | Create new Claude Code skills |
| `create-spec` | Create work specifications for features |
| `implement-spec` | Implement a spec from GitHub issue or file |
| `ship-spec` | Orchestrate full dev cycle: spec → implement → PR → review |
| `socket-check` | Check package.json dependencies for security issues using Socket.dev |
| `standup-report` | Generate git-based standup reports |
| `yearn-branding` | Add Yearn brand assets to projects |
| `yearn-vaults` | Query Yearn vault system documentation |

## Ship-Spec: Full Dev Cycle Orchestration

The `ship-spec` skill chains four skills into a complete development workflow:

```
create-spec → implement-spec → create-pr → review-pr
```

By default it pauses for your approval after each step, keeping operators in control.

### Entry Points

Start anywhere in the flow depending on what you already have:

| Command | Starts at | Use when |
|---------|-----------|----------|
| `/ship-spec` | Spec creation | Starting fresh |
| `/ship-spec #42` | Implementation | You have a spec issue ready |
| `/ship-spec pr 123` | PR review | You have a PR ready for review |

### Example

```
> /ship-spec
Starting full dev cycle. What feature do you want to build?

> Add a logout button to the navbar

[Drafts spec, posts as issue #42]
Spec created at #42. Ready to implement?

> yes

[Implements the spec, runs checks]
Implementation complete. Ready to create PR?

> yes

[Creates PR #87]
PR created. Ready to run review?

> yes

[Reviews PR, posts feedback]
Done! PR #87 is ready for human review.
```

## Usage

After setup, invoke skills in Claude Code:
```
/npm-policy axios
/create-commit
/review-pr 123
```
