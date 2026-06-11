'use strict';

const { slugize } = require('hexo-util');
const { replaceOutsideCode } = require('../../../../core/markdown-guard');
const { normalizeBase } = require('../../../../core/config');
const { getPostIndex, resolvePostByTarget, buildPostHref } = require('../../post-index');

/**
 * Markdown 阶段把 Obsidian wiki link [[target#anchor|alias]] 改写为
 * 指向 abbrlink 永久链接的标准 markdown 链接。无法解析的目标原样保留。
 *
 * - ![[...]] 是嵌入，归 embed node 管，这里用 lookbehind 跳过
 * - #^block-id 块引用锚点在渲染后的 HTML 里不存在，丢弃锚点只留文章链接
 * - [[#标题]]（无 target 的同页链接）改写为页内锚点
 * - 锚点用 hexo-util 的 slugize 生成——与 hexo-renderer-marked 给标题生成 id
 *   的是同一个函数（含 marked.modifyAnchors 配置），保证页内跳转不断
 */
function parseWikiLink(raw) {
  const firstPipe = raw.indexOf('|');
  const targetAndAnchor = firstPipe >= 0 ? raw.slice(0, firstPipe) : raw;
  const alias = firstPipe >= 0 ? raw.slice(firstPipe + 1).trim() : '';

  const hashIndex = targetAndAnchor.indexOf('#');
  const target = hashIndex >= 0 ? targetAndAnchor.slice(0, hashIndex).trim() : targetAndAnchor.trim();
  const anchor = hashIndex >= 0 ? targetAndAnchor.slice(hashIndex + 1).trim() : '';

  return { target, anchor, alias };
}

// 与 hexo-renderer-marked 的标题 id 同源：slugize + modifyAnchors（1 小写 / 2 大写）。
// slug 再过 encodeURIComponent 保证 markdown 链接语法安全（中文等百分号编码后，
// 浏览器解码 fragment 仍命中原 id）。
function anchorToHash(anchor, anchorTransform) {
  return '#' + encodeURIComponent(slugize(anchor, { transform: anchorTransform }));
}

function createWikiLinkReplacer(index, domainPrefix, anchorTransform) {
  return function replaceWikiLinks(segment) {
    return segment.replace(/(?<!!)\[\[([^\]]+)\]\]/g, (full, inner) => {
      const parsed = parseWikiLink(inner);

      // 同页链接 [[#标题]]：没有 target，只有锚点
      if (!parsed.target) {
        if (!parsed.anchor || parsed.anchor.startsWith('^')) return full;
        return '[' + (parsed.alias || parsed.anchor) + '](' + anchorToHash(parsed.anchor, anchorTransform) + ')';
      }

      const post = resolvePostByTarget(index, parsed.target);
      if (!post) return full;

      const href = buildPostHref(post, domainPrefix);
      if (!href) return full;

      // 块引用锚点（#^id）在 HTML 里没有对应元素，降级为文章链接
      const anchor =
        parsed.anchor && !parsed.anchor.startsWith('^') ? anchorToHash(parsed.anchor, anchorTransform) : '';
      const text = parsed.alias || parsed.target;

      return '[' + text + '](' + href + anchor + ')';
    });
  };
}

module.exports = {
  name: 'wikilink',
  stage: 'before_post_render',
  test(content) {
    return content.includes('[[');
  },
  convert(content, ctx) {
    const index = getPostIndex(ctx.hexo);
    const marked = (ctx.hexo.config && ctx.hexo.config.marked) || {};
    const replacer = createWikiLinkReplacer(
      index,
      normalizeBase(ctx.presetConfig.domain_prefix),
      marked.modifyAnchors
    );
    return replaceOutsideCode(content, replacer);
  },
  _internal: { parseWikiLink, createWikiLinkReplacer }
};
