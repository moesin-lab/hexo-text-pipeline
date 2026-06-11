'use strict';

const { parseCalloutInner } = require('./parse');
const { renderCallout } = require('./render');
const css = require('./styles');

const OPEN_TAG = '<blockquote';
const CLOSE_TAG = '</blockquote>';

/**
 * 在 HTML 里找到与 openEnd 处开标签配对的 </blockquote>。
 * 返回 { closeStart, closeEnd }，未闭合返回 null。
 */
function findMatchingClose(html, openEnd) {
  let depth = 1;
  let cursor = openEnd;

  while (depth > 0) {
    const nextOpen = html.indexOf(OPEN_TAG, cursor);
    const nextClose = html.indexOf(CLOSE_TAG, cursor);

    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + OPEN_TAG.length;
    } else {
      depth -= 1;
      if (depth === 0) {
        return { closeStart: nextClose, closeEnd: nextClose + CLOSE_TAG.length };
      }
      cursor = nextClose + CLOSE_TAG.length;
    }
  }

  return null;
}

function transformCallouts(html) {
  let result = '';
  let pos = 0;

  while (pos < html.length) {
    const open = html.indexOf(OPEN_TAG, pos);
    if (open === -1) break;

    const openTagEnd = html.indexOf('>', open);
    if (openTagEnd === -1) break;

    const match = findMatchingClose(html, openTagEnd + 1);
    if (!match) break;

    const inner = html.slice(openTagEnd + 1, match.closeStart);
    const parsed = parseCalloutInner(inner);

    result += html.slice(pos, open);
    if (parsed) {
      result += renderCallout(parsed, transformCallouts(parsed.body));
    } else {
      // 普通引用保留原样，但递归处理内部可能嵌套的 callout
      result += html.slice(open, openTagEnd + 1) + transformCallouts(inner) + CLOSE_TAG;
    }
    pos = match.closeEnd;
  }

  result += html.slice(pos);
  return result;
}

module.exports = {
  name: 'callout',
  stage: 'after_post_render',
  // 主流 markdown 渲染器/主题已多自带 callout 支持，默认关闭避免双重渲染；
  // 需要时 converters.callout.enable: true 打开
  enabledByDefault: false,
  css,
  test(content) {
    return content.includes('[!') && content.includes(OPEN_TAG);
  },
  convert(content) {
    return transformCallouts(content);
  },
  _internal: { transformCallouts, findMatchingClose }
};
