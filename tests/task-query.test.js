const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function extractFunctionSource(script, name) {
  const startToken = `function ${name}(`;
  const startIndex = script.indexOf(startToken);
  if (startIndex === -1) {
    throw new Error(`Could not find function ${name}`);
  }

  const nextFunctionIndex = script.indexOf('\n    function ', startIndex + startToken.length);
  if (nextFunctionIndex === -1) {
    throw new Error(`Could not find end of function ${name}`);
  }

  return script.slice(startIndex, nextFunctionIndex).trim();
}

function loadTaskQueryFunction() {
  const htmlPath = path.join(__dirname, '..', 'project_todo_tool.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('Could not find app script block');
  }

  const script = scriptMatch[1];
  const context = {
    module: { exports: {} }
  };

  const source = extractFunctionSource(script, 'buildTaskQueryState');
  vm.runInNewContext(`${source}\n\nmodule.exports = { buildTaskQueryState };`, context);
  return context.module.exports;
}

function sampleProject() {
  return {
    id: 'project-1',
    tasks: [
      { id: 'task-1', title: 'Alpha', priority: 'high', notes: 'first note', done: false },
      { id: 'task-2', title: 'Bravo', priority: 'low', notes: 'contains keyword', done: true },
      { id: 'task-3', title: 'Charlie', priority: 'medium', notes: '', done: false }
    ]
  };
}

test('buildTaskQueryState preserves filter and search behavior across title, priority, and notes', () => {
  const { buildTaskQueryState } = loadTaskQueryFunction();
  const project = sampleProject();

  const openOnly = buildTaskQueryState(project, { filter: 'open', search: '', editable: true });
  assert.deepEqual(openOnly.visibleTasks.map(task => task.id), ['task-1', 'task-3']);

  const doneOnly = buildTaskQueryState(project, { filter: 'done', search: '', editable: true });
  assert.deepEqual(doneOnly.visibleTasks.map(task => task.id), ['task-2']);

  const titleMatch = buildTaskQueryState(project, { filter: 'all', search: 'alpha', editable: true });
  assert.deepEqual(titleMatch.visibleTasks.map(task => task.id), ['task-1']);

  const priorityMatch = buildTaskQueryState(project, { filter: 'all', search: 'LOW', editable: true });
  assert.deepEqual(priorityMatch.visibleTasks.map(task => task.id), ['task-2']);

  const notesMatch = buildTaskQueryState(project, { filter: 'all', search: 'keyword', editable: true });
  assert.deepEqual(notesMatch.visibleTasks.map(task => task.id), ['task-2']);
});

test('buildTaskQueryState enables reordering only for all-filter with empty search', () => {
  const { buildTaskQueryState } = loadTaskQueryFunction();
  const project = sampleProject();

  assert.equal(buildTaskQueryState(project, { filter: 'all', search: '', editable: true }).canReorder, true);
  assert.equal(buildTaskQueryState(project, { filter: 'open', search: '', editable: true }).canReorder, false);
  assert.equal(buildTaskQueryState(project, { filter: 'all', search: 'alpha', editable: true }).canReorder, false);
  assert.equal(buildTaskQueryState(project, { filter: 'all', search: '', editable: false }).canReorder, false);
});

test('buildTaskQueryState returns the visible-count messaging used by render and disabled reorder states', () => {
  const { buildTaskQueryState } = loadTaskQueryFunction();
  const project = sampleProject();

  const reorderEnabled = buildTaskQueryState(project, { filter: 'all', search: '', editable: true });
  assert.equal(reorderEnabled.visibleCountText, '3 visible');

  const reorderDisabledByQuery = buildTaskQueryState(project, { filter: 'done', search: '', editable: true });
  assert.equal(reorderDisabledByQuery.visibleCountText, '1 visible - Sorting only works without search/filter');

  const reviewOnly = buildTaskQueryState(project, {
    filter: 'all',
    search: '',
    editable: false,
    reviewOnlyMode: true
  });
  assert.equal(reviewOnly.visibleCountText, '3 visible - Read-only while browser storage remains unavailable');
});
