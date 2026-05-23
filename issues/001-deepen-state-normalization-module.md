# Deepen state normalization into one pure in-file module

## Type

AFK

## User stories covered

- As a user, I can import or load older backups without corrupting my projects or ToDos.
- As a user, invalid or partial backup data is repaired predictably.
- As a maintainer, I can change payload version rules in one place.

## What to build

Deepen the state normalization Module inside `project_todo_tool.html` while keeping the app one single HTML file. The Module should own conversion from any accepted persisted shape into the current app state and should report whether the persisted data needs to be rewritten after normalization.

Current friction:

- Payload versioning, repair, and migration detection are split between `normalizeIncomingState`, `stateDiffersAfterNormalization`, storage read flows, and theme-merge logic.
- `stateDiffersAfterNormalization` duplicates much of the same field knowledge as `normalizeIncomingState`. This is shallow because callers still need to understand normalization internals to know whether a rewrite is needed.
- Storage reads from disk and browser storage both repeat the same post-read steps: normalize, decide migration rewrite, merge pending theme, ensure selection.
- The current Interface leaks too many invariants: accepted wrapper shape, direct state shape, version `5`, selection repair, duplicate ID handling, date repair, priority defaults, boolean defaults, theme defaults.

Solution direction:

- Keep implementation in the existing `<script>` block.
- Make one state normalization Module responsible for returning a normalized state plus metadata such as `needsWriteAfterRead` and saved timestamp if relevant.
- Keep storage Adapters focused on reading/writing bytes or records; they should not need to know field-level repair rules.
- Preserve current behavior and payload version.
- Do not add dependencies, build step, or separate JS files.

Architecture expectation:

- This Module should be deep: callers give it persisted payload input and receive a safe normalized result.
- The Interface should hide schema-repair details.
- Locality improves because future schema changes touch this Module rather than disk/browser read flows and import flow.

## Acceptance criteria

- [x] Loading wrapped payload objects, direct state objects, and older/partial backups still works.
- [x] Invalid dates, invalid booleans, invalid priorities, missing task arrays, duplicate IDs, and broken selected project references are still repaired.
- [x] The decision to rewrite migrated/repaired data is produced by the normalization Module, not duplicated by callers.
- [x] Disk load, browser-storage load, and import use the same normalization path.
- [x] Theme preservation behavior remains unchanged when a theme was toggled before storage became available.
- [x] No new files are required for runtime; app still runs from one `project_todo_tool.html`.
- [ ] Focused manual verification covers import of current payload, import of direct state, and import/load of malformed-but-repairable data.

## Implementation notes

- Added `normalizePersistedState(...)` inside `project_todo_tool.html`.
- The function now returns normalized app state, normalized `savedAt`, and `needsWriteAfterRead`.
- Browser-storage load, disk load, and import now go through that same normalization path.
- Added focused regression coverage in `tests/state-normalization.test.js`.

## Blocked by

None - can start immediately
