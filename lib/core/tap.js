'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DIR = '.text-pipeline-tap';

/**
 * tap（管线抽头）—— 开发 hook 用的调试模式。开启后在真实渲染过程中，
 * 把每个 stage 的输入文本和每个改动了文本的 node 的输出落盘：
 *
 *   <dir>/<文章或页面路径>/<stage>/00-input.txt        ← 你的 hook 在该 stage 收到的就是这个
 *   <dir>/<文章或页面路径>/<stage>/01-obsidian:comment.txt
 *   <dir>/<文章或页面路径>/<stage>/02-hook:my-hook.txt  ← 最后一个文件即该 stage 最终输出
 *
 * 配置：
 * text_pipeline:
 *   tap:
 *     enable: true
 *     match: 'my-post'        # 可选：只抓 source/path 匹配该正则的文章/页面（强烈建议设置）
 *     dir: .text-pipeline-tap # 可选：输出目录，相对 Hexo 根
 *
 * 每轮渲染对同一 stage 重新落盘（先清空再写），目录里永远是最近一次的快照。
 */
function sanitize(name) {
  return String(name).replace(/[^\w.-]+/g, '_').slice(0, 120) || 'unknown';
}

function createTap(tapConfig, baseDir, log) {
  if (!tapConfig || tapConfig.enable !== true) return null;

  const root = path.resolve(baseDir || process.cwd(), typeof tapConfig.dir === 'string' && tapConfig.dir ? tapConfig.dir : DEFAULT_DIR);

  let matchRegex = null;
  if (tapConfig.match !== undefined) {
    try {
      matchRegex = new RegExp(tapConfig.match);
    } catch (err) {
      log.warn('tap.match is not a valid regex, tap disabled: ' + (err && err.message));
      return null;
    }
  }

  const sequences = new Map(); // stage 目录 → 下一个序号

  return {
    root,
    capture(stage, post, label, text) {
      const id = (post && (post.source || post.path)) || 'unknown';
      if (matchRegex && !matchRegex.test(id)) return;

      const dir = path.join(root, sanitize(id), sanitize(stage));
      try {
        if (label === 'input') {
          // 新一轮该 stage 的快照：清掉上一轮的
          fs.rmSync(dir, { recursive: true, force: true });
          fs.mkdirSync(dir, { recursive: true });
          sequences.set(dir, 1);
          fs.writeFileSync(path.join(dir, '00-input.txt'), text);
          return;
        }
        const seq = sequences.get(dir) || 1;
        sequences.set(dir, seq + 1);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, String(seq).padStart(2, '0') + '-' + sanitize(label) + '.txt'), text);
      } catch (err) {
        log.warn('tap write failed: ' + (err && err.message));
      }
    }
  };
}

module.exports = { createTap, _internal: { sanitize } };
