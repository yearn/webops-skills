# WebOps Documentation

Internal documentation repository for the WebOps team at Yearn Finance.

## Purpose

This repository captures team policies, protocols, and internal documentation for our web2 engineering team. We use git-based markdown documentation for:

- Version control and change tracking
- PR-based review workflows
- Developer-friendly editing experience
- Keeping documentation close to our development workflows

## Claude Code Skills

This repository includes custom skills for [Claude Code](https://claude.com/claude-code) to enhance development workflows.

### Setup

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

### Available Skills

#### find-create-block
Estimates contract creation block using binary search on archive node RPC.

#### npm-policy
Evaluates npm packages against the dependency policy before adding them.

#### create-commit
Guidelines for composing git commit titles and bodies following project standards.

#### create-skill
Create new Claude Code skills following the standard format. Guides through requirements gathering, drafting, and exporting skills.

#### create-spec
Helps create comprehensive work specifications for new features or changes using a structured template. Guides through requirement gathering, codebase research, and generates detailed specs with tasks, acceptance criteria, and technical notes.

#### create-pr
Guide for composing pull request titles and descriptions (placeholder).

#### review-pr
Review pull requests, run checks, and post structured feedback via GitHub MCP.

#### standup-report
Generate git-based reports for standup meetings (placeholder).

#### yearn-branding
Add Yearn brand assets (logo, favicon) to projects. Sources from presskit.yearn.fi.

---

**Note:** This repository is private and intended for internal Yearn Finance WebOps team use only.
