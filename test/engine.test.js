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

test('per-node css file replaces the default styles', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-css-'));
  fs.writeFileSync(path.join(baseDir, 'custom.css'), '.callout{--callout-color:1,2,3}');

  const replaced = createHexoMock({
    baseDir,
    config: {
      text_pipeline: {
        presets: [{ name: 'obsidian', config: { callout: { enable: true, css: './custom.css' } } }]
      }
    }
  });
  plugin(replaced.hexo);
  const styles = replaced.injected.filter((item) => item.entry === 'head_end' && item.value.includes('.callout'));
  assert.equal(styles.length, 1);
  assert.ok(styles[0].value.includes('1,2,3')); // 只剩用户样式
  assert.ok(!styles[0].value.includes('68,138,255')); // 默认色板被替换

  const missing = createHexoMock({
    baseDir,
    config: {
      text_pipeline: {
        presets: [{ name: 'obsidian', config: { callout: { enable: true, css: './nope.css' } } }]
      }
    }
  });
  plugin(missing.hexo); // 不抛
  assert.ok(missing.warnings.some((message) => message.includes('css file not readable')));

  fs.rmSync(baseDir, { recursive: true, force: true });
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
