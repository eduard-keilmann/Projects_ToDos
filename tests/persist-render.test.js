const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('finishing a save updates the status without replacing the focused task controls', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
  const start = html.indexOf('    async function persistAndRender(');
  const end = html.indexOf('\n    async function pickNewDirectory(', start);
  assert.ok(start >= 0 && end > start);
  let finishWrite;
  const calls = [];
  const context = {
    markDirty() { calls.push('dirty'); },
    render() { calls.push('render'); },
    restoreTaskViewportAnchor() { calls.push('restore'); },
    isEditingEnabled() { return true; },
    setSavingStatus() { calls.push('saving'); },
    queueWrite() { return new Promise(resolve => { finishWrite = resolve; }); },
    renderStatus() { calls.push('status'); }
  };
  vm.runInNewContext(html.slice(start, end) + '\nthis.persistAndRender = persistAndRender;', context);
  const save = context.persistAndRender({ restoreTaskId: 'task', restoreTaskTop: 100, restoreFocusSelector: '.status-select' });
  assert.deepEqual(calls, ['dirty', 'render', 'restore', 'saving']);
  finishWrite();
  await save;
  assert.deepEqual(calls, ['dirty', 'render', 'restore', 'saving', 'status']);
});


test('search refresh waits for leaving the list and clears pending work on render', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
  const start = html.indexOf('    let pendingTaskFilterRefresh = false;');
  const end = html.indexOf('\n    function render()', start);
  assert.ok(start >= 0 && end > start);
  const task = { id: 't', title: 'match old', notes: '', done: false };
  const project = { id: 'p', name: 'Project', createdAt: '2026-01-01T00:00:00Z', tasks: [task] };
  let renders = 0;
  let intents;
  const field = () => ({ style: {}, classList: { toggle() {}, add() {}, remove() {} }, disabled: false });
  const els = new Proxy({ searchInput: { value: 'match' }, taskList: {
    replaceChildren() { renders++; }, appendChild() {}, contains(target) { return Boolean(target?.inside); }
  } }, { get(target, key) { return target[key] || (target[key] = field()); } });
  const noop = () => {};
  const context = {
    els, state: { projects: [project] }, document: {}, directoryHandle: null,
    getSelectedProject: () => project, isEditingEnabled: () => true,
    canReviewUnsavedBrowserState: () => false, getStorageMode: () => ({}),
    canExportCurrentState: () => true, supportsFileSystemAccess: () => true,
    updateDraftCreatedAt: noop, counts: () => ({ total: 1, open: 1, done: 0 }),
    normalizeDateTime: value => value, getCurrentTaskQueryState: () => ({
      visibleTasks: task.title.includes('match') ? [task] : [], visibleCountText: '', canReorder: false
    }),
    buildTaskRow(options) { intents = options.intents; return {}; },
    autoResizeTextarea: noop, clearDragIndicators: noop, formatDate: noop, relativeInfo: noop,
    normalizeDateOnly: noop, scheduleAutosave: noop, requestAnimationFrame: noop,
    resizeRenderedNoteFields: noop, markdownPreferences: new Map()
  };
  vm.runInNewContext(html.slice(start, end) + '\nthis.renderTasks = renderTasks; this.focusOut = refreshTaskFilterOnFocusOut;', context);
  context.renderTasks();
  const destinations = ['notes', 'date', 'title', 'status', 'delete'].map(name => ({ name, inside: true }));
  for (const destination of destinations) {
    const input = { value: 'match changed ' + destination.name, dataset: { previousValue: 'old' } };
    intents.onTitleBlur({ task, input, value: input.value, previousValue: 'old', event: { relatedTarget: destination } });
    context.focusOut({ relatedTarget: destination });
    assert.equal(renders, 1);
    intents.onNotesBlur({ task, input, value: input.value, event: { relatedTarget: destination } });
    assert.equal(renders, 1);
  }
  context.focusOut({ relatedTarget: null });
  assert.equal(renders, 2);
  context.focusOut({ relatedTarget: null });
  assert.equal(renders, 2);
  intents.onTitleBlur({ task, input: { value: 'match again' }, value: 'match again', previousValue: 'old', event: { relatedTarget: destinations[0] } });
  context.renderTasks();
  assert.equal(renders, 3);
  context.focusOut({ relatedTarget: null });
  assert.equal(renders, 3);
});


test('delayed focus restoration does not override a later user focus change', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
  const start = html.indexOf('    function restoreTaskViewportAnchor(');
  const end = html.indexOf('\n    function reorderProjects(', start);
  assert.ok(start >= 0 && end > start);
  let frame;
  let focusCalls = 0;
  let scrollCalls = 0;
  const document = { activeElement: {} };
  const row = { querySelector: () => ({ focus() { focusCalls++; } }), getBoundingClientRect: () => ({ top: 120 }) };
  const context = { document, requestAnimationFrame(callback) { frame = callback; },
    findRenderedTaskById: () => row, window: { scrollBy() { scrollCalls++; } } };
  vm.runInNewContext(html.slice(start, end) + '\nthis.restoreTaskViewportAnchor = restoreTaskViewportAnchor;', context);
  context.restoreTaskViewportAnchor('task', 100, '.status-select');
  document.activeElement = {};
  frame();
  assert.equal(focusCalls, 0);
  assert.equal(scrollCalls, 0);
  context.restoreTaskViewportAnchor('task', 100, '.status-select');
  frame();
  assert.equal(focusCalls, 1);
  assert.equal(scrollCalls, 1);
});
