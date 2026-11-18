const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { extractFunctionSource } = require('./helpers/app-source');
const { runBrowserHtml, browserAvailable } = require('./helpers/browser');

test('Markdown preview treats HTML as text and adjusts to changing content in a browser', { skip: !browserAvailable }, async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const harness = '<!doctype html><style>' + css + '</style><main id="tasks"></main><output id="result">NOT RUN</output><script>' +
    extractFunctionSource(script, 'autoResizeTextarea') + extractFunctionSource(script, 'resizeRenderedNoteFields') + extractFunctionSource(script, 'taskStatusOptions') + extractFunctionSource(script, 'normalizeTaskStatus') + extractFunctionSource(script, 'normalizePriority') + extractFunctionSource(script, 'buildTaskRow') + String.raw`
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
      const fence = String.fromCharCode(96).repeat(3);
      const codeCases = [
        ['python', 'def test():\n    return "<img src=x>" # note', 'def'],
        ['py', 'return 1', 'return'],
        ['bash', 'if true; then\n  echo "hi" # note\nfi', 'if'],
        ['sh', 'for x in a; do echo x; done', 'for'],
        ['shell', 'while true; do break; done', 'while'],
        ['c', 'int main() { return 0; }', 'int'],
        ['cpp', 'class Example { public: int value; };', 'class'],
        ['c++', 'const int value = 1;', 'const'],
        ['powershell', 'if ($x) { return "hi" }', ''],
        ['ps1', 'if ($x) { return "hi" }', ''],
        ['constructor', 'return 1', ''],
        ['', 'return 1', '']
      ];
      for (const [language, code, keyword] of codeCases) {
        const raw = fence + language + '\n' + code + '\n' + fence;
        const codeRow = buildTaskRow({ ...options, task: { ...options.task, title: raw } });
        const block = codeRow.querySelector('.markdown-preview pre code');
        if (!block || block.textContent !== code || block.querySelector('img')) throw Error('Incorrect code block: ' + language);
        if (codeRow.querySelector('textarea.inline-title-input').value !== raw) throw Error('Code source changed: ' + language);
        const highlighted = block.querySelector('.code-keyword');
        if (keyword ? !highlighted || highlighted.textContent !== keyword : block.querySelector('.code-keyword, .code-string, .code-comment')) {
          throw Error('Incorrect highlighting: ' + language);
        }
      }
      const unfinished = buildTaskRow({ ...options, task: { ...options.task, title: fence + 'python\nreturn 1' } });
      if (unfinished.querySelector('.markdown-preview pre code').textContent !== 'return 1') throw Error('Unclosed code block lost text');
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
  const output = await runBrowserHtml(harness);
  assert.equal(output.match(/<output id="result">([^<]*)<\/output>/)?.[1], 'PASS');
});
