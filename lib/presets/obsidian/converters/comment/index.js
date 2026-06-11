'use strict';

const { segmentInlineCode } = require('../../../../core/markdown-guard');

/**
 * Markdown 阶段剥离 Obsidian 注释：行内 %%...%% 与跨行 %% ... %%。
 * 语义约定（与 Obsidian 一致或取其安全子集）：
 * - fenced code / inline code 里的 %% 是字面量，不开启注释；
 * - 注释一旦开启，吞掉直到下一个 %%（中间的代码、围栏一并视为注释内容）；
 * - 跨行注释的首行残余与末行残余合并成一行；
 * - 整行都被注释吃掉时不留空行；
 * - 未闭合的 %% 注释到文件末尾（Obsidian 同此行为）。
 */
function stripObsidianComments(content) {
  const lines = content.split('\n');
  const out = [];

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  let inComment = false;
  let carry = null; // 跨行注释开启行的前缀残余，等闭合行合并

  for (const line of lines) {
    if (!inComment) {
      const match = line.match(/^ {0,3}([`~]{3,})/);
      if (match) {
        const token = match[1];
        if (!inFence) {
          inFence = true;
          fenceChar = token[0];
          fenceLen = token.length;
        } else if (token[0] === fenceChar && token.length >= fenceLen) {
          inFence = false;
        }
        out.push(line);
        continue;
      }
      if (inFence) {
        out.push(line);
        continue;
      }
    }

    let lineOut = '';
    let touched = inComment;

    for (const seg of segmentInlineCode(line)) {
      if (seg.isCode && !inComment) {
        lineOut += seg.text;
        continue;
      }
      const text = seg.text;
      let i = 0;
      while (i < text.length) {
        const idx = text.indexOf('%%', i);
        if (idx === -1) {
          if (!inComment) lineOut += text.slice(i);
          break;
        }
        touched = true;
        if (!inComment) {
          lineOut += text.slice(i, idx);
          inComment = true;
        } else {
          inComment = false;
        }
        i = idx + 2;
      }
    }

    if (inComment) {
      // 注释延续到下一行：行首残余暂存，整行被吞时什么都不留
      if (carry === null) carry = lineOut;
      continue;
    }

    if (carry !== null) {
      lineOut = carry + lineOut;
      carry = null;
    }
    if (touched && lineOut === '') {
      continue; // 整行只有注释，不留空行
    }
    out.push(lineOut);
  }

  // 未闭合注释：carry 是开启行的残余，按 Obsidian 语义其后内容全部隐藏
  if (carry !== null && carry !== '') {
    out.push(carry);
  }

  return out.join('\n');
}

module.exports = {
  name: 'comment',
  stage: 'before_post_render',
  test(content) {
    return content.includes('%%');
  },
  convert(content) {
    return stripObsidianComments(content);
  },
  _internal: { stripObsidianComments }
};
