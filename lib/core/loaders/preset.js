'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { normalizePresetEntry, nodeConfig, isNodeEnabled } = require('../config');
const { resolvePlacement, resolveConvert } = require('../node-contract');

/**
 * preset loader —— "插件的插件"。一个 preset 是一组打包好的 node：
 *
 * module.exports = {
 *   name: 'obsidian',
 *   nodes: [ ...node对象（与统一契约同形，name 用短名）... ],
 *   init(hexo) {}          // 可选：一次性副作用（如注册缓存失效 filter）
 * };
 *
 * 配置：
 * text_pipeline:
 *   presets:
 *     - obsidian                       # 内置（lib/presets/<name>）或 npm 包名
 *     - ./pipeline/my-preset           # 站点本地目录/文件（相对 Hexo 根目录）
 *     - name: obsidian                 # 完整形态：带 preset 级配置
 *       config:
 *         domain_prefix: ''
 *         callout: { enable: true, priority: 15 }   # node 级覆盖：enable / slot / priority / 其他子配置
 *
 * node 的 enable 解析顺序：用户配置 > node.enabledByDefault > 默认开。
 */
function resolvePresetModule(name, baseDir) {
  if (name.startsWith('.') || path.isAbsolute(name)) {
    return require(path.resolve(baseDir || process.cwd(), name));
  }
  const builtIn = path.join(__dirname, '..', '..', 'presets', name);
  if (fs.existsSync(builtIn) || fs.existsSync(builtIn + '.js')) {
    return require(builtIn);
  }
  return require(name); // npm 包
}

function wrapPresetNode(node, presetName, presetConfig) {
  const sub = nodeConfig(presetConfig, node.name);
  // 用户配置覆盖 node 自带声明；默认值与校验和其他注册路径同一套（node-contract.js）
  const resolved = resolvePlacement(
    {
      stage: node.stage,
      slot: sub.slot !== undefined ? sub.slot : node.slot,
      priority: sub.priority !== undefined ? sub.priority : node.priority
    },
    'preset'
  );
  if (resolved.error) {
    return { error: 'preset node "' + presetName + ':' + node.name + '" has ' + resolved.error };
  }
  const converted = resolveConvert(node);
  if (converted.error) {
    return { error: 'preset node "' + presetName + ':' + node.name + '" ' + converted.error };
  }
  return {
    node: Object.assign({}, node, {
      name: presetName + ':' + node.name,
      shortName: node.name,
      origin: 'preset:' + presetName,
      stage: resolved.placement.stage,
      slot: resolved.placement.slot,
      priority: resolved.placement.priority,
      convert: converted.convert,
      config: sub,
      presetConfig
    })
  };
}

function loadPresets(rawPresets, baseDir) {
  const nodes = [];
  const inits = [];
  const issues = [];

  (rawPresets || []).forEach((rawEntry, index) => {
    const entry = normalizePresetEntry(rawEntry);
    if (!entry || !entry.name) {
      issues.push({ level: 'error', message: 'presets[' + index + '] must be a name string or { name, config }' });
      return;
    }

    let mod;
    try {
      mod = resolvePresetModule(entry.name, baseDir);
    } catch (err) {
      issues.push({
        level: 'error',
        message: 'preset "' + entry.name + '" failed to load: ' + (err && err.message)
      });
      return;
    }

    const presetName = (mod && mod.name) || entry.name;
    const presetNodes = Array.isArray(mod) ? mod : mod && Array.isArray(mod.nodes) ? mod.nodes : null;
    if (!presetNodes) {
      issues.push({
        level: 'error',
        message: 'preset "' + entry.name + '" must export { nodes: [...] } or an array of nodes'
      });
      return;
    }

    for (const node of presetNodes) {
      if (!node || typeof node.name !== 'string') {
        issues.push({
          level: 'error',
          message: 'preset "' + presetName + '" contains an invalid node (need { name, stage, convert | replace })'
        });
        continue;
      }
      if (!isNodeEnabled(node, nodeConfig(entry.config, node.name))) continue;
      const wrapped = wrapPresetNode(node, presetName, entry.config);
      if (wrapped.error) {
        issues.push({ level: 'error', message: wrapped.error });
        continue;
      }
      nodes.push(wrapped.node);
    }

    if (mod && typeof mod.init === 'function') {
      inits.push({ name: presetName, init: mod.init });
    }
  });

  return { nodes, inits, issues };
}

module.exports = { loadPresets, _internal: { resolvePresetModule, wrapPresetNode } };
