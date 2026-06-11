'use strict';

/**
 * 全部 converter 的显式注册表。新增语法：在 lib/converters/ 下建目录实现接口，
 * 然后在这里加一行。数组顺序就是同一 stage 内的执行顺序。
 * 接口契约见 docs/ARCHITECTURE.md，操作步骤见 docs/ADDING-A-CONVERTER.md。
 */
module.exports = [
  require('./wikilink'),
  require('./callout'),
  require('./mdlink')
];
