'use strict';

const { replaceOutsideCode } = require('../../../../core/markdown-guard');

/**
 * Markdown 阶段把 Obsidian 高亮 ==文本== 改写为 <mark>文本</mark>。
 * 不跨行、内容非空且不含 =；代码内为字面量。
 */
function replaceHighlights(segment) {
  return segment.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
}

module.exports = {
  name: 'highlight',
  stage: 'before_post_render',
  test(content) {
    return content.includes('==');
  },
  convert(content) {
    return replaceOutsideCode(content, replaceHighlights);
  },
  _internal: { replaceHighlights }
};
