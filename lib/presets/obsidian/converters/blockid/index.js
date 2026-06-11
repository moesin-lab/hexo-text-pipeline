'use strict';

const { replaceOutsideCode } = require('../../../../core/markdown-guard');

/**
 * Markdown 阶段剥离 Obsidian 块定义标记：行尾的 ` ^block-id`
 * （以及独占一行的 `^block-id`）。它们只服务于 Obsidian 内部的块引用，
 * 在 Obsidian 阅读视图里也不可见，不应出现在渲染结果里。
 */
function stripBlockIds(content) {
  // 标记必须在行首独占或跟在空白后（"x^2" 这类行内字面 ^ 不动）
  return replaceOutsideCode(content, (segment) => segment.replace(/(^|\s+)\^[A-Za-z0-9-]+$/, ''));
}

module.exports = {
  name: 'blockid',
  stage: 'before_post_render',
  test(content) {
    return content.includes('^');
  },
  convert(content) {
    return stripBlockIds(content);
  },
  _internal: { stripBlockIds }
};
