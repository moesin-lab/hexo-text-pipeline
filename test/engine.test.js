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
    config: { obsidian_compiler: { converters: { wikilink: { enable: false } } } },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  plugin(ctx.hexo);
  ctx.handlers.get('before_generate')();

  // wikilink 是 before 阶段唯一的 converter，禁用后该阶段 filter 不再注册
  assert.equal(ctx.handlers.get('before_post_render'), undefined);

  const html = ctx.handlers.get('after_post_render')({
    content: '<blockquote>\n<p>[!note] T</p>\n</blockquote>'
  }).content;
  assert.ok(html.includes('data-callout="note"'));
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

test('injects converter css into head_end, unless inject_css is false', () => {
  const withCss = createHexoMock({ config: { obsidian_compiler: {} } });
  plugin(withCss.hexo);
  assert.ok(withCss.injected.some((item) => item.entry === 'head_end' && item.value.includes('.callout')));

  const noCss = createHexoMock({ config: { obsidian_compiler: { inject_css: false } } });
  plugin(noCss.hexo);
  assert.equal(noCss.injected.length, 0);
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
