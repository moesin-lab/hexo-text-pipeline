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
 * 新增 stage 只需在这张表加一项，engine 与 checker 自动覆盖。
 */
const STAGES = {
  before_post_render: {
    kind: 'post',
    description: 'per-post markdown, before markdown rendering'
  },
  after_post_render: {
    kind: 'post',
    description: 'per-post HTML fragment, after markdown rendering'
  },
  'after_render:html': {
    kind: 'string',
    description: 'full page HTML, after template rendering'
  },
  'after_render:css': {
    kind: 'string',
    description: 'generated CSS asset'
  },
  'after_render:js': {
    kind: 'string',
    description: 'generated JS asset'
  }
};

module.exports = { STAGES };
