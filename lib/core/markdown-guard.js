'use strict';

/**
 * Markdown 阶段的代码保护工具：converter 在 before_post_render 做行内替换时，
 * 用 replaceOutsideCode 包住 replacer，避免改写 fenced code / inline code 里的内容。
 * HTML 阶段（after_post_render）不需要本模块——代码已渲染为 <pre>/<code>。
 */
function replaceOutsideInlineCode(line, replacer) {
  let result = '';
  let cursor = 0;

  while (cursor < line.length) {
    const open = line.indexOf('`', cursor);
    if (open === -1) {
      result += replacer(line.slice(cursor));
      break;
    }

    result += replacer(line.slice(cursor, open));

    let ticks = 1;
    while (open + ticks < line.length && line[open + ticks] === '`') {
      ticks += 1;
    }

    const closingToken = '`'.repeat(ticks);
    const close = line.indexOf(closingToken, open + ticks);
    if (close === -1) {
      result += line.slice(open);
      break;
    }

    result += line.slice(open, close + ticks);
    cursor = close + ticks;
  }

  return result;
}

function replaceOutsideCode(content, replacer) {
  const lines = content.split('\n');
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^ {0,3}([`~]{3,})/);

    if (match) {
      const token = match[1];
      const marker = token[0];
      const length = token.length;

      if (!inFence) {
        inFence = true;
        fenceChar = marker;
        fenceLen = length;
      } else if (marker === fenceChar && length >= fenceLen) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }

      continue;
    }

    if (!inFence) {
      lines[i] = replaceOutsideInlineCode(line, replacer);
    }
  }

  return lines.join('\n');
}

module.exports = {
  replaceOutsideInlineCode,
  replaceOutsideCode
};
