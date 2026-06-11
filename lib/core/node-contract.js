'use strict';

const { STAGES } = require('./stages');
const guard = require('./markdown-guard');

const DEFAULT_PRIORITY = 10;
const DEFAULT_STAGE = 'before_post_render';

/**
 * slot 默认值的唯一出处（按注册路径的角色分）：
 * - preset node 默认 early——多数变换需要原始文本（围栏代码块还没被 hexo 吞掉）；
 * - config hook、单文件插件（plugin 目录）与 textPipeline.register 默认 late——
 *   用户/第三方想看到该 stage 的最终文本。
 * 任何路径都可以用 slot 字段显式覆盖。
 */
const SLOT_DEFAULTS = { preset: 'early', hook: 'late', plugin: 'late', api: 'late' };

/**
 * 放置字段（stage / slot / priority / match）的唯一归一化与校验入口。
 * 三条注册路径——preset 加载、config hooks、hexo.textPipeline.register——
 * 都经过这里：默认值和校验规则只此一份，不会再因入口不同而行为分裂。
 *
 * raw 取 { stage?, slot?, priority?, match? }；match（字符串或 RegExp）编译成
 * test(text) 廉价预判——它只是 test 的声明式写法，两者是同一个概念。
 * 返回 { placement: { stage, slot, priority, test? } } 或 { error }。
 */
function resolvePlacement(raw, role) {
  if (!SLOT_DEFAULTS[role]) {
    throw new TypeError('resolvePlacement: unknown role "' + role + '"');
  }

  const stage = raw.stage === undefined ? DEFAULT_STAGE : raw.stage;
  if (!STAGES[stage]) {
    return { error: 'unknown stage "' + stage + '" (valid: ' + Object.keys(STAGES).join(', ') + ')' };
  }

  const slot = raw.slot === undefined ? SLOT_DEFAULTS[role] : raw.slot;
  if (slot !== 'early' && slot !== 'late') {
    return { error: 'invalid slot "' + raw.slot + '" (use early or late)' };
  }

  if (raw.priority !== undefined && !Number.isFinite(raw.priority)) {
    return { error: 'priority must be a number, got ' + JSON.stringify(raw.priority) };
  }
  const priority = raw.priority === undefined ? DEFAULT_PRIORITY : raw.priority;

  const placement = { stage, slot, priority };
  if (raw.match !== undefined) {
    let regex;
    try {
      regex = raw.match instanceof RegExp ? raw.match : new RegExp(raw.match);
    } catch (err) {
      return { error: 'invalid match regex: ' + (err && err.message) };
    }
    placement.test = (text) => regex.test(text);
  }

  return { placement };
}

/**
 * replace DSL → convert 编译。规则形如 [[RegExp, string|fn], ...]：
 * - pattern 必须是 RegExp（DSL 活在 JS 文件里，正则字面量零成本；不收字符串，
 *   省掉转义/标志的歧义面）；缺 g 标志自动补全——"replace 列表"的声明式语义
 *   就是全文替换，只换第一个属于 corner case，请写 convert。
 * - useGuard 时整组规则套 markdown-guard（跳过围栏+行内代码）。
 */
function compileReplace(rules, useGuard) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return { error: 'replace must be a non-empty array of [RegExp, replacement] pairs' };
  }

  const compiled = [];
  for (const [index, rule] of rules.entries()) {
    if (!Array.isArray(rule) || rule.length !== 2) {
      return { error: 'replace[' + index + '] must be a [RegExp, replacement] pair' };
    }
    const [pattern, replacement] = rule;
    if (!(pattern instanceof RegExp)) {
      return { error: 'replace[' + index + '] pattern must be a RegExp literal (got ' + typeof pattern + ')' };
    }
    if (typeof replacement !== 'string' && typeof replacement !== 'function') {
      return { error: 'replace[' + index + '] replacement must be a string or a function' };
    }
    const global = pattern.flags.includes('g') ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
    compiled.push([global, replacement]);
  }

  const applyAll = (segment) => {
    let current = segment;
    for (const [pattern, replacement] of compiled) {
      current = current.replace(pattern, replacement);
    }
    return current;
  };

  if (useGuard) {
    return { convert: (text) => guard.replaceOutsideCode(text, applyAll) };
  }
  return { convert: (text) => applyAll(text) };
}

/**
 * convert 的唯一裁决入口：convert 与 replace 恰有其一——replace 是 convert 的
 * 声明式写法（如同 match 之于 test），所有注册路径同一套规则。
 * node 落在 before_post_render（输入是 markdown）时，replace 编译出的 convert
 * 自动套 markdown-guard 防误伤代码；需要碰代码块就写 convert。
 * 返回 { convert } 或 { error }。
 */
function resolveConvert(node) {
  const hasConvert = typeof node.convert === 'function';
  const hasReplace = node.replace !== undefined;
  if (hasConvert && hasReplace) {
    return { error: 'sets both convert and replace; pick one' };
  }
  if (hasConvert) {
    return { convert: node.convert };
  }
  if (hasReplace) {
    const stage = node.stage === undefined ? DEFAULT_STAGE : node.stage;
    return compileReplace(node.replace, stage === 'before_post_render');
  }
  return { error: 'needs a convert(text, ctx) function or a replace rule list' };
}

module.exports = {
  resolvePlacement,
  compileReplace,
  resolveConvert,
  DEFAULT_PRIORITY,
  DEFAULT_STAGE,
  SLOT_DEFAULTS
};
