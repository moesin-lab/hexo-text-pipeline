'use strict';

const path = require('node:path');

/**
 * script hook → node：本地 JS 文件，module.exports = (text, ctx) => text。
 * 相对 Hexo 根目录解析；每次执行重新 require —— 即改即用，hexo server 下
 * 改完脚本下一次渲染就生效，不用重启。
 */
function resolveScriptPath(scriptPath, baseDir) {
  return path.resolve(baseDir || process.cwd(), scriptPath);
}

/**
 * 精确失效脚本及其本地依赖树（不碰 node_modules）：
 * 脚本 require 的辅助模块改了也要即改即用，但不能误伤无关缓存。
 */
function invalidateModuleTree(modulePath, seen = new Set()) {
  const cached = require.cache[modulePath];
  if (!cached || seen.has(modulePath)) return;
  seen.add(modulePath);
  for (const child of cached.children) {
    if (!child.filename.includes(path.sep + 'node_modules' + path.sep)) {
      invalidateModuleTree(child.filename, seen);
    }
  }
  delete require.cache[modulePath];
}

function createScriptNode(hook, baseDir) {
  const resolved = resolveScriptPath(hook.script, baseDir);
  return {
    name: 'hook:' + hook.name,
    stage: hook.stage,
    slot: hook.slot,
    priority: hook.priority,
    origin: 'hook:script',
    scriptPath: resolved,
    convert(content, ctx) {
      invalidateModuleTree(resolved);
      const fn = require(resolved);
      if (typeof fn !== 'function') {
        throw new Error('script must export a function (text, ctx) => text');
      }
      return fn(content, ctx);
    }
  };
}

module.exports = { createScriptNode, resolveScriptPath, invalidateModuleTree, _internal: { invalidateModuleTree } };
