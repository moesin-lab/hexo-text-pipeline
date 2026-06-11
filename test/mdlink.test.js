'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const plugin = require('../index');
const { createHexoMock } = require('./helpers/mock-hexo');

const ENCODED_MD_HREF =
  '../%E7%BB%8F%E9%AA%8C/%E8%AE%B0%E4%B8%80%E6%AC%A1%E4%B8%AA%E4%BA%BA%E5%8D%9A%E5%AE%A2%E7%9A%84%E5%AE%89%E8%A3%85%E9%85%8D%E7%BD%AE(Obsidian%20+%20Hexo%20+%20Github%20Page).md';

function setupHexo(source) {
  const ctx = createHexoMock({
    config: { obsidian_compiler: {} },
    posts: [
      {
        title: '记一次个人博客安装配置',
        slug: 'blog-setup',
        source,
        abbrlink: '44007'
      }
    ]
  });

  plugin(ctx.hexo);
  ctx.handlers.get('before_generate')();
  return ctx;
}

test('rewrites rendered html href that still points to markdown files', () => {
  const ctx = setupHexo('_posts/经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md');

  const result = ctx.handlers.get('after_post_render')({
    content: '<p><a href="' + ENCODED_MD_HREF + '">x</a></p>'
  }).content;

  assert.equal(result, '<p><a href="/posts/44007">x</a></p>');
});

test('matches when post.source includes source/_posts prefix', () => {
  const ctx = setupHexo('source/_posts/经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md');

  const result = ctx.handlers.get('after_post_render')({
    content: '<p><a href="' + ENCODED_MD_HREF + '">x</a></p>'
  }).content;

  assert.equal(result, '<p><a href="/posts/44007">x</a></p>');
});

test('rewrites markdown-style links that survive into after_post_render', () => {
  const ctx = setupHexo('_posts/经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md');

  const result = ctx.handlers.get('after_post_render')({
    content: '[记一次个人博客的安装配置(Obsidian + Hexo + Github Page)](' + ENCODED_MD_HREF + ')'
  }).content;

  assert.equal(result, '[记一次个人博客的安装配置(Obsidian + Hexo + Github Page)](/posts/44007)');
});

test('leaves external and unresolvable .md links untouched', () => {
  const ctx = setupHexo('_posts/经验/foo.md');

  const input = '<p><a href="https://example.com/other.md">ext</a> <a href="missing.md">miss</a></p>';
  const result = ctx.handlers.get('after_post_render')({ content: input }).content;

  assert.equal(result, input);
});
