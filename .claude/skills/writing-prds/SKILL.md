---
name: writing-prds
description: Use when a bigger or user-facing feature needs requirements fleshed out before planning — turns an approved design into a PRD the plan is written against.
---

# Writing PRDs

Turn an approved design into a Product Requirements Document: the durable spec the plan is written against. Requirements only — no execution order, file lists, or task breakdowns. Those belong in the plan.

## When to Use

- Bigger or user-facing features, gameplay changes, or work spanning multiple systems.
- Skip for small, well-understood work — a lightweight design in the plan or task is enough.

## Before Writing

1. Confirm the design is approved.
2. Read `docs/agent-workflow.md` for where PRDs are stored and how they are tagged.

## Structure

Use only the sections the feature needs:

- **Problem & context** — what is wrong or missing, and why now.
- **Goals / Non-goals** — what success means; what is explicitly out of scope.
- **User experience** — user-visible behavior, states, and flows.
- **Requirements** — numbered functional requirements, each testable.
- **Acceptance criteria** — observable conditions that prove each requirement is met.
- **Edge cases & risks** — failure modes, balance concerns, system interactions.
- **Open questions** — unresolved decisions that block planning.

Keep each section as short as the feature allows. A requirement nobody can test is not a requirement — rewrite it.

## After the PRD

Resolve open questions with the user, then hand off to `writing-plans`. The plan covers execution against this PRD; do not restate requirements there.
