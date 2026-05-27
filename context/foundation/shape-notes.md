---
project: Todoer
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: "2026-06-30"
  after_hours_only: true
created: 2026-05-18
updated: 2026-05-18  # finalized
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "decision paralysis — too many tasks, unclear what to do next for the day"
    - topic: "primary persona"
      decision: "single individual; personal productivity tool, single account"
    - topic: "insight"
      decision: "existing apps show priority but ignore time — they cannot answer 'what fits in my day'"
    - topic: "auth model"
      decision: "email + password or passwordless login; flat user model — no role separation"
    - topic: "MVP scope"
      decision: "auth + task CRUD (date/priority/time/tags) + tag filtering + prioritized daily view + complete/dismiss tracking; calendar view deferred to v2"
    - topic: "timeline"
      decision: "3 weeks after-hours; no hard deadline"
  frs_drafted: 12
  quality_check_status: accepted
---

## User Stories

### US-01: User reviews and acts on their daily task list

- **Given** a logged-in user who has created at least one task for today
- **When** they open the daily view
- **Then** they see tasks for today (and any overdue carried-over tasks) ordered by priority × time fit within their declared available hours, with overdue tasks visually distinct

#### Acceptance Criteria
- Tasks are ordered: priority first (1 = highest), then by time estimate within equal priority (shorter tasks rank higher)
- Only tasks whose cumulative time fits within the user's declared available hours are shown as the primary list
- Tasks from past dates that were neither completed nor dismissed appear at the top, visually marked as overdue
- Each task displays its name, priority, time estimate, and status
- The available-hours field is visible and editable on the daily view
- No spinner or perceptible load delay on open
- Completing or dismissing a task removes it from the active list immediately

---

## Vision & Problem Statement

A person managing their own daily task agenda runs into a familiar wall: the task list is long, priorities are set, but when the day starts (or mid-day), they cannot tell what to actually do next. The result is that planned tasks get dismissed rather than completed — not because the work is wrong, but because the decision of "what do I do right now given how much time I have left?" is never answered by the tool.

Existing apps (Todoist, Things, Notion, etc.) expose a priority field but ignore time. They have no answer to "I have 90 minutes before my next meeting — what from my list fits and matters most?" The user ends up doing that mental math unaided, or skipping it entirely and dismissing tasks. The insight: surfacing the priority × time fit for a given day is what turns a backlog browser into a daily action engine.

## User & Persona

**Primary persona**: An individual managing their own personal task list — someone who works through a mix of professional and personal tasks, uses some form of todo app today, but finds that tasks planned for the day routinely get dismissed rather than completed. They are comfortable with digital tools; their problem is not with capturing tasks but with knowing which task to work on at any given moment.

## Success Criteria

### Primary
- 60% of tasks planned for a given day are marked complete (rather than dismissed) when measured across a user's first two weeks of active use.

### Secondary
- A user can open the daily prioritized view and immediately know which task to start — no manual sorting or re-reading required.

### Guardrails
- Task data must never be silently lost: a task created in one session must be retrievable in all subsequent sessions.
- The daily view must be immediately usable on open — no spinner, no perceptible load delay for a typical task backlog.

---

## Access Control

Single user, email/passwordless login. Flat user model — no roles, no sharing, no team workspaces. A logged-in user has full access to all their own tasks and settings. An unauthenticated user is redirected to the login screen; no public/guest access is provided.

---

## Functional Requirements

### Authentication
- FR-001: User can register with an email address and password. Priority: must-have
  > Socrates: Counter-argument considered: "auth is friction that kills day-1 habit formation." Resolution: kept; auth is load-bearing for cross-session persistence — without accounts, tasks don't survive between sessions.

- FR-002: User can log in to their account (email + password). Priority: must-have
  > Socrates: Login mechanism confirmed as email + password (not passwordless). No revision.

- FR-003: User can log out of their account. Priority: must-have
  > Socrates: No counter-argument. Grouped with FR-002.

### Task Management
- FR-004: User can create a task with a name, target date, priority level (1–3), and estimated time to complete. Priority: must-have
  > Socrates: Counter-argument considered: "requiring all four fields at creation is friction." Resolution: kept; all four fields are needed to drive the daily prioritized view — without date + priority + time, the ordering logic has nothing to work with.

- FR-005: User can edit any field of an existing task. Priority: must-have
  > Socrates: No constraints — user can edit any task at any time, including completed ones.

- FR-006: User can delete a task. Priority: must-have
  > Socrates: Grouped with FR-005. No constraints.

- FR-007: User can mark a task as complete. Priority: must-have
  > Socrates: No counter-argument. Completion is the primary behavioral signal; the 60% success metric depends on it.

- FR-008: User can dismiss a task (explicitly mark it as not done for this session). Priority: must-have
  > Socrates: Kept as distinct from delete — dismiss is the behavioral signal that distinguishes "chose not to do it" from "removed it." The entire 60% success criterion depends on this distinction.

- FR-009: User can assign up to 5 tags to a task. Priority: must-have
  > Socrates: Counter-argument considered: "tags add setup cost before value." Resolution: kept; without categories, a user with 20+ tasks has no way to focus by context (work, personal, errands).

- FR-010: User can filter the task list by tag. Priority: nice-to-have
  > Socrates: No counter-argument to keeping as nice-to-have; ships if time allows, does not block MVP core.

### Daily View
- FR-011: User can view all tasks for a given date, ordered by a combination of priority and time estimate. Priority: must-have
  > Socrates: Revised from "ordered by priority only." Counter-argument accepted: a 5-minute high-priority task and a 3-hour high-priority task look identical under pure priority ordering. The ordering should surface tasks that are both high-priority AND time-feasible given the remaining day. Domain rule refined — see ## Business Logic.

- FR-012: User can navigate to adjacent dates (next day / previous day) to see tasks. Priority: must-have
  > Socrates: Scoped down from "navigate to any date via date picker." Counter-argument accepted: relative prev/next navigation captures 90% of the value with significantly less implementation effort. A full date picker deferred to v2.

---

## Business Logic

Given the user's declared available hours for today, the app ranks tasks by priority and surfaces those whose cumulative time estimates fit within that window — carrying over incomplete tasks from past days as visually distinct overdue items.

**Inputs the rule consumes** (as the user experiences them):
- Each task carries a priority level (1 = highest, 3 = lowest) and a time estimate (how long it takes to complete).
- The daily view has a persistent "available hours today" field the user can adjust at any time.
- Tasks that were neither completed nor dismissed on their target date automatically appear on subsequent days until resolved.

**What the rule produces**:
The daily view shows a ranked list of tasks — by priority first, then by time estimate within equal priority (shorter tasks rank higher) — filtered so that the shown tasks fit within the user's declared available hours. Overdue/carried-over tasks are visually marked as distinct from same-day tasks.

**How the user encounters it**:
The user opens the daily view, sees their available-hours field, and immediately gets a prioritized, time-feasible list of tasks to work through. They do not need to manually judge "does this fit in my day?" — the app surfaces the answer.

---

## Non-Functional Requirements

- The daily view is immediately usable on open — any operation that renders the task list completes before the user perceives a delay (target: < 200ms for a typical backlog of ≤ 200 tasks).
- No authenticated user can read, write, or modify another user's tasks, tags, or settings — isolation is absolute at all layers the product exposes.

---

## Non-Goals

- **No calendar view**: date navigation is prev/next only; no month/week grid. The calendar view would require significant additional UI work before the core daily-view habit is proven.
- **No AI/automated task prioritization**: the user sets priority manually (1–3). AI-based suggestions are v2+ after the ordering rule is validated with real usage.
- **No 3rd-party auth (Google, Facebook, etc.)**: email + password only for v1. Social login deferred until after core habit formation.
- **No 3rd-party calendar integration (Google Calendar, Outlook, etc.)**: import/sync from external calendars is explicitly out of scope; would require OAuth complexity before the core product is proven.
- **No Pomodoro / time-boxing support**: timer-based focus modes are out of MVP scope; the product shapes *what* to work on, not *how* to work.
- **No importing tasks from other TODO apps**: migration tooling adds scope and delay before any users exist.
- **No native mobile app**: responsive web only; native iOS/Android explicitly deferred.
- **No team workspaces or task sharing**: single-user only; collaboration is incompatible with the personal-agenda framing of the MVP.

