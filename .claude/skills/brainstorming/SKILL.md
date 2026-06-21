---
name: brainstorming
description: You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation.
---

# Brainstorming
Help turn ideas into fully formed designs and specs through natural collaborative dialogue.

Start by understanding the current project context, then interview the user relentlessly — one question at a time — walking down each branch of the design tree until you reach a shared understanding. Once you understand what you're building, present the design and get user approval.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Anti-Pattern: "This Is Too Simple To Need A Design"

Every project goes through this process. A todo list, a single-function utility, a config change — all of them. "Simple" projects are where unexamined assumptions cause the most wasted work. The design can be short (a few sentences for truly simple projects), but you MUST present it and get approval.

## Workflow

1. Explore enough project context to avoid guessing.
2. Walk down each branch of the design tree, resolving dependencies between decisions one at a time. For each question, provide your recommended answer.
3. Offer a few approaches when there is a real design choice. Try to reach breadth on the overall solution space. When lacking information that might validate or invalidate an approach, explore the codebase to find the answer before asking the user. Avoid making assumptions.
4. Recommend one approach and explain the tradeoffs briefly.
5. Present the design at the right level of detail.
6. Wait for user approval.
7. Hand off: for bigger or user-facing features, ask whether to invoke `/writing-prds` next; for small, well-understood work, `/writing-plans`.

## Design Shape

For small work, a design can be 3-5 bullets.

For larger work, cover:

- Goal and non-goals
- User-visible behavior
- Files or systems likely affected
- Data flow or state changes
- Docs or task artifacts to update

## The Process

**Understanding the idea:**

- Check out the current project state first (files, docs, recent commits). If a question can be answered by exploring the codebase, explore the codebase instead of asking the user.
- Before asking detailed questions, assess scope: if the request describes multiple independent subsystems (e.g., "build a platform with chat, file storage, billing, and analytics"), flag this immediately. Don't spend questions refining details of a project that needs to be decomposed first.
- If the project is too large for a single spec, help the user decompose into sub-projects: what are the independent pieces, how do they relate, what order should they be built? Then brainstorm the first sub-project through the normal design flow. Each sub-project gets its own spec → plan → implementation cycle.
- For appropriately-scoped projects, interview the user relentlessly — one question at a time — until every design branch is resolved. Treat the design as a tree: work down each branch, and don't move to the next branch until the current one is settled.
- For each question, provide your recommended answer along with brief reasoning. This gives the user something concrete to react to rather than a blank prompt.
- Prefer multiple choice questions when possible, but open-ended is fine too.
- Only one question per message — asking multiple questions at once is bewildering. If a topic needs more exploration, break it into multiple sequential questions.
- Focus on understanding: purpose, constraints, success criteria, and dependencies between decisions.

**Exploring approaches:**

- Propose 2-3 different approaches with trade-offs
- Present options conversationally with your recommendation and reasoning
- Lead with your recommended option and explain why

**Presenting the design:**

- Once you believe you understand what you're building, present the design
- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Cover: requirements, behavior, architecture, components, data flow, error handling
- Be ready to go back and clarify if something doesn't make sense

**Design for isolation and clarity:**

- Break the system into smaller units that each have one clear purpose, communicate through well-defined interfaces, and can be understood and tested independently
- For each unit, you should be able to answer: what does it do, how do you use it, and what does it depend on?
- Can someone understand what a unit does without reading its internals? Can you change the internals without breaking consumers? If not, the boundaries need work.
- Smaller, well-bounded units are also easier for you to work with - you reason better about code you can hold in context at once, and your edits are more reliable when files are focused. When a file grows large, that's often a signal that it's doing too much.

**Working in existing codebases:**

- Explore the current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work (e.g., a file that's grown too large, unclear boundaries, tangled responsibilities), include targeted improvements as part of the design - the way a good developer improves code they're working in.
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

## Avoid

- Writing code before approval on ambiguous work
- Creating a plan document for every tiny change
- Forcing commits, new branches, task codification, or worktrees unless the user asked
- Asking multiple unrelated questions at once
- Asking a question the codebase can answer

## Key Principles

- **One question at a time** - Asking multiple questions at once is bewildering
- **Always provide a recommendation** - Every question should come with your best answer and reasoning; give the user something concrete to react to
- **Explore before asking** - If the codebase can answer a question, explore it instead of asking the user. Use subagents to for exploration.
- **Walk the design tree** - Treat open decisions as a tree; resolve each branch fully before moving to the next
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Present design, get approval before moving on
- **Be flexible** - Go back and clarify when something doesn't make sense

## After the Design

**Critical transition:** Brainstorming ends with an approved design, not implementation. Hand off to the next step:

- Bigger or user-facing features → `writing-prds` to flesh out requirements before planning.
- Small, well-understood work → `writing-plans` directly.

The PRD (or, for small work, the lightweight design) is the durable spec. Consult `docs/agent-workflow.md` for where specs and PRDs are stored.
