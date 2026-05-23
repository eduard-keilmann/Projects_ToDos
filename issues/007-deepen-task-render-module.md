# Deepen ToDo list rendering by separating view creation from task intents

## Type

AFK

## User stories covered

- As a user, I can view, edit, complete, prioritize, date, reorder, and delete ToDos inline.
- As a user, viewport/focus behavior remains stable after editing or moving tasks.
- As a maintainer, I can change a task row without re-reading all storage and list-state logic.

## What to build

Deepen ToDo list rendering inside `project_todo_tool.html` by separating task row creation from task intent handling. Keep all runtime code in the one HTML file.

Current friction:

- `renderTasks()` handles global enable/disable policy, empty states, project header/stat rendering, task query, visible-count text, reorder policy, DOM construction, drag/drop behavior, field mutation, autosave scheduling, delete confirmation, due-date rendering, notes visibility, and viewport repair.
- Task row event handlers repeatedly locate current project/current task and directly mutate state.
- UI construction and business intent are interleaved, which makes safe changes difficult.
- Testing or manual verification must cross a huge Interface: many DOM states, storage states, filters, and event side effects at once.

Solution direction:

- Keep one HTML file and plain JavaScript.
- Create a task row creation Module that receives task display data and a small set of task-intent callbacks.
- Keep intent handlers near task operations: update title, update notes, update priority, update done, update due date, delete, move.
- Do not introduce a framework, virtual DOM, class hierarchy, or large abstraction layer.
- Preserve existing inline editing behavior, including autosave timing and notes-field visibility.

Architecture expectation:

- The task render Module should become deeper by hiding DOM construction details behind a smaller Interface.
- Task operation handlers become the Seam for mutation and persistence.
- Locality improves because DOM layout changes are separate from task mutation and save rules.

## Acceptance criteria

- [ ] No-project, unsupported-browser, loading, save-failed, empty-project, no-filter-match, and normal task-list states still render correctly.
- [ ] Inline title editing preserves current input, blur cleanup, empty-title fallback, autosave, and search re-render behavior.
- [ ] Inline notes editing preserves current notes persistence and search re-render behavior.
- [ ] Priority, done checkbox, due date, delete, drag/drop, and up/down buttons preserve current behavior.
- [ ] Viewport/focus restoration after done toggle, task movement, and due-date change still works.
- [ ] Task row DOM creation is easier to read and does not require knowing storage-mode internals.
- [ ] No runtime files are added; app remains one HTML file.
- [ ] Focused manual verification covers creating, editing, searching, filtering, moving, completing, dating, and deleting a ToDo.

## Blocked by

- 002-deepen-task-query-module.md
- 003-deepen-reorder-module.md
- 006-deepen-persistence-lifecycle-module.md

