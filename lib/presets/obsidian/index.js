'use strict';

const { invalidatePostIndex } = require('./post-index');

/**
 * Obsidian Flavored Markdown preset —— 本插件自带的"插件的插件"。
 * nodes 数组顺序就是同 stage 同 priority 下的执行顺序：
 * comment 必须最先（被注释掉的语法要在其他 node 看到之前消失）。
 *
 * 启用与配置（_config.yml）：
 * text_pipeline:
 *   presets:
 *     - name: obsidian
 *       config:
 *         domain_prefix: ''                    # wikilink/mdlink 的链接前缀
 *         callout: { enable: true }            # callout 出厂默认关
 *         mermaid: { theme: dark }             # 任意 node 级子配置 / priority 覆盖
 */
module.exports = {
  name: 'obsidian',
  nodes: [
    require('./converters/comment'),
    require('./converters/wikilink'),
    require('./converters/mdlink'),
    require('./converters/mermaid'),
    require('./converters/callout')
  ],
  init(hexo) {
    // wikilink/mdlink 共享的文章索引：每轮 generate 前失效重建
    hexo.extend.filter.register('before_generate', () => {
      invalidatePostIndex(hexo);
    });
  }
};
