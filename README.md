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

### Available Skills

#### find-create-block
Estimates contract creation block using binary search on archive node RPC.

**Usage:**
```bash
bun run skills/find-create-block/find-create-block.ts <chainId> <address>
```

**Example:**
```bash
bun run skills/find-create-block/find-create-block.ts 1 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
```

#### npm-policy
Evaluates npm packages against the dependency policy before adding them.

#### commit-guide
Guidelines for composing git commit titles and bodies following project standards.

#### create-spec
Helps create comprehensive work specifications for new features or changes using a structured template. Guides through requirement gathering, codebase research, and generates detailed specs with tasks, acceptance criteria, and technical notes.

#### pr-guide
Guide for composing pull request titles and descriptions (placeholder).

#### standup-report
Generate git-based reports for standup meetings (placeholder).

---

**Note:** This repository is private and intended for internal Yearn Finance WebOps team use only.
