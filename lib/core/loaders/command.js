'use strict';

const { spawnSync } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_BUFFER = 32 * 1024 * 1024;

/**
 * command hook → node：外部命令，正文从 stdin 进、变换结果从 stdout 出，任何语言。
 * 上下文走环境变量：HTP_STAGE / HTP_POST_SOURCE / HTP_POST_PATH / HTP_POST_TITLE。
 * 非零退出 / 启动失败 → 抛错，由 runtime checker 隔离（跳过该 node，原文继续）。
 */
function createCommandNode(hook) {
  return {
    name: 'hook:' + hook.name,
    stage: hook.stage,
    priority: hook.priority,
    origin: 'hook:command',
    convert(content, ctx) {
      const post = (ctx && ctx.post) || {};
      const result = spawnSync(hook.command, {
        input: content,
        shell: true,
        encoding: 'utf8',
        timeout: hook.timeout || DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: Object.assign({}, process.env, {
          HTP_STAGE: hook.stage,
          HTP_POST_SOURCE: post.source || '',
          HTP_POST_PATH: post.path || '',
          HTP_POST_TITLE: post.title || ''
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
  };
}

module.exports = { createCommandNode, DEFAULT_TIMEOUT_MS };
