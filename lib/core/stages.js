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
 * filterPriority 是注册到 hexo filter 时的优先级（不是 node 的 priority）：
 * post 类 stage 用 5，抢在 hexo 内置 filter（backtick_code_block、excerpt 等，
 * 优先级 10）之前——否则代码高亮先把围栏代码块吞成 <hexoPostRenderCodeBlock>，
 * mermaid 等基于围栏的 node 就看不到原始 markdown 了。
 *
 * 新增 stage 只需在这张表加一项，engine 与 checker 自动覆盖。
 */
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

module.exports = { STAGES };
