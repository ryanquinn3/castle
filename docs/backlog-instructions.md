# Backlog.md CLI — Agent Instructions

## Critical Rule

**NEVER edit task files directly. ALL operations go through the CLI.**

- ✅ `backlog task edit 42 --check-ac 1` — mark AC complete
- ❌ Editing `backlog/tasks/task-42 - *.md` directly — breaks metadata, Git tracking, relationships

---

## File Structure

- Tasks: `docs/tasks/task-<id> - <title>.md`
- Drafts: `docs/drafts/`
- Docs: `docs/docs/`
- Decisions: `docs/decisions/`

Always use `--plain` flag when listing or viewing — provides AI-readable text output.

---

## Task Modification Reference

| What to Change      | CLI Command                                                        |
|---------------------|--------------------------------------------------------------------|
| Title               | `backlog task edit 42 -t "New Title"`                              |
| Status              | `backlog task edit 42 -s "In Progress"`                            |
| Assignee            | `backlog task edit 42 -a @sara`                                    |
| Labels              | `backlog task edit 42 -l backend,api`                              |
| Priority            | `backlog task edit 42 --priority high`                             |
| Description         | `backlog task edit 42 -d "New description"`                        |
| Add AC              | `backlog task edit 42 --ac "Criterion"`                            |
| Check AC #1         | `backlog task edit 42 --check-ac 1`                                |
| Check multiple ACs  | `backlog task edit 42 --check-ac 1 --check-ac 2 --check-ac 3`     |
| Uncheck AC #2       | `backlog task edit 42 --uncheck-ac 2`                              |
| Remove AC #3        | `backlog task edit 42 --remove-ac 3`                               |
| Add DoD             | `backlog task edit 42 --dod "Run tests"`                           |
| Check DoD #1        | `backlog task edit 42 --check-dod 1`                               |
| Add Plan            | `backlog task edit 42 --plan "1. Step\n2. Step"`                   |
| Add Notes (replace) | `backlog task edit 42 --notes "Progress"`                          |
| Append Notes        | `backlog task edit 42 --append-notes "More progress"`              |
| Add Comment         | `backlog task edit 42 --comment "Note" --comment-author @agent`    |
| Add Final Summary   | `backlog task edit 42 --final-summary "PR-style summary"`          |
| Append Final Summary| `backlog task edit 42 --append-final-summary "More detail"`        |
| Add dependencies    | `backlog task edit 42 --dep task-1 --dep task-2`                   |
| Add references      | `backlog task edit 42 --ref src/api.ts`                            |

---

## Implementation Workflow

```bash
# 1. Discover work
backlog task list -s "To Do" --plain

# 2. Read task details
backlog task 42 --plain

# 3. Start: assign + status (do both together)
backlog task edit 42 -s "In Progress" -a @myself

# 4. Add implementation plan, then share with user and wait for approval before coding
backlog task edit 42 --plan "1. Analyze\n2. Implement\n3. Test"

# 5. Mark ACs complete as you go (multiple at once supported)
backlog task edit 42 --check-ac 1 --check-ac 2 --check-ac 3

# 6. Append progress notes during implementation
backlog task edit 42 --append-notes "- Completed X\n- Blocked on Y"

# 7. Write Final Summary (PR description) when done
backlog task edit 42 --final-summary "Implemented X because Y; updated Z; tests pass"

# 8. Mark done
backlog task edit 42 -s Done
```

**Phase discipline:**
- **Creation**: Title, Description, ACs, labels/priority/assignee — no plan yet
- **Implementation**: Plan (after In Progress) + appended Notes during work
- **Wrap-up**: Final Summary + verify all ACs/DoD checked + status Done

---

## Creating Tasks

```bash
backlog task create "Title" -d "Description" --ac "Criterion 1" --ac "Criterion 2"

# With all options
backlog task create "Title" -d "Desc" -a @sara -s "To Do" -l auth --priority high \
  --ref src/api.ts --doc docs/spec.md

# Create draft
backlog task create "Title" --draft

# Create subtask (child of task 42)
backlog task create "Title" -p 42
```

---

## Searching

```bash
backlog search "auth" --plain                          # fuzzy search across tasks/docs/decisions
backlog search "login" --type task --plain             # tasks only
backlog search "api" --status "In Progress" --plain    # with status filter
backlog search --modified-file src/server/api.ts --plain  # by modified file
```

---

## Multi-line Input

Prefer repeating `--append-*` flags — works in all shells including agent sandboxes:

```bash
backlog task edit 42 --append-notes "- Added endpoint"
backlog task edit 42 --append-notes "- Updated tests"
backlog task edit 42 --append-notes "- TODO: monitor deploy"
```

Or pass real newlines inside double quotes:

```bash
backlog task edit 42 --notes "- Added endpoint
- Updated tests
- TODO: monitor deploy"
```

Do **not** use `\n` inside double quotes — the CLI stores it literally, not as a newline.

---

## Definition of Done

A task is **Done** only when ALL of:
1. All ACs checked (`--check-ac`)
2. All DoD items checked (`--check-dod`)
3. Final Summary added (`--final-summary`)
4. Status set to Done (`-s Done`)
5. Tests and linting pass

---

## Task Operations

| Action              | Command                                              |
|---------------------|------------------------------------------------------|
| View task           | `backlog task 42 --plain`                            |
| List tasks          | `backlog task list --plain`                          |
| Filter by status    | `backlog task list -s "In Progress" --plain`         |
| Filter by assignee  | `backlog task list -a @sara --plain`                 |
| Archive             | `backlog task archive 42`                            |
| Demote to draft     | `backlog task demote 42`                             |

---

## Document Management

```bash
backlog doc create "Title" -p guides/setup -t guide   # saved under docs/docs/
backlog doc update doc-1 --content "Updated markdown"  # replace body
backlog doc update doc-1 --tags prd                    # set tags (comma-separated or repeat flag)
backlog doc list --plain                               # IDs, titles, types, paths, tags
backlog doc view doc-1
backlog doc search "wave overlay" --plain              # fuzzy search docs
```

| Option / Flag         | Command                                              |
|-----------------------|------------------------------------------------------|
| Subdirectory path     | `backlog doc create "Title" -p guides/api`           |
| Type                  | `-t readme\|guide\|specification\|other`             |
| Replace body          | `backlog doc update doc-1 --content "..."`           |
| Set tags              | `backlog doc update doc-1 --tags prd,gameplay`       |
| Rename                | `backlog doc update doc-1 --title "New Title"`       |
| Move path             | `backlog doc update doc-1 -p guides`                 |

- `doc create` has no `--tags` flag; create first, then `doc update <docId> --tags ...`.
- Paths are relative to `docs/docs/`; absolute paths and `..` traversal are rejected.
- **PRDs**: create with `-t specification`, then tag with `--tags prd`. See `docs/agent-workflow.md` for the PRD workflow.

---

## Common Issues

| Problem              | Solution                                                            |
|----------------------|---------------------------------------------------------------------|
| Task not found       | `backlog task list --plain` to check ID                             |
| AC won't check       | `backlog task 42 --plain` to see AC index numbers                   |
| Changes not saving   | You're editing files directly — use CLI                             |
| Metadata out of sync | `backlog task edit 42 -s <current-status>` to re-sync              |

Full help: `backlog --help`
