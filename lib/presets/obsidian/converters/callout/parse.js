'use strict';

/**
 * 解析渲染后的 blockquote 内 HTML，识别 Obsidian callout 头部：
 *   <p>[!type] title<br>body...</p> 或 <p>[!type] title</p><p>body...</p>
 * 兼容 hexo-renderer-marked 的 breaks: true（<br>）和 breaks: false（\n）两种换行输出。
 * 返回 { type, fold, title, body }，不是 callout 时返回 null。
 */

const HEAD_RE = /^\s*<p>\[!([a-zA-Z0-9_-]+)\]([+-])?[ \t]*/;

function findTitleEnd(rest) {
  const candidates = [];

  const br = rest.match(/<br\s*\/?>(\r?\n)?/);
  if (br) candidates.push({ index: br.index, length: br[0].length, kind: 'br' });

  const nl = rest.indexOf('\n');
  if (nl !== -1) candidates.push({ index: nl, length: 1, kind: 'newline' });

  const pEnd = rest.indexOf('</p>');
  if (pEnd !== -1) candidates.push({ index: pEnd, length: '</p>'.length, kind: 'p-end' });

  if (!candidates.length) {
    return { index: rest.length, length: 0, kind: 'eof' };
  }

  candidates.sort((a, b) => a.index - b.index);
  return candidates[0];
}

function parseCalloutInner(inner) {
  const head = inner.match(HEAD_RE);
  if (!head) return null;

  const type = head[1].toLowerCase();
  const fold = head[2] || '';
  const rest = inner.slice(head[0].length);

  const end = findTitleEnd(rest);
  const title = rest.slice(0, end.index).trim();
  const after = rest.slice(end.index + end.length);

  let body;
  if (end.kind === 'p-end') {
    // 标题独占首段，正文是后续兄弟元素
    body = after.replace(/^\r?\n/, '');
  } else if (end.kind === 'eof') {
    body = '';
  } else {
    // 标题和正文同段：去掉标题行后把段落补回去
    body = '<p>' + after;
  }

  return { type, fold, title, body: body.trim() };
}

module.exports = {
  parseCalloutInner
};
