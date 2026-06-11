'use strict';

const { normalizeBase } = require('../../../../core/config');
const { getPostIndex, resolvePostByTarget, buildPostHref, safeDecodeURI } = require('../../post-index');

/**
 * HTML 阶段兜底：把渲染后仍指向 .md 文件的链接（markdown 形式和 href 属性两种残留）
 * 改写为 abbrlink 永久链接。处理 Obsidian 导出的相对路径和 URI 编码。
 */
function isExternalHref(href) {
  return /^(https?:|mailto:|tel:|\/\/)/i.test(href);
}

function resolveHref(index, domainPrefix, rawHref) {
  const hashPos = rawHref.indexOf('#');
  const hrefWithoutHash = hashPos >= 0 ? rawHref.slice(0, hashPos) : rawHref;
  const hashRaw = hashPos >= 0 ? rawHref.slice(hashPos + 1) : '';

  const post = resolvePostByTarget(index, safeDecodeURI(hrefWithoutHash));
  if (!post) return null;

  const href = buildPostHref(post, domainPrefix);
  if (!href) return null;

  const anchor = hashRaw ? '#' + encodeURIComponent(safeDecodeURI(hashRaw)) : '';
  return href + anchor;
}

function createMarkdownMdLinkReplacer(index, domainPrefix) {
  return function replaceMarkdownMdLinks(content) {
    return content.replace(/\[([^\]]+)\]\(([^\n]+?\.md(?:#[^\n]+)?)\)/gi, (full, text, rawHref) => {
      if (isExternalHref(rawHref)) return full;
      const href = resolveHref(index, domainPrefix, rawHref);
      return href ? '[' + text + '](' + href + ')' : full;
    });
  };
}

function createHtmlMdHrefReplacer(index, domainPrefix) {
  return function replaceMdHref(html) {
    return html.replace(/(href\s*=\s*["'])([^"']+?\.md(?:#[^"']*)?)(["'])/gi, (full, prefix, rawHref, suffix) => {
      if (isExternalHref(rawHref)) return full;
      const href = resolveHref(index, domainPrefix, rawHref);
      return href ? prefix + href + suffix : full;
    });
  };
}

module.exports = {
  name: 'mdlink',
  stage: 'after_post_render',
  test(content) {
    return content.includes('.md');
  },
  convert(content, ctx) {
    const index = getPostIndex(ctx.hexo);
    const domainPrefix = normalizeBase(ctx.presetConfig.domain_prefix);
    const replaceMarkdownMdLinks = createMarkdownMdLinkReplacer(index, domainPrefix);
    const replaceMdHref = createHtmlMdHrefReplacer(index, domainPrefix);
    return replaceMdHref(replaceMarkdownMdLinks(content));
  },
  _internal: { createMarkdownMdLinkReplacer, createHtmlMdHrefReplacer }
};
