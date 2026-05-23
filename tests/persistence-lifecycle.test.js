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

function loadLifecycleFunction() {
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

  const source = extractFunctionSource(script, 'buildPersistenceLifecycle');
  vm.runInNewContext(
    `${source}\n\nmodule.exports = { buildPersistenceLifecycle };`,
    context
  );
  return context.module.exports;
}

function createHarness() {
  const recordedStatuses = [];
  let rendered = 0;
  const current = {
    directoryHandle: { name: 'Current Folder' },
    dataFileHandle: { kind: 'file-handle' },
    appReady: true,
    isDirty: true,
    stateNeedsWriteAfterRead: true,
    lastWriteFailed: true,
    pendingThemeBeforeConnection: 'light',
    browserLastSavedAt: '2026-05-01T10:00:00.000Z',
    state: { projects: [{ id: 'p1' }], settings: { theme: 'dark' } },
    currentStatusKind: 'warn',
    currentStatusTitle: 'Old Status',
    currentStatusParts: ['Old message'],
    currentStatusMeta: 'Old meta'
  };

  return {
    current,
    recordedStatuses,
    getRenderedCount() {
      return rendered;
    },
    deps: {
      readCurrent() {
        return current;
      },
      writeCurrent(next) {
        Object.assign(current, next);
      },
      cloneJsonData(value) {
        return JSON.parse(JSON.stringify(value));
      },
      buildStorageStatus(type, details) {
        const status = { type, details };
        recordedStatuses.push(status);
        return status;
      },
      setStatusObject(status) {
        current.currentStatusKind = status.type;
      },
      render() {
        rendered += 1;
      }
    }
  };
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('buildPersistenceLifecycle snapshots and restores lifecycle-managed app state', () => {
  const { buildPersistenceLifecycle } = loadLifecycleFunction();
  const harness = createHarness();
  const lifecycle = buildPersistenceLifecycle(harness.deps);

  const snapshot = lifecycle.snapshotCurrentAppState();

  harness.current.directoryHandle = { name: 'Changed Folder' };
  harness.current.dataFileHandle = { kind: 'new-handle' };
  harness.current.appReady = false;
  harness.current.isDirty = false;
  harness.current.stateNeedsWriteAfterRead = false;
  harness.current.lastWriteFailed = false;
  harness.current.pendingThemeBeforeConnection = 'dark';
  harness.current.browserLastSavedAt = '';
  harness.current.state = { projects: [], settings: { theme: 'light' } };
  harness.current.currentStatusKind = 'ok';
  harness.current.currentStatusTitle = 'New Status';
  harness.current.currentStatusParts = ['New message'];
  harness.current.currentStatusMeta = 'New meta';

  lifecycle.restoreSnapshot(snapshot);

  assert.deepEqual(toPlainJson(harness.current), {
    directoryHandle: { name: 'Current Folder' },
    dataFileHandle: { kind: 'file-handle' },
    appReady: true,
    isDirty: true,
    stateNeedsWriteAfterRead: true,
    lastWriteFailed: true,
    pendingThemeBeforeConnection: 'light',
    browserLastSavedAt: '2026-05-01T10:00:00.000Z',
    state: { projects: [{ id: 'p1' }], settings: { theme: 'dark' } },
    currentStatusKind: 'warn',
    currentStatusTitle: 'Old Status',
    currentStatusParts: ['Old message'],
    currentStatusMeta: 'Old meta'
  });
});

test('buildPersistenceLifecycle centralizes write success, failure, and migration cleanup', () => {
  const { buildPersistenceLifecycle } = loadLifecycleFunction();
  const harness = createHarness();
  const lifecycle = buildPersistenceLifecycle(harness.deps);

  lifecycle.markWriteSucceeded({
    browserLastSavedAt: '2026-05-02T12:30:00.000Z',
    clearMigrationState: true
  });

  assert.equal(harness.current.isDirty, false);
  assert.equal(harness.current.lastWriteFailed, false);
  assert.equal(harness.current.stateNeedsWriteAfterRead, false);
  assert.equal(harness.current.pendingThemeBeforeConnection, null);
  assert.equal(harness.current.browserLastSavedAt, '2026-05-02T12:30:00.000Z');

  lifecycle.markWriteFailed({
    browserMode: true,
    meta: 'Quota exceeded'
  });

  assert.equal(harness.current.lastWriteFailed, true);
  assert.equal(harness.current.currentStatusKind, 'save-failed');
  assert.equal(harness.getRenderedCount(), 1);
  assert.deepEqual(harness.recordedStatuses.at(-1), {
    type: 'save-failed',
    details: {
      browserMode: true,
      meta: 'Quota exceeded'
    }
  });
});

test('buildPersistenceLifecycle resets connection-scoped flags without touching dirty state', () => {
  const { buildPersistenceLifecycle } = loadLifecycleFunction();
  const harness = createHarness();
  const lifecycle = buildPersistenceLifecycle(harness.deps);

  lifecycle.resetConnectionState();

  assert.equal(harness.current.appReady, false);
  assert.equal(harness.current.dataFileHandle, null);
  assert.equal(harness.current.lastWriteFailed, false);
  assert.equal(harness.current.isDirty, true);
});
