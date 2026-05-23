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

  const source = extractFunctionSource(script, 'buildTaskRow');
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
    this.textContent = '';
    this.type = '';
    this.checked = false;
    this.draggable = false;
    this.title = '';
    this.placeholder = '';
    this.isConnected = true;
  }

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
