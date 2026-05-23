# Deepen storage mode selection and storage adapters inside the single HTML file

## Type

AFK

## User stories covered

- As a Chrome or Opera user, I can connect a folder and autosave directly to `project-todos.json`.
- As a Safari user, I can use browser storage and download/import JSON backups.
- As a maintainer, I can reason about file mode and browser-storage mode without following scattered conditionals.

## What to build

Deepen storage mode handling into a single in-file Module that selects the active storage mode and delegates persistence to file-mode and browser-storage Adapters. Keep `project_todo_tool.html` as the only runtime file.

Current friction:

- Browser support detection lives near the top, but mode decisions are repeated across UI sync, load, write, import/export, reload, and startup.
- `usesBrowserStorageMode()` is called in many places, making mode behavior implicit rather than concentrated.
- File mode and browser-storage mode have different capabilities: folder connect, reload file, remembered directory handle, autosave, backup metadata, export label, reset semantics.
- The current Interface is shallow because callers ask low-level mode questions instead of using a storage-mode capability object.

Solution direction:

- Create one storage mode Module that exposes current mode and capabilities.
- Keep two concrete Adapters: file storage and browser storage. They can remain plain objects/functions in the same script.
- Do not make unsupported browsers a fake Adapter unless it reduces conditionals without hiding important failure behavior.
- Preserve README-documented behavior exactly: Chrome/Opera file mode, Safari browser-storage mode, no target support for other browsers.

Architecture expectation:

- The storage mode Module becomes a real Seam because there are two Adapters with different behavior.
- Leverage improves because UI, save, load, export/import, and reset ask one Module about capabilities.
- Locality improves because future storage-mode changes are made in one area.

## Acceptance criteria

- [ ] Chrome/Opera file mode still supports connect folder, remembered folder, reload file, autosave to `project-todos.json`, export backup, import backup, and delete everything.
- [ ] Safari browser-storage mode still supports autosave in IndexedDB, backup download, import backup, backup freshness metadata, and delete everything.
- [ ] Unsupported browser messaging remains explicit and editing remains disabled.
- [ ] File mode does not accidentally use browser-storage live data.
- [ ] Browser-storage mode does not show folder-only controls as active.
- [ ] No runtime files are added; app remains one HTML file.
- [ ] Focused manual verification covers mode detection paths by browser where available or by controlled function-level checks where not.

## Blocked by

- 001-deepen-state-normalization-module.md
- 004-deepen-status-message-module.md

