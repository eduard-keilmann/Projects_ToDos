# Deepen Markdown processing with a pure parser and safe DOM renderer

## Problem

Markdown detection, block/inline parsing, escaping, code highlighting, DOM creation, and caching currently live inside ToDo row construction. Testing a Markdown rule requires constructing an unrelated task row with date, reorder, and interaction dependencies.

Previous defects around numbering and literal backslashes show that text interpretation needs a directly testable contract. DOM doubles and source-sliced row tests have also obscured failures at this boundary.

The selected design is a pure parser with a bounded structured output and a separate DOM renderer. It complements `008-deepen-task-editing-lifecycle-module.md`; it does not take ownership of the editing lifecycle.

## Proposed Interface

Illustrative interface, entirely inside the existing HTML script:

```js
const parsed = markdown.parse(source);
// { hasMarkdown, blocks }

const fragment = markdown.render(document, parsed);
// DocumentFragment
```

### Contract

- `parse(source)` accepts a string and returns a deterministic, DOM-independent result. It does not mutate the source, access application state, schedule work, or perform I/O.
- `hasMarkdown` is produced by recognizing supported structures. There is no separate detection regex or duplicate grammar in the renderer.
- `render(document, parsed)` constructs a new fragment from parser output. It does not mount it, change focus/selection, toggle visibility, resize fields, or persist anything.
- The structured output contains only the supported node kinds and associated data. It is not a general HTML tree or an extensible plugin protocol.
- The renderer consumes output from the parser, not arbitrary imported JSON. Parsed structures are derived data and never enter the persisted ToDo schema.

Usage sketch:

```js
// Derived caches belong to the row/editor owner from RFC 008.
if (source !== lastSource) {
  parsed = markdown.parse(source);
  lastSource = source;
  previewDirty = true;
}

const showPreview = enabled && parsed.hasMarkdown && !editing;
if (showPreview && previewDirty) {
  preview.replaceChildren(markdown.render(document, parsed));
  previewDirty = false;
}
```

This sketch illustrates ownership, not mandatory helper names. Identical source and display-only transitions must preserve existing preview nodes. While editing, parsing can determine whether the checkbox applies without building a hidden preview DOM. Scheduling and any further parsing optimization belong to the editor; they must preserve current detection behavior.

### Bounded structured representation

Define and test the concrete field names during implementation. The required concepts are:

- Paragraphs, heading levels 1–3, ordered/unordered lists, list start numbers, and simple block quotes.
- Inline text, strong/emphasis, literal inline code, and HTTP(S) links.
- Fenced code blocks with their literal contents and optional classified text segments.
- Highlight segment classes limited to the existing keyword, string, and comment categories.

Parsing and syntax classification own all interpretation. The renderer maps known node kinds to fixed DOM elements; it does not run grammar or language-recognition rules again. Unknown internal node kinds should produce a clear implementation error rather than silently becoming arbitrary HTML.

## Dependency Strategy

- **In-process:** parsing, escape handling, list/fence recognition, language aliases, and basic syntax classification. These require no DOM, storage, clock, or task data.
- **Local-substitutable:** DOM construction and its browser-visible result. Use a real browser for security, selection, and layout checks where simplified doubles are insufficient.
- No remote dependencies or third-party parser/highlighter are introduced.
- All runtime definitions remain in `project_todo_tool.html`. No additional JavaScript/CSS files, framework, build step, or runtime packages are required.
- The existing JSON format and migration behavior are unchanged. Original Markdown remains the persisted text; syntax trees and highlight segments are not stored.

### Ownership and duplication rules

- The Markdown module owns grammar, escaping, language aliases, and highlighting definitions in one place.
- The DOM renderer owns the mapping from the bounded parsed representation to safe elements. This translation is not a second parser.
- The ToDo editor owns source editing, checkbox/session preference, preview visibility, focus, selection, sizing, and the lifetime of derived caches.
- Keep one cache owner. Do not introduce independent source caches in the parser, renderer, and row.
- Reuse text-segment output logic only where responsibilities are actually shared. Do not create one-line forwarding wrappers or a generic visitor/plugin system.
- RFC 008 reuses this module when implemented. Neither RFC requires a second Markdown implementation; they can be introduced incrementally without a circular dependency.

### Compatibility and security requirements

- Preserve the documented limited syntax. This refactor does not promise full CommonMark, nested formatting, tables, or additional fence styles.
- Ordinary underscores and whitespace-delimited arithmetic stars must not spuriously activate emphasis. Preserve current handling of supported escaped punctuation.
- Inline code and code blocks retain literal backslashes, markup characters, spaces, and line breaks according to their existing display contract. Markdown escape removal must not alter code contents.
- Preserve numbered-list start values, including list items separated by blank lines.
- Preserve the current supported backtick-fence behavior, including unfinished blocks and closing-fence length rules.
- Language aliases remain Python (`python`, `py`), Bash/Shell (`bash`, `sh`, `shell`), and C/C++ (`c`, `cpp`, `c++`). Highlighting remains deliberately basic.
- PowerShell, unknown tags, and absent tags render as plain code without syntax highlighting. Do not add a PowerShell grammar.
- All user text is emitted through text nodes or `textContent`. Never concatenate source into HTML, use `innerHTML`, or allow parsed data to choose arbitrary tags or attributes.
- Links retain the existing HTTP(S)-only policy and safe new-tab attributes. Attribute values are assigned through DOM APIs.
- Preserve horizontal scrolling of long code lines and existing theme styling. Chrome/Chromium and Safari remain the browser targets.

## Testing Strategy

### New boundary tests to write

Pure parser tests should cover:

- Plain text, supported emphasis and headings, ordinary identifiers, arithmetic text, and escaped punctuation.
- Inline code with literal backslashes and Markdown characters.
- Ordered/unordered lists, explicit start values, blank-line separation, and transitions back to paragraphs.
- Fenced code: supported aliases, absent/unknown tags, PowerShell plain code, empty and unfinished blocks, longer fences, indentation and blank lines.
- Literal text preservation across classified code segments; HTML-looking content must remain text data.
- Consistency between `hasMarkdown` and recognized supported nodes. Expected results must be independently specified examples, not reconstructed by the implementation under test.

DOM boundary tests should cover visible text, list numbering, safe links, HTML-looking input, code formatting/highlight classes, and absence of injected elements. Use the same module entry points as the application.

Editor integration tests retain responsibility for selection/copy behavior, checkbox toggles, click-to-edit, unchanged-source node identity, focus/scroll stability, and long entries. Verify these in Chrome/Chromium and Safari; do not treat a Chromium pass as Safari evidence.

### Old tests to replace or retain

- Move Markdown rule cases out of `tests/task-render.test.js` once equivalent parser/renderer coverage passes.
- Separate Markdown-specific checks currently bundled into `tests/markdown-browser.test.js` from unrelated task lifecycle checks. Preserve all distinct security and interaction assertions at the appropriate boundary.
- Do not delete tests solely because they exercise the same code path. Remove only assertions whose required behavior is covered by the replacement tests.
- Use the shared test-loading direction from RFC 008. Do not copy more string-position or indentation-dependent function extraction helpers.

### Test environment needs

- A DOM-free test loader for the same in-file parser used by the application, not a test-only copy of the parser.
- A real-browser fixture mounting the renderer and a small number of actual editor integration scenarios.
- Explicit reporting when Chrome/Chromium or Safari coverage is unavailable. Development-only test files are permitted; the shipped app still runs from one HTML file.

## Implementation Recommendations

1. Record representative current examples and add missing regressions, especially literal inline-code escapes and list numbering.
2. Define the smallest structured representation covering the existing supported syntax; avoid speculative node types.
3. Move text interpretation and language classification into the pure parser, with one source of truth for detection.
4. Move safe DOM construction into the renderer. Validate text fidelity and security before replacing the existing path.
5. Connect the row/editor to the parser result and lazily render only when the formatted view is needed. Remove the superseded nested parser, duplicate detection, and duplicate caches.
6. Move rule tests to the parser/renderer boundaries and retain focused editor integration tests.
7. Verify no runtime files or dependencies were added, no persisted schema changed, and no unrequested Markdown syntax expansion slipped into the refactor.

The intended outcome is a smaller ToDo-row responsibility and directly testable Markdown behavior, not a general-purpose Markdown library.
