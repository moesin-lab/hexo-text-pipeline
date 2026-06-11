'use strict';

const { escapeHTML } = require('hexo-util');

const DEFAULT_SCRIPT_SRC = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
const DEFAULT_CLASS = 'mermaid';

/**
 * Markdown 阶段把 ```mermaid 围栏块替换为 <pre class="mermaid">，
 * 让图源码绕过语法高亮（highlight.js / prismjs 会把它渲染成代码而非图）。
 * 内容做 HTML 转义，浏览器解析后 textContent 还原原文，mermaid.js 正常读取。
 *
 * 前端脚本默认按需注入（页面没有 .mermaid 元素时不加载 CDN）：
 * converters.mermaid 子配置：class / inject_script / script_src / theme。
 */
function transformMermaidBlocks(content, className) {
  const lines = content.split('\n');
  const out = [];

  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^ {0,3}([`~]{3,})(.*)$/);

    if (!inFence && match && match[2].trim().toLowerCase() === 'mermaid') {
      const token = match[1];
      // 收集到配对的闭合围栏；未闭合则原样保留
      const body = [];
      let closed = false;
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const closeMatch = lines[j].match(/^ {0,3}([`~]{3,})\s*$/);
        if (closeMatch && closeMatch[1][0] === token[0] && closeMatch[1].length >= token.length) {
          closed = true;
          break;
        }
        body.push(lines[j]);
      }
      if (closed) {
        out.push('<pre class="' + className + '">' + escapeHTML(body.join('\n')) + '</pre>');
        i = j;
        continue;
      }
      out.push(line);
      continue;
    }

    if (match) {
      const token = match[1];
      if (!inFence) {
        inFence = true;
        fenceChar = token[0];
        fenceLen = token.length;
      } else if (token[0] === fenceChar && token.length >= fenceLen && !match[2].trim()) {
        inFence = false;
      }
    }

    out.push(line);
  }

  return out.join('\n');
}

function buildLoaderScript(config) {
  if (config.inject_script === false) return '';
  const src = typeof config.script_src === 'string' && config.script_src ? config.script_src : DEFAULT_SCRIPT_SRC;
  const theme = typeof config.theme === 'string' && config.theme ? config.theme : 'default';
  const className = typeof config.class === 'string' && config.class ? config.class : DEFAULT_CLASS;
  return (
    '(function(){' +
    'if(!document.querySelector("pre.' + className + '"))return;' +
    'var s=document.createElement("script");' +
    's.src=' + JSON.stringify(src) + ';' +
    's.onload=function(){window.mermaid.initialize({startOnLoad:false,theme:' + JSON.stringify(theme) + '});' +
    'window.mermaid.run({querySelector:"pre.' + className + '"});};' +
    'document.head.appendChild(s);' +
    '})();'
  );
}

module.exports = {
  name: 'mermaid',
  stage: 'before_post_render',
  js: buildLoaderScript,
  test(content) {
    return /^ {0,3}[`~]{3,}\s*mermaid\s*$/im.test(content);
  },
  convert(content, ctx) {
    const className =
      ctx && ctx.config && typeof ctx.config.class === 'string' && ctx.config.class
        ? ctx.config.class
        : DEFAULT_CLASS;
    return transformMermaidBlocks(content, className);
  },
  _internal: { transformMermaidBlocks, buildLoaderScript }
};
