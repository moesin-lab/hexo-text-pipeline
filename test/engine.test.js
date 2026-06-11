'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const plugin = require('../index');
const { createHexoMock } = require('./helpers/mock-hexo');

test('does not register filters when plugin is disabled', () => {
  const ctx = createHexoMock({
    config: { text_pipeline: { enable: false } }
  });
  plugin(ctx.hexo);
  assert.equal(ctx.handlers.size, 0);
  assert.equal(ctx.hexo.textPipeline, undefined);
});

test('obsidian preset works end to end, callout off by default', () => {
  const ctx = createHexoMock({
    config: { text_pipeline: { presets: ['obsidian'] } },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  plugin(ctx.hexo);
  ctx.handlers.get('before_generate')();

  const md = ctx.handlers.get('before_post_render')({
    content: '[[Hello Hexo]] %%gone%%'
  }).content;
  assert.equal(md, '[Hello Hexo](/posts/abcd1234) ');

  // callout 默认关闭：HTML 原样
  const input = '<blockquote>\n<p>[!note] T</p>\n</blockquote>';
  assert.equal(ctx.handlers.get('after_post_render')({ content: input }).content, input);
});

test('per-node disable and enable via preset config', () => {
  const ctx = createHexoMock({
    config: {
      text_pipeline: {
        presets: [
          {
            name: 'obsidian',
            config: { wikilink: { enable: false }, callout: { enable: true } }
          }
        ]
      }
    },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  plugin(ctx.hexo);
  ctx.handlers.get('before_generate')();

  const md = ctx.handlers.get('before_post_render')({
    content: '[[Hello Hexo]] %%gone%%'
  }).content;
  assert.equal(md, '[[Hello Hexo]] ');

  const html = ctx.handlers.get('after_post_render')({
    content: '<blockquote>\n<p>[!note] T</p>\n</blockquote>'
  }).content;
  assert.ok(html.includes('data-callout="note"'));
});

test('injects preset css/js, unless inject_css / inject_js are false', () => {
  const withAssets = createHexoMock({
    config: {
      text_pipeline: { presets: [{ name: 'obsidian', config: { callout: { enable: true } } }] }
    }
  });
  plugin(withAssets.hexo);
  assert.ok(withAssets.injected.some((item) => item.entry === 'head_end' && item.value.includes('.callout')));
  assert.ok(withAssets.injected.some((item) => item.entry === 'body_end' && item.value.includes('mermaid')));

  const noAssets = createHexoMock({
    config: { text_pipeline: { presets: ['obsidian'], inject_css: false, inject_js: false } }
  });
  plugin(noAssets.hexo);
  assert.equal(noAssets.injected.length, 0);
});

test('auto-registers when loaded with a global hexo context', () => {
  const ctx = createHexoMock({
    config: { text_pipeline: { presets: ['obsidian'] } },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  const modulePath = require.resolve('../index');
  const previousGlobalHexo = globalThis.hexo;
  let loadedPlugin;

  try {
    delete require.cache[modulePath];
    globalThis.hexo = ctx.hexo;

    loadedPlugin = require('../index');
    ctx.handlers.get('before_generate')();
    const result = ctx.handlers.get('before_post_render')({ content: '[[Hello Hexo]]' }).content;
    assert.equal(result, '[Hello Hexo](/posts/abcd1234)');
  } finally {
    globalThis.hexo = previousGlobalHexo;
    delete require.cache[modulePath];
    require('../index');
  }

  assert.equal(typeof loadedPlugin, 'function');
});
