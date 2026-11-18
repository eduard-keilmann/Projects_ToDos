# Deepen the ToDo editing lifecycle with retained task rows

## Problem

Follow-up to `007-deepen-task-render-module.md`. Separating row construction from task intents improved navigation, but callers still coordinate editing, filtering, rendering, focus restoration, textarea sizing, and asynchronous saving.

- Small edits can rebuild the whole list and replace native controls. Focus, selections, and open dropdowns then require repair.
- Interaction rules have been spread across row listeners, list rendering, pending filter flags, and persistence callbacks. Correctness depends on event ordering across those locations.
- Task handlers repeat project/task lookup and combine mutation, normalization, saving, and rendering decisions.
- Existing tests frequently extract individual functions from HTML source. They can pass while the actual event sequence still loses focus or removes the clicked control.

The agreed direction is retained task rows with a small public interface, not a general-purpose renderer or event framework.

## Proposed Interface

Illustrative JavaScript contract, implemented entirely inside the existing HTML script:

```js
const editor = createTaskListEditor({
  root: els.taskList,
  onEdit: applyTaskEdit,
  onAction: applyTaskAction
});

editor.update({
  project,
  query: { search, filter },
  access: { editable, reviewOnly }
});

// When the editor itself is permanently removed, or a test ends:
editor.dispose();
```

- `update(view)` synchronizes the list with the current canonical project and access/query state while preserving ongoing interactions wherever possible. A null project is valid and clears the list.
- `onEdit({ projectId, taskId, field, value })` applies an allowed field edit synchronously through one shared task-edit path. It owns field validation/normalization, task resolution, status/done consistency, and scheduling the existing autosave mechanism.
- `onAction({ projectId, taskId, type, ...details })` requests an explicit action such as deletion or reordering. Confirmation and persistence remain in the existing application flow. Exact action shapes must be limited to existing actions during implementation.
- `dispose()` removes listeners, cancels editor-owned scheduled work, and releases row references. It does not cancel or discard persistence work.

Typical usage:

```js
function applyTaskEdit(edit) {
  // Resolve the current task and normalize/apply the permitted edit once.
  // Reuse the existing autosave mechanism; do not create a second queue.
  applyAllowedTaskEdit(edit);
  scheduleAutosave();
  editor.update(currentTaskListView());
}

// A project, query, or access change:
editor.update(currentTaskListView());

// A successful background save:
renderStatus();
```

The helper names in this example describe responsibilities, not mandatory new wrappers. Introduce only helpers that consolidate actual rules or responsibilities.

### Ownership and invariants

- The existing application state is the sole authoritative task store. The editor does not clone projects or maintain an independently mutable task store.
- Row identity includes project and task identity. Task IDs are only guaranteed unique within a project; a project switch must not reuse a different project's row accidentally.
- Retain existing row DOM nodes. Update only changed properties; avoid assigning an identical textarea value because that can disturb the caret and selection.
- Editor-owned state is limited to row references, transient interaction state, pending visibility/order work, and derived display caches.
- Existing Markdown parsing/highlighting is reused. This RFC does not introduce a second parser or undertake the separate Markdown refactor.
- There is one rule for deferred structural updates: preserve an active interaction when applying a visibility or order change would remove or move its controls. Apply pending work once after the interaction safely ends. Explicit project/query changes and destructive actions must have documented completion rules.
- Query membership and task counts remain derived from canonical state. If an active task is temporarily retained despite no longer matching the query, visible-count reporting must describe the actual rendered list consistently.
- Purely visual changes, autosave completion, and unrelated row edits must not replace the active control or restore an obsolete focus target.
- Necessary focus/viewport restoration must not override a subsequent user interaction. Delayed editor work must be invalidated on project/data replacement and disposal.
- Deletion, import/reset, project changes, and loss of editing access are explicit structural transitions. Define the surviving focus target, cancel stale editor work, and clean up removed rows. A save failure must still pause editing immediately according to the existing persistence policy.
- Status is authoritative; `done` remains its compatibility projection. Only status `done` produces `done: true`.

## Dependency Strategy

- **In-process:** task-edit rules, query policy, status compatibility, and decisions about pending structural changes. Reuse the existing normalization/query rules rather than copying them into the editor.
- **Local-substitutable:** DOM, focus, selection, layout, and browser scheduling. Use real Chrome/Chromium and Safari for interaction verification; simplified DOM doubles cannot establish native focus or dropdown correctness.
- Existing file and browser-storage persistence stays outside the editor. Reuse the existing lifecycle and write queue. No second debounce/queue policy is introduced.
- All runtime implementation remains in `project_todo_tool.html`. No additional JavaScript/CSS files, framework, package dependency, or build step is required. The existing JSON file remains the persisted artifact.
- JSON version 6 and legacy `done` migration remain unchanged by this refactor. Safari browser-storage behavior and Chrome/Chromium file mode remain supported.

## Testing Strategy

### New boundary tests to write

Exercise the actual editor used by the application, rather than reconstructed private handler fragments:

- Edit title/notes, open status or priority, complete a delayed save, and move focus to another field. Verify active element and DOM identity remain stable.
- Select/copy Markdown preview text; click without selection to edit; return to preview. Preserve source, selection rules, and viewport for long entries.
- Change a searched field so the task no longer matches, then move through text, date, dropdown, and action controls. Verify one deferred structural update at the documented safe point.
- Repeat interaction cycles and unrelated updates; verify that stale listeners or scheduled work do not cause multiple updates or focus changes.
- Change status in both directions. Verify canonical status, compatibility `done`, counts, filter results, and save requests agree.
- Add, delete, reorder, switch projects with overlapping task IDs, import/reset, and transition to a save-failure state. Verify row cleanup and obsolete-work cancellation.
- Verify keyboard navigation and native dropdown behavior in Chrome/Chromium and Safari, including a narrow viewport.

### Old tests to replace or retain

- Replace the source-sliced lifecycle checks in `tests/persist-render.test.js` once equivalent editor-boundary coverage exists.
- Replace redundant callback-wiring and row-construction checks in `tests/task-render.test.js` only where the new tests protect the same behavior. Retain distinct Markdown and regression assertions until their coverage has a suitable home.
- Retain pure query, normalization/migration, reorder, and persistence-failure tests where they cover independent contracts.
- Consolidate repeated test-source loading behind one deliberate test loading mechanism as part of this migration. Do not add more copies of `extractFunctionSource`, and do not make tests depend on a following function's name or indentation.

### Test environment needs

- A test fixture that mounts the real in-file editor with controlled save completion/failure and browser scheduling where necessary.
- A configured Chrome/Chromium browser and a Safari verification environment. Report unavailable coverage explicitly; Chromium results are not Safari evidence.
- Tests may have development-only files, but the shipped application must still run from its single HTML file. Do not make test tooling a runtime requirement.

## Implementation Recommendations

1. Establish integration regression cases for the current interaction contract before moving ownership.
2. Consolidate the existing task-edit rules and task resolution without changing the persistence or JSON contract.
3. Introduce retained row ownership and property updates. Use a bounded map of current row handles, not a general DOM reconciliation framework.
4. Move interaction tracking and pending visibility/order decisions into that owner. Register each listener once at its intended lifetime and clean it up there.
5. Route existing app refresh requests through the editor update boundary. Keep storage completion limited to the status display unless access or canonical data actually changes.
6. Remove superseded pending flags, repeated lookup/mutation paths, and focus-repair calls only after their replacements cover the same behavior.
7. Replace redundant implementation-coupled tests after boundary tests pass. Review both code and tests for unnecessary wrappers and duplicate policies.

Keep this work scoped to the editing lifecycle. Do not combine it with a new Markdown grammar, storage backend, schema migration, framework, or unrelated architectural cleanup.

## Implementation status

- [x] Added the in-file editor with retained rows and project-scoped identity.
- [x] Centralized task edits and explicit structural actions; reused the existing autosave queue.
- [x] Moved deferred filtering and listener lifetime into the editor; visible counts describe retained rows.
- [x] Added stale-row guards, project-aware delayed focus restoration, and disposal.
- [x] Reused the existing Markdown implementation; no schema or runtime dependency changes.
- [x] Replaced the obsolete source-sliced filter test with editor-boundary coverage.
- [x] Consolidated repeated source-extraction and browser-runner test helpers.
- [x] Added a real-application browser scenario for selection, status changes, saving, filtering, reordering, deletion, replacement, access changes, and reset.
- [ ] Complete manual native-dropdown/keyboard and narrow-viewport verification in Chrome/Chromium and Safari;

The concrete editor also accepts an optional onViewChange callback to publish rendered visibility counts after deferred updates. It owns no persistence or second task store. Browser fixtures use controlled save completion and access state; they do not replace the persistence-failure tests.

Verification: 35 local tests passed; both optional Chrome browser tests passed in a separate sequential run. Both in-file JavaScript blocks passed syntax compilation. No TypeScript/typechecker configuration exists. Earlier browser attempts encountered shutdown timeouts/profile locks; the final shared-runner checks completed successfully. Safari and manual native-dropdown/keyboard/narrow-viewport verification remain open above.
