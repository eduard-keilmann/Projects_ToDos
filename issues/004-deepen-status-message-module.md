# Deepen storage status messages into one in-file module

## Type

AFK

## User stories covered

- As a user, I can see accurate storage status for file mode, browser-storage mode, save failure, loading, and backup freshness.
- As a user, status text does not contradict the storage mode I am using.
- As a maintainer, I can change status wording or status rules in one place.

## What to build

Deepen status-message construction into one in-file Module. The Module should own user-facing status meaning for supported browser modes, save states, migration writes, backup freshness, and failure states. Rendering can stay separate and simple.

Current friction:

- `setStatus`, `renderStatus`, `setInitialStorageStatus`, `setBrowserStorageReadyStatus`, `setSavingStatus`, `syncStorageModeUi`, storage error handlers, export metadata handling, and compatibility handling all construct related user-facing status text.
- File mode and browser-storage mode messages are repeated and easy to drift.
- Some status text encodes behavior rules, such as "editing is paused", "backup out of date", and "folder remembered, access missing".
- The current Interface is shallow because callers pass raw text and must know exact wording and mode-specific implications.

Solution direction:

- Keep DOM rendering in the current file.
- Introduce a status message Module that maps named app situations to `{kind, title, textParts, meta}`.
- Preserve existing wording unless a wording change is needed to remove duplication or contradiction.
- Keep rich text support for `{ strong: DATA_FILE_NAME }`.
- Do not introduce a generic notification framework.

Architecture expectation:

- The status Module gives Leverage by letting many flows use one status vocabulary.
- Locality improves because mode-specific copy and status semantics live in one Module.
- The rendering Module remains small: it only displays the status object.

## Acceptance criteria

- [x] Initial unsupported-browser status remains correct.
- [x] Initial Safari browser-storage status remains correct.
- [x] Initial Chrome/Opera file-mode status remains correct.
- [x] Saving, saved, migration-write, save-failed, access-missing, reload-failed, import-failed, and backup-downloaded statuses still display correct text.
- [x] Browser-storage backup metadata still shows last saved, last backup, and backup-out-of-date status.
- [x] No runtime files are added; app remains one HTML file.
- [ ] Focused manual verification covers unsupported browser messaging by code inspection or browser simulation, plus normal file/browser statuses where practical.

## Implementation notes

- Added in-file status-policy functions `buildStorageStatus(...)` and `buildBrowserStorageMetaText(...)` inside `project_todo_tool.html`.
- Added small bridge `setStatusObject(...)` so rendering stays simple while storage flows use named status situations.
- Moved initial mode, browser-ready, saving, migration-write, save-failed, access-missing, reload-failed, import-failed, browser-loading, browser-unavailable, and backup-downloaded storage messages onto that shared status vocabulary.
- Added focused regression coverage in `tests/status-message.test.js`.

## Blocked by

None - can start immediately
