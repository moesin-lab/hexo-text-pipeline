'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const comment = require('../lib/presets/obsidian/converters/comment');

const convert = (md) => comment.convert(md, {});

test('strips an inline comment', () => {
  assert.equal(convert('before %%hidden%% after'), 'before  after');
});

test('strips multiple inline comments on one line', () => {
  assert.equal(convert('a %%x%% b %%y%% c'), 'a  b  c');
});

test('strips a multi-line comment and joins the remnants', () => {
  const input = ['before %%comment starts', 'middle line', 'ends%% after'].join('\n');
  assert.equal(convert(input), 'before  after');
});

test('a fully commented line leaves no blank line behind', () => {
  const input = ['line one', '%%whole line comment%%', 'line two'].join('\n');
  assert.equal(convert(input), 'line one\nline two');
});

test('a multi-line block comment leaves no blank lines behind', () => {
  const input = ['line one', '%%', 'note to self', '%%', 'line two'].join('\n');
  assert.equal(convert(input), 'line one\nline two');
});

test('keeps %% inside fenced code blocks', () => {
  const input = ['```', 'value %% literal %%', '```'].join('\n');
  assert.equal(convert(input), input);
});

test('keeps %% inside inline code', () => {
  const input = 'use `%%` to comment';
  assert.equal(convert(input), input);
});

test('unclosed comment hides everything to the end of file', () => {
  const input = ['visible %%unclosed', 'gone', 'all gone'].join('\n');
  assert.equal(convert(input), 'visible ');
});

test('comment can hide a wiki link so later converters never see it', () => {
  assert.equal(convert('keep %%[[Secret Note]]%% this'), 'keep  this');
});

test('test() is a cheap predicate on %%', () => {
  assert.equal(comment.test('no markers here'), false);
  assert.equal(comment.test('has %% marker'), true);
});
