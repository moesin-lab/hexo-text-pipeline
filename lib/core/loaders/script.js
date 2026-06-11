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

function createScriptNode(hook, baseDir) {
  const resolved = resolveScriptPath(hook.script, baseDir);
  return {
    name: 'hook:' + hook.name,
    stage: hook.stage,
    priority: hook.priority,
    origin: 'hook:script',
    scriptPath: resolved,
    convert(content, ctx) {
      delete require.cache[resolved];
      const fn = require(resolved);
      if (typeof fn !== 'function') {
        throw new Error('script must export a function (text, ctx) => text');
      }
      return fn(content, ctx);
    }
  };
}

module.exports = { createScriptNode, resolveScriptPath };
