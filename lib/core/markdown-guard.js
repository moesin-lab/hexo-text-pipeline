'use strict';

/**
 * Markdown 阶段的代码保护工具：converter 在 before_post_render 做行内替换时，
 * 用 replaceOutsideCode 包住 replacer，避免改写 fenced code / inline code 里的内容。
 * HTML 阶段（after_post_render）不需要本模块——代码已渲染为 <pre>/<code>。
 */
/** 把单行拆成 { isCode, text } 片段序列，isCode 为 true 的片段是行内代码（含反引号）。 */
function segmentInlineCode(line) {
  const segments = [];
  let cursor = 0;

  while (cursor < line.length) {
    const open = line.indexOf('`', cursor);
    if (open === -1) {
      segments.push({ isCode: false, text: line.slice(cursor) });
      break;
    }

    if (open > cursor) {
      segments.push({ isCode: false, text: line.slice(cursor, open) });
    }

    let ticks = 1;
    while (open + ticks < line.length && line[open + ticks] === '`') {
      ticks += 1;
    }

    const closingToken = '`'.repeat(ticks);
    const close = line.indexOf(closingToken, open + ticks);
    if (close === -1) {
      segments.push({ isCode: false, text: line.slice(open) });
      break;
    }

    segments.push({ isCode: true, text: line.slice(open, close + ticks) });
    cursor = close + ticks;
  }

  return segments;
}

function replaceOutsideInlineCode(line, replacer) {
  return segmentInlineCode(line)
    .map((seg) => (seg.isCode ? seg.text : replacer(seg.text)))
    .join('');
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
  segmentInlineCode,
  replaceOutsideInlineCode,
  replaceOutsideCode
};
