'use strict';

/**
 * 管线暴露的全部 stage —— Hexo 渲染管线上所有"文本进、文本出"的执行点
 * （filter 名与 Hexo 官方一致，见 https://hexo.io/api/filter）。
 *
 * 这是本插件的边界：template_locals / server_middleware 等不是文本变换的
 * filter 不在此暴露，需要时请直接注册 Hexo filter。
 *
 * kind 决定 engine 如何接驳 hexo filter：
 * - 'post'：filter 收 post 数据对象，文本在 data.content（逐篇文章）
 * - 'string'：filter 收 (text, data) 并返回新文本（整页/资源，data 含 path 等元信息）
 *
 * 每个 stage 有两个挂点（slot），engine 各注册一个 hexo filter：
 * - early：filterPriority（post 类 5），抢在 hexo 内置 filter（backtick_code_block、
 *   excerpt 等，优先级 10）和其他插件之前——mermaid 等需要原始 markdown 的
 *   preset node 默认在这里；
 * - late：LATE_FILTER_PRIORITY（100），在 hexo 内置和其他插件全部跑完之后——
 *   用户 hook 默认在这里，看到的是该 stage 的最终文本。
 * node 用 slot 字段在两个挂点间移动。
 *
 * 新增 stage 只需在这张表加一项，engine 与 checker 自动覆盖。
 */
const LATE_FILTER_PRIORITY = 100;
const STAGES = {
  before_post_render: {
    kind: 'post',
    filterPriority: 5,
    description: 'per-post markdown, before markdown rendering'
  },
  after_post_render: {
    kind: 'post',
    filterPriority: 5,
    description: 'per-post HTML fragment, after markdown rendering'
  },
  'after_render:html': {
    kind: 'string',
    filterPriority: 10,
    description: 'full page HTML, after template rendering'
  },
  'after_render:css': {
    kind: 'string',
    filterPriority: 10,
    description: 'generated CSS asset'
  },
  'after_render:js': {
    kind: 'string',
    filterPriority: 10,
    description: 'generated JS asset'
  }
};

module.exports = { STAGES, LATE_FILTER_PRIORITY };
