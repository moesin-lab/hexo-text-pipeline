'use strict';

const { STAGES } = require('./stages');

const DEFAULT_PRIORITY = 10;
const DEFAULT_STAGE = 'before_post_render';

/**
 * slot 默认值的唯一出处（按注册路径的角色分）：
 * - preset node 默认 early——多数变换需要原始文本（围栏代码块还没被 hexo 吞掉）；
 * - config hook 与 textPipeline.register 默认 late——用户/第三方想看到该 stage 的最终文本。
 * 任何路径都可以用 slot 字段显式覆盖。
 */
const SLOT_DEFAULTS = { preset: 'early', hook: 'late', api: 'late' };

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

module.exports = { resolvePlacement, DEFAULT_PRIORITY, DEFAULT_STAGE, SLOT_DEFAULTS };
