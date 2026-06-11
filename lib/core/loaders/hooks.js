'use strict';

const { STAGES } = require('../stages');
const { DEFAULT_PRIORITY } = require('../api');
const { createCommandNode } = require('./command');
const { createScriptNode } = require('./script');

/**
 * 解析配置里的 hooks 数组（用户随时插入的自定义脚本），两种形态：
 *
 * text_pipeline:
 *   hooks:
 *     - command: python scripts/furigana.py   # 外部命令（stdin → stdout）
 *       stage: before_post_render             # 可选，默认 before_post_render
 *       priority: 20                          # 可选，默认 10，小者先跑
 *       name: furigana                        # 可选，日志标识
 *       timeout: 10000                        # 可选，毫秒（仅 command）
 *     - script: scripts/toc.js                # 本地 JS：module.exports = (text, ctx) => text
 *       match: '\\[\\[toc\\]\\]'              # 可选：正则预判，文本不命中就跳过（command 可省一次 spawn）
 *       slot: late                            # 可选：默认 late（在 hexo 内置/其他插件之后，
 *                                             #   看到最终文本）；slot: early 抢到它们之前
 *
 * 非法条目收集为 issue（warn 或 strict 下报错），不中断其他条目。
 */
function normalizeHookEntry(raw, index) {
  if (!raw || typeof raw !== 'object') {
    return { error: 'hooks[' + index + '] must be an object with a command or script field' };
  }
  if (raw.enable === false) {
    return null;
  }

  const command = typeof raw.command === 'string' ? raw.command.trim() : '';
  const script = typeof raw.script === 'string' ? raw.script.trim() : '';
  if (!command && !script) {
    return { error: 'hooks[' + index + '] is missing a command or script' };
  }
  if (command && script) {
    return { error: 'hooks[' + index + '] sets both command and script; pick one' };
  }

  const stage = raw.stage || 'before_post_render';
  if (!STAGES[stage]) {
    return {
      error: 'hooks[' + index + '] has unknown stage "' + stage + '" (valid: ' + Object.keys(STAGES).join(', ') + ')'
    };
  }

  const slot = raw.slot === undefined ? 'late' : raw.slot;
  if (slot !== 'early' && slot !== 'late') {
    return { error: 'hooks[' + index + '] has invalid slot "' + raw.slot + '" (use early or late)' };
  }

  let match;
  if (raw.match !== undefined) {
    try {
      match = new RegExp(raw.match);
    } catch (err) {
      return { error: 'hooks[' + index + '] has an invalid match regex: ' + (err && err.message) };
    }
  }

  return {
    hook: {
      name: typeof raw.name === 'string' && raw.name ? raw.name : 'hook-' + index,
      stage,
      slot,
      command,
      script,
      match,
      priority: Number.isFinite(raw.priority) ? raw.priority : DEFAULT_PRIORITY,
      timeout: Number.isFinite(raw.timeout) && raw.timeout > 0 ? raw.timeout : undefined
    }
  };
}

function loadHooks(rawHooks, baseDir) {
  const nodes = [];
  const issues = [];

  (rawHooks || []).forEach((raw, index) => {
    const parsed = normalizeHookEntry(raw, index);
    if (!parsed) return;
    if (parsed.error) {
      issues.push({ level: 'error', message: parsed.error });
      return;
    }
    const node = parsed.hook.command ? createCommandNode(parsed.hook) : createScriptNode(parsed.hook, baseDir);
    if (parsed.hook.match) {
      const regex = parsed.hook.match;
      node.test = (text) => regex.test(text);
    }
    nodes.push(node);
  });

  return { nodes, issues };
}

module.exports = { loadHooks, _internal: { normalizeHookEntry } };
