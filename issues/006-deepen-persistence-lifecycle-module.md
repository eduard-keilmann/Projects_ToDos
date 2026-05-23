# Deepen persistence lifecycle and rollback handling into one in-file module

## Type

AFK

## User stories covered

- As a user, failed saves pause editing instead of silently losing data.
- As a user, reconnecting or regranting access preserves unsaved changes when possible.
- As a user, failed imports or failed folder switches restore the previous state.
- As a maintainer, I can verify data-loss protection in one place.

## What to build

Deepen persistence lifecycle handling into one in-file Module that owns dirty state, write failure state, queued writes, transactional rollback snapshots, and recovery transitions. Keep the app as a single HTML file.

Current friction:

- `appReady`, `isDirty`, `stateNeedsWriteAfterRead`, `lastWriteFailed`, `pendingThemeBeforeConnection`, current status, directory handles, and state snapshots are manually saved/restored in multiple flows.
- `pickNewDirectory` and `importBackup` both implement long rollback snapshots by hand.
- `connectDirectoryFromPicker`, `regrantAccess`, `reloadFromDisk`, migration writes, browser-storage startup, and queued autosave each manipulate lifecycle flags directly.
- This is high-risk because the domain behavior is data-loss protection. Bugs here can silently discard or overwrite user work.

Solution direction:

- Keep file/browser persistence implementations inside the same HTML file.
- Introduce a small lifecycle Module for transition helpers such as "start write", "write succeeded", "write failed", "snapshot current app state", "restore snapshot", and "mark migrated write complete".
- Do not over-generalize; focus only on existing lifecycle transitions.
- Preserve current beforeunload dirty-state protection.

Architecture expectation:

- The Module Interface should hide which flags change together.
- Locality improves because save/recovery bugs concentrate in one Module.
- Leverage improves because import, folder switching, reconnect, reload, and autosave use the same lifecycle semantics.

## Acceptance criteria

- [x] Autosave still serializes writes and preserves current save-failure behavior.
- [x] Failed file writes still pause editing and keep unsaved in-memory state.
- [x] Failed browser-storage writes still pause editing and allow backup download.
- [x] Folder switch failure restores previous directory handle, file handle, state, dirty flags, migration flags, pending theme, and status.
- [x] Import failure restores previous state, dirty flags, migration flags, pending theme, and status.
- [x] Regrant/reconnect flows still attempt to save dirty state before reloading from disk.
- [x] `beforeunload` warning still appears when dirty state exists.
- [x] No runtime files are added; app remains one HTML file.
- [ ] Focused manual verification covers failed import, canceled folder picker, save failure path by code inspection or browser permission simulation, and successful autosave.

## Implementation notes

- Added in-file lifecycle seam `buildPersistenceLifecycle(...)` in `project_todo_tool.html`.
- Centralized rollback snapshots and restore logic for folder switching and backup import.
- Centralized grouped write-success, write-failure, and migration-cleanup flag updates.
- Moved autosave queue serialization behind the lifecycle seam so write ordering and failure handling live in one place.
- Added focused regression coverage in `tests/persistence-lifecycle.test.js`.

## Blocked by

- 005-deepen-storage-mode-module.md
