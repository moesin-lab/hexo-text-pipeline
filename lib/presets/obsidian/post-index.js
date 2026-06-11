'use strict';

/**
 * 文章索引服务：把 hexo 的 Post 集合建成多键索引（title / slug / source 路径），
 * 供链接类 converter 把 Obsidian 目标解析成 abbrlink 永久链接。
 * 缓存以 hexo 实例为键，engine 在 before_generate 时调用 invalidatePostIndex。
 */

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function stripMarkdownExtension(value) {
  return value.replace(/\.(md|markdown)$/i, '');
}

function normalizeLookupKey(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function stripLeadingDotSegments(value) {
  return value.replace(/^(\.\.\/|\.\/)+/, '');
}

function safeDecodeURI(value) {
  try {
    return decodeURIComponent(value);
  } catch (_err) {
    return value;
  }
}

function buildPostIndex(hexo) {
  let posts = [];
  if (hexo.model && typeof hexo.model === 'function') {
    const postModel = hexo.model('Post');
    if (postModel && typeof postModel.toArray === 'function') {
      posts = postModel.toArray();
    }
  }

  if (!posts.length && hexo.locals && typeof hexo.locals.get === 'function') {
    const postQuery = hexo.locals.get('posts');
    posts = postQuery ? postQuery.toArray() : [];
  }

  const byTitle = new Map();
  const bySlug = new Map();
  const bySourcePath = new Map();
  const bySourceBase = new Map();

  let indexedCount = 0;

  for (const post of posts) {
    // abbrlink（frontmatter 标签）优先；没有时兜底用 hexo 生成的 post.path
    if (!post || (!post.abbrlink && !post.path)) continue;
    indexedCount += 1;

    if (post.title) {
      byTitle.set(String(post.title).trim().toLowerCase(), post);
    }

    if (post.slug) {
      bySlug.set(String(post.slug).trim().toLowerCase(), post);
    }

    if (post.source) {
      const normalizedSource = normalizeLookupKey(post.source).replace(/^.*?_posts\//, '');
      const sourceNoExt = stripMarkdownExtension(normalizedSource);
      const sourceBase = sourceNoExt.includes('/') ? sourceNoExt.slice(sourceNoExt.lastIndexOf('/') + 1) : sourceNoExt;

      if (sourceNoExt) {
        bySourcePath.set(sourceNoExt, post);
      }

      if (sourceBase) {
        bySourceBase.set(sourceBase, post);
      }
    }
  }

  return { byTitle, bySlug, bySourcePath, bySourceBase, indexedCount };
}

function buildTargetCandidates(target) {
  const normalized = normalizeLookupKey(stripLeadingDotSegments(target));
  if (!normalized) return [];

  const candidates = new Set();
  const noExt = stripMarkdownExtension(normalized);

  candidates.add(normalized);
  candidates.add(noExt);

  if (normalized.includes('/')) {
    const base = normalized.slice(normalized.lastIndexOf('/') + 1);
    candidates.add(base);
    candidates.add(stripMarkdownExtension(base));
  }

  return Array.from(candidates).filter(Boolean);
}

function resolvePostByTarget(index, target) {
  const candidates = buildTargetCandidates(target);

  for (const key of candidates) {
    const post =
      index.byTitle.get(key) ||
      index.bySlug.get(key) ||
      index.bySourcePath.get(key) ||
      index.bySourceBase.get(key);
    if (post) return post;
  }

  return null;
}

function buildPostHref(post, domainPrefix) {
  let hrefPath;
  if (post.abbrlink) {
    hrefPath = '/posts/' + trimSlashes(post.abbrlink);
  } else if (post.path) {
    hrefPath = '/' + trimSlashes(String(post.path));
  } else {
    return null;
  }
  return domainPrefix ? domainPrefix + hrefPath : hrefPath;
}

const cache = new WeakMap();

function getPostIndex(hexo) {
  let index = cache.get(hexo);
  if (!index || !index.indexedCount) {
    index = buildPostIndex(hexo);
    cache.set(hexo, index);
  }
  return index;
}

function invalidatePostIndex(hexo) {
  cache.delete(hexo);
}

module.exports = {
  trimSlashes,
  stripMarkdownExtension,
  normalizeLookupKey,
  stripLeadingDotSegments,
  safeDecodeURI,
  buildPostIndex,
  buildTargetCandidates,
  resolvePostByTarget,
  buildPostHref,
  getPostIndex,
  invalidatePostIndex
};
