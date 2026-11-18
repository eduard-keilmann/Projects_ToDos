const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { extractFunctionSource } = require('./helpers/app-source');

function loadNormalizationFunctions() {
  const htmlPath = path.join(__dirname, '..', 'project_todo_tool.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('Could not find app script block');
  }

  const script = scriptMatch[1];
  let idCalls = 0;
  const context = {
    createId: prefix => prefix + '-' + (++idCalls),
    Date,
    Math: Object.create(Math),
    module: { exports: {} }
  };

  context.Math.random = () => 0.123456789;

  const functionNames = [
    'normalizeStoredTimestamp',
    'isValidDateOnly',
    'normalizeText',
    'normalizeLongText',
    'normalizeDateTime',
    'normalizeDateOnly',
    'taskStatusOptions',
    'normalizeTaskStatus',
    'normalizePriority',
    'createTodoCodec'
  ];

  const source = functionNames.map(name => extractFunctionSource(script, name)).join('\n\n');
  vm.runInNewContext(`${source}\n\nconst codec = createTodoCodec({ now: () => '2026-05-01T10:00:00.000Z', createId }); module.exports = { codec, normalizePersistedState: codec.decode };`, context);
  return { ...context.module.exports, idCalls: () => idCalls };
}

test('normalizePersistedState repairs malformed persisted payloads and marks them for rewrite', () => {
  const { normalizePersistedState } = loadNormalizationFunctions();
  const result = normalizePersistedState({
    version: 4,
    savedAt: 'bad-date',
    data: {
      projects: [
        {
          id: 'project-1',
          name: '  ',
          createdAt: 'bad-date',
          tasks: [
            {
              id: 'task-1',
              title: '',
              notes: 42,
              dueDate: '2026-99-99',
              priority: 'urgent',
              done: 'yes',
              createdAt: 'bad-date'
            },
            {
              id: 'task-1',
              title: 'Second',
              notes: null,
              dueDate: '2026-05-01',
              priority: 'low',
              done: true,
              createdAt: '2026-05-01T10:00:00.000Z'
            }
          ]
        }
      ],
      selectedProjectId: 'missing-project',
      settings: {
        theme: 'light'
      }
    }
  });

  assert.equal(result.needsWriteAfterRead, true);
  assert.equal(result.savedAt, '');
  assert.equal(result.state.selectedProjectId, 'project-1');
  assert.equal(result.state.settings.theme, 'light');
  assert.equal(result.state.projects[0].name, 'Untitled Project');
  assert.equal(result.state.projects[0].tasks[0].title, 'Untitled Task');
  assert.equal(result.state.projects[0].tasks[0].notes, '42');
  assert.equal(result.state.projects[0].tasks[0].dueDate, '');
  assert.equal(result.state.projects[0].tasks[0].priority, 'medium');
  assert.equal(result.state.projects[0].tasks[0].done, false);
  assert.notEqual(result.state.projects[0].tasks[0].id, result.state.projects[0].tasks[1].id);
});

test('legacy completion states migrate and current statuses survive a JSON round trip', () => {
  const { normalizePersistedState, codec } = loadNormalizationFunctions();
  const createdAt = '2026-05-01T10:00:00.000Z';
  const task = (id, extra) => ({ id, title: id, notes: '', dueDate: '', priority: 'medium', createdAt, ...extra });
  const payload = {
    version: 5, savedAt: createdAt,
    data: { selectedProjectId: 'p', settings: { theme: 'dark' }, projects: [{
      id: 'p', name: 'Project', createdAt,
      tasks: [task('old-open', { done: false }), task('old-done', { done: true }),
        task('progress', { status: 'in-progress', done: true }),
        task('review', { status: 'in-review', done: false }),
        task('acceptance', { status: 'awaiting-acceptance', done: false }),
        task('done', { status: 'done', done: false }), task('invalid', { status: 'invalid', done: true })]
    }] }
  };
  const migrated = normalizePersistedState(payload);
  assert.equal(migrated.needsWriteAfterRead, true);
  const tasks = migrated.state.projects[0].tasks;
  assert.deepEqual(Array.from(tasks, t => [t.status, t.done]), [
    ['open', false], ['done', true], ['in-progress', false], ['in-review', false],
    ['awaiting-acceptance', false], ['done', true], ['done', true]
  ]);
  const stored = JSON.parse(JSON.stringify(codec.encode(migrated.state)));
  const reloaded = normalizePersistedState(stored);
  assert.equal(reloaded.needsWriteAfterRead, false);
  assert.deepEqual(Array.from(reloaded.state.projects[0].tasks, t => [t.status, t.done]),
    Array.from(tasks, t => [t.status, t.done]));
});

// A current payload must report repairs even when normalized values match fallbacks.
test('reports corrected title and due date in current payload', () => {
  const { normalizePersistedState, codec } = loadNormalizationFunctions();
  const date = '2026-05-01T10:00:00.000Z';
  for (const changes of [{ title: '  Task  ' }, { dueDate: 'invalid' }]) {
    const task = { id: 't', title: 'Task', notes: '', dueDate: '', priority: 'medium', status: 'open', done: false, createdAt: date, ...changes };
    const result = normalizePersistedState({ app: 'Project ToDo Tool', version: 6, savedAt: date, data: { projects: [{ id: 'p', name: 'Project', createdAt: date, tasks: [task] }], selectedProjectId: 'p', settings: { theme: 'dark' } } });
    assert.equal(result.needsWriteAfterRead, true);
    assert.equal(result.state.projects[0].tasks[0].title, 'Task');
    assert.equal(result.state.projects[0].tasks[0].dueDate, '');
    assert.equal(codec.decode(plain(codec.encode(result.state))).needsWriteAfterRead, false);
  }
});

const plain = value => JSON.parse(JSON.stringify(value));
const timestamp = '2026-05-01T10:00:00.000Z';
function canonicalPayload() {
  return { app: 'Project ToDo Tool', version: 6, savedAt: timestamp, data: {
    projects: [{ id: 'p', name: 'Project', createdAt: timestamp, tasks: [
      { id: 't', title: 'Task', notes: '', dueDate: '', priority: 'medium', status: 'open', done: false, createdAt: timestamp }
    ] }], selectedProjectId: 'p', settings: { theme: 'dark' }
  } };
}

test('codec round trip repairs missing fields and keeps repaired IDs and timestamps stable', () => {
  const { codec } = loadNormalizationFunctions();
  const input = { projects: [{ id: 'p', name: ' Project ', createdAt: 'bad', tasks: [
    { id: 'same', title: 'A', done: false }, { id: 'same', title: 'B', done: 'true' },
    { id: '', title: 'C', done: true }
  ] }, { id: 'p', name: 'Other', tasks: [{ id: 'same', title: 'D', done: false }] }],
  selectedProjectId: 'missing', settings: { theme: 'dark' } };
  const original = plain(input);
  const loaded = codec.decode(input);
  assert.deepEqual(input, original);
  assert.equal(loaded.needsWriteAfterRead, true);
  assert.equal(loaded.state.selectedProjectId, 'p');
  const [first, second] = loaded.state.projects;
  assert.notEqual(first.id, second.id);
  assert.equal(second.tasks[0].id, 'same');
  assert.equal(new Set(first.tasks.map(t => t.id)).size, 3);
  assert.deepEqual(Array.from(first.tasks, t => [t.status, t.done, t.createdAt]), [
    ['open', false, timestamp], ['open', false, timestamp], ['done', true, timestamp]
  ]);
  const payload = codec.encode(loaded.state);
  const again = codec.decode(plain(payload));
  assert.equal(again.needsWriteAfterRead, false);
  assert.deepEqual(plain(again.state), plain(loaded.state));
  assert.equal(payload.savedAt, timestamp);
});

test('codec preserves canonical state and tracks supported pending-theme changes', () => {
  const { codec } = loadNormalizationFunctions();
  const input = canonicalPayload();
  assert.equal(codec.decode(input).needsWriteAfterRead, false);
  assert.equal(codec.decode(input, { pendingTheme: 'dark' }).needsWriteAfterRead, false);
  const changed = codec.decode(input, { pendingTheme: 'light' });
  assert.equal(changed.state.settings.theme, 'light');
  assert.equal(changed.needsWriteAfterRead, true);
  assert.equal(codec.decode(input, { pendingTheme: 'invalid' }).state.settings.theme, 'dark');
});

test('encoding takes an independent snapshot, derives done and preserves draft text', () => {
  const { codec, idCalls } = loadNormalizationFunctions();
  const state = canonicalPayload().data;
  state.projects[0].tasks[0].title = '  ';
  state.projects[0].tasks[0].status = 'done';
  const before = plain(state);
  const payload = codec.encode(state);
  assert.equal(idCalls(), 0);
  assert.deepEqual([payload.app, payload.version, payload.savedAt], ['Project ToDo Tool', 6, timestamp]);
  assert.deepEqual(state, before);
  assert.equal(payload.data.projects[0].tasks[0].done, true);
  assert.equal(payload.data.projects[0].tasks[0].title, '  ');
  state.projects[0].tasks[0].title = 'Later';
  assert.equal(payload.data.projects[0].tasks[0].title, '  ');
  state.projects[0].tasks[0].status = 'invalid';
  assert.throws(() => codec.encode(state), /invalid status/);
});

test('codec retains compatibility with ignored envelope metadata and extra fields', () => {
  const { codec } = loadNormalizationFunctions();
  const input = canonicalPayload();
  input.app = 'another app';
  input.savedAt = 'bad date';
  input.extra = 1;
  input.data.projects[0].extra = 2;
  const result = codec.decode(input);
  assert.equal(result.needsWriteAfterRead, false);
  assert.equal(result.savedAt, '');
  input.savedAt = '2020-01-01T00:00:00.000Z';
  input.data.projects[0].createdAt = 'bad';
  const repaired = codec.decode(input);
  assert.equal(repaired.savedAt, '2020-01-01T00:00:00.000Z');
  assert.equal(repaired.state.projects[0].createdAt, timestamp);
  input.version = 999;
  assert.equal(codec.decode(input).needsWriteAfterRead, true);
  assert.throws(() => codec.decode({ data: {} }), /Invalid data structure/);
});
