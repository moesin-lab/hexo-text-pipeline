'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const callout = require('../lib/converters/callout');
const { parseCalloutInner } = require('../lib/converters/callout/parse');

const convert = (html) => callout.convert(html, {});

test('converts diary callout rendered with breaks: true (<br>)', () => {
  const input = [
    '<blockquote>',
    '<p>[!diary] 2026-05-30 星期六<br><code>W22</code> · <code>D150/365</code> · <code>年度 41.1%</code></p>',
    '</blockquote>'
  ].join('\n');

  assert.equal(
    convert(input),
    '<div class="callout callout-diary" data-callout="diary">' +
      '<div class="callout-title">2026-05-30 星期六</div>' +
      '<div class="callout-content"><p><code>W22</code> · <code>D150/365</code> · <code>年度 41.1%</code></p></div>' +
      '</div>'
  );
});

test('converts callout rendered with breaks: false (newline in paragraph)', () => {
  const input = '<blockquote>\n<p>[!note] Title\nbody line</p>\n</blockquote>';

  assert.equal(
    convert(input),
    '<div class="callout callout-note" data-callout="note">' +
      '<div class="callout-title">Title</div>' +
      '<div class="callout-content"><p>body line</p></div>' +
      '</div>'
  );
});

test('title-only first paragraph keeps following paragraphs as content', () => {
  const input = '<blockquote>\n<p>[!info] Heads up</p>\n<p>first</p>\n<p>second</p>\n</blockquote>';

  assert.equal(
    convert(input),
    '<div class="callout callout-info" data-callout="info">' +
      '<div class="callout-title">Heads up</div>' +
      '<div class="callout-content"><p>first</p>\n<p>second</p></div>' +
      '</div>'
  );
});

test('missing title falls back to capitalized type and empty body omits content block', () => {
  const input = '<blockquote>\n<p>[!warning]</p>\n</blockquote>';

  assert.equal(
    convert(input),
    '<div class="callout callout-warning" data-callout="warning">' +
      '<div class="callout-title">Warning</div>' +
      '</div>'
  );
});

test('foldable callouts render as details, with open attribute for +', () => {
  const closed = convert('<blockquote>\n<p>[!tip]- Hidden tip<br>body</p>\n</blockquote>');
  assert.equal(
    closed,
    '<details class="callout callout-tip" data-callout="tip">' +
      '<summary class="callout-title">Hidden tip</summary>' +
      '<div class="callout-content"><p>body</p></div>' +
      '</details>'
  );

  const open = convert('<blockquote>\n<p>[!tip]+ Shown tip<br>body</p>\n</blockquote>');
  assert.ok(open.startsWith('<details class="callout callout-tip" data-callout="tip" open>'));
});

test('plain blockquotes stay untouched', () => {
  const input = '<blockquote>\n<p>just a quote</p>\n</blockquote>';
  assert.equal(convert(input), input);
});

test('nested callout inside callout body is converted recursively', () => {
  const input = [
    '<blockquote>',
    '<p>[!note] Outer</p>',
    '<blockquote>',
    '<p>[!tip] Inner<br>inner body</p>',
    '</blockquote>',
    '</blockquote>'
  ].join('\n');

  const output = convert(input);
  assert.ok(output.includes('data-callout="note"'));
  assert.ok(output.includes('data-callout="tip"'));
  assert.ok(output.includes('<div class="callout-title">Inner</div>'));
  assert.ok(!output.includes('<blockquote'));
});

test('callout nested in a plain blockquote is converted, quote preserved', () => {
  const input = [
    '<blockquote>',
    '<p>plain quote</p>',
    '<blockquote>',
    '<p>[!note] Inner<br>body</p>',
    '</blockquote>',
    '</blockquote>'
  ].join('\n');

  const output = convert(input);
  assert.ok(output.startsWith('<blockquote>'));
  assert.ok(output.includes('data-callout="note"'));
});

test('type casing is normalized and uppercase markers are recognized', () => {
  const output = convert('<blockquote>\n<p>[!NOTE] Title</p>\n</blockquote>');
  assert.ok(output.includes('data-callout="note"'));
});

test('literal [!note] text inside rendered code blocks is not touched', () => {
  const input = '<pre><code>&gt; [!note] not a callout\n</code></pre>';
  assert.equal(callout.test(input), false);
  assert.equal(convert(input), input);
});

test('parseCalloutInner returns null for non-callout content', () => {
  assert.equal(parseCalloutInner('<p>regular paragraph</p>'), null);
  assert.equal(parseCalloutInner('<p>[!] missing type</p>'), null);
});
