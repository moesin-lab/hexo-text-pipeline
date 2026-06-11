'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { nodeConfig, isNodeEnabled } = require('../config');
const { resolvePlacement, resolveConvert } = require('../node-contract');
const { invalidateModuleTree } = require('./script');
const { suggest } = require('../checker/static');

/**
 * 单文件插件目录（第四条注册路径，role 'plugin'）——写插件 = 写一个文件：
 *
 *   <hexo 根>/text-pipeline/arrow.js
 *   module.exports = { replace: [[/-->/g, '→']] };
 *
 * 约定：
 * - 目录里每个顶层 .js 文件自动挂载，零配置生效；`_` 前缀文件跳过（共享辅助模块）；
 *   按文件名排序保证注册顺序确定。
 * - 导出单个 node 对象（与统一契约同形；name 缺省取文件名）或 node 数组
 *   （数组元素必须显式 name）。不收裸函数——`(text, ctx) => text` 的函数语义
 *   由 hooks 的 script 条目承载。
 * - name 不加前缀（用户自己起的名）；origin 为 'plugin:<文件名>'。
 * - _config.yml 的 text_pipeline.plugins.<name> 可覆盖 enable / slot / priority，
 *   其余键随整个子对象进 ctx.config（语义与 preset 子配置一致）；stage 不可覆盖。
 *
 * 热重载（与 script hook 同一套失效语义）：convert / replace / test / match
 * 即改即用——每次执行重新 require 文件取新声明；stage / slot / priority / name /
 * css / js / enabledByDefault 在注册期固化，改动需重启；目录增删文件同样需重启。
 */
function listPluginFiles(root) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (err) {
    return null; // 目录不存在：零配置默认值不该制造噪音
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort();
}

function freshPrecheckPasses(decl, content) {
  if (typeof decl.test === 'function' && !decl.test(content)) return false;
  if (decl.match !== undefined) {
    const regex = decl.match instanceof RegExp ? decl.match : new RegExp(decl.match);
    if (!regex.test(content)) return false;
  }
  return true;
}

function buildPluginNode(entry, { fileName, scriptPath, shortName, sub, placement }) {
  return {
    name: shortName,
    stage: placement.stage,
    slot: placement.slot,
    priority: placement.priority,
    origin: 'plugin:' + fileName,
    scriptPath,
    config: sub,
    css: entry.css,
    js: entry.js,
    // 热重载入口：每次执行取文件的最新声明（test/match 预判也吃最新值），
    // guard 跟随注册期固化的 stage——声明里改 stage 不会生效，必须重启。
    convert(content, ctx) {
      invalidateModuleTree(scriptPath);
      const fresh = require(scriptPath);
      const decl = Array.isArray(fresh) ? fresh.find((n) => n && n.name === shortName) : fresh;
      if (!decl || typeof decl !== 'object') {
        throw new Error('node "' + shortName + '" no longer found in ' + fileName + ' — restart hexo to re-discover plugins');
      }
      if (!freshPrecheckPasses(decl, content)) return content;
      const converted = resolveConvert(Object.assign({}, decl, { stage: placement.stage }));
      if (converted.error) {
        throw new Error(converted.error);
      }
      return converted.convert(content, ctx);
    }
  };
}

function loadPluginDir(pluginsDir, pluginsOverrides, baseDir) {
  const nodes = [];
  const issues = [];
  const root = path.resolve(baseDir || process.cwd(), pluginsDir);

  const files = listPluginFiles(root);
  if (!files) {
    return { nodes, issues };
  }

  const discoveredNames = [];
  for (const fileName of files) {
    const scriptPath = path.join(root, fileName);
    let exported;
    try {
      exported = require(scriptPath);
    } catch (err) {
      issues.push({
        level: 'error',
        message: 'plugin "' + fileName + '" failed to load: ' + (err && err.message) + ' (fix the file and restart hexo)'
      });
      continue;
    }

    if (typeof exported === 'function') {
      issues.push({
        level: 'error',
        message:
          'plugin "' + fileName + '" exports a function — plugin files export a node object; for a plain (text, ctx) => text transform use a hooks script entry instead'
      });
      continue;
    }
    if (!exported || typeof exported !== 'object') {
      issues.push({
        level: 'error',
        message: 'plugin "' + fileName + '" must export a node object or an array of nodes'
      });
      continue;
    }

    const entries = Array.isArray(exported) ? exported : [exported];
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        issues.push({ level: 'error', message: 'plugin "' + fileName + '" node [' + index + '] must be an object' });
        return;
      }
      const explicitName = typeof entry.name === 'string' && entry.name ? entry.name : '';
      if (Array.isArray(exported) && !explicitName) {
        issues.push({
          level: 'error',
          message: 'plugin "' + fileName + '" node [' + index + '] is missing a name (array exports must name every node)'
        });
        return;
      }
      const shortName = explicitName || path.basename(fileName, '.js');
      discoveredNames.push(shortName);

      const sub = nodeConfig(pluginsOverrides, shortName);
      if (!isNodeEnabled(entry, sub)) return;

      const placed = resolvePlacement(
        {
          stage: entry.stage,
          slot: sub.slot !== undefined ? sub.slot : entry.slot,
          priority: sub.priority !== undefined ? sub.priority : entry.priority
        },
        'plugin'
      );
      if (placed.error) {
        issues.push({ level: 'error', message: 'plugin "' + fileName + '" node "' + shortName + '" has ' + placed.error });
        return;
      }
      // 注册期预检 convert/replace 的合法性；编译结果丢弃，执行时按最新声明重新解析
      const converted = resolveConvert(Object.assign({}, entry, { stage: placed.placement.stage }));
      if (converted.error) {
        issues.push({ level: 'error', message: 'plugin "' + fileName + '" node "' + shortName + '" ' + converted.error });
        return;
      }

      nodes.push(buildPluginNode(entry, { fileName, scriptPath, shortName, sub, placement: placed.placement }));
    });
  }

  for (const key of Object.keys(pluginsOverrides || {})) {
    if (!discoveredNames.includes(key)) {
      issues.push({
        level: 'warn',
        message: 'text_pipeline.plugins.' + key + ' matches no discovered plugin' + suggest(key, discoveredNames)
      });
    }
  }

  return { nodes, issues };
}

module.exports = { loadPluginDir, _internal: { listPluginFiles } };
