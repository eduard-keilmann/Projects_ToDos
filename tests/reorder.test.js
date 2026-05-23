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

function loadReorderModule(document = { querySelectorAll() { return []; } }) {
  const htmlPath = path.join(__dirname, '..', 'project_todo_tool.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('Could not find app script block');
  }

  const script = scriptMatch[1];
  const context = {
    document,
    module: { exports: {} }
  };

  const source = extractFunctionSource(script, 'createReorderModule');
  vm.runInNewContext(`${source}\n\nmodule.exports = { createReorderModule };`, context);
  return context.module.exports.createReorderModule();
}

function createItems(ids) {
  return ids.map(id => ({ id }));
}

test('shared reorder module moves items before and after a target with one set of rules', () => {
  const reorderModule = loadReorderModule();
  const items = createItems(['a', 'b', 'c', 'd']);

  assert.equal(reorderModule.moveByTarget(items, item => item.id, 'a', 'c'), true);
  assert.deepEqual(items.map(item => item.id), ['b', 'a', 'c', 'd']);

  assert.equal(reorderModule.moveByTarget(items, item => item.id, 'd', 'a', true), true);
  assert.deepEqual(items.map(item => item.id), ['b', 'a', 'd', 'c']);
});

test('shared reorder module handles same-target and invalid-target drops as no-ops', () => {
  const reorderModule = loadReorderModule();
  const items = createItems(['a', 'b', 'c']);

  assert.equal(reorderModule.moveByTarget(items, item => item.id, 'b', 'b'), false);
  assert.equal(reorderModule.moveByTarget(items, item => item.id, 'x', 'b'), false);
  assert.equal(reorderModule.moveByTarget(items, item => item.id, 'b', 'x'), false);
  assert.deepEqual(items.map(item => item.id), ['a', 'b', 'c']);
});

test('shared reorder module reports adjacent target drops that keep order as no-ops', () => {
  const reorderModule = loadReorderModule();
  const items = createItems(['a', 'b', 'c']);

  assert.equal(reorderModule.moveByTarget(items, item => item.id, 'a', 'b'), false);
  assert.deepEqual(items.map(item => item.id), ['a', 'b', 'c']);

  assert.equal(reorderModule.moveByTarget(items, item => item.id, 'b', 'a', true), false);
  assert.deepEqual(items.map(item => item.id), ['a', 'b', 'c']);
});

test('shared reorder module moves items by step and to the end', () => {
  const reorderModule = loadReorderModule();
  const items = createItems(['a', 'b', 'c']);

  assert.equal(reorderModule.moveByStep(items, item => item.id, 'b', -1), true);
  assert.deepEqual(items.map(item => item.id), ['b', 'a', 'c']);

  assert.equal(reorderModule.moveByStep(items, item => item.id, 'c', 1), false);
  assert.deepEqual(items.map(item => item.id), ['b', 'a', 'c']);

  assert.equal(reorderModule.moveToEnd(items, item => item.id, 'b'), true);
  assert.deepEqual(items.map(item => item.id), ['a', 'c', 'b']);

  assert.equal(reorderModule.moveToEnd(items, item => item.id, 'b'), false);
});

test('shared reorder module clears drag state for a selector', () => {
  const nodes = [
    {
      classList: {
        removed: [],
        remove(...names) {
          this.removed.push(...names);
        }
      }
    },
    {
      classList: {
        removed: [],
        remove(...names) {
          this.removed.push(...names);
        }
      }
    }
  ];

  let queriedSelector = '';
  const reorderModule = loadReorderModule({
    querySelectorAll(selector) {
      queriedSelector = selector;
      return nodes;
    }
  });

  reorderModule.clearIndicators('.editor-task');

  assert.equal(
    queriedSelector,
    '.editor-task.dragging, .editor-task.drag-over-top, .editor-task.drag-over-bottom'
  );
  assert.deepEqual(nodes[0].classList.removed, ['dragging', 'drag-over-top', 'drag-over-bottom']);
  assert.deepEqual(nodes[1].classList.removed, ['dragging', 'drag-over-top', 'drag-over-bottom']);
});
