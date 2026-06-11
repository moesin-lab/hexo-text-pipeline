'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const plugin = require('../index');
const { register } = require('../lib/core/engine');
const { createHexoMock } = require('./helpers/mock-hexo');

test('does not register filters when plugin is disabled', () => {
  const ctx = createHexoMock({
    config: { obsidian_compiler: { enable: false } }
  });
  plugin(ctx.hexo);
  assert.equal(ctx.handlers.size, 0);
});

test('disabling a single converter keeps the others working', () => {
  const ctx = createHexoMock({
    config: {
      obsidian_compiler: {
        converters: { wikilink: { enable: false }, callout: { enable: true } }
      }
    },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  plugin(ctx.hexo);
  ctx.handlers.get('before_generate')();

  // wikilink 被禁用：[[...]] 原样保留，同阶段其他 converter 不受影响
  const md = ctx.handlers.get('before_post_render')({
    content: '[[Hello Hexo]] %%gone%%'
  }).content;
  assert.equal(md, '[[Hello Hexo]] ');

  const html = ctx.handlers.get('after_post_render')({
    content: '<blockquote>\n<p>[!note] T</p>\n</blockquote>'
  }).content;
  assert.ok(html.includes('data-callout="note"'));
});

test('callout is disabled by default, explicit enable overrides', () => {
  const ctx = createHexoMock({ config: { obsidian_compiler: {} } });
  plugin(ctx.hexo);

  const input = '<blockquote>\n<p>[!note] T</p>\n</blockquote>';
  const html = ctx.handlers.get('after_post_render')
    ? ctx.handlers.get('after_post_render')({ content: input }).content
    : input;
  assert.equal(html, input);
});

test('a throwing converter is skipped without breaking the stage', () => {
  const ctx = createHexoMock({ config: { obsidian_compiler: {} } });
  const boom = {
    name: 'boom',
    stage: 'after_post_render',
    convert() {
      throw new Error('boom');
    }
  };
  const upper = {
    name: 'upper',
    stage: 'after_post_render',
    convert(content) {
      return content.toUpperCase();
    }
  };

  register(ctx.hexo, [boom, upper]);
  const result = ctx.handlers.get('after_post_render')({ content: 'ok' }).content;
  assert.equal(result, 'OK');
});

test('injects converter css/js, unless inject_css / inject_js are false', () => {
  const withAssets = createHexoMock({
    config: { obsidian_compiler: { converters: { callout: { enable: true } } } }
  });
  plugin(withAssets.hexo);
  assert.ok(withAssets.injected.some((item) => item.entry === 'head_end' && item.value.includes('.callout')));
  assert.ok(withAssets.injected.some((item) => item.entry === 'body_end' && item.value.includes('mermaid')));

  const noAssets = createHexoMock({
    config: { obsidian_compiler: { inject_css: false, inject_js: false } }
  });
  plugin(noAssets.hexo);
  assert.equal(noAssets.injected.length, 0);
});

test('auto-registers when loaded with a global hexo context', () => {
  const ctx = createHexoMock({
    config: { obsidian_compiler: {} },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  const modulePath = require.resolve('../index');
  const previousGlobalHexo = globalThis.hexo;
  let loadedPlugin;

  try {
    delete require.cache[modulePath];
    globalThis.hexo = ctx.hexo;

    loadedPlugin = require('../index');
    const result = ctx.handlers.get('before_post_render')({ content: '[[Hello Hexo]]' }).content;
    assert.equal(result, '[Hello Hexo](/posts/abcd1234)');
  } finally {
    globalThis.hexo = previousGlobalHexo;
    delete require.cache[modulePath];
    require('../index');
  }

  assert.equal(typeof loadedPlugin, 'function');
});
