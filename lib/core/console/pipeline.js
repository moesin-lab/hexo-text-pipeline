'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { STAGES } = require('../stages');

const DIFF_MAX_LINES = 40;
const DIFF_DP_LIMIT = 2000;

/**
 * `hexo pipeline` 诊断命令（兜底第三道防线）：上线前把整条管线摊开看。
 *
 * 默认：打印每个 stage 的 node 执行顺序（priority + 来源）和全部静态检查结果。
 * --dry-run <file>：读样例 markdown 文件，剥 frontmatter 后逐 node 跑
 * before_post_render 链，打印每个 node 改了什么（行级 diff）——
 * 两个 node 语义上互相打架时，在这里直接看见。
 */
function formatReport(state) {
  const lines = [];
  lines.push('text-pipeline');
  lines.push('');

  for (const stageName of Object.keys(STAGES)) {
    const slots = [
      ['early', state.registry.forStage(stageName, 'early')],
      ['late', state.registry.forStage(stageName, 'late')]
    ];
    if (!slots[0][1].length && !slots[1][1].length) continue;

    lines.push(stageName + '  (' + STAGES[stageName].description + ')');
    for (const [slot, nodes] of slots) {
      if (!nodes.length) continue;
      lines.push('  ' + slot + (slot === 'late' ? '  (after hexo internals & other plugins)' : '  (before hexo internals & other plugins)'));
      nodes.forEach((node, index) => {
        const priority = Number.isFinite(node.priority) ? node.priority : 10;
        lines.push('    ' + (index + 1) + '. [' + priority + '] ' + node.name + '  <' + (node.origin || 'unknown') + '>');
      });
    }
    lines.push('');
  }
  if (lines.length === 2) {
    lines.push('(no nodes registered on any stage)');
    lines.push('');
  }

  if (state.issues.length) {
    lines.push('checks:');
    for (const issue of state.issues) {
      lines.push('  ' + issue.level.toUpperCase() + ': ' + issue.message);
    }
  } else {
    lines.push('checks: all clear');
  }

  return lines.join('\n');
}

function stripFrontMatter(text) {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? text.slice(match[0].length) : text;
}

/** 行级 LCS diff，超大文件退化为只报行数变化。返回展示行数组。 */
function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');

  if (a.length > DIFF_DP_LIMIT || b.length > DIFF_DP_LIMIT) {
    return ['  (file too large for a diff: ' + a.length + ' -> ' + b.length + ' lines)'];
  }

  // 标准 LCS DP
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  let truncated = false;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push('  - ' + a[i]);
      i += 1;
    } else {
      out.push('  + ' + b[j]);
      j += 1;
    }
    if (out.length >= DIFF_MAX_LINES) {
      truncated = true;
      break;
    }
  }
  if (!truncated) {
    while (i < a.length && out.length < DIFF_MAX_LINES) out.push('  - ' + a[i++]);
    while (j < b.length && out.length < DIFF_MAX_LINES) out.push('  + ' + b[j++]);
    if (i < a.length || j < b.length) truncated = true;
  }
  if (truncated) out.push('  … (diff truncated at ' + DIFF_MAX_LINES + ' lines)');
  return out;
}

function formatDryRun(hexo, state, filePath) {
  const resolved = path.resolve(hexo.base_dir || process.cwd(), filePath);
  const raw = fs.readFileSync(resolved, 'utf8');
  let current = stripFrontMatter(raw);

  const lines = ['dry-run: ' + filePath + '  (stage: before_post_render)', ''];
  const post = { source: filePath, path: '', title: path.basename(filePath, path.extname(filePath)) };

  // early → late 串行；真实渲染中两者之间还有 hexo 内置 filter 和其他插件，这里不模拟
  const chain = [
    ...state.registry.forStage('before_post_render', 'early'),
    ...state.registry.forStage('before_post_render', 'late')
  ];

  for (const node of chain) {
    const warnings = [];
    // 与 engine 的 ctx 构建保持一致：config / presetConfig 仅 node 自带时出现
    const ctx = {
      hexo,
      post,
      stage: 'before_post_render',
      pluginConfig: state.pluginConfig,
      utils: hexo.textPipeline && hexo.textPipeline.utils,
      log: { warn: (m) => warnings.push(m), debug() {} }
    };
    if (node.config !== undefined) ctx.config = node.config;
    if (node.presetConfig !== undefined) ctx.presetConfig = node.presetConfig;

    if (typeof node.test === 'function' && !node.test(current)) {
      lines.push('· ' + node.name + ': skipped (test)');
      continue;
    }

    let output;
    try {
      output = node.convert(current, ctx);
      if (typeof output !== 'string') {
        throw new Error('returned ' + typeof output + ' instead of a string');
      }
    } catch (err) {
      lines.push('✗ ' + node.name + ': FAILED — ' + (err && err.message) + ' (text passed through unchanged)');
      continue;
    }

    for (const warning of warnings) {
      lines.push('! ' + node.name + ': ' + warning);
    }

    if (output === current) {
      lines.push('· ' + node.name + ': no change');
    } else {
      lines.push('✓ ' + node.name + ': changed (' + current.length + ' -> ' + output.length + ' chars)');
      lines.push(...lineDiff(current, output));
      current = output;
    }
  }

  lines.push('');
  lines.push('note: only before_post_render runs in a dry-run; later stages need rendered HTML.');
  lines.push('note: hexo internal filters and other plugins (which run between the early and late slots) are not simulated.');
  return lines.join('\n');
}

function registerDoctorCommand(hexo) {
  if (!hexo.extend.console || typeof hexo.extend.console.register !== 'function') {
    return;
  }
  hexo.extend.console.register(
    'pipeline',
    'Inspect the text pipeline: node order, check results; --dry-run <file> traces a sample file node by node',
    {
      options: [{ name: '--dry-run <file>', desc: 'run the before_post_render chain on a markdown file and show each node\'s diff' }]
    },
    function pipelineCommand(args) {
      const state = this._textPipeline;
      if (!state) {
        console.log('text-pipeline is disabled (text_pipeline.enable: false) or not registered');
        return;
      }

      const dryRunTarget = args && (args['dry-run'] || args.d);
      if (typeof dryRunTarget === 'string' && dryRunTarget) {
        // 文章索引等 preset 服务依赖数据库，先 load 再跑
        const ready = typeof this.load === 'function' ? this.load() : Promise.resolve();
        return ready.then(() => {
          console.log(formatDryRun(this, state, dryRunTarget));
        });
      }

      console.log(formatReport(state));
    }
  );
}

module.exports = { registerDoctorCommand, formatReport, formatDryRun, _internal: { lineDiff, stripFrontMatter } };
