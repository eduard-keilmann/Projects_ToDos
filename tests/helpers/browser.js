const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const browser = process.env.MARKDOWN_TEST_BROWSER;
async function runBrowserHtml(html) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-browser-test-'));
  try {
    const file = path.join(dir, 'test.html');
    fs.writeFileSync(file, html);
    return await new Promise((resolve, reject) => {
      const child = spawn(browser, ['--headless', '--disable-gpu', '--no-first-run',
        '--no-default-browser-check', '--disable-background-networking', '--virtual-time-budget=2000',
        '--user-data-dir=' + path.join(dir, 'profile'), '--dump-dom', pathToFileURL(file).href],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let output = '';
      let errors = '';
      let settled = false;
      const timer = setTimeout(() => finish(new Error('Browser DOM output timed out')), 30000);
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.stdout.destroy();
        child.stderr.destroy();
        child.kill();
        child.unref();
        if (error) reject(error);
        else resolve(output);
      }
      child.stdout.on('data', chunk => {
        output += chunk.toString();
        // dump-dom has completed its job even if background browser shutdown stalls.
        if (/<\/html>\s*$/i.test(output)) finish();
      });
      child.stderr.on('data', chunk => { errors += chunk.toString(); });
      child.on('error', error => finish(new Error('Could not start browser', { cause: error })));
      child.on('close', code => {
        if (/<\/html>\s*$/i.test(output)) finish();
        else finish(new Error('Browser exited without a complete DOM (' + code + '): ' + errors));
      });
    });
  } finally {
    try {
      await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      if (error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;
      // Some browser child processes briefly retain profile files after shutdown.
      process.emitWarning('Temporary browser profile remains locked: ' + dir);
    }
  }
}
module.exports = { runBrowserHtml, browserAvailable: Boolean(browser && fs.existsSync(browser)) };
