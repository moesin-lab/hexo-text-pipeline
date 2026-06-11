'use strict';

const { spawnSync } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_BUFFER = 32 * 1024 * 1024;

/**
 * command hook → node：外部命令，正文从 stdin 进、变换结果从 stdout 出，任何语言。
 * 上下文走环境变量：HTP_STAGE / HTP_SLOT 恒有；post 类 stage 给
 * HTP_POST_SOURCE / HTP_POST_PATH / HTP_POST_TITLE，string 类给 HTP_FILE_PATH——
 * 与 ctx.post / ctx.file 的分流一一对应，不再用空的 POST 变量冒充。
 * 非零退出 / 启动失败 → 抛错，由 runtime checker 隔离（跳过该 node，原文继续）。
 */
function createCommandNode(hook) {
  return {
    name: 'hook:' + hook.name,
    stage: hook.stage,
    slot: hook.slot,
    priority: hook.priority,
    origin: 'hook:command',
    convert(content, ctx) {
      const env = Object.assign({}, process.env, {
        HTP_STAGE: hook.stage,
        HTP_SLOT: hook.slot
      });
      if (ctx && ctx.post) {
        env.HTP_POST_SOURCE = ctx.post.source || '';
        env.HTP_POST_PATH = ctx.post.path || '';
        env.HTP_POST_TITLE = ctx.post.title || '';
      }
      if (ctx && ctx.file) {
        env.HTP_FILE_PATH = ctx.file.path || '';
      }
      const result = spawnSync(hook.command, {
        input: content,
        shell: true,
        encoding: 'utf8',
        timeout: hook.timeout || DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env
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
