# Deepen the persisted-state contract with a compact codec

## Problem

Follow-up to `001-deepen-state-normalization-module.md`. The existing normalization boundary accepts persisted input and returns state plus rewrite metadata, but its implementation still describes most fields twice: once to normalize them and again in `stateDiffersAfterNormalization()`.

This duplicates schema knowledge. Field additions, status compatibility, and version changes require synchronized edits across normalization, comparison, payload creation, and migration messages.

The second pass also hides some actual repairs. It normalizes incoming values again before comparing them with normalized output, so corrected titles or invalid date fields can fail to mark a version-6 payload for rewriting.

The selected design is a compact codec with repair tracking during normalization. It uses explicit field and cross-field rules, not a generic schema language or migration framework.

## Proposed Interface

Illustrative interface, implemented inside the existing HTML script:

```js
const codec = createTodoCodec({
  now: () => new Date().toISOString(),
  createId: prefix => uid(prefix)
});

const loaded = codec.decode(input, { pendingTheme });
// { state, needsWriteAfterRead, savedAt }

const payload = codec.encode(state);
// { app, version, savedAt, data }

codec.format.version; // 6
```

### Usage

```js
// Existing file/browser/import adapter obtains the parsed JSON value.
const loaded = codec.decode(parsedValue, {
  pendingTheme: pendingThemeBeforeConnection
});
state = loaded.state;
stateNeedsWriteAfterRead = loaded.needsWriteAfterRead;

// Existing persistence lifecycle decides when it is safe to write.
await writePayload(codec.encode(state));
```

`writePayload` illustrates the existing storage adapter responsibility, not a required new forwarding helper. The codec never reads or writes files, IndexedDB, localStorage, or DOM elements.

### Decode contract

- Accept the currently supported wrapped payloads, direct state objects, and older compatible data shapes. Reject an invalid root structure with a clear error before activating it.
- Produce a new normalized state without mutating the supplied input.
- Read and normalize each known field once. Determine repair information at that point instead of re-running field normalization in a separate comparison pass.
- Local field processing may use a small internal result such as `{ value, repaired }`. This is an implementation pattern, not a mandatory allocation for every scalar and not a public descriptor protocol.
- Aggregate repair information through tasks, projects, and the outer payload. Missing/invalid known fields and changed canonical values must not be hidden by applying the same fallback again during comparison.
- Preserve distinctions between valid falsy values and missing or malformed values. In particular, legacy completion means strictly `done === true`, not generic truthiness.
- Keep coupled rules as explicit code: ID uniqueness, `status` and its derived `done`, selected-project repair, and the final application of a pending theme.
- Use one timestamp for fallback dates within a decode operation. Generate replacement IDs only where required, with project/task uniqueness scopes matching the existing contract.
- Return a normalized `savedAt` as metadata, preserving its established meaning. Do not confuse a payload's previous save time with fallback task/project creation timestamps.
- Direct state input and supported older payloads require rewriting into the current envelope. A valid canonical version-6 payload does not.
- Apply a supported pending theme after data normalization and mark write-needed only when it changes the resulting persisted state.

### Encode contract

- Create the existing version-6 payload using the shared format definition and a controlled save timestamp.
- Return an independent JSON-compatible snapshot; subsequent edits to live state must not change a payload already handed to persistence.
- Do not mutate live state, regenerate IDs, or silently repair fields while saving. Canonical state invariants are established by loading and by the application's edit rules.
- Preserve currently allowed in-progress editing values. Do not introduce stricter export validation that would reject autosaved draft text without a separate agreed behavior change.
- Emit the compatibility `done` value consistently with `status`. Resolve any encountered invariant violation explicitly during implementation; do not introduce a second independent status-normalization policy into encoding.

### Shared format definition

The codec owns one definition of the current application marker and version. Output, version-based rewrite decisions, and migration messages use it. Known version numbers in explicit legacy fixtures remain intentional historical data.

## Dependency Strategy

- **In-process:** all decoding, normalization, repair aggregation, envelope construction, and compatibility rules.
- Clock and replacement-ID generation are controlled construction dependencies, enabling deterministic tests. They are not storage or browser adapters.
- File access, browser storage, permissions, save queues, rollback, and UI state remain with the existing persistence/application modules.
- All runtime definitions remain in `project_todo_tool.html`. No new runtime files, packages, framework, or build step are introduced.
- JSON version 6 and its fields remain unchanged. Original ToDo text is preserved according to the existing normalization/edit contract; Markdown structures are never persisted.
- RFC 008 continues to own editing lifecycle coordination. RFC 009 concerns Markdown interpretation. Neither should duplicate this codec's persisted-data rules.

## Authorized Behavioral Correction

Actual persisted-field repairs must reliably set `needsWriteAfterRead`, including cases currently masked by the second normalizing comparison. This is an intentional correction rather than a strictly behavior-preserving refactor.

For example, a version-6 task with a title requiring normalization or an invalid due date must report a repair when the output changes. Once the repaired state is encoded and decoded again, no further repair should be needed.

Envelope metadata needs explicit policy rather than an indiscriminate object comparison. Do not use `JSON.stringify(input) !== JSON.stringify(output)` as a repair detector: key order and unrelated differences are not field-repair rules.

During implementation, characterize and document how unknown extra fields, unrecognized future versions, the application marker, and invalid envelope metadata are currently handled. Do not silently introduce rejection of previously accepted data or invent historical schemas. If a safer policy would change compatibility beyond the correction above, raise that decision separately before implementing it.

## Testing Strategy

### New boundary tests to write

Exercise the same public codec used by file loading, browser loading, import, and payload creation:

- Supported older wrapped data and direct state objects migrate into the current state and request a rewrite.
- Canonical version-6 payloads load without a rewrite.
- Missing/invalid known fields are repaired and reported, including the masked title/date cases.
- Valid false values remain false; malformed booleans do not become true through truthiness.
- Every task status survives a round trip. Valid status wins over contradictory legacy `done`; legacy-only data maps to Open/Done.
- Duplicate/invalid IDs are repaired within their correct scopes and remain stable on the next round trip.
- Missing or broken project selection is repaired consistently.
- Pending-theme application marks a rewrite only when needed.
- Invalid root input fails before caller state is replaced; decode does not mutate its input.
- Encoding does not mutate the state or run replacement-ID generation. Later live edits do not alter the returned payload snapshot.
- `decode -> encode -> decode` preserves the normalized state and reports no second repair. Saved timestamps are tested using the controlled clock, not unstable wall time.
- Characterization fixtures protect compatibility policies that this RFC does not authorize changing.

### Old tests to replace or retain

- Expand `tests/state-normalization.test.js` into codec contract tests before removing redundant field-level checks.
- Remove tests tied solely to `stateDiffersAfterNormalization()` after the corresponding repair decisions are covered at the codec boundary.
- Retain independent storage-failure, rollback, queue-order, and browser-mode tests; codec tests do not replace them.
- Add focused integration checks that file load, browser load, import, and export/write paths all use the codec instead of retaining parallel normalization or envelope logic.
- Use the common test-loading direction from RFC 008 rather than adding another copied source-extraction helper. Do not test a duplicate test-only implementation of the codec.

### Test environment needs

Most codec tests require only the existing JavaScript test runner and controlled clock/ID inputs. No browser, DOM double, filesystem substitute, or network service is necessary for the codec itself. Existing browser/storage verification remains applicable to the adapters.

## Implementation Recommendations

1. Characterize accepted input shapes and compatibility edge cases; add failing regressions for actual repairs that currently escape rewrite detection.
2. Centralize the current format marker/version without changing the emitted JSON schema.
3. Move normalization into the codec and record repairs in the same field-processing pass. Keep cross-field rules explicit and readable.
4. Route payload construction through encoding with a stable snapshot and the shared format definition. Reuse the existing save lifecycle and queue.
5. Migrate file/browser/import callers, preserving their rollback and activation behavior. Remove the separate comparison pass and any superseded envelope-building paths.
6. Point migration messages at the shared version definition. Audit field rules and status compatibility for duplicate implementations.
7. Run codec round-trip and repair tests, then relevant persistence/integration checks. Remove only tests whose behavior is already protected by replacements.

Do not turn this work into a generic validator, recursive schema interpreter, migration registry, or unrelated storage rewrite. The intended improvement is one maintainable persisted-data contract with a small interface.

## Implementation and compatibility notes

- [x] Decode known fields and track repairs in one pass, including title and date corrections.
- [x] Encode a detached version-6 snapshot and derive compatibility done from a valid status.
- [x] Route file, browser, import, export and save paths through the codec.
- [x] Cover codec round trips, compatibility policies, and persistence integration; retain lifecycle and failure tests.
- [x] Share the app marker and version with output, rewrite decisions and migration messages.

Compatibility characterization: unknown fields and the application marker are ignored during decoding and do not independently request a rewrite. A version other than 6, including an unrecognized future version, remains accepted when its data shape is supported and requests rewriting. An invalid or missing savedAt becomes empty metadata without independently requesting a rewrite; it is never used as a fallback creation timestamp. Invalid root values are rejected before state activation.
