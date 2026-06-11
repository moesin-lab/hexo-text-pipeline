'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const highlight = require('../lib/presets/obsidian/converters/highlight');

const convert = (md) => highlight.convert(md, {});

test('converts ==text== to <mark>', () => {
  assert.equal(convert('this is ==important== text'), 'this is <mark>important</mark> text');
});

test('multiple highlights on one line', () => {
  assert.equal(convert('==a== and ==b=='), '<mark>a</mark> and <mark>b</mark>');
});

test('does not match empty, multi-line, or in-code highlights', () => {
  assert.equal(convert('==== nothing'), '==== nothing');
  assert.equal(convert('==spans\nlines=='), '==spans\nlines==');
  assert.equal(convert('`==literal==`'), '`==literal==`');
  const fenced = '```\n==literal==\n```';
  assert.equal(convert(fenced), fenced);
});
