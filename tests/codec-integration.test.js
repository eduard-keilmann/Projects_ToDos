const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extractFunctionSource } = require('./helpers/app-source');

function harness(input) {
  const script = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const names = ['normalizeStoredTimestamp', 'isValidDateOnly', 'normalizeText', 'normalizeLongText',
    'normalizeDateTime', 'normalizeDateOnly', 'taskStatusOptions', 'normalizeTaskStatus', 'normalizePriority',
    'createTodoCodec', 'readStateFromBrowserStorage', 'readStateFromDisk', 'writeStateToDisk',
    'writeStateToBrowserStorage', 'importBackup', 'exportBackup'];
  let written;
  const context = {
    Date, Intl, JSON, BROWSER_PAYLOAD_KEY: 'payload', pendingThemeBeforeConnection: null,
    state: { previous: true }, stateNeedsWriteAfterRead: false, browserLastSavedAt: '',
    loadBrowserStorageMeta: async () => {}, readBrowserStoredValue: async () => input,
    createEmptyState: () => ({ projects: [], selectedProjectId: null, settings: { theme: 'dark' } }),
    ensureDataFileHandle: async () => {}, ensureSelection() {},
    dataFileHandle: { getFile: async () => ({ text: async () => JSON.stringify(input) }),
      createWritable: async () => ({ write: async text => { written = JSON.parse(text); }, close: async () => {} }) },
    directoryHandle: { name: 'test' }, persistenceLifecycle: {
      markWriteSucceeded() {}, snapshotCurrentAppState() { return context.state; },
      restoreSnapshot(snapshot) { context.state = snapshot; }
    },
    saveBrowserStoredValue: async (key, value) => { written = value; },
    setStatusObject() {}, buildStorageStatus() {}, setBrowserStorageReadyStatus() {},
    getStorageMode: () => ({ usesBrowserStorage: false, supportsBackupMetadata: false }),
    isEditingEnabled: () => true, canExportCurrentState: () => true, confirm: () => true,
    markDirty() {}, persistAndRender: async () => {}, alert() {}, render() {}, els: { importFile: {} },
    Blob: class { constructor(parts) { written = JSON.parse(parts[0]); } },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } }
  };
  vm.runInNewContext(names.map(name => extractFunctionSource(script, name)).join('\n') +
    "\nthis.codec = createTodoCodec({ now: () => '2026-05-01T10:00:00.000Z', createId: prefix => prefix + '-generated' });" +
    "\nObject.assign(this, { readStateFromBrowserStorage, readStateFromDisk, writeStateToDisk, writeStateToBrowserStorage, importBackup, exportBackup });", context);
  return { context, written: () => written };
}

const legacy = { projects: [{ id: 'p', name: 'Project', createdAt: '2026-05-01T10:00:00.000Z', tasks: [] }], selectedProjectId: 'p', settings: { theme: 'dark' } };

test('file and browser loads and import use the codec and reject invalid input before replacing state', async () => {
  for (const method of ['readStateFromDisk', 'readStateFromBrowserStorage', 'importBackup']) {
    const { context } = harness(legacy);
    if (method === 'importBackup') await context[method]({ text: async () => JSON.stringify(legacy) });
    else await context[method]();
    assert.equal(context.state.projects[0].name, 'Project');
    if (method !== 'importBackup') assert.equal(context.stateNeedsWriteAfterRead, true);
  }
  const missing = harness(undefined);
  assert.equal(await missing.context.readStateFromBrowserStorage(), false);
  assert.equal(missing.context.state.projects.length, 0);
  const badImport = harness(legacy);
  await badImport.context.importBackup({ text: async () => 'null' });
  assert.equal(badImport.context.state.previous, true);
  for (const method of ['readStateFromDisk', 'readStateFromBrowserStorage']) {
    for (const invalid of [{ data: {} }, null, false, 0, '']) {
      const { context } = harness(invalid);
      await assert.rejects(context[method](), /Invalid data structure/);
      assert.equal(context.state.previous, true);
    }
  }
});

test('file and browser saves and backup export use the current codec envelope', async () => {
  for (const method of ['writeStateToDisk', 'writeStateToBrowserStorage', 'exportBackup']) {
    const h = harness(legacy);
    h.context.state = h.context.codec.decode(legacy).state;
    await h.context[method]();
    const payload = h.written();
    assert.equal(payload.app, 'Project ToDo Tool');
    assert.equal(payload.version, 6);
    assert.equal(payload.savedAt, '2026-05-01T10:00:00.000Z');
    assert.equal(payload.data.projects[0].name, 'Project');
  }
});
