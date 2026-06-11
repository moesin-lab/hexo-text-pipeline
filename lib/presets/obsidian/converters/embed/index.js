'use strict';

const { replaceOutsideCode } = require('../../../../core/markdown-guard');
const { normalizeBase } = require('../../../../core/config');
const { getPostIndex, resolvePostByTarget, buildPostHref } = require('../../post-index');

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif'];

/**
 * Markdown 阶段处理 Obsidian 嵌入 ![[target|param]]：
 * - 图片（按扩展名识别）→ 标准 markdown 图片；param 为数字时输出 <img width>（Obsidian 缩放语法）
 *   src = asset_prefix + target（attachment 目录布局是站点私事，交给配置）
 * - 能解析为文章的笔记嵌入 → 降级为指向该文章的链接（博客无法内联整篇笔记）
 * - 其他（pdf、音视频、解析不到的笔记）→ 原样保留
 *
 * 必须在 wikilink 之前运行：否则 ![[x]] 的 [[x]] 部分会被替换成链接，
 * 残留的 ! 使其变成指向文章 URL 的图片。
 */
function parseEmbed(raw) {
  const firstPipe = raw.indexOf('|');
  const targetAndAnchor = firstPipe >= 0 ? raw.slice(0, firstPipe) : raw;
  const param = firstPipe >= 0 ? raw.slice(firstPipe + 1).trim() : '';

  const hashIndex = targetAndAnchor.indexOf('#');
  const target = (hashIndex >= 0 ? targetAndAnchor.slice(0, hashIndex) : targetAndAnchor).trim();

  return { target, param };
}

function imageExtension(target) {
  const dot = target.lastIndexOf('.');
  if (dot === -1) return '';
  return target.slice(dot + 1).toLowerCase();
}

function renderImage(target, param, assetPrefix) {
  const src = encodeURI((assetPrefix ? assetPrefix + '/' : '') + target.replace(/^\/+/, ''));
  if (/^\d+$/.test(param)) {
    return '<img src="' + src + '" width="' + param + '">';
  }
  const alt = param || target.split('/').pop();
  return '![' + alt + '](' + src + ')';
}

function createEmbedReplacer(index, domainPrefix, assetPrefix) {
  return function replaceEmbeds(segment) {
    return segment.replace(/!\[\[([^\]]+)\]\]/g, (full, inner) => {
      const { target, param } = parseEmbed(inner);
      if (!target) return full;

      if (IMAGE_EXTENSIONS.includes(imageExtension(target))) {
        return renderImage(target, param, assetPrefix);
      }

      const post = resolvePostByTarget(index, target);
      if (!post) return full;

      const href = buildPostHref(post, domainPrefix);
      if (!href) return full;

      return '[' + (param || target) + '](' + href + ')';
    });
  };
}

module.exports = {
  name: 'embed',
  stage: 'before_post_render',
  test(content) {
    return content.includes('![[');
  },
  convert(content, ctx) {
    const index = getPostIndex(ctx.hexo);
    const domainPrefix = normalizeBase(ctx.presetConfig.domain_prefix);
    const assetPrefix = normalizeBase(ctx.config.asset_prefix);
    return replaceOutsideCode(content, createEmbedReplacer(index, domainPrefix, assetPrefix));
  },
  _internal: { parseEmbed, createEmbedReplacer, renderImage }
};
