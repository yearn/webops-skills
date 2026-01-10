---
name: create-skill
description: create new Claude Code skills following the standard format
---

## Activation Criteria
Use this skill when:
- Creating a new skill
- User says "/create-skill"

## Skill Structure

Skills live in `webops/skills/<skill-name>/` and require:

```
skills/
└── <skill-name>/
    └── SKILL.md
```

## SKILL.md Template

```markdown
---
name: <skill-name>
description: <one-line description for skill registry>
---

## Activation Criteria
Use this skill when:
- [Condition 1]
- [Condition 2]

## [Main Content Sections]

[Workflow, format, examples, notes as appropriate]
```

## Workflow

1. **Gather requirements** - Use `AskUserQuestion` to clarify:
   - What should the skill do?
   - When should it activate?
   - What inputs/outputs are expected?
   - Any external resources or URLs to reference?

2. **Choose name** - Short, kebab-case (e.g., `yearn-branding`, `commit-guide`)

3. **Draft SKILL.md** - Show the user for approval before saving

4. **Create folder** - Save to `webops/skills/<skill-name>/SKILL.md`

5. **Export** - Run `webops/skills/export.sh` to symlink to `~/.claude/skills/`

## Guidelines

- Keep skills focused on one purpose
- Description should be <100 chars (shown in skill registry)
- Include concrete examples where helpful
- Reference external URLs/docs rather than duplicating content
- Always ask clarifying questions before drafting
