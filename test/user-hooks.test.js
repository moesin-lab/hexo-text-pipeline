'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { register } = require('../lib/core/engine');
const { createHookConverters } = require('../lib/core/user-hooks');
const { createHexoMock } = require('./helpers/mock-hexo');
const registry = require('../lib/converters/registry');

// 用 node -e 保证跨平台：stdin 进，stdout 出
const upperCommand = 'node -e "let d=\'\';process.stdin.on(\'data\',c=>d+=c).on(\'end\',()=>process.stdout.write(d.toUpperCase()))"';

test('a configured hook transforms content via stdin/stdout', () => {
  const ctx = createHexoMock({
    config: {
      obsidian_compiler: {
        hooks: [{ command: upperCommand, stage: 'after_post_render', name: 'upper' }]
      }
    }
  });

  register(ctx.hexo, []);
  const result = ctx.handlers.get('after_post_render')({ content: 'hello' }).content;
  assert.equal(result, 'HELLO');
});

test('hook receives post context through HOC_* env vars', () => {
  const envCommand = 'node -e "process.stdout.write(process.env.HOC_STAGE+\'|\'+process.env.HOC_POST_TITLE)"';
  const ctx = createHexoMock({
    config: { obsidian_compiler: { hooks: [{ command: envCommand }] } }
  });

  register(ctx.hexo, []);
  const result = ctx.handlers.get('before_post_render')({ content: 'x', title: 'My Post' }).content;
  assert.equal(result, 'before_post_render|My Post');
});

test('a failing hook is skipped and the original content survives', () => {
  const ctx = createHexoMock({
    config: {
      obsidian_compiler: {
        hooks: [{ command: 'node -e "process.exit(1)"', name: 'boom' }]
      }
    }
  });

  register(ctx.hexo, []);
  const result = ctx.handlers.get('before_post_render')({ content: 'keep me' }).content;
  assert.equal(result, 'keep me');
});

test('hooks run after built-in converters within the same stage', () => {
  const ctx = createHexoMock({
    config: { obsidian_compiler: { hooks: [{ command: upperCommand }] } }
  });
  const builtIn = {
    name: 'exclaim',
    stage: 'before_post_render',
    convert(content) {
      return content + '!';
    }
  };

  register(ctx.hexo, [builtIn]);
  const result = ctx.handlers.get('before_post_render')({ content: 'hi' }).content;
  assert.equal(result, 'HI!');
});

test('invalid hook entries are collected, valid and disabled ones handled', () => {
  const { converters, invalid } = createHookConverters([
    { command: 'cat' },
    { command: 'cat', enable: false },
    { stage: 'before_post_render' },
    { command: 'cat', stage: 'nonsense' },
    { command: 'cat', script: 'x.js' },
    'not-an-object'
  ]);

  assert.equal(converters.length, 1);
  assert.equal(converters[0].name, 'hook:hook-0');
  assert.equal(invalid.length, 4);
  assert.ok(invalid[0].includes('missing a command or script'));
  assert.ok(invalid[1].includes('unknown stage'));
  assert.ok(invalid[2].includes('pick one'));
});

test('a script hook runs in-process and reloads on change (即改即用)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hoc-hook-'));
  const scriptPath = path.join(dir, 'transform.js');

  try {
    fs.writeFileSync(scriptPath, 'module.exports = (text, ctx) => text + "|v1:" + ctx.stage;');
    const ctx = createHexoMock({
      config: { obsidian_compiler: { hooks: [{ script: 'transform.js' }] } }
    });
    ctx.hexo.base_dir = dir;

    register(ctx.hexo, []);
    const handler = ctx.handlers.get('before_post_render');
    assert.equal(handler({ content: 'a' }).content, 'a|v1:before_post_render');

    // 改完脚本不重启，下一次渲染立即生效
    fs.writeFileSync(scriptPath, 'module.exports = (text) => text + "|v2";');
    assert.equal(handler({ content: 'a' }).content, 'a|v2');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a hook can take over the full page via after_render:html', () => {
  const ctx = createHexoMock({
    config: {
      obsidian_compiler: {
        hooks: [{ command: upperCommand, stage: 'after_render:html' }]
      }
    }
  });

  register(ctx.hexo, []);
  const handler = ctx.handlers.get('after_render:html');
  assert.equal(handler('<html>hi</html>', { path: 'index.html' }), '<HTML>HI</HTML>');
});

test('a converter targeting an unknown stage is skipped with a warning', () => {
  const warnings = [];
  const ctx = createHexoMock({ config: { obsidian_compiler: {} } });
  ctx.hexo.log.warn = (msg) => warnings.push(msg);

  register(ctx.hexo, [{ name: 'lost', stage: 'no_such_stage', convert: (s) => s }]);
  assert.equal(ctx.handlers.get('no_such_stage'), undefined);
  assert.ok(warnings.some((msg) => msg.includes('unknown stage "no_such_stage"')));
});

test('full pipeline: built-in registry plus a hook', () => {
  const ctx = createHexoMock({
    config: {
      obsidian_compiler: {
        hooks: [{ command: upperCommand, stage: 'before_post_render' }]
      }
    }
  });

  register(ctx.hexo, registry);
  const result = ctx.handlers.get('before_post_render')({ content: 'a %%hidden%% b' }).content;
  assert.equal(result, 'A  B');
});
