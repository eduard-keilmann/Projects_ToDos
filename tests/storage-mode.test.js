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

function loadStorageModeFunctions() {
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

  const functionNames = [
    'buildFileStorageMode',
    'buildBrowserStorageMode',
    'buildUnsupportedStorageMode',
    'buildStorageMode'
  ];

  const source = functionNames.map(name => extractFunctionSource(script, name)).join('\n\n');
  vm.runInNewContext(
    `${source}\n\nmodule.exports = { buildStorageMode };`,
    context
  );
  return context.module.exports;
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test('buildStorageMode returns file mode capabilities and labels', () => {
  const { buildStorageMode } = loadStorageModeFunctions();

  assert.deepEqual(toPlainJson(buildStorageMode('file')), {
    id: 'file',
    isSupported: true,
    usesBrowserStorage: false,
    supportsFolderConnection: true,
    supportsRememberedDirectory: true,
    supportsReload: true,
    supportsLiveFile: true,
    supportsBackupMetadata: false,
    initialStatusType: 'initial-file-mode',
    appStorageHint: 'Data is stored in a JSON file.',
    storageCardHeading: 'Storage Location',
    showStorageActionRow: true,
    storageFootnote: 'Every change is written to the file automatically once the folder is connected.',
    exportButtonLabel: 'Export Backup',
    extrasFootnote: 'Note: "Delete Everything" also clears the connected JSON file. Use export first if you want a backup.'
  });
});

test('buildStorageMode returns browser mode capabilities and labels', () => {
  const { buildStorageMode } = loadStorageModeFunctions();

  assert.deepEqual(toPlainJson(buildStorageMode('browser')), {
    id: 'browser',
    isSupported: true,
    usesBrowserStorage: true,
    supportsFolderConnection: false,
    supportsRememberedDirectory: false,
    supportsReload: false,
    supportsLiveFile: false,
    supportsBackupMetadata: true,
    initialStatusType: 'initial-browser-storage',
    appStorageHint: 'Changes are autosaved in this browser. Download JSON backups when needed.',
    storageCardHeading: 'Storage Mode',
    showStorageActionRow: false,
    storageFootnote: 'Changes are autosaved in this browser. Download a JSON backup whenever you want a file copy.',
    exportButtonLabel: 'Download Backup',
    extrasFootnote: 'Note: "Delete Everything" clears the browser-saved data for this app. Download a backup first if you need one.'
  });
});

test('buildStorageMode returns unsupported mode capabilities and labels', () => {
  const { buildStorageMode } = loadStorageModeFunctions();

  assert.deepEqual(toPlainJson(buildStorageMode('unsupported')), {
    id: 'unsupported',
    isSupported: false,
    usesBrowserStorage: false,
    supportsFolderConnection: false,
    supportsRememberedDirectory: false,
    supportsReload: false,
    supportsLiveFile: false,
    supportsBackupMetadata: false,
    initialStatusType: 'initial-unsupported-browser',
    appStorageHint: 'This browser is outside the supported storage modes for this app.',
    storageCardHeading: 'Browser Support',
    showStorageActionRow: false,
    storageFootnote: 'Use current Chrome or Opera for direct file mode, or Safari for browser-storage mode.',
    exportButtonLabel: 'Export Backup',
    extrasFootnote: 'This app does not enable local data editing in unsupported browsers.'
  });
});

test('buildStorageMode rejects unknown mode ids', () => {
  const { buildStorageMode } = loadStorageModeFunctions();

  assert.throws(() => buildStorageMode('legacy'), /Unknown storage mode/);
});
