'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const blockid = require('../lib/presets/obsidian/converters/blockid');

const convert = (md) => blockid.convert(md, {});

test('strips a trailing block id marker', () => {
  assert.equal(convert('Some paragraph text. ^quote-of-the-day'), 'Some paragraph text.');
});

test('strips a standalone block id line', () => {
  assert.equal(convert('paragraph\n^block1\nnext'), 'paragraph\n\nnext');
});

test('keeps literal carets that are not block ids', () => {
  assert.equal(convert('x^2 + y^2'), 'x^2 + y^2');
  assert.equal(convert('mid ^id not-at-end'), 'mid ^id not-at-end');
  assert.equal(convert('`code ^id`'), '`code ^id`');
});
