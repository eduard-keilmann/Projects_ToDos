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
  const context = {
    Date,
    Math: Object.create(Math),
    module: { exports: {} }
  };

  context.Math.random = () => 0.123456789;

  const functionNames = [
    'uid',
    'normalizeStoredTimestamp',
    'isValidDateOnly',
    'normalizeText',
    'normalizeLongText',
    'normalizeDateTime',
    'normalizeDateOnly',
    'taskStatusOptions',
    'normalizeTaskStatus',
    'normalizePriority',
    'ensureUniqueId',
    'stateDiffersAfterNormalization',
    'normalizeIncomingState',
    'normalizePersistedState'
  ];

  const source = functionNames.map(name => extractFunctionSource(script, name)).join('\n\n');
  vm.runInNewContext(`${source}\n\nmodule.exports = { normalizePersistedState };`, context);
  return context.module.exports;
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

test('normalizePersistedState preserves a pending theme and flags the rewritten state', () => {
  const { normalizePersistedState } = loadNormalizationFunctions();
  const result = normalizePersistedState(
    {
      version: 5,
      savedAt: '2026-05-01T10:00:00.000Z',
      data: {
        projects: [],
        selectedProjectId: null,
        settings: {
          theme: 'dark'
        }
      }
    },
    { pendingTheme: 'light' }
  );

  assert.equal(result.savedAt, '2026-05-01T10:00:00.000Z');
  assert.equal(result.state.settings.theme, 'light');
  assert.equal(result.needsWriteAfterRead, true);
});


test('legacy completion states migrate and current statuses survive a JSON round trip', () => {
  const { normalizePersistedState } = loadNormalizationFunctions();
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
  const stored = JSON.parse(JSON.stringify({ version: 6, savedAt: createdAt, data: migrated.state }));
  const reloaded = normalizePersistedState(stored);
  assert.equal(reloaded.needsWriteAfterRead, false);
  assert.deepEqual(Array.from(reloaded.state.projects[0].tasks, t => [t.status, t.done]),
    Array.from(tasks, t => [t.status, t.done]));
});
