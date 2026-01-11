# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Repository Purpose

This repository contains custom Claude Code skills used by the WebOps team at Yearn Finance.

## Structure

- `skills/` - Claude Code skill definitions
  - Each skill has a `SKILL.md` file defining activation criteria, workflow, and output format
  - Some skills include additional resources (policy docs, examples, scripts)
- `skills/export.sh` - Symlinks skills to `~/.claude/skills/`

## Working with Skills

- Skills are markdown-based prompt definitions
- Follow the existing `SKILL.md` format when creating new skills
- Use `/create-skill` to scaffold new skills
- Test skills after changes by re-running `bun run install-skills`
