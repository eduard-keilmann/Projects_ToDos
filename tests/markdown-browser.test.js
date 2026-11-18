const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const browser = process.env.MARKDOWN_TEST_BROWSER;

test('Markdown preview treats HTML as text and adjusts to changing content in a browser', { skip: !browser || !fs.existsSync(browser) }, () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  function source(name) {
    const start = script.indexOf('function ' + name + '(');
    const end = script.indexOf('\n    function ', start + 1);
    if (start < 0 || end < 0) throw new Error('Missing function ' + name);
    return script.slice(start, end);
  }
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const harness = '<!doctype html><style>' + css + '</style><main id="tasks"></main><output id="result">NOT RUN</output><script>' +
    source('autoResizeTextarea') + source('resizeRenderedNoteFields') + source('buildTaskRow') + String.raw`
    const options = {
      document, task: { id: 'test', title: '**Safe** <img src=x onerror="window.injected=true">', notes: '', priority: 'medium', done: false, dueDate: '', createdAt: '2026-01-01T00:00:00Z' },
      editable: true, taskReorderEnabled: false, taskIndex: 0, taskCount: 1,
      autoResizeTextarea, clearDragIndicators() {}, formatDate: value => value,
      normalizeDateTime: value => value, relativeInfo: () => '', normalizeDateOnly: value => value,
      getDraggedTaskId: () => null, setDraggedTaskId() {}
    };
    try {
      const row = buildTaskRow(options);
      document.getElementById('tasks').appendChild(row);
      resizeRenderedNoteFields();
      const preview = row.querySelector('.markdown-preview');
      const input = row.querySelector('textarea.inline-title-input');
      const checkbox = row.querySelector('.markdown-checkbox');
      if (preview.querySelector('img') || !preview.textContent.includes('<img src=x') || window.injected) throw Error('HTML was interpreted');
      if (preview.style.height) throw Error('Preview has a fixed height');
      const selection = document.getSelection();
      const range = document.createRange();
      range.selectNodeContents(preview.querySelector('strong'));
      selection.removeAllRanges();
      selection.addRange(range);
      preview.click();
      if (selection.toString() !== 'Safe' || preview.classList.contains('hidden')) throw Error('Selection was lost');
      selection.removeAllRanges();
      preview.click();
      if (input.classList.contains('hidden') || document.activeElement !== input) throw Error('Click did not open the editor');
      input.value = '**Long**\n' + Array(12).fill('Another line').join('\n');
      input.dispatchEvent(new Event('input'));
      input.blur();
      if (preview.scrollHeight > preview.clientHeight + 1) throw Error('Preview is clipped');
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change'));
      if (input.scrollHeight > input.clientHeight + 1) throw Error('Editor is clipped: ' + input.scrollHeight + '/' + input.clientHeight + ' height ' + input.style.height);
      const numberedRow = buildTaskRow({
        ...options,
        task: { ...options.task, id: 'numbered', title: 'Es fehlen Schritte:\n\n1. **Erster.** Text\n\n2. **Zweiter.** Text\n\n3. **Dritter.** Text\n\n4. **Vierter.** Text\n\n5. **Fünfter.** Text' }
      });
      document.body.appendChild(numberedRow);
      const numberedLists = [...numberedRow.querySelectorAll('.markdown-preview ol')];
      if (numberedLists.length !== 5 || numberedLists.some((list, index) => list.start !== index + 1 || list.children.length !== 1)) {
        throw Error('List numbering is incorrect');
      }
      const spacer = document.createElement('div');
      spacer.style.height = '1200px';
      document.body.appendChild(spacer);
      const longRow = buildTaskRow({ ...options, task: { ...options.task, id: 'long', title: '**Long task**\n' + Array(100).fill('A long line').join('\n') } });
      document.body.appendChild(longRow);
      const bottomSpacer = document.createElement('div');
      bottomSpacer.style.height = '1200px';
      document.body.appendChild(bottomSpacer);
      window.scrollTo(0, longRow.getBoundingClientRect().top + window.scrollY + 400);
      const previousScroll = window.scrollY;
      longRow.querySelector('.markdown-preview').click();
      const longInput = longRow.querySelector('textarea.inline-title-input');
      if (document.activeElement !== longInput) throw Error('Editor did not retain focus');
      if (Math.abs(window.scrollY - previousScroll) > 2) throw Error('Viewport moved: ' + previousScroll + ' to ' + window.scrollY);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (document.activeElement !== longInput) {
          document.getElementById('result').textContent = 'FAIL: Focus changed after layout';
        } else if (Math.abs(window.scrollY - previousScroll) > 2) {
          document.getElementById('result').textContent = 'FAIL: Viewport moved after layout';
        } else {
          document.getElementById('result').textContent = 'PASS';
        }
      }));
    } catch (error) {
      document.getElementById('result').textContent = 'FAIL: ' + error.message;
    }
  ` + '</script>';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-markdown-test-'));
  try {
    const file = path.join(dir, 'test.html');
    fs.writeFileSync(file, harness);
    const output = execFileSync(browser, ['--headless', '--disable-gpu', '--virtual-time-budget=1000', '--user-data-dir=' + path.join(dir, 'profile'), '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(output.match(/<output id="result">([^<]*)<\/output>/)?.[1], 'PASS');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
