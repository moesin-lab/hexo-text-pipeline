'use strict';

// Converter 模板：复制本目录为 lib/converters/<name>/，按需拆出 parse.js / render.js，
// 完成后在 lib/converters/registry.js 注册。本目录不在注册表里，仅作起点。

// const { replaceOutsideCode } = require('../../core/markdown-guard');

module.exports = {
  // 配置键名：obsidian_compiler.converters.<name>
  name: 'template',

  // stage 全表见 lib/core/stages.js。
  // 'before_post_render'：输入是 markdown，行内替换务必用 markdown-guard 跳过代码。
  // 'after_post_render'：输入是渲染后的 HTML。
  stage: 'before_post_render',

  // 可选：出厂默认关闭（用户 converters.<name>.enable 永远优先）。
  // enabledByDefault: false,

  // 可选：默认 CSS 字符串，engine 会在 inject_css 开启时注入 head_end。
  // css: require('./styles'),

  // 可选：前端脚本，inject_js 开启时注入 body_end；字符串或 (子配置) => 字符串。
  // js: (config) => '...',

  // 廉价预判，返回 false 直接跳过 convert。
  test(content) {
    return content.includes('TODO-marker');
  },

  // 必须无副作用：不改 ctx，不读 hexo 全局状态（需要文章索引用 core/post-index）。
  // ctx = { hexo, post, config(本 converter 的子配置), pluginConfig, log }
  convert(content, ctx) {
    return content;
  }
};
