const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { extractFunctionSource } = require('./helpers/app-source');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'project_todo_tool.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const markdown = vm.runInNewContext('(' + extractFunctionSource(script, 'createMarkdownModule') + ')()');

test('parser recognizes supported structures without activating ordinary text', () => {
  for (const text of ['plain text', 'snake_case_name', '2 * 3 * 4', '# ', '- ', '\\*literal*']) {
    assert.equal(markdown.parse(text).hasMarkdown, false, text);
  }
  for (const text of ['# Heading', '**bold**', '1. item', '`code`']) {
    assert.equal(markdown.parse(text).hasMarkdown, true, text);
  }
});

test('parser preserves inline literals, lists and fences', () => {
  const parsed = markdown.parse('# Heading\n\n3. **Three**\n\n4. [Four](https://example.com)\n\n' + String.fromCharCode(96) + 'a\\\\b *literal*' + String.fromCharCode(96));
  assert.equal(parsed.blocks[0].level, 1);
  assert.equal(parsed.blocks[2].start, 3);
  assert.equal(parsed.blocks[4].start, 4);
  assert.equal(parsed.blocks[4].items[0].find(node => node.type === 'link').href, 'https://example.com');
  assert.equal(parsed.blocks[6].inline.find(node => node.type === 'code').text, 'a\\\\b *literal*');

  const fence = String.fromCharCode(96).repeat(4);
  const text = '  return "<img>"\n\n' + String.fromCharCode(96).repeat(3) + '\n# comment';
  const block = markdown.parse(fence + 'py\n' + text + '\n' + fence).blocks[0];
  assert.equal(block.segments.map(segment => segment.text).join(''), text);
  assert.ok(block.segments.some(segment => segment.type === 'keyword' && segment.text === 'return'));
  for (const language of ['', 'powershell', 'ps1', 'unknown', 'constructor']) {
    const plain = markdown.parse(fence + language + '\nreturn "hello"').blocks[0];
    assert.equal(plain.segments.map(segment => segment.text).join(''), 'return "hello"');
    assert.ok(plain.segments.every(segment => segment.type === 'text'), language);
  }
});

test('lists, inline escapes and fence boundaries retain their structure and text', () => {
  const parsed = markdown.parse('- one\n+ two\nparagraph\n> quoted\n## subheading\n**Bold** \\*literal* snake_case_name');
  assert.equal(parsed.blocks[0].type, 'ul');
  assert.equal(parsed.blocks[0].items.length, 2);
  assert.equal(parsed.blocks[1].type, 'paragraph');
  assert.equal(parsed.blocks[2].type, 'quote');
  assert.equal(parsed.blocks[3].level, 2);
  assert.equal(parsed.blocks[4].inline.map(node => node.text).join(''), 'Bold *literal* snake_case_name');
  assert.ok(!parsed.blocks[4].inline.some(node => node.type === 'em'));

  const fence = String.fromCharCode(96).repeat(3);
  const empty = markdown.parse(fence + '\n' + fence);
  assert.equal(empty.hasMarkdown, true);
  assert.equal(empty.blocks[0].segments.map(segment => segment.text).join(''), '');
  for (const [alias, keyword] of [
    ['python', 'def'], ['py', 'def'], ['bash', 'if'], ['sh', 'if'], ['shell', 'if'],
    ['c', 'int'], ['cpp', 'int'], ['c++', 'int']
  ]) {
    const block = markdown.parse(fence + alias + '\n' + keyword + '\n' + fence).blocks[0];
    assert.ok(block.segments.some(segment => segment.type === 'keyword' && segment.text === keyword), alias);
  }
});
