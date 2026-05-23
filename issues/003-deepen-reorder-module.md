# Deepen project and ToDo reorder behavior into one in-file module

## Type

AFK

## User stories covered

- As a user, I can reorder projects and ToDos consistently using drag/drop or up/down buttons.
- As a user, drag/drop edge cases do not lose items or create duplicate ordering.
- As a maintainer, I can fix ordering semantics once for projects and ToDos.

## What to build

Deepen reorder behavior into one in-file Module that handles moving an item before/after another item, moving by step, and moving to the end. Project and ToDo code should use this Module through small Adapters while the app remains a single HTML file.

Current friction:

- Project and ToDo reorder functions are nearly duplicated.
- Drag/drop indicator logic is duplicated between projects and tasks.
- Button move and drag/drop move paths use separate functions even though they share ordering semantics.
- Current deletion test result: if the existing reorder helpers were deleted, the complexity would reappear across project and task render handlers. That means the idea earns a Module, but current implementation is still too shallow and duplicated.

Solution direction:

- Keep one generic reorder Module in the script.
- Project and task callers provide arrays and item IDs; the Module returns whether order changed.
- Keep project-specific and task-specific DOM details outside the core reorder Module.
- If drag indicator clearing is also unified, keep it small and concrete; do not over-abstract DOM creation.

Architecture expectation:

- The reorder Module Interface should hide index/splice edge cases.
- The project list and ToDo list become Adapters at the reorder Seam.
- Locality improves because ordering bugs concentrate in one Module.

## Acceptance criteria

- [ ] Project drag/drop reorder preserves current behavior.
- [ ] Project up/down buttons preserve current behavior.
- [ ] ToDo drag/drop reorder preserves current behavior.
- [ ] ToDo up/down buttons preserve current behavior.
- [ ] Moving to list end via blank-area drop still works for projects and ToDos.
- [ ] Reorder remains disabled for ToDos while search/filter is active.
- [ ] No runtime files are added; app remains one HTML file.
- [ ] Focused manual verification covers first item, last item, same-target drop, invalid target, and blank-area drop.

## Blocked by

- 002-deepen-task-query-module.md

