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
| `standup-report` | Generate git-based standup reports |
| `yearn-branding` | Add Yearn brand assets to projects |
| `yearn-vaults` | Query Yearn vault system documentation |

## Usage

After setup, invoke skills in Claude Code:
```
/npm-policy axios
/create-commit
/review-pr 123
```
