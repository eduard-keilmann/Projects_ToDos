# Deepen task query and list-order policy into one pure in-file module

## Type

AFK

## User stories covered

- As a user, I can filter and search ToDos and see the correct visible list.
- As a user, I understand why task reordering is disabled while search or filters are active.
- As a maintainer, I can change visible-list rules without hunting through render and drag/drop handlers.

## What to build

Deepen the task query Module inside `project_todo_tool.html` so filtering, search, visible-count text, and reorder-enabled policy are decided in one place. Keep all code in the single HTML file.

Current friction:

- `getFilteredTasks` reads DOM values directly and only returns tasks.
- `renderTasks` separately decides whether task reorder is enabled.
- Task-list drop handlers duplicate the same reorder-disabled conditions by checking filter/search DOM values again.
- README documents that reordering is disabled while search or filtering is active, but the actual rule is spread across multiple implementation points.
- This is shallow because callers must remember that "visible tasks" and "can reorder" are coupled concepts.

Solution direction:

- Introduce one pure in-file Module for task-list query state.
- The Module should take the selected project plus current filter/search values and return visible tasks plus reorder policy and explanatory text.
- DOM event handlers should ask this Module instead of duplicating filter/search checks.
- Keep the Interface small and behavior-focused: "given list query inputs, what is visible and can ordering change?"

Architecture expectation:

- This creates a clearer Seam between UI controls and task-list semantics.
- Locality improves because future query behavior, such as searching due date text or notes rules, changes in one Module.
- Leverage improves because render, drop handlers, and tests/manual checks use the same policy.

## Acceptance criteria

- [x] `all`, `open`, and `done` filters preserve current behavior.
- [x] Search still matches title, priority, and notes.
- [x] Reordering stays enabled only when filter is `all` and search is empty.
- [x] Visible count and "sorting only works without search/filter" messaging remain correct.
- [x] Task-list blank-area drop uses the same reorder policy as `renderTasks`.
- [x] No runtime files are added; app remains one HTML file.
- [ ] Focused manual verification covers search, filter, visible count, reorder enabled, and reorder disabled states.

## Implementation notes

- Added pure in-file query-policy function `buildTaskQueryState(...)` in `project_todo_tool.html`.
- Added small DOM wrapper `getCurrentTaskQueryState(...)` so UI code asks the same policy instead of duplicating filter/search checks.
- `renderTasks()` now reads visible tasks, reorder enablement, and visible-count text from that shared query state.
- Task-list blank-area drag/drop now uses the same reorder policy as `renderTasks()`.
- Added focused regression coverage in `tests/task-query.test.js`.

## Blocked by

None - can start immediately
