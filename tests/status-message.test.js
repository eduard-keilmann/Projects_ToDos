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

function loadStatusFunctions() {
  const htmlPath = path.join(__dirname, '..', 'project_todo_tool.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    throw new Error('Could not find app script block');
  }

  const script = scriptMatch[1];
  const context = {
    DATA_FILE_NAME: 'project-todos.json',
    Date,
    Intl,
    module: { exports: {} }
  };

  const functionNames = [
    'fileStatusMessage',
    'normalizeStoredTimestamp',
    'formatDateTime',
    'buildBrowserStorageMetaText',
    'buildStorageStatus'
  ];

  const source = functionNames.map(name => extractFunctionSource(script, name)).join('\n\n');
  vm.runInNewContext(
    `${source}\n\nmodule.exports = { buildBrowserStorageMetaText, buildStorageStatus };`,
    context
  );
  return context.module.exports;
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('buildStorageStatus returns correct initial statuses for unsupported, browser, and file modes', () => {
  const { buildStorageStatus } = loadStatusFunctions();

  assert.deepEqual(toPlainJson(buildStorageStatus('initial-unsupported-browser')), {
    kind: 'err',
    title: 'Browser Not Supported',
    textParts: ['This app supports direct file mode in current Chrome or Opera, and browser-storage mode in Safari.'],
    meta: 'Please use current Chrome, Opera, or Safari.'
  });

  assert.deepEqual(toPlainJson(buildStorageStatus('initial-browser-storage')), {
    kind: 'warn',
    title: 'Browser Storage Mode',
    textParts: ['Changes can be autosaved in this browser. Use "Download Backup" whenever you want a JSON file copy.'],
    meta: 'Browser storage has not been opened yet.'
  });

  assert.deepEqual(toPlainJson(buildStorageStatus('initial-file-mode')), {
    kind: 'warn',
    title: 'No folder connected yet',
    textParts: ['Click "Connect Folder" and choose the same folder as this HTML file.'],
    meta: 'No file connection active yet.'
  });
});

test('buildStorageStatus keeps file and browser save/failure wording in one place', () => {
  const { buildStorageStatus } = loadStatusFunctions();

  assert.deepEqual(toPlainJson(buildStorageStatus('saving', { browserMode: true, meta: 'Last saved: May 1, 2026' })), {
    kind: 'warn',
    title: 'Saving...',
    textParts: ['Updating saved data in this browser.'],
    meta: 'Last saved: May 1, 2026'
  });

  assert.deepEqual(toPlainJson(buildStorageStatus('save-failed', { browserMode: true, meta: 'Quota exceeded' })), {
    kind: 'err',
    title: 'Save Failed',
    textParts: ['Browser storage could not be updated. Editing is paused; unsaved changes remain in this tab. Download a backup before reloading the page.'],
    meta: 'Quota exceeded'
  });

  assert.deepEqual(toPlainJson(buildStorageStatus('save-failed', { browserMode: false, meta: 'Permission denied' })), {
    kind: 'err',
    title: 'Save Failed',
    textParts: ['The file could not be written. Editing is paused; unsaved changes remain in the browser.'],
    meta: 'Permission denied'
  });

  assert.deepEqual(toPlainJson(buildStorageStatus('write-migrated-state', { browserMode: false, meta: 'Folder: Work' })), {
    kind: 'warn',
    title: 'Updating File',
    textParts: ['Old or repaired data is being written as version 5 to ', { strong: 'project-todos.json' }, '.'],
    meta: 'Folder: Work'
  });
});

test('buildBrowserStorageMetaText and browser status handle backup freshness and paused backup downloads', () => {
  const { buildBrowserStorageMetaText, buildStorageStatus } = loadStatusFunctions();
  const meta = buildBrowserStorageMetaText('2026-05-02T12:30:00.000Z', '2026-05-01T08:00:00.000Z');

  assert.match(meta, /Last saved:/);
  assert.match(meta, /Last backup:/);
  assert.match(meta, /Backup out of date\./);

  assert.deepEqual(toPlainJson(buildStorageStatus('backup-downloaded', { browserStoragePaused: true, meta })), {
    kind: 'warn',
    title: 'Backup Downloaded',
    textParts: ['Current in-memory data was downloaded as a backup. Browser storage is still unavailable, so editing remains paused.'],
    meta
  });
});

test('buildStorageStatus covers access-missing, reload-failed, and import-failed cases', () => {
  const { buildStorageStatus } = loadStatusFunctions();

  assert.deepEqual(toPlainJson(buildStorageStatus('folder-access-missing', { folderName: 'Projects' })), {
    kind: 'warn',
    title: 'Folder Remembered, Access Missing',
    textParts: ['The folder "Projects" is known, but the browser needs permission again.'],
    meta: 'Click "Connect Folder". The app will first try to reauthorize the remembered folder and only open the picker if needed.'
  });

  assert.deepEqual(toPlainJson(buildStorageStatus('reload-failed', { meta: 'Read error' })), {
    kind: 'err',
    title: 'Reload Failed',
    textParts: ['The data file could not be read.'],
    meta: 'Read error'
  });

  assert.deepEqual(toPlainJson(buildStorageStatus('import-failed', { meta: 'Bad JSON' })), {
    kind: 'err',
    title: 'Import Failed',
    textParts: ['The previous state was restored. Please choose a valid JSON backup file.'],
    meta: 'Bad JSON'
  });
});
