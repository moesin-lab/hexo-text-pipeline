'use strict';

const fs = require('node:fs');
const { STAGES } = require('../stages');

const KNOWN_TOP_KEYS = ['enable', 'debug', 'strict', 'inject_css', 'inject_js', 'presets', 'hooks', 'plugins', 'plugins_dir', 'tap'];
const KNOWN_TAP_KEYS = ['enable', 'match', 'dir'];
const KNOWN_HOOK_KEYS = ['command', 'script', 'stage', 'slot', 'priority', 'name', 'timeout', 'enable', 'match'];

function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prev = Array.from({ length: cols }, (_, j) => j);

  for (let i = 1; i < rows; i += 1) {
    const current = [i];
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(Math.min(prev[j] + 1, current[j - 1] + 1, prev[j - 1] + cost));
    }
    prev = current;
  }
  return prev[cols - 1];
}

function suggest(key, candidates) {
  const lower = key.toLowerCase();
  let best = null;
  let bestDistance = 3; // 编辑距离 <= 2 才算像

  for (const candidate of candidates) {
    const distance = editDistance(lower, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best ? ' (did you mean "' + best + '"?)' : '';
}

/**
 * 注册期静态检查（兜底第一道防线）：在任何文章被处理之前发现配置问题。
 * 返回 issue 列表 { level: 'error' | 'warn', message }；
 * strict 模式下 error 级会让构建失败，否则全部降为日志告警。
 */
function checkPluginConfig(rawConfig) {
  const issues = [];
  if (!rawConfig || typeof rawConfig !== 'object') return issues;

  for (const key of Object.keys(rawConfig)) {
    if (!KNOWN_TOP_KEYS.includes(key)) {
      issues.push({
        level: 'warn',
        message: 'unknown config key "text_pipeline.' + key + '"' + suggest(key, KNOWN_TOP_KEYS)
      });
    }
  }
  if ('presets' in rawConfig && !Array.isArray(rawConfig.presets)) {
    issues.push({ level: 'error', message: 'text_pipeline.presets must be a list' });
  }
  if ('hooks' in rawConfig && !Array.isArray(rawConfig.hooks)) {
    issues.push({ level: 'error', message: 'text_pipeline.hooks must be a list' });
  }
  if ('plugins_dir' in rawConfig && rawConfig.plugins_dir !== false && typeof rawConfig.plugins_dir !== 'string') {
    issues.push({ level: 'error', message: 'text_pipeline.plugins_dir must be a directory name string or false' });
  }
  if (
    'plugins' in rawConfig &&
    (!rawConfig.plugins || typeof rawConfig.plugins !== 'object' || Array.isArray(rawConfig.plugins))
  ) {
    issues.push({ level: 'error', message: 'text_pipeline.plugins must be a map of <plugin name> -> overrides' });
  } else if (rawConfig.plugins && typeof rawConfig.plugins === 'object') {
    for (const [name, sub] of Object.entries(rawConfig.plugins)) {
      if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
        // `arrow: false` 之类的写法意图明显但会被静默忽略——指条明路
        issues.push({
          level: 'warn',
          message: 'text_pipeline.plugins.' + name + ' must be an object (to disable a plugin use { enable: false })'
        });
      }
    }
  }
  for (const [index, entry] of (Array.isArray(rawConfig.hooks) ? rawConfig.hooks : []).entries()) {
    if (!entry || typeof entry !== 'object') continue;
    for (const key of Object.keys(entry)) {
      if (!KNOWN_HOOK_KEYS.includes(key)) {
        issues.push({
          level: 'warn',
          message: 'unknown key "' + key + '" in hooks[' + index + ']' + suggest(key, KNOWN_HOOK_KEYS)
        });
      }
    }
  }
  if (rawConfig.tap && typeof rawConfig.tap === 'object') {
    for (const key of Object.keys(rawConfig.tap)) {
      if (!KNOWN_TAP_KEYS.includes(key)) {
        issues.push({
          level: 'warn',
          message: 'unknown key "' + key + '" in text_pipeline.tap' + suggest(key, KNOWN_TAP_KEYS)
        });
      }
    }
  }
  return issues;
}

/**
 * node 级检查：stage 合法性、重名、priority 类型、script 文件可达性（advisory：
 * 文件可以等会儿再创建——即改即用，所以只 warn 不拦截）、同 stage 同 priority 的顺序歧义提示。
 */
function checkNodes(nodes) {
  const issues = [];
  const seen = new Map();

  for (const node of nodes) {
    if (!STAGES[node.stage]) {
      issues.push({
        level: 'error',
        message: '"' + node.name + '" targets unknown stage "' + node.stage + '" (valid: ' + Object.keys(STAGES).join(', ') + ')'
      });
    }
    if (seen.has(node.name)) {
      issues.push({
        level: 'warn',
        message: 'duplicate node name "' + node.name + '" — both will run; rename one to tell them apart in logs'
      });
    }
    seen.set(node.name, node);

    if (node.priority !== undefined && !Number.isFinite(node.priority)) {
      issues.push({ level: 'error', message: '"' + node.name + '" has a non-numeric priority' });
    }
    if (node.slot !== undefined && node.slot !== 'early' && node.slot !== 'late') {
      issues.push({ level: 'error', message: '"' + node.name + '" has invalid slot "' + node.slot + '" (use early or late)' });
    }
    if (node.scriptPath && !fs.existsSync(node.scriptPath)) {
      issues.push({
        level: 'warn',
        message: '"' + node.name + '" script not found yet: ' + node.scriptPath + ' (will be retried on each render)'
      });
    }
  }

  // 顺序歧义提示：不同来源（不同 preset / hook）的 node 落在同 stage 同 priority 时，
  // 相对顺序只由注册顺序决定——提示用户用 priority 显式表达意图。
  // 同一来源内部共享 priority 是常态（preset 自己声明的顺序），不提示。
  const byStagePriority = new Map();
  for (const node of nodes) {
    const key = node.stage + '.' + (node.slot || 'early') + '@' + (Number.isFinite(node.priority) ? node.priority : 10);
    if (!byStagePriority.has(key)) byStagePriority.set(key, []);
    byStagePriority.get(key).push(node);
  }
  for (const [key, group] of byStagePriority) {
    const origins = new Set(group.map((node) => node.origin || 'unknown'));
    if (origins.size > 1) {
      // info 级：这是常见且行为良定义的情况（preset 先于 hook），只在 doctor 报告里展示，
      // 不在构建日志刷 warn——否则最普通的配置都会告警，用户会学会无视警告
      issues.push({
        level: 'info',
        message: 'nodes from different sources share priority at ' + key + ' (' + group.map((n) => n.name).join(' → ') + '); order follows registration — set explicit priorities to pin it'
      });
    }
  }

  return issues;
}

module.exports = { checkPluginConfig, checkNodes, suggest };
