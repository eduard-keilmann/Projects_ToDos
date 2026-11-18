const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runBrowserHtml, browserAvailable } = require('./helpers/browser');

for (const cancel of [false, true]) test(cancel
  ? 'interaction during loading cancels scroll restoration'
  : 'reload restores the scroll position after asynchronous loading', { skip: !browserAvailable }, async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
  const scenario = String.raw`
    const loadTestContent = async () => {
      if (${cancel}) window.dispatchEvent(new Event('wheel'));
      await new Promise(resolve => setTimeout(resolve, 100));
      const spacer = document.createElement('div');
      spacer.style.height = '4000px';
      document.body.appendChild(spacer);
      appReady = true;
    };
    initBrowserStorageMode = loadTestContent;
    tryRestoreRememberedDirectory = loadTestContent;
    (async () => {
      await init();
      const result = document.createElement('output');
      result.id = 'reload-scroll-result';
      result.textContent = Math.abs(window.scrollY - ${cancel ? 0 : 1500}) < 2 ? 'PASS' : 'FAIL: ' + window.scrollY;
      document.body.appendChild(result);
    })().catch(error => {
      const result = document.createElement('output');
      result.id = 'reload-scroll-result';
      result.textContent = 'ERROR: ' + error.message;
      document.body.appendChild(result);
    });
  `;
  const setup = `<script>sessionStorage.setItem('project-todo-tool-scroll', '{"x":0,"y":1500}');
    performance.getEntriesByType = () => [{type: 'reload'}];
    window.requestAnimationFrame = callback => setTimeout(callback, 0);</script>`;
  const html = source.replace(/<script>\s*const DATA_FILE_NAME/, setup + '\n<script>\n    const DATA_FILE_NAME')
    .replace(/    init\(\);\s*<\/script>/, scenario + '\n  </script>');
  assert.ok(html !== source, 'Could not install the browser scenario');
  const output = await runBrowserHtml(html);
  assert.equal(output.match(/<output id="reload-scroll-result">([^<]*)<\/output>/)?.[1], 'PASS');
});
