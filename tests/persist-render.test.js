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
  const project = {};
  const context = { document, getSelectedProject: () => project, requestAnimationFrame(callback) { frame = callback; },
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
