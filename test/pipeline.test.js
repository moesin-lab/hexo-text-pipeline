'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const plugin = require('../index');
const { createHexoMock } = require('./helpers/mock-hexo');
const { checkPluginConfig, checkNodes } = require('../lib/core/checker/static');
const { createRuntimeGuard, FAILURE_TRIP_THRESHOLD } = require('../lib/core/checker/runtime');
const { formatReport } = require('../lib/core/console/pipeline');

// 用 node -e 保证跨平台：stdin 进，stdout 出
const upperCommand = 'node -e "let d=\'\';process.stdin.on(\'data\',c=>d+=c).on(\'end\',()=>process.stdout.write(d.toUpperCase()))"';

function silentLog() {
  return { warn() {}, debug() {} };
}

// ---- hooks：command / script ----

test('a command hook transforms content via stdin/stdout', () => {
  const ctx = createHexoMock({
    config: {
      text_pipeline: { hooks: [{ command: upperCommand, stage: 'after_post_render', name: 'upper' }] }
    }
  });

  plugin(ctx.hexo);
  const result = ctx.handlers.get('after_post_render')({ content: 'hello' }).content;
  assert.equal(result, 'HELLO');
});

test('command hook receives post context through HTP_* env vars', () => {
  const envCommand = 'node -e "process.stdout.write(process.env.HTP_STAGE+\'|\'+process.env.HTP_POST_TITLE)"';
  const ctx = createHexoMock({
    config: { text_pipeline: { hooks: [{ command: envCommand }] } }
  });

  plugin(ctx.hexo);
  const result = ctx.handlers.get('before_post_render')({ content: 'x', title: 'My Post' }).content;
  assert.equal(result, 'before_post_render|My Post');
});

test('a script hook runs in-process and reloads on change (edit-and-use)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htp-hook-'));
  const scriptPath = path.join(dir, 'transform.js');

  try {
    fs.writeFileSync(scriptPath, 'module.exports = (text, ctx) => text + "|v1:" + ctx.stage;');
    const ctx = createHexoMock({
      config: { text_pipeline: { hooks: [{ script: 'transform.js' }] } },
      baseDir: dir
    });

    plugin(ctx.hexo);
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
    config: { text_pipeline: { hooks: [{ command: upperCommand, stage: 'after_render:html' }] } }
  });

  plugin(ctx.hexo);
  const handler = ctx.handlers.get('after_render:html');
  assert.equal(handler('<html>hi</html>', { path: 'index.html' }), '<HTML>HI</HTML>');
});

// ---- 执行顺序：priority ----

test('priority decides order across presets and hooks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htp-prio-'));
  try {
    fs.writeFileSync(path.join(dir, 'first.js'), 'module.exports = (t) => t + "|first";');
    fs.writeFileSync(path.join(dir, 'last.js'), 'module.exports = (t) => t + "|last";');

    const ctx = createHexoMock({
      config: {
        text_pipeline: {
          hooks: [
            { script: 'last.js', name: 'last', priority: 30 },
            { script: 'first.js', name: 'first', priority: 1 }
          ]
        }
      },
      baseDir: dir
    });

    plugin(ctx.hexo);
    const result = ctx.handlers.get('before_post_render')({ content: 'x' }).content;
    assert.equal(result, 'x|first|last');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- 程序化 API ----

test('hexo.textPipeline.register adds a node at runtime', () => {
  const ctx = createHexoMock({ config: { text_pipeline: {} } });
  plugin(ctx.hexo);

  ctx.hexo.textPipeline.register({
    name: 'exclaim',
    stage: 'before_post_render',
    convert(text) {
      return text + '!';
    }
  });

  const result = ctx.handlers.get('before_post_render')({ content: 'hi' }).content;
  assert.equal(result, 'hi!');

  assert.throws(() => ctx.hexo.textPipeline.register({ name: 'bad', stage: 'nope', convert: (t) => t }), /unknown stage/);
  assert.equal(typeof ctx.hexo.textPipeline.utils.replaceOutsideCode, 'function');
});

// ---- checker：静态 ----

test('static checker flags unknown config keys with suggestions', () => {
  const issues = checkPluginConfig({ enabel: true, hooks: [{ command: 'cat', stagee: 'x' }] });
  assert.ok(issues.some((i) => i.message.includes('text_pipeline.enabel') && i.message.includes('enable')));
  assert.ok(issues.some((i) => i.message.includes('"stagee"') && i.message.includes('stage')));
});

test('static checker flags duplicate names, bad stage and missing script', () => {
  const issues = checkNodes([
    { name: 'a', stage: 'before_post_render', origin: 'hook:script', scriptPath: '/nonexistent/x.js' },
    { name: 'a', stage: 'before_post_render', origin: 'hook:command' },
    { name: 'b', stage: 'no_such_stage', origin: 'api' }
  ]);
  assert.ok(issues.some((i) => i.message.includes('duplicate node name "a"')));
  assert.ok(issues.some((i) => i.level === 'error' && i.message.includes('unknown stage "no_such_stage"')));
  assert.ok(issues.some((i) => i.message.includes('script not found yet')));
});

test('invalid hook entries are warned and skipped, valid ones still run', () => {
  const ctx = createHexoMock({
    config: {
      text_pipeline: {
        hooks: [
          { stage: 'before_post_render' },
          { command: 'cat', script: 'x.js' },
          { command: upperCommand, name: 'ok' }
        ]
      }
    }
  });

  plugin(ctx.hexo);
  assert.ok(ctx.warnings.some((w) => w.includes('missing a command or script')));
  assert.ok(ctx.warnings.some((w) => w.includes('pick one')));
  assert.equal(ctx.handlers.get('before_post_render')({ content: 'hi' }).content, 'HI');
});

test('strict mode turns config errors into a build failure', () => {
  const ctx = createHexoMock({
    config: { text_pipeline: { strict: true, hooks: [{ stage: 'before_post_render' }] } }
  });
  assert.throws(() => plugin(ctx.hexo), /strict mode: config check failed/);
});

// ---- checker：运行期 ----

test('runtime guard skips a failing node and keeps the original text', () => {
  const guard = createRuntimeGuard({});
  const node = {
    name: 'boom',
    convert() {
      throw new Error('boom');
    }
  };
  const out = guard.run(node, 'keep me', { stage: 's', log: silentLog() });
  assert.equal(out, 'keep me');
});

test('runtime guard trips the circuit breaker after consecutive failures', () => {
  const guard = createRuntimeGuard({});
  const node = {
    name: 'boom',
    convert() {
      throw new Error('boom');
    }
  };
  const ctx = { stage: 's', log: silentLog() };
  for (let i = 0; i < FAILURE_TRIP_THRESHOLD; i += 1) {
    guard.run(node, 'x', ctx);
  }
  assert.equal(guard.isTripped(node), true);
  // 熔断后直接放行原文，不再调用 convert
  assert.equal(guard.run(node, 'y', ctx), 'y');
});

test('runtime guard warns on suspicious output but accepts it', () => {
  const warnings = [];
  const log = { warn: (m) => warnings.push(m), debug() {} };
  const guard = createRuntimeGuard({});

  const empty = guard.run({ name: 'wipe', convert: () => '' }, 'non-empty', { stage: 's', log });
  assert.equal(empty, '');
  assert.ok(warnings.some((w) => w.includes('empty output')));
});

test('runtime guard rethrows in strict mode', () => {
  const guard = createRuntimeGuard({ strict: true });
  const node = {
    name: 'boom',
    convert() {
      throw new Error('boom');
    }
  };
  assert.throws(() => guard.run(node, 'x', { stage: 's', log: silentLog() }), /\[boom\] boom/);
});

test('shared priority across sources is info-level: visible in doctor, no build warning', () => {
  const ctx = createHexoMock({
    config: {
      text_pipeline: { presets: ['obsidian'], hooks: [{ command: upperCommand, name: 'upper' }] }
    }
  });
  plugin(ctx.hexo);

  assert.ok(!ctx.warnings.some((w) => w.includes('share priority')));
  assert.ok(ctx.hexo._textPipeline.issues.some((i) => i.level === 'info' && i.message.includes('share priority')));
});

// ---- doctor ----

test('hexo pipeline command reports node order and check results', () => {
  const ctx = createHexoMock({
    config: {
      text_pipeline: {
        presets: ['obsidian'],
        hooks: [{ command: upperCommand, name: 'upper', priority: 20 }],
        typo_key: 1
      }
    }
  });
  plugin(ctx.hexo);

  assert.ok(ctx.consoleCommands.has('pipeline'));
  const report = formatReport(ctx.hexo._textPipeline);

  assert.ok(report.includes('before_post_render'));
  assert.ok(report.indexOf('obsidian:comment') < report.indexOf('hook:upper'));
  assert.ok(report.includes('[20] hook:upper'));
  assert.ok(report.includes('WARN') && report.includes('typo_key'));
});
