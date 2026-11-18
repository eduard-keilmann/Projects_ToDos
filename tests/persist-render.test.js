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


test('search refresh waits until the task dropdown loses focus', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
  const start = html.indexOf('    function renderTasks()');
  const end = html.indexOf('\n    function render()', start);
  assert.ok(start >= 0 && end > start);
  const task = { id: 't', title: 'match old', notes: '', done: false };
  const project = { id: 'p', name: 'Project', createdAt: '2026-01-01T00:00:00Z', tasks: [task] };
  let renders = 0;
  let intents;
  const field = () => ({ style: {}, classList: { toggle() {}, add() {}, remove() {} }, disabled: false });
  const els = new Proxy({ searchInput: { value: 'match' }, taskList: {
    replaceChildren() { renders++; }, appendChild() {}, contains() { return true; }
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
  vm.runInNewContext(html.slice(start, end) + '\nthis.renderTasks = renderTasks;', context);
  context.renderTasks();
  const select = { matches: () => true };
  const input = { value: 'changed', dataset: {} };
  intents.onTitleBlur({ task, input, value: input.value, previousValue: 'match old', event: { relatedTarget: select } });
  assert.equal(renders, 1);
  intents.onSelectBlur({ event: { relatedTarget: null } });
  assert.equal(renders, 2);
});
