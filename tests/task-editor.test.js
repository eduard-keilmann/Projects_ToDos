const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('editor retains rows and defers structural changes only while interacting', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
  const script = html.match(/<script id="task-editor-module">([\s\S]*?)<\/script>/);
  assert.ok(script, 'public editor module exists');
  const document = { activeElement: null };
  const listeners = new Map();
  const root = {
    ownerDocument: document, children: [],
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    contains(node) { return this.children.includes(node); },
    replaceChildren() { this.children = []; },
    insertBefore(row, before) {
      this.children = this.children.filter(item => item !== row);
      this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, row);
    }
  };
  const edits = [];
  const resized = [];
  const context = {
    markdownPreferences: new WeakMap(), autoResizeTextarea(input) { resized.push(input.value); }, clearDragIndicators() {},
    formatDate() {}, normalizeDateTime() {}, relativeInfo() {}, normalizeDateOnly() {},
    buildTaskQueryState(project, options) {
      return { visibleTasks: project.tasks.filter(task => task.title.includes(options.search)), canReorder: !options.search };
    },
    buildTaskRow(options) {
      return { dataset: { taskId: options.task.id }, options,
        querySelectorAll() { return []; },
        updateTask(next) { this.options = { ...this.options, ...next }; },
        remove() { root.children = root.children.filter(row => row !== this); }
      };
    }
  };
  vm.runInNewContext(script[1], context);
  const editor = context.createTaskListEditor({ root, onEdit: edit => edits.push(edit), onAction() {} });
  const project = { id: 'p', tasks: [{ id: 't', title: 'match' }] };
  const view = { project, query: { search: '' }, access: { editable: true } };
  editor.update(view);
  const row = root.children[0];
  document.activeElement = row;
  const restoredTitle = 'First line\nSecond line\nThird line';
  const emptyInput = { value: '' };
  row.options.intents.onTitleBlur({ input: emptyInput, value: '', previousValue: restoredTitle });
  assert.equal(emptyInput.value, restoredTitle);
  assert.ok(resized.includes(restoredTitle), 'Restored multiline input must be resized');
  row.options.intents.onStatusChange({ value: 'done' });
  assert.equal(edits.at(-1).field, 'status');
  assert.equal(edits.at(-1).projectId, 'p');
  assert.equal(edits.at(-1).taskId, 't');
  editor.update(view);
  assert.equal(root.children[0], row);
  view.query.search = 'missing';
  listeners.get('focusin')();
  document.activeElement = null; // During blur, browsers may temporarily report body/null.
  assert.equal(editor.update(view).visibleCount, 1);
  assert.equal(root.children[0], row);
  document.activeElement = null;
  listeners.get('focusout')({ relatedTarget: null });
  assert.equal(root.children.length, 0);
  view.query.search = '';
  editor.update(view);
  const beforeImport = root.children[0];
  editor.update({ ...view, project: { id: 'other', tasks: [{ id: 't', title: 'other' }] } });
  assert.notEqual(root.children[0], beforeImport);
  const previousEdits = edits.length;
  beforeImport.options.intents.onStatusChange({ value: 'done' });
  assert.equal(edits.length, previousEdits);
  document.activeElement = root.children[0];
  editor.update({ ...view, access: { editable: false } });
  assert.equal(root.children[0].options.editable, false);
  editor.dispose();
  assert.equal(root.children.length, 0);
  assert.equal(listeners.size, 0);
  row.options.intents.onStatusChange({ value: 'done' });
  assert.equal(edits.length, previousEdits);
  editor.update(view);
  assert.equal(root.children.length, 0);
});
