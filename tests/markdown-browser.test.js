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
    extractFunctionSource(script, 'createMarkdownModule') + 'const markdown = createMarkdownModule();' + extractFunctionSource(script, 'autoResizeTextarea') + extractFunctionSource(script, 'resizeRenderedNoteFields') + extractFunctionSource(script, 'taskStatusOptions') + extractFunctionSource(script, 'normalizeTaskStatus') + extractFunctionSource(script, 'normalizePriority') + extractFunctionSource(script, 'buildTaskRow') + String.raw`
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

test('Markdown renderer creates safe elements with correct numbering and code classes', { skip: !browserAvailable }, async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const harness = '<!doctype html><output id="result">NOT RUN</output><script>' +
    extractFunctionSource(script, 'createMarkdownModule') + 'const markdown = createMarkdownModule();' +
    "try {\n      const direct = document.createElement('div');\n      direct.appendChild(markdown.render(document, markdown.parse('# Heading\\n- **Item**\\n<img src=x> [link](https://example.com)\\n**Bold** \\\\*literal* snake_case_name')));\n      if (direct.querySelector('h1').textContent !== 'Heading' || direct.querySelector('li strong').textContent !== 'Item') throw Error('Incorrect block rendering');\n      const link = direct.querySelector('a');\n      if (link.href !== 'https://example.com/' || link.rel !== 'noopener noreferrer' || link.target !== '_blank') throw Error('Unsafe link');\n      if (direct.querySelector('img') || direct.querySelector('em') || !direct.textContent.includes('Bold *literal* snake_case_name')) throw Error('Incorrect literal rendering');\n      const directList = document.createElement('div');\n      directList.appendChild(markdown.render(document, markdown.parse('3. Three\\n\\n4. Four')));\n      const directLists = directList.querySelectorAll('ol');\n      if (directLists.length !== 2 || directLists[0].start !== 3 || directLists[1].start !== 4) throw Error('Incorrect direct list numbering');\n      const directFence = String.fromCharCode(96).repeat(3);\n      const directCode = document.createElement('div');\n      directCode.appendChild(markdown.render(document, markdown.parse(directFence + 'python\\nreturn \"<img>\" # note\\n' + directFence)));\n      if (directCode.querySelector('img') || directCode.querySelector('code').textContent !== 'return \"<img>\" # note' ||\n          !directCode.querySelector('.code-keyword') || !directCode.querySelector('.code-string') || !directCode.querySelector('.code-comment')) throw Error('Incorrect direct code rendering');\n      let rejected = false;\n      try { markdown.render(document, { blocks: [{ type: 'constructor' }] }); } catch (error) { rejected = true; }\n      if (!rejected) throw Error('Unknown block was accepted');\ndocument.getElementById('result').textContent = 'PASS';\n} catch (error) { document.getElementById('result').textContent = 'FAIL: ' + error.message; }" + '</' + 'script>';
  const output = await runBrowserHtml(harness);
  assert.match(output, /<output id="result">PASS<\/output>/);
});
