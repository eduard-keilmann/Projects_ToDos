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

function loadTaskRenderFunction() {
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

  const source = ['taskStatusOptions', 'normalizeTaskStatus'].map(name => extractFunctionSource(script, name)).join('\n\n') + '\n\n' + extractFunctionSource(script, 'buildTaskRow');
  vm.runInNewContext(`${source}\n\nmodule.exports = { buildTaskRow };`, context);
  return context.module.exports;
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach(name => this.values.add(name));
  }

  remove(...names) {
    names.forEach(name => this.values.delete(name));
  }

  toggle(name, force) {
    if (typeof force === 'boolean') {
      if (force) {
        this.values.add(name);
      } else {
        this.values.delete(name);
      }
      return force;
    }

    if (this.values.has(name)) {
      this.values.delete(name);
      return false;
    }

    this.values.add(name);
    return true;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = new Map();
    this.disabled = false;
    this.value = '';
    this.rows = 0;
    this._textContent = '';
    this.type = '';
    this.checked = false;
    this.draggable = false;
    this.title = '';
    this.placeholder = '';
    this.isConnected = true;
  }

  set textContent(value) { this._textContent = value; this.children = []; }

  get textContent() { return this._textContent; }

  append(...nodes) {
    nodes.forEach(node => this.appendChild(node));
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(listener);
  }

  dispatchEvent(event) {
    const listeners = this.listeners.get(event.type) || [];
    listeners.forEach(listener => listener(event));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const matcher = buildSelectorMatcher(selector);

    for (const child of this.children) {
      if (matcher(child)) {
        matches.push(child);
      }
      matches.push(...child.querySelectorAll(selector));
    }

    return matches;
  }

  getBoundingClientRect() {
    return {
      top: 120,
      height: 40
    };
  }

  focus() {}
}

function buildSelectorMatcher(selector) {
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    return node => {
      const classNames = node.className.split(/\s+/).filter(Boolean);
      return classNames.includes(className) || node.classList.contains(className);
    };
  }

  return node => node.tagName.toLowerCase() === selector.toLowerCase();
}

function createDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

function createTask(overrides = {}) {
  return {
    id: 'task-1',
    title: 'Alpha task',
    notes: 'Detail',
    priority: 'high',
    done: false,
    dueDate: '2026-05-30',
    createdAt: '2026-05-20T10:00:00.000Z',
    ...overrides
  };
}

test('buildTaskRow renders notes, due metadata, and reorder controls from display data', () => {
  const { buildTaskRow } = loadTaskRenderFunction();
  const row = buildTaskRow({
    document: createDocument(),
    task: createTask(),
    editable: true,
    taskReorderEnabled: true,
    taskIndex: 0,
    taskCount: 2,
    autoResizeTextarea() {},
    clearDragIndicators() {},
    formatDate(value) {
      return `fmt:${value}`;
    },
    normalizeDateTime(value) {
      return value;
    },
    relativeInfo() {
      return 'in 7 days';
    },
    normalizeDateOnly(value) {
      return value;
    },
    getDraggedTaskId() {
      return null;
    },
    setDraggedTaskId() {},
    intents: {}
  });

  assert.equal(row.className, 'editor-task');
  assert.equal(row.dataset.taskId, 'task-1');
  assert.equal(row.querySelector('.inline-title-input').value, 'Alpha task');
  assert.equal(row.querySelector('.inline-notes-input').value, 'Detail');
  assert.equal(row.querySelector('.priority-select').value, 'high');
  assert.equal(row.querySelector('.move-task-up-btn').disabled, true);
  assert.equal(row.querySelector('.move-task-down-btn').disabled, false);
  assert.equal(row.querySelector('.editor-meta-line').children.length, 3);
  assert.equal(row.querySelector('.editor-meta-line').children[2].textContent, 'Due: fmt:2026-05-30 - in 7 days');
});

test('buildTaskRow routes field changes through task intents and hides empty notes rows', () => {
  const { buildTaskRow } = loadTaskRenderFunction();
  const calls = [];
  const row = buildTaskRow({
    document: createDocument(),
    task: createTask({ notes: '', priority: 'urgent' }),
    editable: true,
    taskReorderEnabled: false,
    taskIndex: 1,
    taskCount: 2,
    autoResizeTextarea() {},
    clearDragIndicators() {},
    formatDate(value) {
      return value;
    },
    normalizeDateTime(value) {
      return value;
    },
    relativeInfo() {
      return '';
    },
    normalizeDateOnly(value) {
      return value;
    },
    getDraggedTaskId() {
      return null;
    },
    setDraggedTaskId() {},
    intents: {
      onPriorityChange({ value }) {
        calls.push(['priority', value]);
      },
      onTitleInput({ value }) {
        calls.push(['title-input', value]);
      },
      onTitleBlur({ value, previousValue }) {
        calls.push(['title-blur', value, previousValue]);
      },
      onNotesInput({ value }) {
        calls.push(['notes-input', value]);
      },
      onNotesBlur({ value }) {
        calls.push(['notes-blur', value]);
      }
    }
  });

  assert.equal(row.querySelector('.inline-notes-input'), null);
  assert.equal(row.querySelector('.priority-select').value, 'medium');

  const titleInput = row.querySelector('.inline-title-input');
  const prioritySelect = row.querySelector('.priority-select');

  titleInput.value = 'Updated title';
  titleInput.dispatchEvent({ type: 'input' });
  titleInput.value = '';
  titleInput.dispatchEvent({ type: 'blur' });
  prioritySelect.value = 'low';
  prioritySelect.dispatchEvent({ type: 'change' });

  assert.deepEqual(calls, [
    ['title-input', 'Updated title'],
    ['title-blur', '', 'Alpha task'],
    ['priority', 'low']
  ]);
});


test('Markdown preview defaults on, can be toggled, and leaves the source editable', () => {
  const { buildTaskRow } = loadTaskRenderFunction();
  const task = createTask({ title: '**Bold** and \x60code\x60', notes: '' });
  const preferences = new Map();
  const options = {
    document: createDocument(), task, markdownPreferences: preferences,
    editable: true, taskReorderEnabled: false, taskIndex: 0, taskCount: 1,
    autoResizeTextarea() {}, clearDragIndicators() {}, formatDate: value => value,
    normalizeDateTime: value => value, relativeInfo: () => '', normalizeDateOnly: value => value,
    getDraggedTaskId: () => null, setDraggedTaskId() {}
  };
  const row = buildTaskRow(options);
  const input = row.querySelector('.inline-title-input');
  const preview = row.querySelector('.markdown-preview');
  const checkbox = row.querySelector('.markdown-checkbox');
  assert.equal(checkbox.checked, true);
  assert.equal(row.querySelector('.markdown-toggle').classList.contains('hidden'), false);
  assert.equal(input.classList.contains('hidden'), true);
  assert.equal(preview.querySelector('strong').textContent, 'Bold');
  assert.equal(preview.querySelector('code').textContent, 'code');
  assert.equal(input.value, task.title);
  const initialBlock = preview.children[0];

  checkbox.checked = false;
  checkbox.dispatchEvent({ type: 'change' });
  assert.equal(preview.classList.contains('hidden'), true);
  assert.equal(input.classList.contains('hidden'), false);
  assert.equal(buildTaskRow(options).querySelector('.markdown-checkbox').checked, false);

  checkbox.checked = true;
  checkbox.dispatchEvent({ type: 'change' });
  assert.equal(preview.children[0], initialBlock);
  preview.dispatchEvent({ type: 'click', target: { closest: () => null } });
  assert.equal(input.classList.contains('hidden'), false);
  input.value = 'plain text';
  input.dispatchEvent({ type: 'input' });
  input.dispatchEvent({ type: 'blur' });
  assert.equal(row.querySelector('.markdown-toggle').classList.contains('hidden'), true);
  assert.equal(preview.classList.contains('hidden'), true);
});

test('Markdown display renders headings, lists, and links', () => {
  const { buildTaskRow } = loadTaskRenderFunction();
  const row = buildTaskRow({
    document: createDocument(), task: createTask({ title: '# Heading\n- **Item**\n<img src=x> [link](https://example.com)' }),
    editable: true, taskReorderEnabled: false, taskIndex: 0, taskCount: 1,
    autoResizeTextarea() {}, clearDragIndicators() {}, formatDate: value => value,
    normalizeDateTime: value => value, relativeInfo: () => '', normalizeDateOnly: value => value,
    getDraggedTaskId: () => null, setDraggedTaskId() {}
  });
  const preview = row.querySelector('.markdown-preview');
  assert.equal(preview.querySelector('h1').children[0].textContent, 'Heading');
  assert.equal(preview.querySelector('li').querySelector('strong').textContent, 'Item');
  assert.equal(preview.querySelector('a').href, 'https://example.com');
  assert.equal(preview.querySelector('a').rel, 'noopener noreferrer');
});


test('disabling Markdown resizes the now-visible multiline editor', () => {
  const { buildTaskRow } = loadTaskRenderFunction();
  const resizedVisibleInputs = [];
  const row = buildTaskRow({
    document: createDocument(), task: createTask({ title: '**Title**\nSecond line\nThird line', notes: '' }),
    editable: true, taskReorderEnabled: false, taskIndex: 0, taskCount: 1,
    autoResizeTextarea(input) {
      if (!input.classList.contains('hidden')) resizedVisibleInputs.push(input);
    },
    clearDragIndicators() {}, formatDate: value => value,
    normalizeDateTime: value => value, relativeInfo: () => '', normalizeDateOnly: value => value,
    getDraggedTaskId: () => null, setDraggedTaskId() {}
  });
  resizedVisibleInputs.length = 0;
  const checkbox = row.querySelector('.markdown-checkbox');
  checkbox.checked = false;
  checkbox.dispatchEvent({ type: 'change' });
  assert.equal(row.querySelector('.inline-title-input').classList.contains('hidden'), false);
  assert.equal(resizedVisibleInputs.includes(row.querySelector('.inline-title-input')), true);
});


test('ordinary underscores, escaped syntax, and empty markers do not activate Markdown', () => {
  const { buildTaskRow } = loadTaskRenderFunction();
  for (const title of ['snake_case_name', '5 * 10 * 20', String.raw`\*literal*`, '# ', '- ']) {
    const row = buildTaskRow({
      document: createDocument(), task: createTask({ title, notes: '' }),
      editable: true, taskReorderEnabled: false, taskIndex: 0, taskCount: 1,
      autoResizeTextarea() {}, clearDragIndicators() {}, formatDate: value => value,
      normalizeDateTime: value => value, relativeInfo: () => '', normalizeDateOnly: value => value,
      getDraggedTaskId: () => null, setDraggedTaskId() {}
    });
    assert.equal(row.querySelector('.markdown-toggle').classList.contains('hidden'), true, title);
    assert.equal(row.querySelector('.inline-title-input').value, title);
  }
});

test('escaped markup stays literal alongside actual Markdown', () => {
  const { buildTaskRow } = loadTaskRenderFunction();
  const row = buildTaskRow({
    document: createDocument(), task: createTask({ title: String.raw`**Bold** \*literal* snake_case_name` }),
    editable: true, taskReorderEnabled: false, taskIndex: 0, taskCount: 1,
    autoResizeTextarea() {}, clearDragIndicators() {}, formatDate: value => value,
    normalizeDateTime: value => value, relativeInfo: () => '', normalizeDateOnly: value => value,
    getDraggedTaskId: () => null, setDraggedTaskId() {}
  });
  const preview = row.querySelector('.markdown-preview');
  assert.equal(preview.querySelector('strong').textContent, 'Bold');
  assert.equal(preview.querySelector('em'), null);
  assert.equal(preview.querySelector('p').children.map(child => child.textContent).join(''), 'Bold *literal* snake_case_name');
});


test('fenced code is preserved and only selected languages receive highlighting', () => {
  const { buildTaskRow } = loadTaskRenderFunction();
  const fence = String.fromCharCode(96).repeat(3);
  for (const [language, code, highlighted] of [
    ['python', 'def run():\n    return "hello"', true],
    ['bash', 'if true; then echo hi; fi', true],
    ['cpp', 'int main() { return 0; }', true],
    ['powershell', 'if ($x) { return 1 }', false],
    ['', 'return 1', false]
  ]) {
    const title = fence + language + '\n' + code + '\n' + fence;
    const row = buildTaskRow({
      document: createDocument(), task: createTask({ title, notes: '' }),
      editable: true, taskReorderEnabled: false, taskIndex: 0, taskCount: 1,
      autoResizeTextarea() {}, clearDragIndicators() {}, formatDate: value => value,
      normalizeDateTime: value => value, relativeInfo: () => '', normalizeDateOnly: value => value,
      getDraggedTaskId: () => null, setDraggedTaskId() {}
    });
    const block = row.querySelector('pre').querySelector('code');
    const displayed = block.children.length ? block.children.map(child => child.textContent).join('') : block.textContent;
    assert.equal(displayed, code, language);
    assert.equal(Boolean(block.querySelector('.code-keyword')), highlighted, language);
    assert.equal(row.querySelector('.markdown-toggle').classList.contains('hidden'), false);
    assert.equal(row.querySelector('.inline-title-input').value, title);
  }
});


test('status selector displays the current status and reports changes', () => {
  const { buildTaskRow } = loadTaskRenderFunction();
  const calls = [];
  const row = buildTaskRow({
    document: createDocument(), task: createTask({ status: 'in-review' }),
    editable: true, taskReorderEnabled: true, taskIndex: 0, taskCount: 1,
    autoResizeTextarea() {}, clearDragIndicators() {}, formatDate: value => value,
    normalizeDateTime: value => value, relativeInfo: () => '', normalizeDateOnly: value => value,
    getDraggedTaskId: () => null, setDraggedTaskId() {},
    intents: { onStatusChange({ value }) { calls.push(value); } }
  });
  const select = row.querySelector('.status-select');
  assert.equal(select.value, 'in-review');
  assert.deepEqual(select.children.map(option => option.textContent), ['Open', 'In Progress', 'In Review', 'Awaiting Acceptance', 'Done']);
  assert.equal(row.querySelector('.editor-meta-line').children[1].textContent, 'In Review');
  select.value = 'done';
  select.dispatchEvent({ type: 'change' });
  select.value = 'open';
  select.dispatchEvent({ type: 'change' });
  assert.deepEqual(calls, ['done', 'open']);
});
