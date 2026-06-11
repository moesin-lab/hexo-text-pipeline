'use strict';

/**
 * 把解析出的 callout 结构渲染为 HTML。
 * 普通 callout 输出 div 结构；折叠语法 [!type]- / [!type]+ 输出 <details>（+ 为默认展开）。
 * type 已被 parse 的正则限定为 [a-zA-Z0-9_-]，可直接进入 class/attribute。
 */

function defaultTitle(type) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function renderCallout(parsed, bodyHtml) {
  const type = parsed.type;
  const title = parsed.title || defaultTitle(type);
  const classAttr = 'callout callout-' + type;
  const content = bodyHtml ? '<div class="callout-content">' + bodyHtml + '</div>' : '';

  if (parsed.fold) {
    const openAttr = parsed.fold === '+' ? ' open' : '';
    return (
      '<details class="' + classAttr + '" data-callout="' + type + '"' + openAttr + '>' +
      '<summary class="callout-title">' + title + '</summary>' +
      content +
      '</details>'
    );
  }

  return (
    '<div class="' + classAttr + '" data-callout="' + type + '">' +
    '<div class="callout-title">' + title + '</div>' +
    content +
    '</div>'
  );
}

module.exports = {
  renderCallout,
  defaultTitle
};
