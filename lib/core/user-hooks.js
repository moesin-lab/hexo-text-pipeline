'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { STAGES } = require('./stages');

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_BUFFER = 32 * 1024 * 1024;

/**
 * 用户 hook：在 _config.yml 里声明，把渲染管线的任意 stage 交给用户代码接管。
 * 两种形态，都是 text in, text out，即改即用（改完下一次渲染就生效，不用重启）：
 *
 * obsidian_compiler:
 *   hooks:
 *     - command: python scripts/furigana.py   # 外部命令：正文从 stdin 进、stdout 出，任何语言
 *       stage: before_post_render             # 可选，默认 before_post_render，全部 stage 见 core/stages.js
 *       name: furigana                        # 可选，日志标识
 *       timeout: 10000                        # 可选，毫秒（仅 command）
 *     - script: scripts/toc.js                # 本地 JS：module.exports = (text, ctx) => text
 *       stage: after_post_render              #   相对 Hexo 根目录解析，每次执行重新加载（免重启）
 *
 * command 通过环境变量拿到上下文：HOC_STAGE / HOC_POST_SOURCE / HOC_POST_PATH / HOC_POST_TITLE；
 * script 直接收 ctx（{ hexo, post, stage, config, pluginConfig, log }）。
 * 与内置 converter 同由 engine 调度：失败只跳过该 hook，构建不受影响。
 */
function normalizeHook(raw, index) {
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
    return { error: 'hooks[' + index + '] has unknown stage "' + stage + '" (valid: ' + Object.keys(STAGES).join(', ') + ')' };
  }

  return {
    hook: {
      name: typeof raw.name === 'string' && raw.name ? raw.name : 'hook-' + index,
      stage,
      command,
      script,
      timeout: Number.isFinite(raw.timeout) && raw.timeout > 0 ? raw.timeout : DEFAULT_TIMEOUT_MS
    }
  };
}

function runHookCommand(hook, content, post) {
  const result = spawnSync(hook.command, {
    input: content,
    shell: true,
    encoding: 'utf8',
    timeout: hook.timeout,
    maxBuffer: MAX_BUFFER,
    env: Object.assign({}, process.env, {
      HOC_STAGE: hook.stage,
      HOC_POST_SOURCE: (post && post.source) || '',
      HOC_POST_PATH: (post && post.path) || '',
      HOC_POST_TITLE: (post && post.title) || ''
    })
  });

  if (result.error) {
    throw new Error('command failed to start: ' + result.error.message);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim().slice(0, 500);
    throw new Error('command exited with ' + result.status + (stderr ? ': ' + stderr : ''));
  }
  return result.stdout;
}

function runHookScript(hook, baseDir, content, ctx) {
  const resolved = path.resolve(baseDir || process.cwd(), hook.script);
  // 即改即用：每次执行重新加载，hexo server 下改脚本立即生效
  delete require.cache[resolved];
  const fn = require(resolved);
  if (typeof fn !== 'function') {
    throw new Error('script must export a function (text, ctx) => text');
  }
  return fn(content, ctx);
}

function toConverter(hook, baseDir) {
  return {
    name: 'hook:' + hook.name,
    stage: hook.stage,
    isUserHook: true,
    convert(content, ctx) {
      if (hook.command) {
        return runHookCommand(hook, content, ctx && ctx.post);
      }
      return runHookScript(hook, baseDir, content, ctx);
    }
  };
}

/** 把配置里的 hooks 数组解析为 converter 列表；非法条目收集到 invalid 供 engine warn。 */
function createHookConverters(rawHooks, baseDir) {
  const converters = [];
  const invalid = [];

  (rawHooks || []).forEach((raw, index) => {
    const parsed = normalizeHook(raw, index);
    if (!parsed) return;
    if (parsed.error) {
      invalid.push(parsed.error);
      return;
    }
    converters.push(toConverter(parsed.hook, baseDir));
  });

  return { converters, invalid };
}

module.exports = {
  createHookConverters,
  _internal: { normalizeHook, runHookCommand, runHookScript }
};
