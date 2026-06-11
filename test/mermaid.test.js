'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const mermaid = require('../lib/presets/obsidian/converters/mermaid');

const convert = (md, config = {}) => mermaid.convert(md, { config });

test('converts a mermaid fence into <pre class="mermaid"> with escaped content', () => {
  const input = ['```mermaid', 'graph TD', 'A --> B', '```'].join('\n');
  assert.equal(convert(input), '<pre class="mermaid">graph TD\nA --&gt; B</pre>');
});

test('keeps other fenced code blocks untouched', () => {
  const input = ['```js', 'const a = 1;', '```'].join('\n');
  assert.equal(convert(input), input);
});

test('ignores a mermaid fence nested inside an outer fence', () => {
  const input = ['````markdown', '```mermaid', 'graph TD', '```', '````'].join('\n');
  assert.equal(convert(input), input);
});

test('supports tilde fences and surrounding text', () => {
  const input = ['before', '~~~mermaid', 'pie', '"a": 1', '~~~', 'after'].join('\n');
  // hexo-util escapeHTML 连引号一起转义；textContent 还原后 mermaid 读到的仍是原文
  assert.equal(convert(input), 'before\n<pre class="mermaid">pie\n&quot;a&quot;: 1</pre>\nafter');
});

test('leaves an unclosed mermaid fence as-is', () => {
  const input = ['```mermaid', 'graph TD'].join('\n');
  assert.equal(convert(input), input);
});

test('custom class via converter config', () => {
  const input = ['```mermaid', 'graph LR', '```'].join('\n');
  assert.equal(convert(input, { class: 'diagram' }), '<pre class="diagram">graph LR</pre>');
});

test('test() matches only a mermaid fence line', () => {
  assert.equal(mermaid.test('```mermaid\ngraph\n```'), true);
  assert.equal(mermaid.test('inline `mermaid` mention'), false);
});

test('loader script respects config and inject_script: false disables it', () => {
  const js = mermaid._internal.buildLoaderScript({ theme: 'dark', script_src: 'https://example.com/m.js' });
  assert.ok(js.includes('"https://example.com/m.js"'));
  assert.ok(js.includes('"dark"'));
  assert.equal(mermaid._internal.buildLoaderScript({ inject_script: false }), '');
});
