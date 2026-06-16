---
name: writing-skills
description: Use when creating, editing, reviewing, or tuning repo-local Claude skills in .claude/skills
---

# Writing Skills

Write skills as reusable operating instructions for future agents. Keep them small, discoverable, and easy to tune.

## Core Rule

Skills are reference guides for recurring judgment calls, workflows, techniques, and tools. They are not narratives, changelogs, or one-off notes.

Read `docs/agent-workflow.md` before writing or changing project workflow skills.

## Location

Repo-local skills live in:

```text
.claude/skills/<skill-name>/SKILL.md
```

Use lowercase hyphenated names. The folder name and frontmatter `name` should match.

## Frontmatter

```markdown
---
name: skill-name
description: Use when <specific trigger, symptom, or task context>
---
```

Description rules:

- Start with `Use when` or `Use before`.
- Describe the trigger, not the whole workflow.
- Include concrete keywords users or agents are likely to mention.
- Use `Use ONLY when` for narrow skills that should not trigger broadly.

## Body Structure

Use only the sections the skill needs:

- Overview or core rule
- When to use
- Workflow
- Quick reference
- Project-specific paths or commands
- Common mistakes

Keep frequently loaded skills short. Move heavy references or examples to separate files only when they are truly reusable.

## Good Skill Content

- Clear trigger conditions
- Exact commands and paths
- Concrete decision rules
- Explicit limits and non-goals
- Project conventions pulled from `docs/agent-workflow.md`

## Bad Skill Content

- Long theory sections
- Generic software advice already covered by system prompts
- Forced ceremony that does not match this repo
- Hardcoded tool choices when the workflow should stay tool-agnostic
- References to stale files or commands

## Review Checklist

Before finishing a skill change, check:

- Frontmatter has `name` and `description`.
- Description is trigger-focused and searchable.
- Paths and commands exist or are clearly optional.
- The skill does not contradict `AGENTS.md` or `docs/agent-workflow.md`.
- The skill can work without Backlog.md unless it is specifically a Backlog skill.
- The skill tells future agents what to do, not what happened in this session.

## Optional Validation

For important discipline skills, test with a fresh subagent or adversarial prompt:

- What would an agent do without this skill?
- What mistake should this skill prevent?
- Does the skill close that loophole without overreaching?

Do this when the skill affects coding discipline, safety, verification, or user collaboration. For small wording edits, careful self-review is enough.
