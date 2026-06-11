'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const plugin = require('../index');
const { createHexoMock } = require('./helpers/mock-hexo');
const { checkPluginConfig } = require('../lib/core/checker/static');
const { compileReplace, resolveConvert } = require('../lib/core/node-contract');
const { formatReport, formatDryRun } = require('../lib/core/console/pipeline');

// fixture：<站点根>/text-pipeline/<name>.js —— 默认目录名，零配置发现
function makeSite(files, dirName = 'text-pipeline') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'htp-plug-'));
  const pluginDir = path.join(root, dirName);
  fs.mkdirSync(pluginDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(pluginDir, name), content);
  }
  return { root, pluginDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// ---- 发现与挂载 ----

test('a three-line plugin file works with zero config: name from filename, slot late, guard on', () => {
  const site = makeSite({ 'arrow.js': 'module.exports = { replace: [[/-->/g, "→"]] };' });
  try {
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);

    const late = ctx.hexo._textPipeline.registry.forStage('before_post_render', 'late');
    assert.deepEqual(late.map((n) => [n.name, n.origin]), [['arrow', 'plugin:arrow.js']]);

    const input = 'a --> b\n```\nx --> y\n```\nand `c --> d` inline';
    const result = ctx.handlers.get('before_post_render')({ content: input }).content;
    assert.ok(result.includes('a → b'));
    assert.ok(result.includes('x --> y'), 'fenced code must be untouched');
    assert.ok(result.includes('`c --> d`'), 'inline code must be untouched');
  } finally {
    site.cleanup();
  }
});

test('missing dir and plugins_dir: false are both silent; a custom dir name works', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'htp-empty-'));
  try {
    const noDir = createHexoMock({ config: { text_pipeline: {} }, baseDir: empty });
    plugin(noDir.hexo);
    assert.equal(noDir.warnings.length, 0);
    assert.equal(noDir.hexo._textPipeline.registry.all().length, 0);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }

  const site = makeSite({ 'up.js': 'module.exports = { stage: "after_post_render", convert: (t) => t.toUpperCase() };' }, 'my-pipeline');
  try {
    const off = createHexoMock({
      config: { text_pipeline: { plugins_dir: false } },
      baseDir: site.root
    });
    plugin(off.hexo);
    assert.equal(off.hexo._textPipeline.registry.all().length, 0);

    const renamed = createHexoMock({
      config: { text_pipeline: { plugins_dir: 'my-pipeline' } },
      baseDir: site.root
    });
    plugin(renamed.hexo);
    assert.equal(renamed.handlers.get('after_post_render')({ content: 'hi' }).content, 'HI');
  } finally {
    site.cleanup();
  }
});

test('array exports mount every named node; an unnamed element is an error issue', () => {
  const site = makeSite({
    'multi.js': [
      'module.exports = [',
      '  { name: "ex", convert: (t) => t + "!" },',
      '  { name: "q", convert: (t) => t + "?" },',
      '  { convert: (t) => t }',
      '];'
    ].join('\n')
  });
  try {
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);

    assert.equal(ctx.handlers.get('before_post_render')({ content: 'a' }).content, 'a!?');
    assert.ok(ctx.warnings.some((w) => w.includes('multi.js') && w.includes('missing a name')));
  } finally {
    site.cleanup();
  }
});

test('underscore-prefixed helper files are skipped but requirable; files register in name order', () => {
  const site = makeSite({
    '_shared.js': 'module.exports = "S";',
    'a.js': 'const s = require("./_shared");\nmodule.exports = { convert: (t) => t + "|a" + s };',
    'b.js': 'module.exports = { convert: (t) => t + "|b" };'
  });
  try {
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);

    assert.deepEqual(
      ctx.hexo._textPipeline.registry.forStage('before_post_render', 'late').map((n) => n.name),
      ['a', 'b']
    );
    assert.equal(ctx.handlers.get('before_post_render')({ content: 'x' }).content, 'x|aS|b');
  } finally {
    site.cleanup();
  }
});

test('a broken plugin file is an error issue; strict turns it into a build failure', () => {
  const site = makeSite({ 'broken.js': 'module.exports = {' });
  try {
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);
    assert.ok(ctx.warnings.some((w) => w.includes('broken.js') && w.includes('failed to load')));

    const strict = createHexoMock({ config: { text_pipeline: { strict: true } }, baseDir: site.root });
    assert.throws(() => plugin(strict.hexo), /strict mode: config check failed/);
  } finally {
    site.cleanup();
  }
});

test('a function export is rejected with a pointer to hooks scripts', () => {
  const site = makeSite({ 'fn.js': 'module.exports = (t) => t;' });
  try {
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);
    assert.ok(ctx.warnings.some((w) => w.includes('fn.js') && w.includes('hooks script')));
  } finally {
    site.cleanup();
  }
});

// ---- replace DSL（node-contract 单元 + 全路径）----

test('compileReplace: auto-global flag, function replacements, rule validation', () => {
  const noG = compileReplace([[/x/, 'y']], false);
  assert.equal(noG.convert('x x x'), 'y y y');

  const fn = compileReplace([[/\d+/g, (m) => String(Number(m) * 2)]], false);
  assert.equal(fn.convert('3 and 4'), '6 and 8');

  assert.match(compileReplace([], false).error, /non-empty/);
  assert.match(compileReplace([['not-regex', 'y']], false).error, /must be a RegExp/);
  assert.match(compileReplace([[/x/, 42]], false).error, /string or a function/);
});

test('resolveConvert: convert/replace are mutually exclusive, one is required', () => {
  assert.match(resolveConvert({ convert: (t) => t, replace: [[/x/g, 'y']] }).error, /pick one/);
  assert.match(resolveConvert({}).error, /convert\(text, ctx\) function or a replace rule list/);
  assert.equal(typeof resolveConvert({ replace: [[/x/g, 'y']] }).convert, 'function');
});

test('replace skips the markdown guard outside before_post_render', () => {
  const site = makeSite({
    'tick.js': 'module.exports = { stage: "after_post_render", replace: [[/x/g, "y"]] };'
  });
  try {
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);
    // HTML 阶段没有 markdown guard：反引号里的 x 一样被替换
    assert.equal(ctx.handlers.get('after_post_render')({ content: 'x `x`' }).content, 'y `y`');
  } finally {
    site.cleanup();
  }
});

test('replace works on every registration path: register API and preset nodes', () => {
  const ctx = createHexoMock({ config: { text_pipeline: {} } });
  plugin(ctx.hexo);
  ctx.hexo.textPipeline.register({ name: 'dash', replace: [[/--/g, '—']] });
  assert.equal(ctx.handlers.get('before_post_render')({ content: 'a -- b' }).content, 'a — b');
  assert.throws(
    () => ctx.hexo.textPipeline.register({ name: 'both', convert: (t) => t, replace: [[/x/g, 'y']] }),
    /pick one/
  );
  assert.throws(() => ctx.hexo.textPipeline.register({ name: 'none' }), /convert\(text, ctx\) function or a replace/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'htp-preplace-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'my-preset.js'),
      'module.exports = { name: "rp", nodes: [{ name: "dots", replace: [[/\\.\\.\\./g, "…"]] }] };'
    );
    const presetCtx = createHexoMock({
      config: { text_pipeline: { presets: ['./my-preset.js'] } },
      baseDir: dir
    });
    plugin(presetCtx.hexo);
    assert.equal(presetCtx.handlers.get('before_post_render')({ content: 'wait...' }).content, 'wait…');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- 配置覆盖（plugins.<name>）----

test('config overrides: enable kills a plugin, slot/priority move it, the rest lands in ctx.config', () => {
  const site = makeSite({
    'off.js': 'module.exports = { convert: (t) => t + "|off" };',
    'probe.js': 'module.exports = { convert: (t, ctx) => t + "|" + JSON.stringify(ctx.config) };'
  });
  try {
    const ctx = createHexoMock({
      config: {
        text_pipeline: {
          plugins: {
            off: { enable: false },
            probe: { slot: 'early', priority: 3, flavor: 'mint' }
          }
        }
      },
      baseDir: site.root
    });
    plugin(ctx.hexo);

    const registry = ctx.hexo._textPipeline.registry;
    assert.equal(registry.all().some((n) => n.name === 'off'), false);
    const probe = registry.forStage('before_post_render', 'early');
    assert.deepEqual(probe.map((n) => [n.name, n.priority]), [['probe', 3]]);

    const result = ctx.handlers.get('before_post_render')({ content: 'x' }).content;
    assert.equal(result, 'x|{"slot":"early","priority":3,"flavor":"mint"}');
  } finally {
    site.cleanup();
  }
});

test('an override key that matches no plugin warns with a did-you-mean', () => {
  const site = makeSite({ 'arrow.js': 'module.exports = { replace: [[/a/g, "b"]] };' });
  try {
    const ctx = createHexoMock({
      config: { text_pipeline: { plugins: { arow: { enable: false } } } },
      baseDir: site.root
    });
    plugin(ctx.hexo);
    assert.ok(ctx.warnings.some((w) => w.includes('plugins.arow') && w.includes('did you mean "arrow"')));
  } finally {
    site.cleanup();
  }
});

test('static checker flags bad plugins_dir / plugins shapes', () => {
  const issues = checkPluginConfig({ plugins_dir: 42, plugins: ['nope'] });
  assert.ok(issues.some((i) => i.level === 'error' && i.message.includes('plugins_dir')));
  assert.ok(issues.some((i) => i.level === 'error' && i.message.includes('plugins must be a map')));
});

// ---- 热重载与兜底 ----

test('replace/match edits apply on the next render; placement stays fixed until restart', () => {
  const site = makeSite({
    'a.js': 'module.exports = { priority: 20, convert: (t) => t + "|a1" };',
    'b.js': 'module.exports = { priority: 10, convert: (t) => t + "|b" };'
  });
  try {
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);
    const handler = ctx.handlers.get('before_post_render');
    assert.equal(handler({ content: 'x' }).content, 'x|b|a1');

    // convert 热更新 + match 热生效；priority 改动不影响已固化顺序
    fs.writeFileSync(path.join(site.pluginDir, 'a.js'), 'module.exports = { priority: 1, match: "NEEDLE", convert: (t) => t + "|a2" };');
    assert.equal(handler({ content: 'x' }).content, 'x|b', 'match miss skips the node');
    assert.equal(handler({ content: 'NEEDLE' }).content, 'NEEDLE|b|a2', 'still after b: placement is fixed');
  } finally {
    site.cleanup();
  }
});

test('a node removed from an array export is isolated with a restart hint', () => {
  const site = makeSite({
    'multi.js': 'module.exports = [{ name: "keep", convert: (t) => t }, { name: "gone", convert: (t) => t + "|g" }];'
  });
  try {
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);
    const handler = ctx.handlers.get('before_post_render');
    assert.equal(handler({ content: 'x' }).content, 'x|g');

    fs.writeFileSync(path.join(site.pluginDir, 'multi.js'), 'module.exports = [{ name: "keep", convert: (t) => t }];');
    assert.equal(handler({ content: 'x' }).content, 'x', 'failure isolated, text passes through');
    assert.ok(ctx.warnings.some((w) => w.includes('restart hexo to re-discover')));
  } finally {
    site.cleanup();
  }
});

test('plugins flow through doctor: report shows the origin, dry-run traces the node', () => {
  const site = makeSite({ 'arrow.js': 'module.exports = { replace: [[/-->/g, "→"]] };' });
  try {
    fs.writeFileSync(path.join(site.root, 'sample.md'), '---\ntitle: S\n---\ngo --> there\n');
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);

    const report = formatReport(ctx.hexo._textPipeline);
    assert.ok(report.includes('arrow') && report.includes('<plugin:arrow.js>'));

    const dryRun = formatDryRun(ctx.hexo, ctx.hexo._textPipeline, 'sample.md');
    assert.ok(dryRun.includes('✓ arrow: changed'));
    assert.ok(dryRun.includes('+ go → there'));
  } finally {
    site.cleanup();
  }
});

test('plugin css/js declarations are injected like preset assets', () => {
  const site = makeSite({
    'styled.js': 'module.exports = { convert: (t) => t, css: ".styled{color:red}", js: "console.log(1)" };'
  });
  try {
    const ctx = createHexoMock({ config: { text_pipeline: {} }, baseDir: site.root });
    plugin(ctx.hexo);
    assert.ok(ctx.injected.some((i) => i.entry === 'head_end' && i.value.includes('.styled')));
    assert.ok(ctx.injected.some((i) => i.entry === 'body_end' && i.value.includes('console.log(1)')));
  } finally {
    site.cleanup();
  }
});
