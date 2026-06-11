'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const embed = require('../lib/presets/obsidian/converters/embed');

function makeIndex(posts = []) {
  const byTitle = new Map();
  for (const post of posts) {
    byTitle.set(post.title.toLowerCase(), post);
  }
  return { byTitle, bySlug: new Map(), bySourcePath: new Map(), bySourceBase: new Map() };
}

const replacerWith = (posts, assetPrefix = '') =>
  embed._internal.createEmbedReplacer(makeIndex(posts), '', assetPrefix);

test('image embed becomes a markdown image', () => {
  const replace = replacerWith([]);
  assert.equal(replace('![[photo.png]]'), '![photo.png](photo.png)');
  assert.equal(replace('![[dir/photo.jpg|My alt]]'), '![My alt](dir/photo.jpg)');
});

test('numeric param becomes an <img> with width (Obsidian resize syntax)', () => {
  const replace = replacerWith([]);
  assert.equal(replace('![[photo.png|300]]'), '<img src="photo.png" width="300">');
});

test('asset_prefix is prepended to image src', () => {
  const replace = replacerWith([], '/images');
  assert.equal(replace('![[photo.png]]'), '![photo.png](/images/photo.png)');
});

test('note embed degrades to a link when the post resolves', () => {
  const replace = replacerWith([{ title: 'My Note', abbrlink: 'abc123' }]);
  assert.equal(replace('![[My Note]]'), '[My Note](/posts/abc123)');
  assert.equal(replace('![[My Note|see this]]'), '[see this](/posts/abc123)');
});

test('unresolvable non-image embeds stay untouched', () => {
  const replace = replacerWith([]);
  assert.equal(replace('![[Missing Note]]'), '![[Missing Note]]');
  assert.equal(replace('![[file.pdf]]'), '![[file.pdf]]');
});

test('image src is URI-encoded', () => {
  const replace = replacerWith([]);
  assert.equal(replace('![[my photo.png]]'), '![my photo.png](my%20photo.png)');
});
